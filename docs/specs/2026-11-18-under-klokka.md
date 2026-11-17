# Under klokka: dom, spøkelse, ukas utfordring, hva uka kjøpte, løpsfart

Dato: 2026-11-18. Status: **godkjent** 2026-11-18 («Bygge da?»). Plan: docs/plans/2026-11-18-under-klokka-plan.md. Erstatter morgenlappen fra Health-specen (docs/specs/2026-11-02-health.md §7), men ikke varslene. Skisser: https://claude.ai/artifact/XZvHN34RE4Ar9sUgzR9QUo (mørk modus, med brukerens egne tall).

## 1. Hvorfor

Morgenlappen under løpsklokka på Training er skrevet av AI hver dag. Den gjentar bare planen og endringen i klokka («Yesterday you covered 12.3 km … No sessions are scheduled today»). Brukeren: «den gir meg virkelig 0». Grunnen er at AI får faste fakta og må skrive noe hver dag. Da blir det et referat.

Den plassen skal i stedet vise ting appen regner ut selv, og bare når de er nye: hvordan siste økt gikk målt mot målet, fremgang mot deg selv, noe å sikte på denne uka, og hva uka ga på løpstiden. Ingen AI, ingen kostnad, og ingen fyllpreik.

## 2. Mål

- **Svar etter hver økt:** gjorde jeg det riktig? Ett eller to ord og tallene bak.
- **Fremgang mot deg selv**, ikke bare mot et anslag.
- **Noe konkret å sikte på** hver uke, avgjort automatisk.
- **Treningen koblet til løpstiden:** hva uka ga.
- **Tomt når det ikke er noe nytt.**
- **Ingen innsats:** brukeren fyller ikke ut noe.

**Suksess:** brukeren ser på plassen etter en økt fordi den sier noe hen ikke visste.

## 3. Utenfor scope (nå)

- Sykkeløkter og styrke. Bare løping får dom, spøkelse og utfordring.
- Vær og temperatur.
- Stempler for utfordringer («4 på rad»). Kan komme senere.
- AI-tekst i denne plassen.
- Feil i planmotoren og i coachen: løpsfart i byggeplaner, at coachen sjekker at tittel og sone stemmer, og langturer som blir én runde på klokka. Tas i en egen diskusjon når dette er ferdig (se §13).
- Enhetstester (prosjektregel).

## 4. Hvor og når

All tekst i appen er engelsk.

### 4.1 Plassen
Rett under løpsklokka på Training (`RaceRoad`), der `MorningNote` står i dag. Uten løpsklokke står plassen øverst på siden, under tittelen, som i dag.

### 4.2 Én ting om gangen
Plassen viser én hovedting. Første som gjelder vinner:

1. **Varsel** (§10), så lenge det ikke er håndtert.
2. **Dom** (§5), med spøkelset (§6) under når det finnes. Den vises fra økta er synket til slutten av neste dag (lokal tid). Er det flere løpeturer, vises den siste.
3. **Hva uka kjøpte** (§8): søndag fra kl 18 og hele mandag, til første løpetur den uka er synket.
4. **Ukas utfordring** (§7), til den er avgjort.
5. **Ingenting:** plassen er borte, uten tom boks og uten «nothing new».

Er ukas utfordring ikke avgjort mens noe annet er hovedtingen, står den som én liten linje under: «This week: Beat 20:36 in the 5K test». Det er min avgjørelse (§14), så den ikke blir borte i dagene med dom.

### 4.3 Uten Garmin
Dom, spøkelse, utfordring, «hva uka kjøpte» og kontoen trenger runder fra klokka eller Garmins anslag. Uten Garmin vises bare varsler, slik det er i dag. Det gjelder også Training only med «Mark as done».

## 5. Dom på økta

### 5.1 Hvilken økt
Den sist synkede løpeturen. Er den koblet til en planøkt (`planned_workouts.activity_id`), dømmes den mot den økta. Ellers dømmes den som en rolig tur (§5.4), men bare hvis den er rolig (`isEasyRun`). En hard tur uten planøkt viser bare tallene, så en tur du løp hardt med vilje ikke får «Too fast for easy». Innendørs turer (tredemølle, `INDOOR` i `lib/recovery/load.ts`) får ikke dom-ord, fordi farten der er usikker. De viser bare tallene (§5.6).

