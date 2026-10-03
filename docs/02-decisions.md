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
| 2026-09-30 | Ukentlig innsjekk beregnes ved første app-åpning på/etter innsjekkdag (ingen cron). Unik per uke | Brukeren må uansett godta; mindre drift |
| 2026-09-30 | Bilder: WebP ~1024 px klientside, private buckets, signerte URL-er, sletting følger innslag/konto | — |
| 2026-09-30 | Feilhåndtering: 2 SDK-retries, bilde/tekst beholdes ved feil, hurtigtillegg som fallback, offline-utkast lokalt. Observabilitet via ai_estimates + Vercel-logger | — |
| 2026-09-30 | AI-kost estimert ~$0.03–0.05 per logg med Opus 5.5 (se research-notes). Spaker: effort, Sonnet 5 | Må måles |
| 2026-09-30 | Appen skal være **gratis** for brukere | Brukerens avklaring (brukt i Garmin-søknad) |
| 2026-09-30 | Teknisk spec skrevet: specs/2026-09-30-fase1-teknisk.md | — |
| 2026-09-30 | Garmin Developer Program-søknad sendt inn via en kompis sitt ENK (Activity, Health, Training API) | Programmet krever bedrift. Avtale/ansvar ligger hos ENK-eier |
| 2026-09-30 | **Teknisk spec godkjent** (uten enhetstester) | Brukeren: "da fortsetter vi" |
| 2026-09-30 | **Design: appen skal se kul ut, Runna-inspirert.** Før UI-oppgavene: finn gode UX/design-inspirasjonskilder og lag en liten designretning | Brukerens ønske |
| 2026-09-30 | Fase 1 implementert (grenen `fase1`): alle planoppgaver unntatt publisering. Final review (1 kritisk, 6 viktige) rettet | Se docs/plans/2026-09-30-fase1-plan.md |
| 2026-09-30 | Innlogging: e-post med **6-sifret kode + token_hash-lenke** (virker i alle nettlesere/PWA). Krever tilpasset Magic Link-mal i Supabase | PKCE-lenke feiler i annen nettleser |
| 2026-09-30 | AI-skjema har `alcohol_g` (prompt v2) | Øl/vin ble ellers avvist av kcal-sjekken |
| 2026-10-01 | Skritt: i fase 2 hentes daglige skritt fra Garmin og telles som egen aktivitetsdel sammen med trening (valg C). Fase 1: skritt brukes kun i startestimatet | Brukeren valgte C |
| 2026-10-01 | **Fase 2 startet** (Garmin + treningsplan): idémyldring | Brukeren: "start on phase 2 now" |
| 2026-10-01 | Garmin-tilgang fase 2: **uoffisielt bibliotek** (garminconnect/garth), kun krypterte tokens lagres (aldri passord), Python-funksjon i samme Vercel-prosjekt, bak adapter-lag | Ingen svar fra Garmin på offisiell søknad |
| 2026-10-01 | **Grunnforbruk = passivt (BMR × 1.2).** All aktivitet (skritt over grunnnivå + økter) kommer fra Garmin per dag: forventet om morgenen (14-d snitt/plan), korrigert med faktisk. Ukentlig innsjekk trekker fra faktisk Garmin-aktivitet. Ved tilkobling trekkes onboarding-gangtillegget ut av grunnforbruket | Brukerens ønske: base skal ikke inneholde ekstra aktivitet |
| 2026-10-03 | Garmin-tall: **egne formler fra rådata** (skritt, km, varighet, puls) — ikke Garmins aktive kalorier (valg A). Samme formel med og uten Garmin | Konsistent med startestimat og innsjekk; Garmins kcal-tall varierer |
| 2026-10-03 | **Dagsmål bygges løpende** (erstatter "forventet 14-d snitt" i raden over): planlagt løp legges til på forhånd (fra plan, fase 2b), skritt og annen aktivitet legges til etter hvert som de synkes. Løpeskritt trekkes fra dagens skritt (skritt i Garmin-økter; ellers estimert fra km) så de ikke telles dobbelt | Brukerens forslag. Ærlig tall, likt MFP+Garmin |
| 2026-10-03 | Når fase 2a er ferdig: **wipe dev-databasen** og start på nytt | Brukerens ønske |
| 2026-10-03 | Garmin-synk: ved app-åpning + dra-ned-for-å-oppdatere (i dag + manglende dager siden sist), **pluss nattlig cron** (Vercel Hobby: 1/dag) som ferdigstiller gårsdagen for alle tilkoblede | Brukeren valgte B. Få kall = lav risiko for blokkering |
| 2026-10-03 | **Fase 2a + 2b planlegges sammen nå** og bygges i ett løp | Brukerens ønske |
| 2026-10-03 | Garmin-data: skritt per dag + økter med detaljer (runder, pulssoner, tempo per km). Rått Garmin-svar lagres per dag/økt. Restitusjon (søvn, HRV, hvilepuls) senere | Brukeren valgte C uten restitusjon |
| 2026-10-03 | Treningsplan: **regelmotor (i `packages/core`) som grunnmur + AI-justering i fritekst** (brukerens nøkkel). AI endrer kun innenfor motorens rammer. Tempo fra Garmin-løp (VDOT). Begge deler i fase 2b | Brukeren valgte C |
| 2026-10-03 | AI-justering av plan kjøres **kun når brukeren ber om det** (fritekst). Aldri proaktiv AI | Koster penger; brukeren styrer |
| 2026-10-03 | Planmål: løp med dato (5k, 10k, halvmaraton, maraton; måltid valgfritt, ellers estimert fra form) **+ «bygge form»-plan uten dato** (løpende, gradvis økning, lett uke innimellom). Belastning dempes ved stort kaloriunderskudd | Brukeren valgte B |
| 2026-10-03 | Brukeren setter **hvilke dager man kan trene** og **foretrukket langturdag** (evt. andre faste ønsker). Motoren planlegger innenfor dette | Brukerens ønske |
| 2026-10-03 | Plan-justeringer fra motoren (droppet økt, nye tempo, nedtrapping) kommer som **forslag brukeren godtar**, aldri automatisk. Får det ikke plass innenfor tilgjengelige dager, sier forslaget det | Brukeren valgte C: flytting er ikke alltid mulig |
| 2026-10-03 | AI-modell per bruk, som konfig: matlogg = Opus 5.5 (effort medium, `AI_FOOD_MODEL`), plan-justering = Opus 5.5 (`AI_PLAN_MODEL`, sjelden brukt, kvalitet viktig). Billigere modell for mat vurderes via eval | Kostnad per plan-justering ~$0.05–0.10 |
| 2026-10-03 | Planlagte økter **sendes til Garmin-kalenderen som strukturerte økter** (oppvarming, drag, tempo, pause) så klokka guider. Feiler opplasting → vises kun i app med beskjed | Brukeren valgte A. Runnas kjernefunksjon |
| 2026-10-03 | **Treningsplan og aktivitetsbasert dagsmål krever Garmin.** Uten Garmin: kun mat + vekt (fase 1-oppførsel, aktivitet fra oppstartsestimat) | Brukeren valgte A |
| 2026-10-03 | Garmin-arkitektur: **Python som tynt, tilstandsløst adapter** (Vercel-funksjon, garth/garminconnect). Next eier kryptering, DB og logikk; sender tokens + kommando, får data + evt. fornyede tokens. Delt hemmelighet mellom dem. Spike først: Python-funksjon i samme Vercel-prosjekt + MFA-innlogging | Brukeren valgte A |
| 2026-10-03 | Seksjon 1 (Garmin-tilkobling og synk) godkjent. Brukeren: «gjør så mye du kan» → resten av designet skrevet direkte i spec (Claude-valg merket): specs/2026-10-03-fase2-garmin-trening.md | Brukeren vil ha fart |
| 2026-10-03 | Implementering fase 2 (gren `fase2`), Claude-valg underveis: tempo-forslag kun oppover (lette uker gir ikke falsk nedgang); maraton toppvolum 50–90 km og langtur bygges mot 30 km; Garmin-økt-JSON bruker Garmins egne ID-er (distance=3, pace.zone=6); detaljer (runder/puls) hentes for maks 15 nye løp per synk; bunnmeny I dag · Trening · + · Mat · Kropp, profil via ikon på I dag; manuelle aktivitetsinnstillinger skjules for Garmin-brukere | Se ledger/oppsummering; kan endres |
| 2026-10-03 | Mat rundt økt: faste regler (gratis, alltid) + liten, diskré «Foreslå mat»-lenke som spør AI ved behov (valg C). Ikke stor knapp | Brukeren: «må ikke ha den knappen så stor» |
| 2026-10-03 | Mat rundt økt bygget: regler (før: måltid eller 1–1,5 g karbo/kg 2–3 t før; under >75 min: 30–60 g/t (>150 min 60–90), 4–8 dl væske/t; etter: 0,3 g protein/kg + 1 g karbo/kg etter harde/lange). Én linje på økt-kortet, seksjon på økt-siden, «Foreslå mat»-lenke (Sonnet 5, `AI_FUEL_MODEL`), svar lagres på økta. Ingen emojis — ikoner | Brukeren godkjente (uten emojis) |
| 2026-10-03 | Motor forbedret: hver uke treffer volumet (±5 %); kvalitet ≤ 25 % av uka (økter krympes i små uker: færre drag, kortere oppvarming); 2. kvalitetsøkt kun ved ≥ 40 km/uke; rolige turer min ~5 km (3–4 km kun ved svært små uker) — heller færre turer enn små; restitusjonstur dagen etter hard økt, medium-lang tur ved 4+ økter; rolig tur aldri lengre enn langturen (langturen tar overskuddet). Neste: ukentlig volumforslag ut fra faktisk løpt siste 3 uker | Brukeren godkjente punkt 1–4; «3 km er litt lite» |
| 2026-10-03 | Planstart ut fra historikk: erfaren løper (≥ 10 løp og ≥ 15 km/uke siste 4 uker) hopper over base-fasen; runder i terskelfart eller raskere siste 4 uker → kvalitetsøkter starter ett nivå opp; startvolum = høyeste av 4- og 2-ukers snitt (maks +20 % over 4-ukers), og uke 1 øker allerede (+8 %/+5 %); langturen starter fra lengste tur siste 4 uker. Kvalitet ≤ 30 % (én økt) / 40 % (to), inkl. oppvarming | Brukeren: «har løpt intervaller en måned» + «hvorfor ikke øke» |
| 2026-10-04 | Form (VDOT) = beste av utendørs løp ≥ 3 km, raske intervallrunder (nest raskeste per økt; 200–600 m som R-fart, 600–1600 m som I-fart) og Garmins 10k-estimat minus 1 VDOT. Tredemølle teller ikke. Kilden vises i veiviseren | Garmin-estimat 47:00; tredemølle ga falsk 38,6 |
| 2026-10-04 | Ytelse: Vercel-funksjoner i icn1 (Seoul) — samme region som Supabase-prosjektet (ap-northeast-2). Innlogging sjekkes lokalt (getClaims), bruker/Garmin-status caches per forespørsel, laste-skjelett ved fanebytte, plan-vedlikehold kun etter synk (ikke ved hver visning). Vurder EU-region ved DB-wipe | Fanebytte tok 1–2 s (DC ↔ Seoul per DB-kall) |

## Åpne spørsmål
- (Teknisk fase) Garmin-tilgang. Offisielt program er kun for bedrifter og muligens pauset (se research-notes). Sannsynlig vei: uoffisielt bibliotek i personlig fase, bak adapter-lag; offisielt når/om appen blir produkt.
