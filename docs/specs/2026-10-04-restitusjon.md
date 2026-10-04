# Restitusjon — sammenhenger i egne data

Dato: 2026-10-04. Status: **til godkjenning**.
Beslutninger: `docs/02-decisions.md`, rader 2026-10-04 om restitusjonsfanen.

## 1. Mål

En ny fane, **Recovery**, som viser **sammenhenger over tid** i brukerens egne data: hva som påvirker søvn og restitusjon, og hva som påvirker hvordan øktene går. Dagsform viser klokka allerede og er ikke med.

- Grunnmuren er **regler og statistikk** (gratis, forklarbart, samme svar hver gang). **AI ligger oppå** og bruker bare tall motoren har verifisert.
- **Kvalitet foran mengde:** heller «trenger mer data» enn et usikkert funn.
- **Ingen ekstra logging.** Alt kommer fra Garmin og matloggingen brukeren allerede gjør.

**Suksess**
- Etter ca. 4–8 uker med data viser fanen 1–5 funn som stemmer med det brukeren kjenner igjen, og ingen åpenbart tilfeldige.
- Ren støy gir ikke funn (testet).
- Brukeren kan alltid se tallene bak et funn.

## 2. Utenfor scope

- Dagsform/beredskapsscore (klokka viser den).
- Automatiske endringer i treningsplanen ut fra restitusjon (mulig senere via forslag).
- Vekt/energi-sammenhenger (dekkes av ukentlig innsjekk).
- Nye loggefelt (koffein, stress-dagbok o.l.).
- Enhetstester (prosjektregel).

## 3. Navigasjon

- Bunnmeny: **I dag · Trening · + · Recovery · Kropp**. Mat-fanen fjernes.
- Måltidshistorikk: datopilene/ukestripa på I dag (som i dag) + lenke **«All meals»** på I dag til den eksisterende mat-historikken.
- Profil: ny bryter **«Use my health data with AI»** (se §7).

## 4. Data fra Garmin

### 4.1 Hva som hentes (per morgen)
- **Søvn:** total, dyp, lett, REM, våken (sekunder); søvnscore; leggetid og oppvåkning.
- **HRV:** snitt gjennom natta + Garmins normalområde (baseline) og status.
- **Hvilepuls.**
- **Body Battery:** opplading i natt.
- **Stress:** snitt for dagen.
- Rått Garmin-svar lagres per dag (`raw`), så nye felt kan tas i bruk uten ny henting.

Adapteret får en ny kommando `fetch_recovery {tokens, dates[]}` som henter søvn (dagssvar inneholder søvnscore, hvilepuls, HRV-snitt, Body Battery-endring) og HRV-endepunktet (baseline). Feltnavn verifiseres mot brukerens ekte konto i en spike før motoren bygges på dem.

### 4.2 Datoer
Søvn hører til **morgenen man våkner** (Garmins `calendarDate`). Natta mandag→tirsdag lagres på tirsdag og sammenlignes med mat/trening mandag.

### 4.3 Henting
- Vanlig synk: siste 3 dager.
- **Historikk:** 90 dager bakover, **10 dager per synk** (ett kall per dag per endepunkt; skånsomt mot Garmin). Fremdrift lagres på Garmin-kontoen (`recovery_backfilled_until`).
- Mangler en natt (klokke av/tom): ingen rad, aldri utfylt med snitt.

### 4.4 Data appen allerede har
- **Mat per dag:** kcal mot dagsmål (underskudd), karbo og protein per kg (trendvekt), alkohol (`alcohol_g` fra AI-logg), kcal etter kl. 20 (fra måltidets tidspunkt).
- **Trening per dag:** hard økt (intervall/terskel/tempo/løp, eller uplanlagt løp med snittfart under terskelfart + 10 s/km), langtur (planlagt langtur eller løp ≥ 90 min), skritt, total treningstid.
- **Løpsform:** se §5.2.
- **Måltidstid:** måltider kan nå få endret klokkeslett i redigeringsarket, så «sene måltider» blir riktig også når man logger i etterkant.

## 5. Motoren (`packages/core/src/recovery/`)

Ren TypeScript, ingen I/O, deterministisk.

### 5.1 Daglige variabler
Fra dagsdata bygges én rad per dato med faktorer (mat, trening, søvn natta før, HRV om morgenen …) og utfall. Dager uten matlogging (under 800 kcal eller under 2 måltider) får tomme matfaktorer og er ikke med i matspørsmål.

