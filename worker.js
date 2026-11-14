/** MiSt public-price lookup worker.
 * Only reads public product pages that visibly publish a retail price.
 * Deploy as a Cloudflare Worker; set no secrets or API keys.
 */
const SOURCES = [
  {
    id: "okov", name: "Okov.rs",
    search: q => `https://www.okov.rs/sr/pretraga/${encodeURIComponent(q)}`
  },
  {
    id: "okovmarket", name: "Okov Market",
    search: q => `https://okovmarket.rs/?s=${encodeURIComponent(q)}&post_type=product`
  },
  {
    id: "europrofil", name: "Euro-Profil",
    search: q => `https://www.europrofil.rs/rs/katalog/okov-za-namestaj?search=${encodeURIComponent(q)}`
  }
];
const UA = "Mozilla/5.0 (compatible; MiStPriceChecker/1.0; +https://pages.github.com/)";
const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function score(a, b) {
  const aa = new Set(norm(a).split(/\s+/).filter(x => x.length > 1));
  const bb = new Set(norm(b).split(/\s+/).filter(x => x.length > 1));
  if (!aa.size || !bb.size) return 0;
  let hit = 0; for (const t of aa) if (bb.has(t)) hit++;
  return hit / Math.max(aa.size, bb.size);
}
function absUrl(href, base) { try { return new URL(href, base).href; } catch { return ""; } }
function money(v) {
  if (typeof v === "number") return v;
  const s = String(v || "").replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const n = Number(s.replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : 0;
}
function collectJsonLd(html, base, store) {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const root = JSON.parse(m[1]);
      const walk = x => {
        if (!x) return;
        if (Array.isArray(x)) return x.forEach(walk);
        if (typeof x !== "object") return;
        const types = Array.isArray(x["@type"]) ? x["@type"] : [x["@type"]];
        if (types.some(t => String(t).toLowerCase() === "product")) {
          const offers = Array.isArray(x.offers) ? x.offers : [x.offers || {}];
          for (const o of offers) {
            const price = money(o.price ?? o.lowPrice);
            const currency = String(o.priceCurrency || "RSD").toUpperCase();
            if (price > 0 && currency === "RSD") out.push({ title: x.name || "Proizvod", price, currency, unit: "kom", store, url: absUrl(x.url || o.url || "", base), publicPrice: true });
          }
        }
        for (const v of Object.values(x)) if (v && typeof v === "object") walk(v);
      };
      walk(root);
    } catch {}
  }
  return out;
}
function collectWooCards(html, base, store) {
  const out = [];
  // WooCommerce product cards: title/link and visible price text in the same card.
  const cards = html.match(/<li[^>]*class=["'][^"']*(?:product|type-product)[^"']*["'][\s\S]*?<\/li>/gi) || [];
  for (const card of cards) {
    const a = card.match(/<a[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>/i);
    const title = (card.match(/class=["'][^"']*(?:woocommerce-loop-product__title|product-title)[^"']*["'][^>]*>([\s\S]*?)<\//i) || [])[1];
    const priceText = (card.match(/class=["'][^"']*(?:price|amount)[^"']*["'][^>]*>([\s\S]*?)<\//i) || [])[1] || card;
    const priceMatch = priceText.replace(/<[^>]+>/g, " ").match(/([\d.]+(?:,\d{1,2})?)\s*(?:RSD|rsd|din)/i);
    const price = priceMatch ? money(priceMatch[1]) : 0;
    const cleanTitle = (title || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    if (cleanTitle && price > 0 && a) out.push({ title: cleanTitle, price, currency: "RSD", unit: "kom", store, url: absUrl(a[1], base), publicPrice: true });
  }
  return out;
}
async function fetchSource(source, query) {
  const url = source.search(query);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml" }, redirect: "follow" });
    if (!res.ok) return [];
    const html = await res.text();
    return [...collectJsonLd(html, res.url || url, source.name), ...collectWooCards(html, res.url || url, source.name)]
      .filter(x => x.url && x.price > 0);
  } catch { return []; }
}
function queryFor(item) {
  // Search exact model/dimensions first. Do not invent a brand or SKU.
  return String(item.query || item.name || item.key || "").trim().slice(0, 100);
}
async function handle(request) {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors() });
  if (request.method !== "POST") return json({ error: "Use POST" }, 405);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!Array.isArray(body.items)) return json({ error: "Missing items[]" }, 400);
  if (body.items.length > 12) return json({ error: "Najviše 12 artikala po zahtevu." }, 400);
  const results = [];
  for (const item of body.items) {
    const query = queryFor(item);
    if (!query) continue;
    const lists = await Promise.all(SOURCES.map(s => fetchSource(s, query)));
    const candidates = lists.flat()
      .map(o => ({ ...o, matchScore: score(query, o.title) }))
      .filter(o => o.matchScore >= 0.45)
      .filter(o => String(o.unit).toLowerCase() === String(item.unit || "kom").toLowerCase());
    // Deduplicate same product URL; preserve only explicitly visible RSD prices.
    const unique = new Map();
    for (const o of candidates) {
      const old = unique.get(o.url);
      if (!old || o.price > old.price) unique.set(o.url, o);
    }
    results.push({ key: item.key, offers: [...unique.values()].sort((a,b) => b.price-a.price).slice(0, 12) });
  }
  return json({ results, checkedAt: new Date().toISOString(), sources: SOURCES.map(s => s.name) });
}
function cors() { return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin" }; }
function json(data, status=200) { return new Response(JSON.stringify(data), { status, headers: { ...cors(), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }); }
export default { fetch: handle };
