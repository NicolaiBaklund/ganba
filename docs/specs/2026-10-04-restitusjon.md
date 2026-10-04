# Restitusjon — sammenhenger i egne data

Dato: 2026-10-04. Status: **godkjent**; del 1 under arbeid (plan: `docs/plans/2026-10-04-restitusjon-del1-plan.md`).
Beslutninger: `docs/02-decisions.md`, rader 2026-10-04 om restitusjonsfanen.

## 1. Mål

En ny fane, **Recovery**, som viser **sammenhenger over tid** i brukerens egne data: hva som påvirker søvn og restitusjon, og hva som påvirker hvordan øktene går. Dagsform viser klokka allerede og er ikke med.

- Grunnmuren er **regler og statistikk** (gratis, forklarbart, samme svar hver gang). **AI ligger oppå** og bruker bare tall motoren har verifisert.
- **Kvalitet foran mengde:** heller «trenger mer data» enn et usikkert funn.
- **Ingen ekstra logging.** Alt kommer fra Garmin og matloggingen brukeren allerede gjør.

**Suksess**
- Når en sammenheng faktisk finnes og dataene holder (ca. 4–8 uker), viser fanen den med riktig retning, og brukeren kjenner den igjen. Finnes ingen, sier fanen det ærlig i stedet for å finne på noe.
- Ren støy gir nesten aldri funn (testet, se §10).
- Brukeren kan alltid se tallene bak et funn.

## 2. Utenfor scope

- Dagsform/beredskapsscore (klokka viser den).
- Automatiske endringer i treningsplanen ut fra restitusjon (mulig senere via forslag).
- Vekt/energi-sammenhenger (dekkes av ukentlig innsjekk).
- Nye loggefelt (koffein, stress-dagbok o.l.).
- Stress fra Garmin (krever eget kall og brukes ikke i v1; ligger uansett i `raw` hvis det kommer med).
- Enhetstester (prosjektregel).

## 3. Navigasjon

- Bunnmeny: **I dag · Trening · + · Recovery · Kropp**. Mat-fanen fjernes.
- Måltidshistorikk: datopilene/ukestripa på I dag (som i dag) + lenke **«All meals»** på I dag til den eksisterende mat-historikken.
- Profil: ny bryter **«Use my health data with AI»** (se §7).

## 4. Data

### 4.1 Fra Garmin (per morgen)
- **Søvn:** total, dyp, lett, REM, våken (sekunder); søvnscore; leggetid og oppvåkning.
- **HRV:** snitt gjennom natta + Garmins normalområde (baseline) og status.
- **Hvilepuls.**
- **Body Battery:** opplading i natt (lagres, ikke brukt i v1-spørsmålene).
- Rått Garmin-svar lagres per dag (`raw`), så nye felt kan tas i bruk uten ny henting. Tidsserier (lister per minutt/epoke) tas ut før lagring; de er store og brukes ikke.

Adapteret får en ny kommando `fetch_recovery {tokens, dates[]}` som per dato henter søvn (dagssvaret inneholder søvnscore, hvilepuls, HRV-snitt, Body Battery-endring) og HRV-endepunktet (baseline). To kall per dag. Feltnavn verifiseres mot brukerens ekte konto i en spike før motoren bygges på dem.

### 4.2 Datoer
Søvn hører til **morgenen man våkner** (Garmins `calendarDate`). Natta mandag→tirsdag lagres på tirsdag og sammenlignes med mat/trening mandag.

### 4.3 Henting
- Vanlig synk: siste 3 dager, eller fra dagen før siste lagrede natt hvis den er eldre (maks 10 dager), så et opphold i synkingen ikke etterlater hull.
- **Historikk:** 90 dager bakover, **10 dager per synk** (20 kall; skånsomt mot Garmin). Fremdrift lagres på Garmin-kontoen (`recovery_backfilled_until`).
- Mangler en natt (klokke av/tom): ingen rad, aldri utfylt med snitt.

### 4.4 Mat per dag
- **Loggført dag:** minst 2 måltider **og** logget kcal ≥ 50 % av dagens kcal-mål. Andre dager får tomme matfaktorer og er ikke med i matspørsmål (en halvlogget dag ville gitt et kjempeunderskudd).
- **Underskudd** = forbruk (grunnforbruk + dagens aktivitet) − inntak. Ikke mål − inntak, som ville blandet inn vektmålet.
- **Karbo og protein** per kg (trendvekt).
- **Alkohol:** ny kolonne `food_items.alcohol_g`. AI-loggen lagrer den (feltet finnes i AI-svaret allerede, men lagres ikke per matvare i dag). Eksisterende rader fylles fra `ai_estimates.response` der det lar seg koble. Hurtiglogg og manuelle rader = 0. Drikkedag = `alcohol_g` > 0.
- **Sene måltider:** kcal etter kl. 20 lokal tid (`profiles.timezone`), fra måltidets `logged_at`.
  - I dag settes `logged_at` til *nå* også når man logger for en annen dag. Oppføringer der `logged_at` (lokal dato) ≠ `local_date` har derfor **ukjent klokkeslett**, og dagen er ikke med i spørsmålet om sene måltider.
  - Klokkeslett kan endres i redigeringsarket. Da regnes tiden som kjent.