### 5.2 Drag-runder (kvalitetsøkter)
Gjelder terskel, intervall, tempo, fartlek og formtest.

1. **Økter fra klokka:** Garmin merker rundene med `intensityType` (`ACTIVE`/`INTERVAL` for drag, `WARMUP`, `REST`, `COOLDOWN`) og `wktStepIndex`. Drag-rundene i rekkefølge pares med øktas «run»-steg etter at gjentakelsene er pakket ut (`blocks`). Hvert drag får sin sone (`target.minSecPerKm`–`maxSecPerKm`).
   **Avbrutt økt** (færre drag-runder enn steg, men alle har `wktStepIndex`): de løpte dragene dømmes, og tallinja får «1 of 2 reps».
2. **Uten `wktStepIndex`**, fordi økta ikke ble kjørt fra klokka: drag er runder på minst 400 m eller 90 s som er raskere enn rolig sone minus 10 s. Alle måles mot sonen til øktas første «run»-steg.
3. **Ingen drag funnet:** ingen dom-ord, bare tallene for hele turen.
4. **Fart per runde:** `movingDuration / distance`. Når Garmin gir `avgGradeAdjustedSpeed`, dømmes runden på den (bakker skal ikke gi «Too slow»). Tallet som vises er den vanlige farten.
5. **Avvik** = sekunder per km utenfor sonen, 0 når runden er innenfor.

### 5.3 Ordet for kvalitetsøkter
Første regel som slår til:

| Regel | Ord | Farge |
|---|---|---|
| Et drag mer enn 5 s raskere enn sonen | Too fast | rød |
| Et drag mer enn 5 s tregere enn sonen | Too slow | rød |
| Mer enn 8 s mellom raskeste og tregeste drag | Uneven | gul |
| Et drag opptil 5 s raskere | A bit fast | gul |
| Et drag opptil 5 s tregere | A bit slow | gul |
| Alle innenfor, og hvert drag raskere enn det før (minst 3 drag) | Faster each rep | grønn |
| Alle innenfor | On target | grønn |

Steg uten fartsmål (`target.kind = "none"`, for eksempel bakker) får ikke ord, bare tall.

### 5.4 Rolig tur, restitusjon, langtur, drag
Disse har ikke fartsmål i planen.

- **Fart:** snittet av rundene etter at drag-runder er tatt ut (under 200 m eller under 40 s). Klokka lager ofte en ekstra runde etter at økta er ferdig (gåing eller litt ekstra løping). Den blir med i snittet, fordi den er en del av turen. Måles mot rolig sone fra planens VDOT (`pacesFor(vdot).easy`). Uten plan brukes VDOT fra `fitnessFrom`.
- **Vanlig puls:** medianen av snittpuls på rolige turer de siste 42 dagene (`isEasyRun`, minst 5 turer). Med færre turer sjekkes ikke pulsen.

| Regel | Ord | Farge |
|---|---|---|
| Raskere enn rolig sone | Too fast for easy | gul |
| Puls mer enn 5 slag over vanlig | Heart rate high | gul |
| Ellers (også tregere enn sonen) | Nice and easy | grønn |

**Langtur med minst 4 runder på rundt 1 km:** en ekstra linje «Second half {n} s/km faster» eller «… slower» når forskjellen er minst 5 s.

### 5.5 Formtest og løp
- **Formtest:** ordet er tiden, «5K in 20:21». Grønn hvis den slår Garmins anslag den dagen. Gjelder testen er ny fart foreslått (`plan_proposals`), kommer linja «New paces suggested», med lenke til forslaget.
- **Løp:** «Half in 1:39:48» og «{n} faster than the clock» (eller «slower»). Det er klokka dagen før løpet.

### 5.6 Linja med tall
Under ordet står alltid tallene som ga dommen:
- **Drag:** «4:27 and 4:28. Zone 4:29–4:39. Heart rate 178 and 182.» Med mer enn 4 drag: «6 reps, 4:10–4:16. Zone 4:08–4:18.»
- **Rolig:** «5:22, heart rate 158. Normal for you.» (eller «7 above normal»).

