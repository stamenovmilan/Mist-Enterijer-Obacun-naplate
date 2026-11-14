MiSt kalkulacija - GitHub Pages paket
====================================

SADRŽAJ
- Mist_Kalkulacija_MiSt_nova.html : aplikacija
- worker.js                      : Cloudflare Worker za proveru javno prikazanih cena
- wrangler.toml                  : konfiguracija Worker-a
- kurs.json                      : početni kurs EUR/RSD; postojeći GitHub Action može da ga osvežava
- .github/workflows/update-nbs-rate.yml : automatizacija kursa NBS
- mist-defaults.json             : početni podrazumevani cenovnik koji aplikacija učitava

1) OBJAVLJIVANJE APLIKACIJE NA GITHUB PAGES
1. Napravi GitHub repozitorijum, npr. mist-kalkulacija.
2. Raspakuj paket i otpremi SVE fajlove i .github direktorijum u glavni direktorijum repozitorijuma.
3. U GitHub-u otvori Settings > Pages.
4. Izaberi Deploy from a branch, granu main i folder /(root), pa Save.
5. Sačekaj objavu. Aplikacija će biti dostupna na https://TVOJ-KORISNIK.github.io/NAZIV-REPOZITORIJUMA/.

2) UKLJUČIVANJE PRETRAGE CENA (CLOUDFLARE WORKER)
Aplikacija je statički HTML i GitHub Pages ne može sam da čita druge prodavnice zbog CORS zaštite. Worker je posredni servis koji čita javne stranice prodavnica.
1. Napravi besplatan Cloudflare nalog.
2. Otvori Workers & Pages > Create > Worker.
3. Napravi Worker pod imenom mist-price-search.
4. Otvori Edit code i zameni sadržaj worker.js iz ovog paketa.
5. Deploy. Kopiraj Worker adresu, npr. https://mist-price-search.TVOJ-NALOG.workers.dev.
6. Otvori MiSt aplikaciju > VMCene > Ažuriranje cena okova preko interneta.
7. Nalepi Worker adresu u polje adrese servisa i klikni Sačuvaj adresu.
8. Klikni Ažuriranje cena okova.

U ovoj verziji Worker proverava javne stranice:
- Okov.rs
- Okov Market
- Euro-Profil

Ponuda se prikazuje samo kada je cena pronađena u javnom HTML/JSON-LD sadržaju, valuta je RSD, postoji direktan link do proizvoda i naziv dovoljno odgovara traženom artiklu. Prikazuju se samo cene različite od postojeće. Najviša cena je prva. Aplikacija zahteva ručni izbor i potvrdu pre izmene cenovnika.

VAŽNA OGRANIČENJA PRETRAGE
- Prodavnice menjaju strukturu sajtova. Ako promene pretragu ili način prikaza cene, potrebno je prilagoditi worker.js.
- Nije garantovano da će svaka prodavnica vratiti rezultate za svaki artikal. Worker ne izmišlja cenu ako ne može da je pročita.
- Za artikle koji se prodaju po paru, metru ili pakovanju rezultat se prihvata samo ako se jedinica poklapa sa traženom jedinicom. Ako prodavnica ne označava jedinicu, rezultat može biti izostavljen.
- Ova integracija je početna, proverljiva implementacija sa tri javna izvora, a ne tvrdnja da su obuhvaćene sve prodavnice u Srbiji.
- Pre korišćenja u ponudi kupcu proveri link i uslove prodavnice, naročito PDV, pakovanje, dostupnost i dostavu.

3) ČUVANJE PODRAZUMEVANOG CENOVNIKA NA GITHUB-U
Aplikacija može da učita mist-defaults.json pri otvaranju, a kroz GitHub API da sačuva izmene naziva i cena u isti fajl.
1. GitHub > Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token.
2. Izaberi samo svoj repozitorijum.
3. Repository permissions: Contents = Read and write.
4. Napravi token i kopiraj ga. Ne deli ga i ne stavljaj ga u javni HTML.
5. U aplikaciji otvori VMCene i odeljak Podrazumevani cenovnik na GitHub-u.
6. Unesi GitHub korisnika/organizaciju, naziv repozitorijuma, granu (obično main) i token.
7. Klikni Sačuvaj podešavanja, pa Sačuvaj kao podrazumevano na GitHub-u.
8. Aplikacija će ažurirati mist-defaults.json. Ostali uređaji učitavaju taj fajl pri otvaranju aplikacije.

Token se čuva u localStorage pregledača na uređaju na kom ga uneseš. Nemoj ovo koristiti na javnom ili tuđem računaru. Za bolju bezbednost koristi poseban fine-grained token ograničen samo na ovaj repozitorijum i opozovi ga kada ti više nije potreban.

4) TIPL
Prikazani naziv stavke Tipl promenjen je u „Tipl Double Power 8 × 65 mm (produženi)“. Interni ključ kalkulacije ostaje „Tipl“, tako da postojeće CSV prepoznavanje i obračun nisu prekinuti.

5) KURS NBS
Postojeći GitHub Actions workflow ažurira kurs.json prema NBS srednjem kursu. U GitHub repozitorijumu proveri Settings > Actions > General > Workflow permissions i dozvoli Read and write permissions da bi workflow mogao da ažurira kurs.json.