### 4.5 Trening per dag
- **Hard dag:** planlagt kvalitetsøkt (intervall/terskel/tempo/løp) gjennomført, **eller** en aktivitet (alle typer) med Garmins Training Effect aerob ≥ 3,5 eller anaerob ≥ 2,0 (fra `activities.raw`). Dekker uplanlagte intervaller, fotball, styrke, sykkel.
- **Langtur:** planlagt langtur gjennomført, eller løp ≥ 90 min.
- Skritt, total treningstid.

### 4.6 Løpsform
Se §5.2.

## 5. Motoren (`packages/core/src/recovery/`)

Ren TypeScript, ingen I/O, deterministisk.

### 5.1 Daglige variabler
Fra dagsdata bygges én rad per dato med faktorer (mat, trening, søvn natta før, HRV om morgenen …) og utfall. Faktorer som mangler (ikke loggført dag, ukjent klokkeslett, ingen natt) er tomme, og raden er bare ute av spørsmålene som trenger dem.

### 5.2 Utfall
- **Søvnscore, HRV, hvilepuls** (morgenen etter dag D).
- **Løpsform**, to mål slått sammen:
  - *Rolige turer:* meter per hjerteslag = (meter per minutt) / snittpuls, for løp ≥ 20 min som ikke er kvalitetsøkter og ikke er innendørs. Høyere = bedre.
  - *Kvalitetsøkter:* faktisk tempo på dragene / planlagt tempo (samme måling som tempo-ned-forslagene). Lavere = bedre.
  - Hvert mål avtrendes for seg (se under), deles på sitt eget standardavvik og får fortegn slik at **høyere alltid er bedre**. Så slås de sammen til én serie «løpsform» (z-verdier).
- **Avtrending:** avvik fra brukerens glidende median over de **foregående** 28 dagene (30 for løpsform), med minst 14 verdier i vinduet for søvn/HRV/hvilepuls og minst 5 for hver løpstype (kvalitetsøkter er bare 1–2 i uka); ellers er dagens utfall tomt. Jevn formfremgang eller sesong gir dermed ikke falske funn.

### 5.3 Spørsmålskatalog (v1: 13 faktor–utfall-grupper = 21 tester)

| Id | Faktor | Utfall | Forskyvning |
|---|---|---|---|
| deficit→sleep/hrv/rhr | underskudd (kcal) | søvnscore, HRV, hvilepuls | dag D → morgen D+1 |
| carbs→sleep/hrv | karbo g/kg | søvnscore, HRV | D → D+1 |
| protein→sleep/hrv | protein g/kg | søvnscore, HRV | D → D+1 |
| alcohol→sleep/hrv/rhr | drikkedag ja/nei | søvnscore, HRV, hvilepuls | D → D+1 |
| late→sleep | ≥ 300 kcal etter kl. 20 ja/nei | søvnscore | D → D+1 |
| hard→hrv/rhr | hard dag ja/nei | HRV, hvilepuls | D → D+1 |
| long→hrv/rhr | langtur ja/nei | HRV, hvilepuls | D → D+1 |
| steps→sleep | skritt | søvnscore | D → D+1 |
| sleep→run | søvnscore natta før | løpsform | morgen D → økt D |
| hrv→run | HRV om morgenen | løpsform | D → D |
| carbs→run | karbo g/kg dagen før | løpsform | D−1 → D |
| deficit3→run | underskudd siste 3 dager (alle tre loggført) | løpsform | D−3..D−1 → D |
| rest→run | dager siden forrige harde dag | løpsform | → D |

### 5.4 Grupper
- Tallfaktorer: **øverste tredjedel mot nederste tredjedel** av brukerens egne verdier (midten droppes). Teksten bruker de faktiske grensene («more than 820 kcal deficit»).
- Ja/nei-faktorer: ja mot nei.

