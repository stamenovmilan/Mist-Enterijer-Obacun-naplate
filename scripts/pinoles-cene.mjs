// Čita cene artikala sa pinoles.com i upisuje ih u pinoles-cene.json.
// Linkovi dolaze iz mist-defaults.json (polje "pinolesLinks": { "Naziv artikla": "https://www.pinoles.com/proizvod/..." }).
// Pokreće se iz GitHub Actions-a, ali radi i lokalno: node scripts/pinoles-cene.mjs
import { readFile, writeFile } from "node:fs/promises";

const DEFAULTS = process.env.DEFAULTS_FILE || "mist-defaults.json";
const OUT = process.env.OUT_FILE || "pinoles-cene.json";
const UA = process.env.PINOLES_UA || "MiSt-Cenovnik/1.0 (privatna kalkulacija cena; 1 zahtev po artiklu, jednom dnevno)";
const DELAY = Number(process.env.DELAY_MS ?? 2000);
const ALLOWED = (process.env.ALLOWED_HOSTS || "www.pinoles.com,pinoles.com").split(",");
const ALLOW_HTTP = process.env.ALLOW_HTTP === "1"; // samo za test

const sleep = ms => new Promise(r => setTimeout(r, ms));
const decode = s => String(s || "")
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ").replace(/&amp;/g, "&").replace(/&#8211;|&ndash;/g, "–")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const text = html => decode(String(html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// "1.872,00" -> 1872 ; "1872.00" -> 1872 ; "1.872" -> 1872 ; "405,5" -> 405.5
export function parsePrice(raw) {
    let s = String(raw ?? "").replace(/[\s\u00a0]/g, "");
    if (!s) return null;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
}
const AMOUNT = /\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?|\d+\.\d{1,2}/;
function firstAmount(html) {
    const t = text(html);
    const m = t.match(AMOUNT);
    return m ? parsePrice(m[0]) : null;
}
function unitFrom(html) {
    const m = text(html).match(/RSD\s*\/\s*([^\s<)]+)/i);
    return m ? m[1].toUpperCase() : null;
}

function jsonLdProducts(html) {
    const out = [];
    const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html))) {
        let data; try { data = JSON.parse(m[1]); } catch { continue; }
        const stack = [data];
        while (stack.length) {
            const n = stack.pop();
            if (Array.isArray(n)) { stack.push(...n); continue; }
            if (!n || typeof n !== "object") continue;
            const t = n["@type"];
            if (t === "Product" || (Array.isArray(t) && t.includes("Product"))) out.push(n);
            if (n["@graph"]) stack.push(n["@graph"]);
        }
    }
    return out;
}
function offerInfo(product) {
    const offers = [].concat(product.offers || []);
    for (const o of offers) {
        if (!o) continue;
        if (o.lowPrice !== undefined || o["@type"] === "AggregateOffer") {
            const lo = parsePrice(o.lowPrice), hi = parsePrice(o.highPrice);
            if (lo && hi && lo !== hi) return { variants: true, price: lo };
            if (lo) return { price: lo };
        }
        let p = parsePrice(o.price);
        if (!p) for (const ps of [].concat(o.priceSpecification || [])) { p = parsePrice(ps && ps.price); if (p) break; }
        if (p) return { price: p, validUntil: o.priceValidUntil || null };
    }
    return null;
}