Puls står som informasjon. Den avgjør bare ord for rolige turer.

Øverst står økttype som stripe, tittelen og ukedagen («Terskel 12 + 13 min, Mon»), som i skissen.

## 6. Spøkelset

En linje under dommen etter rolige turer og langturer (ikke kvalitetsøkter):

1. **Kandidater:** løpeturer ute de siste 182 dagene som er minst 14 dager eldre enn dagens tur, er rolige (`isEasyRun`) og har puls.
2. **Lignende:** distanse innenfor ±10 % av dagens. Den nyeste som passer vinner. Det er ikke samme rute, fordi GPS-spor ikke lagres.
3. **Sammenlign likt:** drag-runder tas ut av begge turene på samme måte (§5.4). Fart = bevegelsestid / distanse. Puls er snittpuls.
4. **Tekst** (avrundet til hele sekunder og slag):
   - Raskere og lavere puls: «12 km easy on 6 Nov: 5:46 at 163. **27 s/km faster, 4 bpm lower.**»
   - Fart innen ±5 s og puls minst 3 slag lavere: «… **Same pace, 4 bpm lower.**»
   - Raskere og høyere puls: «… **12 s/km faster, 6 bpm higher.**»
   - Tregere: «… **9 s/km slower, 2 bpm lower.**»
   - Under 3 s og under 2 slag forskjell: linja vises ikke.
5. **Ingen kandidat eller ingen puls:** ingen linje.

## 7. Ukas utfordring

### 7.1 Når den lages
Ved første lasting av Training (eller I dag) i en uke (mandag til søndag), når det finnes en aktiv løpeplan og Garmin. Den lagres (§11), så den ikke endrer seg i løpet av uka. Lages den midt i uka, velges bare blant økter som ikke er løpt ennå.

### 7.2 Nøkkeløkta
Blant ukas planlagte løpeøkter som ikke er løpt, velges første type i lista:
formtest, langtur med fartsavslutning (et «run»-steg i sonen race eller marathon til slutt), intervall/terskel/tempo/fartlek, vanlig langtur. Finnes ingen, velges «rolige uker» (§7.3, siste rad).

### 7.3 Maler

| Økt | Utfordring (engelsk) | Tall fra | Vunnet når |
|---|---|---|---|
| Formtest | Beat {tid} in the {distanse} test | Garmins anslag for distansen den dagen; uten det planens anslag | Testrundas tid < tallet |
| Intervall/terskel, sist bommet | Every rep in {min}–{max} | Øktas sone | Alle drag innenfor (§5.2) |
| Intervall/terskel, sist i sonen | Make the last rep the fastest | – | Siste drag raskest (lik innen 1 s teller) |
| Langtur med fartsavslutning | Last {km} km at {fart} or faster | Avslutningssteget, sonens øvre grense | Avslutningsrundas fart ≤ tallet |
| Vanlig langtur | Long run under {puls} bpm | Vanlig puls + 5 | Snittpuls ≤ tallet |
| Uke uten nøkkeløkt | Every easy run under {puls} bpm | Vanlig puls | Alle ukas rolige turer ≤ tallet |

«Sist» betyr forrige løpte økt av samme type. Finnes det ingen, brukes «Every rep in …».

**Ikke samme mal to uker på rad** når en annen mal passer ukas økter. Maler med puls hoppes over når vanlig puls mangler.

Under utfordringen: ukedagen og øktas tittel («Friday, Fitness test: 5K time trial»). For formtest står «Garmin's estimate for you now».

### 7.4 Avgjørelse
- Avgjøres når økta synkes (`afterGarminSync`), med samme rundematching som dommen.
- Resultatet lagres med tallet. Dommen etter økta viser «✓ 20:21» (grønn) eller «✗ 20:58» (rød) ved siden av ordet.
- «Every easy run under …» avgjøres søndag kl 23:59, eller med ✗ med en gang en rolig tur går over.
- Flytter coachen økta, følger utfordringen økta (`workout_id`). Blir økta fjernet eller ikke løpt innen uka er slutt, forsvinner utfordringen uten ✗.