### 5.5 Krav før et funn vises
1. **Minst 8 dager i hver gruppe.**
2. **Effekt:** forskjell i snitt ≥ **0,4 standardavvik** av det avtrendede utfallet (SD over alle dager i vinduet).
3. **Test:** **blokkpermutasjon** — faktorverdiene stokkes i hele kalenderuker (blokker på 7 dager), ikke dag for dag, fordi dagene henger sammen (HRV går i perioder, underskudd kommer i uker). 2000 omstokkinger, fast frø = samme svar hver gang, tosidig.
4. **Korreksjon:** **Benjamini–Hochberg** over alle tester i denne beregningen som har nok data (krav 1), q ≤ 0,10.
5. **Kontroll:** for søvn/HRV/hvilepuls-spørsmål der faktoren ikke selv er trening: samme analyse **uten harde dager og langturdager** må gi samme retning og effekt ≥ 0,25 SD. Ellers stoppes funnet («likely training»).
6. **Vindu:** siste 90 dager.

### 5.6 Tre lister
Hver test havner i nøyaktig én liste:
- **Funn:** besto §5.5. Maks 5 vises, rangert etter effekt (så q).
- **No clear link:** ≥ 20 dager i hver gruppe og |effekt| < 0,2 SD.
- **Trenger mer data:** alt annet, med grunn:
  - for få dager: fremdrift («Alcohol: 3 of 8 nights»; for tallfaktorer «12 of 24 days», siden hver tredjedel trenger 8)
  - nok dager, men ikke avgjort (effekt 0,2–0,4 SD, eller ikke signifikant): «Not clear yet»
  - stoppet av kontrollen: «Likely training»
- **Alkohol-spørsmålene vises ikke i det hele tatt** før brukeren har minst 4 drikkedager i vinduet (ellers blir umeldt drikking «ingen alkohol» og gir feil svar).

### 5.7 Når
- Etter en Garmin-synk (nattlig cron + app-åpning) som ga nye data, **eller** når forrige beregning er over 6 timer gammel (fanger opp endret mat/vekt).
- Tidspunktet lagres (`garmin_accounts.recovery_computed_at`). Resultatet lagres (`recovery_findings`), så fanen åpner raskt og AI viser til nøyaktig samme funn.

## 6. Datamodell (ny migrasjon)

- `recovery_days` (user_id, local_date, sleep_s, deep_s, light_s, rem_s, awake_s, sleep_score, sleep_start, sleep_end, hrv_avg, hrv_baseline_low, hrv_baseline_high, hrv_status, resting_hr, body_battery_charged, raw jsonb; unik user+dato). RLS own_rows.
- `recovery_findings` (user_id, computed_at, question_id, factor, outcome, kind `finding|no_effect|needs_data`, reason (`few_days|unclear|training`, for needs_data), groups jsonb (grenser, n, snitt), effect_sd, q_value, control_ok, source `engine|ai`, ai_question_id (nullable), rank). Erstattes per beregning. RLS own_rows.
- `recovery_ai_questions` (user_id, created_at, spec jsonb, rationale, status `testing|accepted|rejected`, model, prompt_version). RLS own_rows.
- `recovery_summaries` (user_id, week_start, content jsonb, model, prompt_version, input/output tokens, cost_usd; unik user+uke). RLS own_rows.
- `recovery_day_answers` (user_id, local_date, question, content jsonb, input_hash, model, prompt_version, cost_usd). RLS own_rows.
- `food_items.alcohol_g` (numeric, default 0).
- `profiles.ai_health_consent` (bool, default false) + `ai_health_consent_at`.
- `activities.te_aerobic`, `te_anaerobic` (Training Effect, fra `raw`; brukes for «hard dag»).
- Del 1 lager `recovery_days`, `recovery_findings` (uten `ai_question_id`), `alcohol_g`, Training Effect og feltene på `garmin_accounts`. AI-tabellene, `ai_question_id` og samtykke kommer i del 2s migrasjon.
- `garmin_accounts.recovery_backfilled_until` (date) + `recovery_computed_at` (timestamptz).

## 7. AI

### 7.1 Felles
- **Bryter** «Use my health data with AI» i Profil, **av som standard** (samtykke; søvn/HRV er helseopplysninger). Teksten sier hva som sendes: daglige tall og funn, ingen bilder, ingen navn. Av → ingen AI-kall, AI-delene skjult, liten lenke «Turn on AI insights».
- Brukerens egen Anthropic-nøkkel. Modell `AI_RECOVERY_MODEL` (default `claude-sonnet-5`, samme som matrådene; byttes samlet senere).
- **Grunnregel:** AI får bare tabeller fra motoren. Strukturert svar der **hver setning har henvisninger** (`finding:<id>` eller `day:<dato>:<felt>`). Setninger med ugyldige/manglende henvisninger fjernes før visning. Står ingenting igjen, vises ingenting.
- Svarspråk = profilens språk.