export function extract(html) {
    const res = { status: "ok", source: null, price: null, regular: null, sale: null, unit: null, title: null, validUntil: null };
    const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    const h1 = html.match(/<h1[^>]*product_title[^>]*>([\s\S]*?)<\/h1>/i);
    res.title = text(h1 ? h1[1] : (og ? og[1] : "")) || null;

    // 1) HTML blok cene (prvi na stranici je cena glavnog proizvoda, ne srodnih)
    const block = html.match(/<(p|span|div)[^>]*class=["'][^"']*\bprice\b[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i);
    let variantsHtml = false;
    if (block) {
        const inner = block[2];
        const del = inner.match(/<del[^>]*>([\s\S]*?)<\/del>/i);
        const ins = inner.match(/<ins[^>]*>([\s\S]*?)<\/ins>/i);
        res.unit = unitFrom(inner);
        if (del && ins) {
            res.regular = firstAmount(del[1]); res.sale = firstAmount(ins[1]); res.price = res.sale;
        } else {
            // raspon cena (varijante): "od X do Y"
            const nums = [...text(inner).matchAll(new RegExp(AMOUNT.source, "g"))].map(x => parsePrice(x[0])).filter(Boolean);
            if (nums.length >= 2 && /–|-\s*\d/.test(text(inner)) && new Set(nums).size > 1) variantsHtml = true;
            res.regular = res.price = nums[0] || null;
        }
        if (res.price) res.source = "html";
    }

    // 2) JSON-LD kao dopuna ili rezerva
    const ld = jsonLdProducts(html).map(offerInfo).find(Boolean);
    if (ld) {
        res.validUntil = ld.validUntil || null;
        if (!res.price && ld.price) { res.price = ld.price; res.regular = res.regular || ld.price; res.source = "json-ld"; }
        if (ld.variants) variantsHtml = true;
    }
    if (variantsHtml) { res.status = "varijante (cena zavisi od izbora na stranici)"; res.price = null; res.regular = null; res.sale = null; }
    else if (!res.price) res.status = "cena nije pronađena na stranici";
    return res;
}

function allowedUrl(u) {
    try {
        const x = new URL(u);
        if (!(x.protocol === "https:" || (ALLOW_HTTP && x.protocol === "http:"))) return false;
        return ALLOWED.includes(x.hostname);
    } catch { return false; }
}

async function main() {
    let defaults;
    try { defaults = JSON.parse(await readFile(DEFAULTS, "utf8")); }
    catch (e) { console.error(`Ne mogu da pročitam ${DEFAULTS}: ${e.message}`); process.exit(1); }
    const links = defaults.pinolesLinks || {};
    const keys = Object.keys(links);
    if (!keys.length) { console.log("Nema unetih Pinoles linkova (pinolesLinks je prazno). Ništa za preuzimanje."); return; }

    const items = {};
    let ok = 0;
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i], url = links[key];
        if (!allowedUrl(url)) { items[key] = { url, status: "link nije sa pinoles.com" }; console.log(`✗ ${key}: nedozvoljen link`); continue; }
        try {
            const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 20000);
            const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "sr,en;q=0.5" }, redirect: "follow", signal: ctrl.signal });
            clearTimeout(t);
            if (!r.ok) throw new Error("HTTP " + r.status);
            const html = await r.text();
            const info = extract(html);
            items[key] = { url, ...info };
            if (info.status === "ok") { ok++; console.log(`✓ ${key}: ${info.price}${info.sale ? " (akcija, redovna " + info.regular + ")" : ""} ${info.unit || ""}`); }
            else console.log(`! ${key}: ${info.status}`);
        } catch (e) {
            items[key] = { url, status: "greška: " + e.message };
            console.log(`✗ ${key}: ${e.message}`);
        }
        if (i < keys.length - 1) await sleep(DELAY);
    }

    if (!ok) { console.error("Nijedna cena nije preuzeta. Postojeći pinoles-cene.json se ne menja."); process.exit(1); }

    let previous = null;
    try { previous = JSON.parse(await readFile(OUT, "utf8")); } catch {}
    if (previous && JSON.stringify(previous.items) === JSON.stringify(items)) { console.log("Bez promena u odnosu na prethodno preuzimanje."); return; }
    await writeFile(OUT, JSON.stringify({ format: "mist-pinoles-prices", version: 1, updatedAt: new Date().toISOString(), items }, null, 2) + "\n");
    console.log(`Upisano ${OUT}: ${ok} od ${keys.length} cena.`);
}

import { fileURLToPath } from "node:url";
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