## 8. Hva uka kjøpte

- **Tall:** Garmins anslag (`prediction_days`) for klokkas distanse denne søndagen minus forrige søndag. Mangler søndagen, brukes nærmeste dag før, inntil 3 dager tilbake. Mangler den også, vises ikke tingen.
- **Tekst:** «−2:29 on the half» (grønn), «+0:40 on the half» (nøytral grå, ikke rød), «No change on the half». Distansenavn: 5K, 10K, half, marathon.
- **Under:** «This week, 4 runs, 43.9 km» og tre små stolper: endringen denne uka og de to ukene før, med tallet under hver.
- **Uten løpsklokke** (ingen distanse): vises ikke.

## 9. Kontoen for løpsfart

En fast linje i `RaceRoad`, under «{n} days»: «Race pace 4:41: 0 of 4 km», med en tynn stripe i `--w-race` som fylles.

- **Vises bare i planer med en løpsdag:** en planlagt økt av typen `race` som ikke er fjernet og ikke har passert. Det må også være planlagt minst én km løpsfart før løpet. Den vises ikke i byggeplaner uten løp, og ikke dagen etter løpet.
- **Planlagt:** summen av «run»-steg med sonen `race` i økter før løpsdagen, som ikke er fjernet. Selve løpet teller ikke. Steg målt i tid regnes om til km med midten av sonen.
- **Løpt:** runder fra Garmin siden planen startet, på minst 400 m, der farten (gradjustert når den finnes) ligger i løpets sone ±3 s. Sonen er race-steget i løpsøkta. Fullført kan gå over planlagt («6 of 4 km»), og stripa er da full.
- **Fart i teksten:** midten av løpets sone.
- **Uten Garmin:** vises ikke.

## 10. Varsler (beholdes) og hva som forsvinner

- **Varsler** (`alertFor`: sick, easy_fast, sleep) virker som i dag: setningen fra `templateNote`, «Coach, this morning» i varselfarge, og «Swap to easy N km» / «Keep the plan» / «Got it». `daily_notes` beholdes for varsler (`alert`, `alert_done`, `text` = varselsetningen). Ventingen på søvn gjelder bare varselet. Mens appen venter, vises de andre tingene som vanlig, og teksten «waiting» vises ikke lenger.
- **Dager uten varsel:** ingen rad i `daily_notes`.
- **Forsvinner:**
  - AI-kallet: `NOTE_PROMPT`, `noteMessage`, `NoteSchema` og `NOTE_PROMPT_VERSION`.
  - `lastSession`, `today`, `tomorrow` og `clockDeltaS` i `NoteFacts`, og resten av `templateNote` utenom varselsetningene.
  - «Coach, this morning» på dager uten varsel.
- **Coachen:** konteksten (`lib/coach/context.ts`) får dagens dom (ord + tall) og ukas utfordring (tekst + status) i stedet for morgenlappens tekst. Varsler som før.

## 11. Data (ny migrasjon)

`weekly_challenges`:
- `id uuid`, `user_id` (cascade), `week_start date` (mandag), `workout_id uuid` (references planned_workouts on delete set null, null for «rolige uker»).
- `kind text` med check: `test_beat`, `reps_in_zone`, `last_rep_fastest`, `finish_fast`, `long_hr`, `easy_hr_week`.
- `params jsonb`: tallene, f.eks. `{ "targetS": 1236, "distance": "5k" }`.
- `result text` med check `won`/`lost`, null mens den er åpen. `result_value numeric` (tid i s, fart i s/km eller puls). `decided_at timestamptz`, `created_at`.
- `unique (user_id, week_start)`.
- RLS: eier kan lese, skriving skjer på serveren (som de andre tabellene).

Dom, spøkelse, «hva uka kjøpte» og kontoen regnes ut ved lasting og lagres ikke.

Reglene (rundematching, ord, spøkelse, malvalg, avgjørelse, kontoen) ligger i `packages/core/src/health/` som rene funksjoner. Henting av data ligger i `apps/web/lib/health/`.

## 12. Feil og tomme tilstander