### 7.2 A) Ukentlig oppsummering
- Uke = mandag–søndag. Lages første gang fanen åpnes etter at uka er slutt. Input: ukas daglige tall, verifiserte funn, neste ukes plan.
- Output: overskrift, 3–5 setninger, 1–2 tips for neste uke (med henvisninger). Lagres; én per uke.

### 7.3 B) Spør om en dag
- «Why?» i dagsarket. Input: dagen og dagen før, avvik fra egen normal per tall, funnene.
- 2–4 setninger. Sier ærlig fra når ingen faktor skiller seg ut.
- Lagres per dag med et fingeravtrykk (`input_hash`) av dataene. Er dataene endret siden (f.eks. rettet mat), vises «Data changed» og nytt svar lages først når brukeren trykker igjen.

### 7.4 C) AI foreslår spørsmål
- Én gang i måneden, når det finnes ≥ 60 dager data.
- AI ser **variabelkatalogen** med navn, enhet og statistikk **per variabel** (snitt, SD, antall dager), og eksisterende spørsmål. Den får **aldri** tall for faktor mot utfall (korrelasjoner, gruppesnitt): da ville den valgt spørsmål ut fra de samme dataene som testes, og testen blir skjev.
- Foreslår maks 3 nye i fast format: faktor (fra katalogen), transformasjon (tredjedel/ja-nei/terskel), utfall, forskyvning (−3..+1 dag), begrunnelse. Forslag som er like et eksisterende spørsmål (samme faktor, utfall og forskyvning) avvises.
- Motoren tester dem med §5.5 **pluss strengere korreksjon** (BH q ≤ 0,05 innen AI-forslagene). Bare de som består blir funn, merket «suggested by AI».

## 8. Skjermen

Følger Tasuki-redesignet (smale tall, linjer framfor kort, karmosinrød kun for det viktigste, lys/mørk modus) og bygges **etter at redesignet er slått sammen**, med dets komponenter.

Rekkefølge:
1. **Ukas oppsummering** (AI, sammenfoldbar; kun med bryter på).
2. **Funn** (maks 5): én linje med tall og n. Trykk → ark med to-gruppe-graf (punkt for punkt), hva som er kontrollert for, ev. «suggested by AI».
3. **Kurver:** søvnscore, HRV, hvilepuls, løpsform; 30 dager, normalområde som skygge, dagens verdi. Trykk dag → dagsark.
4. **No clear link** og **trenger mer data** (sammenfoldet).

**Dagsark:** søvnfaser som én stolpe, søvnscore, HRV og hvilepuls mot normal; dagen før (kcal mot mål, karbo, protein, alkohol hvis logget, sene måltider, trening); «Why?» (AI på).

**Tomme tilstander:** ikke koblet til Garmin (knapp), henter historikk («Fetching sleep data: 40 of 90 days»), lite data (kurver straks, funn med fremdrift).

## 9. Feil

- Garmin-feil: prøves igjen neste synk; historikk fortsetter der den stoppet.
- AI-feil / manglende nøkkel: funn og kurver virker; kort melding i AI-delene.
- Endret mat/vekt bakover: med i neste beregning (§5.7).

## 10. Testing (integrasjon)

- Falsk Garmin med søvndata: riktig morgen-dato, historikk 10 dager per synk, fremdrift lagres.
- Motor mot konstruerte data:
  - innlagt sammenheng → funn med riktig retning og størrelse
  - ren støy, 20 frø → **høyst 4 frø** med funn (q ≤ 0,10 tillater ca. 10 % datasett med et falskt funn; forventet ≤ 2)
  - støy der dagene henger sammen (AR(1), ρ = 0,6), 20 frø → høyst 4 frø med funn (fanger opp hvis blokkpermutasjonen ikke virker)
  - sammenheng som bare skyldes harde dager → «Likely training», ikke funn
  - alkohol uten logget drikke → spørsmålet vises ikke
  - avtrending: jevn HRV-økning uten årsak → ingen funn
  - halvlogget matdag og mat logget i etterkant → ute av hhv. matspørsmål og sene måltider
- AI-laget med falsk AI-respons: setninger uten gyldig henvisning fjernes; bryter av → null AI-kall.
- Smoke (Playwright) for fanen med demodata; nye README-skjermbilder.

## 11. Levering

1. **Del 1 – data og motor** (nå; rører ikke UI): adapter, tabeller, `alcohol_g`, henting/historikk, motor, beregning etter synk, API for å endre måltidstid. Begynner å samle data mens redesignet ferdigstilles.
2. **Del 2 – skjerm og AI** (etter redesign-sammenslåing): fanen, dagsark, navigasjon, Profil-bryter, klokkeslett i redigeringsarket for måltid, AI A/B/C.
