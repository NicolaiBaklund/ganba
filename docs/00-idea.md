# Loop — idé (rå)

Status: **idéfase / diskusjon**. Ingen tekniske valg er tatt ennå.

## Kort
Webapp (mobilvennlig, evt. PWA) som kombinerer **Runna** (treningsplan) og **MyFitnessPal** (kosthold).
Én plass for: treningsplan + status på trening + ernæring + vekt/kropp.

## Moduler (slik brukeren beskrev det)

### 1. Trening (fokus: løping)
- Treningsplan mot mål. Start: **10 km**.
- Økter genereres, evt. med AI (ingen tools, godt prompta) — "noe lignende Runna".
- Oppsett: enten **konkret løp** (dato + måltid) eller **åpent mål** (blokker med testløp). Pluss nåværende form, dager/uke, hvilke dager.
- **Ukentlig justering**: fast ramme (base → bygg → topp → taper), neste ukes økter justeres fra hva som faktisk ble gjort.
- Senere: daglig justering fra søvn/HRV.

### 2. Aktivitetssynk
- **Garmin primær** (full kobling, mest mulig data): økter, distanse, tempo, puls, kalorier, treningsbelastning, senere søvn/HRV.
- Strava sekundær/fallback.
- Ønske: **sende planlagte økter til klokka** (strukturerte økter via Garmin).

### 3. Ernæring
**v1:**
- **Bilde og/eller tekst → AI estimerer** matvarer, mengde, kcal og makroer. Bruker kan rette før lagring. (Erfaring: Claude-appen med Opus 5.5 har vært veldig god.)
- **Hurtigtillegg**: skriv inn kcal direkte, valgfritt protein/karbo/fett.

**Senere:** søk i matdatabase (Matvaretabellen/Kassalapp), strekkode, egne matvarer/oppskrifter/favoritter.

### 4. Kropp og vektendring (kjerneområde)
- Påkrevd vektmål: målvekt + tempo (kg/uke, f.eks. −1, −0.5, 0, +0.25).
- Kalorimål og makromål som i MFP, men **adaptive**: justeres ukentlig fra vekt-trend + faktisk inntak.
- AI-coach (lavmælt): ukentlig oppsummering av trening + mat + vekt, tips når relevant.
- Varsle hvis vektmål og treningsmål kolliderer (f.eks. stort underskudd i tung treningsuke).
- Logge **vekt**.
- Senere: bodyfat og andre mål.
- **Bilder** ved logging (progresjonsbilder).

### 5. Hjemskjerm ("i dag")
- Kort-basert, Runna-inspirert. Trykk på kort → mer detaljer.
- **Økt-kort øverst** (hvis økt i dag): planlagt økt (struktur, tempo, distanse) hvis ikke gjort; faktisk prestasjon (tempo, puls, splits, vs. plan) hvis gjort.
- **Mat + vekt** under (eller sveip sidelengs): kcal igjen, makroer, rask logg-knapp, dagens vekt.
- **Trend** under der igjen.
- Kroppslogg: vekt når som helst, trendlinje, valgfritt privat bilde, side-om-side-sammenligning.

### Senere
- Søvn (og evt. HRV, hvilepuls) — f.eks. fra Garmin.

## Målgruppe
Brukeren selv først. Skal kunne utvides til andre senere.

## Innspill fra Claude (til diskusjon, ikke besluttet)
Se [01-research-notes.md](01-research-notes.md).
