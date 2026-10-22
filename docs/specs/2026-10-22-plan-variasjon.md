# Variasjon i treningsplanen

Dato: 2026-10-22. Status: **levert**; godkjent i samtale. Plan: `docs/plans/2026-10-22-plan-variasjon-plan.md`.

## 1. Mål

Planene føles statiske. En 10K-plan veksler i dag mellom 1 km-drag og terskel, «bygg form» mellom terskel og stigningsløp, og langturen er alltid lik. Målet er at **alle planer** (5K, 10K, halvmaraton, maraton, bygg form) får variasjon som også gjør løperen bedre, uten mer input fra brukeren.

- Flere typer kvalitetsøkter som roterer og blir gradvis tøffere. Alt kan løpes på flat vei.
- Stigningsløp på én rolig tur hver uke.
- «Bygg form» får et fokus, som i Strava (en distanse uten løp, eller General), og en formtest omtrent hver 8. uke som oppdaterer farten.
- Bakker er et valg, av som standard.
- En plan som starter midt i en uke, får bare rolige turer den første uka.

**Ikke med:** endring av planer som allerede finnes (de nye reglene gjelder nye planer og nye uker i «bygg form»), nye distanser (15K, 10 miles) og varierte langturer i løpsplaner.

## 2. Input

Én ny ting å velge i veiviseren, pluss én bryter:
- **«Bygg form»: fokus.** General (standard), 5K, 10K, halvmaraton eller maraton.
- **«I have hills nearby»**, gjelder alle planer, av som standard.

Alt annet (volum, fart, langtur, ukedager) er som i dag.

**Lagring:** `training_plans.distance_km` brukes også for fokuset i «bygg form» (`goal_kind = 'build'`). Løpsfart regnes da ut fra VDOT, siden det ikke finnes en måltid. Ny kolonne `training_plans.hills boolean default false`. Ny økttype `test` i `workout_type`.

## 3. Kvalitetsøkter

Familier, hver med en tabell for nivå 0–4 (samme nivåregel som i dag: framdrift i planen, begrenset av ukevolum):

| Familie | Type | Nivå 0 → 4 | Fart |
|---|---|---|---|
| Korte drag | intervals | 8 × 400 m, 10 × 400 m, 6 × 600 m, 8 × 600 m, 12 × 400 m | rep (400 m), interval (600 m) |
| Lange drag | intervals | 5 × 1 km, 6 × 1 km, 4 × 1200 m, 5 × 1200 m, 3 × 1600 m | interval |
| Løpsfart | intervals | per distanse (5K: 4 × 1 km … 3 × 2 km; 10K: 3 × 2 km … 3 × 3 km; halvmaraton: 2 × 3 km … 2 × 6 km) | race |
| Terskel | threshold | som i dag (3 × 8 … 4 × 10 min) | threshold |
| Fartslek | intervals | 8 × 1/1 min, 10 × 1/1 min, 6 × 2/1 min, 8 × 2/1 min, 5 × 3/1,5 min | interval (1 min), threshold (2–3 min) |
| Bakker | intervals | 6 × 60 s, 8 × 60 s, 10 × 60 s, 6 × 90 s, 8 × 90 s motbakke, jogg ned | ingen pace-mål |
| Maratonfart | tempo | som i dag | marathon |

**Rotasjon:** k = kvalitetsøkt nummer k i planen (som i dag), så samme input alltid gir samme plan. «Fart/bakke» betyr bakker når bryteren er på, ellers fartslek.

| Plan | Grunntrening | Oppbygging (roterer) | Topp (roterer) |
|---|---|---|---|
| 5K | fartslek/bakke | korte drag, terskel, lange drag, fart/bakke | løpsfart, korte drag, terskel |
| 10K | fartslek/bakke | lange drag, terskel, korte drag, fart/bakke | løpsfart, terskel, lange drag |
| Halvmaraton | fartslek/bakke | terskel, lange drag, fart/bakke, terskel | løpsfart, terskel, maratonfart |
| Maraton | fartslek/bakke | terskel, maratonfart, lange drag, fart/bakke | maratonfart, terskel |

