# MiSt Enterijer - kalkulacija

## Sadržaj paketa
- `Mist_Kalkulacija_MiSt_nova.html` - aplikacija
- `kurs.json` - poslednji poznati zvanični srednji kurs EUR/RSD NBS
- `.github/workflows/update-nbs-rate.yml` - GitHub Actions automatizacija za osvežavanje kursa

## Objavljivanje na GitHub Pages
1. Napravite novi GitHub repozitorijum (ili otvorite postojeći).
2. Postavite HTML fajl i `kurs.json` u isti, početni direktorijum repozitorijuma.
3. Postavite workflow fajl u tačnu putanju `.github/workflows/update-nbs-rate.yml`.
4. U repozitorijumu otvorite **Settings → Pages** i uključite objavljivanje sa grane `main`, folder `/ (root)`.
5. Otvorite **Settings → Actions → General → Workflow permissions** i dozvolite **Read and write permissions**.
6. U tabu **Actions** pokrenite workflow „Ažuriranje srednjeg kursa NBS“ jednom ručno preko **Run workflow**. Posle toga se automatski pokreće radnim danima u 07:15 UTC.

Aplikacija na GitHub Pages učitava `kurs.json` sa istog sajta. GitHub Actions preuzima zvaničnu srednju kursnu listu sa sajta NBS, ažurira JSON i čuva izmenu u repozitorijumu. Ako kurs trenutno nije dostupan, aplikacija zadržava poslednji sačuvani kurs.

## Čuvanje projekata
Dugme „Sačuvaj projekat“ preuzima JSON fajl na uređaj. „Učitaj sačuvani projekat“ vraća obračun sa tog fajla. Samo cenovnik i pravila ostaju lokalno u pregledaču; projekat je prenosiv preko JSON fajla.

## Pravila CSV krojne liste
Sekcija „Pravila CSV okova“ sadrži dva dela. Ugrađena pravila omogućavaju izmenu tekstualnih oznaka koje se prepoznaju u CSV-u i faktora za izračunavanje standardnog okova (šarke, šrafovi, klizači, pinovi, nogice itd.). Dodatna pravila omogućavaju dodavanje novog artikla sa nazivom, tekstom za prepoznavanje, faktorom količine i cenom. Količine pronađene u CSV-u ulaze u obračun i u PDF/tekstualni izvoz. Posle izmene ugrađenih pravila ponovo učitaj CSV fajl.