### 5.2 Utfall
- **Søvnscore, HRV, hvilepuls** (morgenen etter dag D).
- **Rolige turer:** meter per hjerteslag = (meter per minutt) / snittpuls, for løp ≥ 20 min som ikke er kvalitetsøkter og ikke er innendørs.
- **Kvalitetsøkter:** faktisk tempo på dragene / planlagt tempo (samme måling som tempo-ned-forslagene).
- Alle utfall **avtrendes**: avvik fra brukerens glidende 28-dagers median (30 dager for løpsform). Jevn formfremgang eller sesong gir dermed ikke falske funn.

### 5.3 Spørsmålskatalog (v1)

| Id | Faktor | Utfall | Forskyvning |
|---|---|---|---|
| deficit→sleep/hrv/rhr | underskudd (kcal) | søvnscore, HRV, hvilepuls | dag D → morgen D+1 |
| carbs→sleep/hrv | karbo g/kg | søvnscore, HRV | D → D+1 |
| protein→sleep/hrv | protein g/kg | søvnscore, HRV | D → D+1 |
| alcohol→sleep/hrv/rhr | alkohol ja/nei | søvnscore, HRV, hvilepuls | D → D+1 |
| late→sleep | ≥ 300 kcal etter kl. 20 ja/nei | søvnscore | D → D+1 |
| hard→hrv/rhr | hard økt ja/nei | HRV, hvilepuls | D → D+1 |
| long→hrv/rhr | langtur ja/nei | HRV, hvilepuls | D → D+1 |
| steps→sleep | skritt | søvnscore | D → D+1 |
| sleep→run | søvnscore natta før | løpsform | morgen D → økt D |
| hrv→run | HRV om morgenen | løpsform | D → D |
| carbs→run | karbo g/kg dagen før | løpsform | D−1 → D |
| deficit3→run | underskudd siste 3 dager | løpsform | D−3..D−1 → D |
| rest→run | dager siden forrige harde økt | løpsform | → D |

### 5.4 Grupper
- Tallfaktorer: **øverste tredjedel mot nederste tredjedel** av brukerens egne verdier (midten droppes). Teksten bruker de faktiske grensene («mer enn 820 kcal underskudd»).
- Ja/nei-faktorer: ja mot nei.

### 5.5 Krav før et funn vises
1. **Minst 8 dager i hver gruppe.**
2. **Effekt:** forskjell i snitt ≥ **0,4 standardavvik** av det avtrendede utfallet.
3. **Test:** permutasjonstest (2000 omstokkinger, fast frø = samme svar hver gang), tosidig. **Benjamini–Hochberg** over alle spørsmål, q ≤ 0,10.
4. **Kontroll:** for søvn/HRV/hvilepuls-spørsmål der faktoren ikke selv er trening: samme analyse **uten harde trenings- og langturdager** må gi samme retning og effekt ≥ 0,25 SD. Ellers forkastes funnet («skyldes trolig treningen»).
5. **Vindu:** siste 90 dager.

### 5.6 Tre lister
- **Funn:** besto §5.5. Maks 5 vises, rangert etter effekt (så q).
- **Testet, ingen sammenheng:** ≥ 12 dager i hver gruppe og effekt < 0,2 SD.
- **Trenger mer data:** viser fremdrift («Alcohol: 3 of 8 nights»).
- **Alkohol-spørsmålene vises ikke i det hele tatt** før brukeren har logget drikke minst 4 dager (ellers blir umeldt drikking «ingen alkohol» og gir feil svar).

### 5.7 Når
Etter hver Garmin-synk (nattlig cron + app-åpning), maks hver 6. time hvis ingen nye data. Resultatet lagres (`recovery_findings`), så fanen åpner raskt og AI viser til nøyaktig samme funn.

## 6. Datamodell (ny migrasjon)

- `recovery_days` (user_id, local_date, sleep_s, deep_s, light_s, rem_s, awake_s, sleep_score, sleep_start, sleep_end, hrv_avg, hrv_baseline_low, hrv_baseline_high, hrv_status, resting_hr, body_battery_charged, stress_avg, raw jsonb; unik user+dato). RLS own_rows.
- `recovery_findings` (user_id, computed_at, question_id, factor, outcome, kind `finding|no_effect|needs_data`, groups jsonb (grenser, n, snitt), effect_sd, q_value, control_ok, source `engine|ai`, rank). Erstattes per beregning. RLS own_rows.
- `recovery_ai_questions` (user_id, created_at, spec jsonb, rationale, status `testing|accepted|rejected`). RLS own_rows.
- `recovery_summaries` (user_id, week_start, content jsonb, model, input/output tokens, cost_usd; unik user+uke). RLS own_rows.
- `recovery_day_answers` (user_id, local_date, question, content jsonb, model, cost_usd). RLS own_rows.
- `profiles.ai_health_consent` (bool, default false) + `ai_health_consent_at`.
- `garmin_accounts.recovery_backfilled_until` (date).