- I grunntreningen blir fartsleken en lett kvalitetsøkt (nivå 0) når uka er på minst 20 km. Ellers bare stigningsløp, som i dag.
- I lettere uker: ingen kvalitetsøkt, men stigningsløp. Unntak: formtesten (§5).
- Nedtrapping: som i dag (korte, skarpe drag).
- Med to kvalitetsøkter i uka (5+ løp og ≥ 40 km) tas to naboer i rotasjonen.

## 4. «Bygg form»

Løpende blokker på 4 uker (3 bygg + 1 lettere), som i dag. Nye uker lages når planen nærmer seg slutten.

**Med fokus på en distanse:** blokkene veksler mellom oppbygging, oppbygging og topp (12 ukers syklus). Øktene velges fra tabellen for den distansen. Ingen nedtrapping og ingen løpsdag. Langturen bygges mot distansens mål.

**General:** blokkene veksler mellom
1. **Fart:** korte drag, fart/bakke, lange drag.
2. **Terskel:** terskel, og annenhver gang lange drag.
3. **Utholdenhet:** fartslek og terskel. Annenhver langtur avslutter med 2–3 km i maratonfart.

Langturen bygges mot 18 km (3 løp i uka) eller 20 km (4 løp eller flere), med tak på 22 km, så man lærer å løpe lengre.

## 5. Formtest

- **Når:** I «bygg form»-planer, i den lettere uka i hver andre blokk (uke 8, 16, 24 …), på dagen kvalitetsøkten ellers ville ligget.
- **Økt:** «Fitness test: 5K time trial». 2 km rolig, 5 km så raskt du klarer jevnt, 1,5 km rolig. Ingen pace-mål på klokka. Type `test`, regnes som hard.
- **Etterpå:** Når testen er gjort og koblet til en aktivitet med minst 4,8 km i testdelen, regnes VDOT ut fra de raskeste sammenhengende rundene som til sammen er 4,8–5,4 km (5 km-runden fra den sendte økta, eller fem 1 km auto-runder), ellers hele aktiviteten hvis den bare var testen. Aldri snitt over oppvarming og nedjogg (for tregt). Formtesten legges bare i uker på minst 18 km med minst 3 løp. En test de siste 14 dagene bestemmer farten: andre fartsforslag lages ikke da. Er forskjellen fra planens VDOT minst 0,5, lages et fartsforslag («Fitness test: 5 km in 22:31, VDOT 44.1 (plan 43.2). Update your paces?»). Både opp og ned, maks 3 ned. Det brukes med det eksisterende forslagssystemet.

## 6. Stigningsløp

6 × 20 s på én rolig tur hver uke i alle faser unntatt nedtrapping og løpsuke. Aldri på en restitusjonstur (dagen etter en hard dag eller langtur), som i dag.

## 6b. Langtur

I alle planer vokser langturen maks ~10 % over forrige fulle langtur (minst 1, maks 2 km per uke), også når ledig volum ellers ville løftet den. Lette uker og nedtrapping teller ikke som «forrige».

## 7. Første uke

Starter planen etter mandag, får den første uka ingen kvalitetsøkt. Bare rolige turer, eventuelt med stigningsløp, og langturen. Kvalitetsrotasjonen starter i første hele uke.

## 8. Testing (integrasjon)

- 10K-plan: minst 4 ulike økttitler blant kvalitetsøktene i oppbyggingen. Stigningsløp hver uke unntatt nedtrapping. Bakker bare med bryteren på.
- Plan som starter torsdag: ingen kvalitetsøkt i første uke.
- «Bygg form» General: blokker i rekkefølgen fart, terskel, utholdenhet. Formtest i uke 8. Langturen vokser over 16 km.
- «Bygg form» med 10K-fokus: løpsfartsøkter i toppblokken. Ingen løpsdag.
- Formtest gjort, fra en aktivitet → fartsforslag med riktig VDOT.
- Eksisterende plantester består fortsatt.
