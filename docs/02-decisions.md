# Beslutningslogg

Format: dato — beslutning — begrunnelse.

| Dato | Beslutning | Begrunnelse |
|------|-----------|-------------|
| 2026-09-29 | Starte med konsept/idé, teknikk senere | Brukerens ønske |
| 2026-09-29 | Første treningsmål: 10 km løping | Brukeren trener mot 10k nå |
| 2026-09-29 | Målgruppe: brukeren selv først, utvides til andre senere | Bygg for én bruker, men ikke lås oss (datamodell med bruker-id, API-vilkår må sjekkes før utvidelse) |
| 2026-09-29 | Vektendring er et **kjerneområde**, ikke bare logging: kalorimål, makromål som i MFP + hjelp til å nå vektmål | Mange trener i sammenheng med vektendring |
| 2026-09-29 | Søvn: ønsket, men **senere** | "En ting av gangen" |

| 2026-09-29 | Vekthjelp = **adaptivt kalorimål + AI-coach** (nivå C) | Deterministisk TDEE-matte som kjerne, AI som coach oppå |
| 2026-09-29 | Vektmål er **påkrevd** ved oppstart: målvekt + tempo (kg/uke, f.eks. −1, −0.5, 0, +0.25) | Kalorimål utledes fra tempo |
| 2026-09-29 | AI-coach skal være **lavmælt**: ukentlig oppsummering + tips når relevant, ikke mas | "Så lenge det ikke blir for mye" |
| 2026-09-29 | Brukerens utstyr: **Garmin-klokke + Strava** | — |
| 2026-09-29 | **Garmin er primær datakilde** ("full kobling", mest mulig data). Strava sekundær/fallback | Garmin har mer data (puls, søvn, HRV, treningsbelastning) + kan motta økter |
| 2026-09-29 | Innsikt om samspill vekttap ↔ trening er en ønsket funksjon | Brukeren bekreftet |
| 2026-09-29 | Treningsplan: **ukentlig justering** (nivå B). Fast ramme (base → bygg → topp → taper), neste ukes økter justeres fra faktisk gjennomføring (fullført/droppet, tempo, puls) | Runna-lignende. Daglig justering fra søvn/HRV (nivå C) senere |
| 2026-09-29 | Matlogging v1: **bilde og/eller tekst → AI-estimat** (redigerbart før lagring) + **hurtigtillegg** (kcal, valgfritt makroer) | Minst friksjon. Database-søk, strekkode, egne oppskrifter kommer senere |
| 2026-09-29 | Plan-oppsett: **både konkret løp** (dato + måltid → periodisering mot løpsdag med taper) **og åpent mål** (blokker på 8–12 uker med testløp). Input også: nåværende form (fersk tid, evt. fra Garmin), antall dager/uke, hvilke dager | Brukeren har konkret løp + måltid nå |
| 2026-09-29 | Kroppslogg: vekt når som helst (anbefalt daglig morgen) med utjevnet trendlinje; valgfritt privat bilde per logg; side-om-side-sammenligning. Bodyfat/mål senere | Claude-forslag, ingen innvendinger |
| 2026-09-29 | **Hjemskjerm = "i dag"** (Runna-stil): 1) dagens økt-kort øverst — planlagt versjon hvis ikke gjort, faktisk prestasjon hvis gjort; 2) mat og vekt under (eller sveip til side); 3) trend under der. Trykk på kort → detaljer | Brukerens ønske |
| 2026-09-29 | **Byggerekkefølge: mat + vekt først.** Fase 1: mål-oppsett, AI-matlogg + hurtigtillegg, vektlogg m/ bilde + trend, enkel hjemskjerm. Fase 2: Garmin-lesing + treningsplan. Fase 3: AI-coach, økter til klokka | Raskest til daglig bruk, starter datainnsamling tidlig, Garmin-risiko blokkerer ikke. Brukeren bruker Runna for trening inntil videre |
| 2026-09-29 | Kalorimål: startestimat → **adaptivt (flyttet til fase 1)**, aktiveres automatisk etter 2–3 uker data, justerer ukentlig | Ren matte, trenger ikke Garmin |
| 2026-09-29 | Makro-default: protein 2 g/kg ved vekttap, fett ~25 % kcal, resten karbo. Overstyrbart | — |
| 2026-09-29 | Sikkerhet: tempo maks ~1 % kroppsvekt/uke, kcal-gulv med advarsel | — |
| 2026-09-29 | Fase 1: samme kcal-mål hver dag. Fase 2: dagsmål kan variere med treningsbelastning | — |
| 2026-09-29 | Startestimat = **lagdelt**: BMR (Mifflin-St Jeor) × hverdagsfaktor fra snitt skritt/dag + løpekcal (≈ 1 kcal × kg × km, snitt km/uke ÷ 7). Vises som område med forklaring. Fase 1: skritt og km/uke tastes inn; fase 2: hentes fra Garmin | Nettkalkulatorer (~2000) og Garmin (~2500) spriker for brukeren. Adaptiv beregning avgjør sannheten etter 2–3 uker |
| 2026-09-29 | AI-matlogg-flyt godkjent: bilde/tekst → liste per matvare (gram, kcal, makro, sikkerhet, antakelser) → rediger linjer eller korriger med tekst → lagre. Måltidstype auto fra klokkeslett. Bilde lagres med innslag | Prompt må itereres med ekte testing |
| 2026-09-29 | **Systemet designes generelt, ikke for én person.** Brukerkontoer og per-bruker-data fra start; ingen hardkodede personverdier | Brukerens ønske ("ikke kun for meg") |
| 2026-09-29 | Vekt og trend (fase 1): ett-trykk-logging, trendvekt (utjevnet) som hovedtall, graf med prognose mot mål, private bilder side om side, tåler hull | Presentert; brukeren sa "fortsett" |
| 2026-09-29 | Generelt-konsekvenser godkjent: alle kjønn/mål (ned/opp/hold), kjønnsspesifikk formel og kcal-gulv, oppgang-regler (overskudd, maks ~0.25–0.5 kg/uke), aktivitet = skritt + løpe-km + timer annen trening (MET), metrisk nå, personvern (egne data, private bilder, slett konto, GDPR ved åpning) | — |
| 2026-09-29 | Hjemskjerm fase 1 godkjent: kcal-ring + makrobarer, dagens måltider, trendvekt-kort, mini-graf. Stor "+" (Bilde/Tekst/Hurtig/Vekt). Bunnmeny: I dag, Mat, Kropp, Profil (Trening i fase 2). Dato-navigasjon for historikk | — |
| 2026-09-29 | Ukentlig innsjekk: **brukeren godkjenner** nytt mål (Godta / Behold forrige). Ingen auto-aksept | Brukeren valgte B |
| 2026-09-29 | Forbruk beregnes fra **faktisk inntak + faktisk trendendring**, aldri fra forrige mål. Glidende vindu 2–3 uker. Maks ±150 kcal endring/uke. Krever logg ≥5/7 dager | Brukerens presisering |
| 2026-09-29 | Offisiell Garmin-tilgang er kun for bedrifter (og muligens pauset) | Sjekket Garmin FAQ, se research-notes |
| 2026-09-29 | **Godkjent:** Forbruk deles i **grunnforbruk** (uten trening) + **treningsforbruk**. Adaptiv beregning finner grunnforbruk = inntak − vektendring − estimert treningskcal. Mål = grunnforbruk + treningskcal − underskudd. Fase 1: treningskcal = konstant fra oppstart (kan oppdateres). Fase 2: faktisk/planlagt fra Garmin → mål varierer | Brukeren påpekte: uke uten trening med samme inntak → vektøkning hvis forbruk er ett samlet tall |
| 2026-09-29 | **Dagsmål fase 2 = plan + korreksjon (B):** mål settes om morgenen fra planlagt økt; erstattes med faktisk når økt synkes; droppet økt → mål faller; uplanlagt økt legges til etter gjennomføring. Mulig innstilling senere: jevnt fordelt over uka (C) | Muliggjør fueling før økt; unngår kveldsspising (MFP-problemet) |
| 2026-09-29 | **Fase 1 konsept-spec godkjent** | Brukeren: "ser veldig bra ut" |
| 2026-09-29 | UI-språk: engelsk + i18n-klar (Claude-default, ikke eksplisitt bekreftet) | Appen skal åpnes for andre |
| 2026-09-29 | Brukerens erfaring: mest Python, kjent med TS/React. Claude skriver det meste | Påvirker stack-valg |
| 2026-09-29 | **Stack: Next.js + TypeScript (PWA) + Supabase**, Vercel-hosting. Garmin fase 2 som liten Python-tjeneste | Ett språk, raskest, flerbruker/RLS i grunnmur. Se 03-tech-notes |
| 2026-09-29 | Arkitektur godkjent: `packages/core` (ren TS) for energi/trend/food-ai, gjenbrukbar i senere Expo-app | Mulig native app senere |
| 2026-09-29 | AI-modell = konfigurasjon; start Opus 5.5, test billigere mot eval-sett | Kvalitet først, kutt kost basert på måling |
| 2026-09-29 | **Bring your own key** for nå: bruker legger inn egen Anthropic-nøkkel, kryptert server-side. Plattformnøkkel hvis produkt | Eier betaler ikke for andres bruk |
| 2026-09-30 | **Datamodell godkjent** (se 03-tech-notes): local_date/tidssone, energy_plans med grunnforbruk, totaler kun i food_items, flere bilder per innslag, separate buckets, AI-estimat-kjede, innsjekk lagrer grunnlag, api_keys kun server, alle vektmålinger lagres | Claude-gjennomgang, brukeren godkjente |
| 2026-09-30 | Ikke pose på bilder, ikke fiber | Liten verdi, mer innsats for bruker |
| 2026-09-30 | **Produktprinsipp: minst mulig innsats for brukeren.** Mye data, men samlet automatisk. Ikke for detaljert | "Om bruker alltid må gjøre masse, går man lei" |

## Åpne spørsmål
- (Teknisk fase) Garmin-tilgang. Offisielt program er kun for bedrifter og muligens pauset (se research-notes). Sannsynlig vei: uoffisielt bibliotek i personlig fase, bak adapter-lag; offisielt når/om appen blir produkt.
- (Teknisk fase) Ukentlig jobb, bildelagring, feilhåndtering, AI-priser. Se 03-tech-notes.