## 7. AI

### 7.1 Felles
- **Bryter** «Use my health data with AI» i Profil, **av som standard** (samtykke; søvn/HRV er helseopplysninger). Teksten sier hva som sendes: daglige tall og funn, ingen bilder, ingen navn. Av → ingen AI-kall, AI-delene skjult, liten lenke «Turn on AI insights».
- Brukerens egen Anthropic-nøkkel. Modell `AI_RECOVERY_MODEL` (default `claude-sonnet-5`).
- **Grunnregel:** AI får bare tabeller fra motoren. Strukturert svar der **hver setning har henvisninger** (`finding:<id>` eller `day:<dato>:<felt>`). Setninger med ugyldige/manglende henvisninger fjernes før visning. Står ingenting igjen, vises ingenting.
- Svarspråk = profilens språk.

### 7.2 A) Ukentlig oppsummering
- Lages første gang fanen åpnes etter at uka er slutt (som innsjekken). Input: ukas daglige tall, verifiserte funn, neste ukes plan.
- Output: overskrift, 3–5 setninger, 1–2 tips for neste uke (med henvisninger). Lagres; én per uke.

### 7.3 B) Spør om en dag
- «Why?» i dagsarket. Input: dagen og dagen før, avvik fra egen normal per tall, funnene.
- 2–4 setninger. Sier ærlig fra når ingen faktor skiller seg ut. Lagres per dag.

### 7.4 C) AI foreslår spørsmål
- Én gang i måneden, når det finnes ≥ 60 dager data.
- AI ser **variabelkatalogen** (navn, enhet, enkel statistikk; ikke rådata) og eksisterende spørsmål, og foreslår maks 3 nye i fast format: faktor (fra katalogen), transformasjon (tredjedel/ja-nei/terskel), utfall, forskyvning (−3..+1 dag), begrunnelse.
- Motoren tester dem med §5.5 **pluss strengere korreksjon** (q ≤ 0,05 innen AI-forslagene). Bare de som består blir funn, merket «suggested by AI».

## 8. Skjermen

Følger Tasuki-redesignet (smale tall, linjer framfor kort, karmosinrød kun for det viktigste, lys/mørk modus) og bygges **etter at redesignet er slått sammen**, med dets komponenter.

Rekkefølge:
1. **Ukas oppsummering** (AI, sammenfoldbar; kun med bryter på).
2. **Funn** (maks 5): én linje med tall og n. Trykk → ark med to-gruppe-graf (punkt for punkt), hva som er kontrollert for, ev. «suggested by AI».
3. **Kurver:** søvnscore, HRV, hvilepuls, løpsform; 30 dager, normalområde som skygge, dagens verdi. Trykk dag → dagsark.
4. **Testet uten sammenheng** og **trenger mer data** (sammenfoldet).

**Dagsark:** søvnfaser som én stolpe, søvnscore, HRV og hvilepuls mot normal; dagen før (kcal mot mål, karbo, protein, alkohol hvis logget, sene måltider, trening); «Why?» (AI på).

**Tomme tilstander:** ikke koblet til Garmin (knapp), henter historikk («Fetching sleep data: 40 of 90 days»), lite data (kurver straks, funn med fremdrift).

## 9. Feil

- Garmin-feil: prøves igjen neste synk; historikk fortsetter der den stoppet.
- AI-feil / manglende nøkkel: funn og kurver virker; kort melding i AI-delene.
- Endret mat/vekt bakover: med i neste beregning.

## 10. Testing (integrasjon)

- Falsk Garmin med søvndata: riktig morgen-dato, historikk 10 dager per synk, fremdrift lagres.
- Motor mot konstruerte data:
  - innlagt sammenheng → funn med riktig retning og størrelse
  - ren støy (flere frø) → **ingen** funn
  - sammenheng som bare skyldes harde dager → stoppes av kontrollen
  - alkohol uten logget drikke → spørsmålet vises ikke
  - avtrending: jevn HRV-økning uten årsak → ingen funn
- AI-laget med falsk AI-respons: setninger uten gyldig henvisning fjernes; bryter av → null AI-kall.
- Smoke (Playwright) for fanen med demodata; nye README-skjermbilder.

## 11. Levering

1. **Del 1 – data og motor** (nå; rører ikke UI): adapter, tabeller, henting/historikk, motor, beregning etter synk, måltidstid kan endres. Begynner å samle data mens redesignet ferdigstilles.
2. **Del 2 – skjerm og AI** (etter redesign-sammenslåing): fanen, dagsark, navigasjon, Profil-bryter, AI A/B/C.