- **Runder mangler** (`splits` er null, ikke synket ennå): kvalitetsøkt uten ord, rolig tur dømmes på hele turen.
- **Puls mangler:** pulsdelene hoppes over. Spøkelset vises ikke.
- **Plan uten VDOT eller sykkelplan:** ingen dom på rolige turer, fordi det ikke finnes noen rolig sone. Sykkelplaner får ingen utfordring.
- **Lasting feiler:** plassen er borte, som `MorningNote` i dag. Resten av siden påvirkes ikke.
- **Lys modus:** samme farger via tokens (`--success`, `--warning`, `--destructive`).

## 12a. Sjekket mot ekte økter (2026-11-18)

Alle 21 løpte planøkter fra én bruker sjekket mot klokkas runder. Både motorens og coachens økter er med.
- **Kvalitetsøkter** (terskel, intervall, fartlek): antall drag-runder (`ACTIVE`) er likt antall «run»-steg, og alle har `wktStepIndex`. Én avbrutt terskeløkt hadde 1 av 2 drag (derfor «1 of 2 reps»).
- **Rolig tur med drag:** første runde er den rolige delen, dragene er runder på cirka 20 s. Regelen om under 40 s tar dem ut.
- **Rolige turer og langturer:** ett steg gir én runde, pluss ofte en kort ekstra runde. Rolig dom, spøkelse og pulsutfordringer virker. «Second half …» virker ikke før motoren deler langturer (§13).
- **Tur uten økt på klokka:** én runde merket `INTERVAL`, uten `wktStepIndex`. Den bruker reserveregelen.
- **Formtesten** er ett «run»-steg på 5 km uten fartsmål. Det gir én runde, og tiden på den runden er testtiden.

## 13. Avhengigheter (egen diskusjon etterpå)

- **Løpsfart i byggeplaner:** i en byggeplan der løpet er lagt til, har sonen `race` ikke eget tempo. Den faller tilbake til terskelfart (`targetFor`). Da viser kontoen feil fart. Kontoen er riktig først når motoren gir løpsfart i slike planer.
- **Coachens økter:** coachen kan lage en økt der tittelen sier «race pace» og sonen er maratonfart. Dommen og utfordringen bruker sonen og stoler på den.
- **Langturer som ett steg** blir én runde på klokka. Da får «Second half …» (§5.4) ikke data. Kan løses i motoren eller ved å hente km-splitter fra Garmin.

## 14. Åpne valg (min anbefaling i parentes)

1. Ukas utfordring som liten linje under når noe annet er hovedtingen (ja, ellers ser man den knapt).
2. Grenser: 5 s for «a bit», 8 s for «Uneven», 5 slag for «Heart rate high», ±10 % for spøkelset (start sånn, juster etter noen uker med ekte data).
3. Gradjustert fart i dommen når Garmin gir den (ja).
4. Rød for «Too fast»/«Too slow» (ja, men bare på ordet, aldri hele plassen).

## 15. Testing (integrasjon)

- Dom: kvalitetsøkt med runder fra klokka (`intensityType`, `wktStepIndex`) for hvert ord i §5.3. Økt uten struktur. Rolig tur: for fort, høy puls, «Nice and easy». Tredemølle uten ord. Formtest med forslag.
- Spøkelse: nyeste kandidat innen ±10 %, minst 14 dager gammel. Drag tatt ut av begge. Ingen linje under grensene.
- Utfordring: lages én gang per uke og velger riktig mal. Ikke samme mal to uker på rad. Avgjøres ved synk med ✓ eller ✗ og tallet. Fjernet økt forsvinner. «Every easy run» avgjøres med ✗ med en gang.
- Hva uka kjøpte: søndag mot søndag, reserve for dag som mangler, tre uker.
- Kontoen: bare med løpsdag, planlagt og løpt km med ±3 s, ikke etter løpet.
- Prioritet: varsel > dom > uka kjøpte > utfordring. Tom plass uten noe.
- Varsler og «Swap to easy» virker som før (eksisterende health-test).
- Smoke: `health-smoke.mjs` oppdateres (dom, utfordringslinje, kontoen), mørk og lys.
