# Research-notater (kunnskap per 2026-09, må verifiseres før bygging)

## AI-bilde av mat — Opus 5.5 via API
- Samme modell (`claude-opus-5-5`) er tilgjengelig via Anthropic API med API-nøkkel. Bildeinput (vision) støttes.
- Claude-appen har egen systemprompt og kan ha tools (f.eks. websøk), men selve bildeforståelsen er den samme modellen. Med god prompt + strukturert output (JSON med matvarer, gram, makroer, usikkerhet) bør resultatet bli likt eller bedre enn i appen.
- Kost: betales per token (ikke dekket av Claude-abonnement). Ett bilde + svar er typisk noen få øre–kroner per logg. Må regnes ut når vi vet volum.
- API-nøkkel må ligge på server, aldri i nettleseren.
- **Priser (claude-api-skill, cache 2026-06-24), per 1M tokens inn / ut:** Opus 5.5 $4 / $20 (cache-lesing $0.20) · Sonnet 5 $2 / $10 · Haiku 4.5 $1 / $5.
- Bilde ≈ (bredde × høyde) / 750 tokens → 1024×768 ≈ 1050 tokens (tommelfingerregel, ikke verifisert for nyeste modeller).
- Opus 5.5: thinking kan ikke slås av; styres med `effort` (default `medium`). Thinking faktureres som output. Ingen prefill, ingen tvungen tool_choice → bruk structured outputs (`output_config.format`).
- Grovt estimat per matlogg (Opus 5.5): ~2.5k tokens inn (bilde + prompt, prompt caches) + ~1–2k ut (JSON + thinking) ≈ **$0.03–0.05**. 5 logger/dag ≈ $5–7.5/mnd per bruker. Må måles i praksis; `effort: low` og Sonnet 5 er spakene.

## Strava API
- Lese aktiviteter: ja (distanse, tid, puls, splits, kalorier på detaljert aktivitet).
- Sende strukturerte økter til klokke: **nei**, Strava støtter ikke det.
- Ny app starter med grense på 1 atlet (deg selv) inntil godkjenning — greit for personlig bruk.
- API-vilkår har restriksjoner på bruk av data (bl.a. AI/deling til andre). Må leses nøye hvis appen skal brukes av andre enn deg.

## Garmin
- Offisielt: Garmin Connect Developer Program (Activity API, Health API, Women's Health API, **Training API** for å pushe økter/planer til klokka, Courses API). Sjekket 2026-09-29:
  - FAQ: **kun for bedrifter** ("only for business use"), krever juridisk enhet. Personlig bruk avvises.
  - Ingen lisensavgift, men enkelte metrikker kan kreve lisens ved kommersiell bruk.
  - Svar innen 2 virkedager, integrasjon typisk 1–4 uker.
  - Søknad: https://www.garmin.com/en-US/forms/GarminConnectDeveloperAccess/
  - **Rapportert (Terra-blogg, ikke bekreftet på Garmins side):** nye søknader satt på pause i 2026 mens programmet oppdateres.
  - Konsekvens: for personlig fase er offisiell tilgang trolig ikke mulig nå. Aktuelt først hvis appen blir et produkt (f.eks. via ENK/AS).
- Uoffisielt: biblioteker som logger inn som deg (f.eks. `garminconnect`/`garth` i Python). Funker, kan både lese og laste opp økter, men er skjørt og i gråsone mot vilkår.
- Garmin gir også mer helsedata (søvn, HRV, hvilepuls, body battery) — nyttig for tilpasning av plan.
- Alternativ for økt-til-klokke: eksportere økt som fil (.FIT) og importere manuelt.

## Matdatabaser (Norge) — må verifiseres
- **Matvaretabellen** (Mattilsynet): offisiell norsk næringsinnhold for råvarer/generiske matvarer. Åpne data.
- **Open Food Facts**: åpen global database med strekkoder, varierende kvalitet på norske varer.
- **Kassalapp API**: norske dagligvarer med strekkode + næringsinnhold (har gratis nivå, sjekk vilkår).
- Egendefinerte matvarer/oppskrifter lagres per bruker.

## Vektendring — adaptivt kalorimål
- Apper som MacroFactor regner ut faktisk forbruk (TDEE) fra **vekt-trend + loggført inntak** over tid, i stedet for å stole på formler/klokke-kalorier.
- Prinsipp: hvis du spiste X kcal/dag i 2–3 uker og trendvekten endret seg Y kg, er forbruket ≈ X − (Y × ~7700 kcal) / dager.
- Glatter daglig vekt (vann, salt) med glidende snitt / eksponentiell utjevning.
- Deterministisk matte, ikke AI. Robust og forklarbart. AI kan legges på som coach (forklare, motivere, foreslå justeringer).
- Kalorier fra klokke er ofte overestimert — bør brukes forsiktig i kaloribudsjett.

### Hvorfor nettkalkulator (~2000) og Garmin (~2500) spriker
- Nettkalkulatorer: BMR × gjettet aktivitetsfaktor. Folk velger ofte "stillesittende" (×1.2), og trening telles ofte ikke med.
- Garmin: BMR + aktive kalorier fra skritt og puls. Pulsbaserte aktive kalorier er ofte for høye.
- Sannheten ligger typisk mellom. Eneste sikre måte: inntak vs. vekttrend over tid (adaptiv).
- Garmin "hvilekalorier" ser ut til å ligge nær BMR × 1.2 (dvs. inkluderer grunnnivå av dagliglivet), ikke ren BMR. Eksempel: Mifflin 2050 × 1.2 ≈ 2460 vs. Garmin ~2500. Ikke bekreftet av Garmin.
- Skritt: ca. 0.4 kcal per kg per 1000 skritt (gange). Skritt fra løping telles også i Garmins skritt — unngå dobbelttelling.
- Løping er et unntak der estimat er ganske presist: brutto ≈ 1 kcal per kg kroppsvekt per km, nesten uavhengig av tempo.

## Utvidelse til flere brukere — risiko
- Strava API-vilkår (fra 2024) begrenser bl.a. visning av en brukers data til andre og bruk av data i AI. Må leses nøye før appen åpnes for andre, spesielt om Strava-data sendes til Claude.

## Hvordan Runna-lignende planer typisk bygges
- Input: mål (distanse, måltid, dato), nåværende form (nylig 5k-tid e.l.), dager/uke, erfaring.
- Periodisering: base → oppbygging → topp → nedtrapping (taper).
- Økttyper: rolig, langtur, intervaller, terskel/tempo, restitusjon.
- Tempo-soner utledes fra nåværende form (f.eks. Jack Daniels VDOT-tabeller).
- Tilpasning: justerer basert på gjennomførte økter og ferske resultater.
- Mulig hybrid: deterministisk struktur/tempo-regning i kode + AI som velger/justerer økter og forklarer, med strukturert JSON-output.
