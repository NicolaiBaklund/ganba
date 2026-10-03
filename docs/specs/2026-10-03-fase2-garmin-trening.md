# Fase 2 — Garmin + treningsplan (konsept + teknisk)

Status: **utkast til gjennomgang** (2026-10-03). Brukeren ba Claude «gjøre så mye som mulig» etter seksjon 1, så resten av designet er skrevet uten seksjonsvis godkjenning. Punkter merket **(Claude-valg)** er tatt uten eksplisitt svar fra brukeren og kan endres.

Beslutninger med begrunnelse står i [02-decisions.md](../02-decisions.md) (rader fra 2026-10-01 og 2026-10-03).

## 1. Mål

- **2a:** Garmin-klokka leverer dagens aktivitet automatisk. Dagsmålet = passivt grunnforbruk + faktisk aktivitet (skritt + økter) + planlagt løp − underskudd. Ukentlig innsjekk bruker faktisk aktivitet.
- **2b:** Runna-aktig treningsplan mot løp (5k/10k/halvmaraton/maraton) eller «bygge form». Planen lages av en regelmotor, tempo fra Garmin-løp, økter sendes til klokka. Endringer kommer som forslag brukeren godtar. AI-justering i fritekst når brukeren ber om det.
- Treningsplan og aktivitetsbasert mål **krever Garmin**. Uten Garmin: fase 1-oppførsel.
- Restitusjon (søvn, HRV, hvilepuls) er **ikke** med, men rådata lagres så det kan bygges senere uten ny henting.

## 2. Garmin-tilkobling og synk (godkjent seksjon)

### Adapter (Python, tilstandsløst)
- Fil: `apps/web/api/py/garmin.py` (Vercel Python-funksjon, sti `/api/py/garmin`), bibliotek `garminconnect` (0.3.x; bruker curl_cffi, ikke lenger garth). `requirements.txt` i `apps/web/`.
- Kun én jobb: snakke med Garmin. Ingen DB, ingen krypteringsnøkkel, logger aldri innhold.
- Krever header `x-adapter-secret` = `GARMIN_ADAPTER_SECRET` (sammenlignes konstant-tid).
- Kommandoer (POST JSON `{ op, ... }`):
  - `login {email, password}` → `{ok, tokens}` eller `{mfa: true, mfaState}` eller `{error}`
  - `login_mfa {mfaState, code}` → `{ok, tokens}` / `{error}`
  - `fetch {tokens, from, to, activityDetailsFor: id[]}` → `{days[], activities[], details{}, tokens?}`
  - `push_workout {tokens, workout, date}` → `{workoutId, scheduleId, tokens?}`
  - `delete_workout {tokens, workoutId, scheduleId?}` → `{ok, tokens?}`
- `tokens` = `client.dumps()` (DI-token + refresh-token). Returneres bare når de er fornyet.
- **MFA:** biblioteket holder halvferdig MFA-innlogging i minnet (session-cookies + noen felt). Adapteret serialiserer dette til `mfaState` (JSON), Next krypterer og lagrer 5 min, sender det tilbake med koden. **Må verifiseres i spike** med ekte konto. Fallback hvis det ikke lar seg gjøre: login-kallet venter på koden via en kort polling-løsning (beskrives da i planen).
- Feiltyper: `auth` (feil passord / utløpte tokens), `mfa_invalid`, `rate_limited`, `unavailable`.
- Lokal utvikling: `python apps/web/api/py/dev_server.py` på port 3200; Next bruker `GARMIN_ADAPTER_URL` (default i prod: samme domene `/api/py/garmin`).

### Next (TypeScript) eier resten
- `lib/garmin/adapter.ts`: interface `GarminSource` (`login`, `loginMfa`, `fetch`, `pushWorkout`, `deleteWorkout`) + HTTP-implementasjon. Integrasjonstester bruker en falsk implementasjon med fixture-data.
- Tokens krypteres med eksisterende AES-256-GCM (`API_KEY_ENCRYPTION_SECRET`).
- `syncGarmin(userId)`:
  1. Område: fra `last_synced_date − 1` til i dag (maks 30 dager tilbake). Første synk: **90 dager**.
  2. Henter skritt per dag, økter i området, detaljer (runder, pulssoner, tempo per km) for nye løpeøkter.
  3. Upsert `garmin_days` og `activities`. Rått svar lagres.
  4. Kobler løpeøkter til planlagte økter (se §5.6) og markerer dager før lokal «i dag» som ferdige.
  5. Fornyede tokens lagres med en gang.
- Utløsere: app-åpning (klient-komponent kaller `POST /api/garmin/sync` hvis > 15 min siden sist), dra-ned / synk-knapp, nattlig cron `GET /api/cron/garmin` (Vercel cron 03:00 UTC, `Authorization: Bearer CRON_SECRET`) som synker siste 2 dager for alle tilkoblede brukere én etter én, og skyver økter for de neste 14 dagene til Garmin (§6).
- Lås: synk hopper over hvis en synk for brukeren startet for < 2 min siden (`sync_started_at`).

### Koble til / fra
- Profil → «Koble til Garmin»: e-post + passord (+ MFA-kode). Passord kun i minnet under kallet.
- Ved første tilkobling: ny `energy_plans`-rad (gyldig fra i dag) med grunnforbruk **minus gangtillegget** fra oppstartsestimatet, kilde `garmin_connect`. Etter dette skal grunnforbruket kun være passivt.
- Koble fra: sletter tokens, beholder synkede data. Planlagte økter i Garmin-kalenderen slettes (best effort).
- Status `reauth_required` → banner på I dag: «Garmin trenger ny innlogging».

## 3. Aktivitet og dagsmål (2a)

### Formler (egne, fra rådata — valg A)
For en dag med Garmin-data og vekt `kg` (trendvekt):
- **Løpeøkt:** `km × kg × 0.9` (som i dag).
- **Annen økt:** `timer × (MET(type) − 1) × kg`. MET-tabell per Garmin-type **(Claude-valg)**: sykling 7, svømming 7, styrke 4, langrenn 8, roing 6, annet 5. Gå/fjelltur telles via skritt (ikke som økt) så de ikke dobbelttelles.
- **Skritt:** `gangskritt = max(0, dagens skritt − løpeskritt)`, der løpeskritt = skritt registrert i løpeøkter, ellers `km × 700`. `skrittkcal = max(0, gangskritt − 4000)/1000 × 0.4 × kg`.
- **Aktivitet(dag)** = skrittkcal + Σ økter.

### Dagsmålet bygges løpende
`mål = grunnforbruk + aktivitet hittil + planlagt løp som ikke er gjort ennå − underskudd` (gulv som før).
- Planlagt løp i dag (fra plan) legges til fra morgenen: `planlagt km × kg × 0.9`. Når en løpeøkt synkes den dagen, erstattes det planlagte med det faktiske.
- Fortid: dagen er endelig når den er synket etter midnatt. Dag uten data fra klokka (ingen skritt): snitt av aktivitet siste 14 dager med data.
- I dag-skjermen viser oppbygningen: grunnforbruk, aktivitet, planlagt økt, underskudd.
- Uten Garmin: uendret fase 1 (aktivitet fra `activity_baselines`).

### Innsjekk
For Garmin-brukere: `avgTrainingKcal` = snitt av faktisk aktivitet(dag) i vinduet (manglende dager = 14-d snitt). Ellers som før. Formelen i `computeCheckin` er uendret.

## 4. Treningsplan — konsept (2b)

### Oppsett (Trening-fanen, «Lag plan»)
1. **Mål:** løp (5k / 10k / halvmaraton / maraton + dato + valgfritt måltid) eller «Bygge form».
2. **Dager:** hvilke ukedager du kan løpe, antall økter per uke (forslag = antall dager, maks 6), langturdag.
3. **Oppsummering:** nåværende form (km/uke, VDOT, beregnet løpstid), foreslått måltid hvis ikke oppgitt, uke-for-uke-volum. «Lag plan».
4. Planen lages og de neste 14 dagene sendes til Garmin.

Form hentes automatisk fra 90 dager Garmin-historikk. Valgfritt felt: «nylig løpstid» som overstyrer. Har man under 2 uker med løp, starter planen forsiktig (§5.2).

### Hva brukeren ser
- **Trening-fanen:** forslag-kort øverst (hvis noen), denne uka med økter (dag, type-farge, km, status), kommende uker sammenfoldet, plan-info (mål, uker igjen, beregnet tid). Knapp «Juster med AI».
- **Økt-detalj:** stegene (oppvarming, drag × N @ tempo, pause, nedjogg), planlagt vs faktisk (km, tid, tempo, puls, runder), Garmin-status («på klokka» / «ikke sendt»).
- **I dag:** økt-kort (dagens økt eller «hviledag»; etter gjennomføring: faktiske tall), kcal-kortet viser planlagt løp som del av målet.
- **Navigasjon (Claude-valg):** bunnmeny = I dag, Trening, [+], Mat, Kropp. Profil flyttes til ikon øverst til høyre på I dag.

### Endringer
- **Regelmotoren** foreslår endringer (kort på Trening og I dag, godta/avvis):
  - Droppet nøkkeløkt (kvalitet/langtur): flytt til ledig dag samme uke innenfor tilgjengelige dager og ikke dagen før/etter en annen hard økt; ellers «stryk».
  - Nye tempo: når form-estimatet (VDOT) fra siste løp avviker ≥ 1.0 fra planens.
  - For lite gjennomført: fullført < 70 % av planlagt km to uker på rad → trapp ned kommende uker fra faktisk nivå.
  - Lettløpte enkeltøkter som droppes gir ingen forslag (de bare telles som droppet).
- Maks ett ventende forslag per type. Forslag som blir utdatert (dagen har passert) markeres `stale`.
- **AI-justering** kun på forespørsel (§7).

## 5. Treningsplan — regelmotor (`packages/core/src/training/`)

Ren TypeScript, deterministisk, ingen I/O.

### 5.1 Form (VDOT, Jack Daniels)
- `vo2(v) = −4.60 + 0.182258·v + 0.000104·v²` (v i m/min)
- `pct(t) = 0.8 + 0.1894393·e^(−0.012778·t) + 0.2989558·e^(−0.1932605·t)` (t i min)
- `vdot(d, t) = vo2(d/t) / pct(t)`
- Form fra historikk: høyeste VDOT blant løp ≥ 3 km siste 8 uker (hele økta, eller beste sammenhengende runder ≥ 3 km hvis tilgjengelig). Ingen løp: 30 (svært forsiktig) **(Claude-valg)**.
- Løpstidsprediksjon: løs `vdot(d, t) = V` for t (halvering).
- Treningstempo (fart der `vo2(v) = V × andel`), andeler **(Claude-valg)**: Rolig 0.65–0.74, Maraton 0.80, Terskel 0.88, Intervall 0.975, Repetisjon 1.05. Tempo vises som område ±5 s/km (rolig: hele området).

### 5.2 Volum
- Startvolum = snitt km/uke siste 4 uker (min `økter × 3 km`).
- Ukentlig økning 8 % (maks 10 %); **5 %** når vektmålet har underskudd > 500 kcal/dag.
- Hver 4. uke er lett uke (−25 %).
- Toppvolum: `clamp(start × 1.5, min, maks)` per distanse: 5k 20–50, 10k 25–60, halv 30–70, maraton 40–90 km.
- Langtur ≈ 30 % av ukevolum, tak: 5k 14, 10k 18, halv 22, maraton 32 km.
- Nedtrapping: 5k/10k siste uke 70 %; halv siste 2 uker 80/60 %; maraton siste 3 uker 80/65/50 %.
- Plan-lengde = uker til løpsdato. < 4 uker: kortversjon (ingen bygg, bare skarphet + nedtrapping) med advarsel. > 20 uker: «bygge form» frem til 20 uker før, så løpsplanen.

### 5.3 Faser og økttyper
- Faser: Base → Bygg → Topp → Nedtrapping (løp); Bygge form = løpende blokker på 4 uker (3 opp, 1 ned), genereres 4 uker frem og forlenges lazy ved app-åpning.
- Økttyper (fast farge per type): `easy`, `long`, `intervals`, `threshold`, `tempo` (maratonfart), `strides` (rolig + stigningsløp), `race`.
- Uke-mal per antall økter:
  - 2: kvalitet + langtur
  - 3: rolig + kvalitet + langtur
  - 4: rolig + kvalitet + rolig + langtur
  - 5: rolig + kvalitet + rolig + kvalitet 2 + langtur (kvalitet 2 kun i Bygg/Topp, ellers rolig m/ stigningsløp)
  - 6: som 5 + rolig
- Kvalitet per fase og distanse:
  - Base: stigningsløp / kort fartlek
  - Bygg: annenhver uke intervall (I-tempo, 3–5 min drag) og terskel (T-tempo, 2×10 → 3×10 min)
  - Topp: 5k/10k intervall + terskel; halv terskel + maratonfart; maraton maratonfart i langtur + terskel
  - Nedtrapping: korte drag, redusert mengde. Løpsdagen = `race`.

### 5.4 Plassering på dager
- Kun tilgjengelige ukedager. Langtur på valgt dag. Kvalitet så langt fra langturen som mulig, aldri dagen før/etter en annen hard økt hvis det kan unngås. Rolige fyller resten.
- Flere økter enn tilgjengelige dager → antall økter = antall dager.

### 5.5 Strukturert økt (lagres som JSON, sendes til Garmin)
```ts
type Target = { kind: "pace"; minSecPerKm: number; maxSecPerKm: number } | { kind: "none" };
type Step = {
  kind: "warmup" | "run" | "recover" | "cooldown";
  duration: { kind: "distance"; m: number } | { kind: "time"; s: number } | { kind: "open" };
  target: Target;
};
type Block = Step | { kind: "repeat"; times: number; steps: Step[] };
interface PlannedWorkout {
  date: ISODate; type: WorkoutType; title: string; blocks: Block[];
  plannedKm: number; plannedDurationS: number; week: number; phase: Phase;
}
```

### 5.6 Kobling til faktisk økt
- Løpeøkt på samme dato som planlagt økt → `done`, `activity_id` settes. Flere løp samme dag: den lengste.
- Løp på en dag uten planlagt økt: lagres og teller i aktivitet; ingen plan-endring.
- Planlagt dag passert uten løp → `missed` (ved synk/åpning).

### 5.7 Forslag (proposals)
Motoren lager `ProposalChange[]`: `move {workoutId, toDate}`, `drop {workoutId}`, `replace {workoutId, workout}`, `rescale {fromDate, factor}`, `repace {vdot}`. Godta → endringene utføres, berørte økter skyves på nytt til Garmin.

## 6. Økter til Garmin
- Rullerende vindu: de neste **14 dagene** med planlagte økter ligger i Garmin-kalenderen.
- Oversettelse `PlannedWorkout → Garmin workout JSON` (sportType running, steg med `endCondition` distance/time/lap.button, `targetType` pace.zone i m/s). Gjøres i TypeScript; adapteret sender JSON videre.
- Endret/flyttet/strøket økt: slett gammel (unschedule + delete), last opp ny.
- Feil: `garmin_push_status = failed`, vises «ikke på klokka», prøves igjen ved neste synk/cron.

## 7. AI-justering
- Trening → «Juster med AI» → fritekst («vondt i kneet, rolig uke», «ferie 12.–18.»).
- Modell: `AI_PLAN_MODEL` (default `claude-opus-5-5`), effort `high` **(Claude-valg)**, brukerens nøkkel.
- Input: plan-mål, tilgjengelige dager, kommende 4 uker økter (id, dato, type, km), regler. Output (strukturert, zod): `{ summary, changes: ProposalChange[] }` der `replace` kun kan bruke motorens økttyper og km — motoren bygger stegene.
- Motoren validerer (kun kommende økter, kun tilgjengelige dager med mindre teksten nevner en dag, ingen uke > +10 % volum, ingen to harde dager på rad). Ugyldige endringer fjernes og nevnes.
- Resultatet vises som forslag (`kind = ai`) med oppsummering og diff. Godta/avvis. Kost logges.

## 8. Datamodell (ny migrasjon)
- `garmin_accounts` (user_id pk, tokens kryptert, status `active|reauth_required`, connected_at, last_synced_at, last_synced_date, sync_started_at, history_imported_at). **RLS uten policies** (kun server), som `api_keys`. Status leses server-side.
- `garmin_login_states` (id, user_id, mfa_state kryptert, expires_at). RLS uten policies.
- `garmin_days` (user_id, local_date, steps, run_steps, raw jsonb, final bool, synced_at; unik user+date). RLS own_rows.
- `activities` (id, user_id, garmin_activity_id bigint, local_date, start_time, type_key, name, distance_m, duration_s, moving_s, avg_hr, max_hr, steps, elevation_gain_m, garmin_kcal, splits jsonb, hr_zones jsonb, raw jsonb; unik user+garmin id). RLS own_rows.
- `training_plans` (id, user_id, goal_kind `race|build`, distance_km, race_date, target_time_s, runs_per_week, weekdays smallint[], long_run_weekday, vdot, start_date, status `active|completed|cancelled`). Maks én aktiv per bruker. RLS own_rows.
- `planned_workouts` (id, plan_id, user_id, date, week, phase, type, title, blocks jsonb, planned_km, planned_duration_s, status `planned|done|missed|removed`, activity_id, garmin_workout_id, garmin_schedule_id, garmin_push_status `pending|pushed|failed|none`). RLS own_rows.
- `plan_proposals` (id, user_id, plan_id, kind `missed|paces|volume|ai`, summary, changes jsonb, status `pending|accepted|rejected|stale`, request_text, model, input_tokens, output_tokens, cost_usd). RLS own_rows.
- `energy_source` enum får `garmin_connect`.

## 9. Feilhåndtering
- Garmin nede / rate-limit: stille, prøv neste gang. Dra-ned viser feil.
- Tokens ugyldige: `reauth_required`, banner, ingen nye data; dagsmål faller tilbake til 14-d snitt for dager uten data.
- Adapter-hemmelighet feil: 401, logges.
- AI: samme feilklasser som matlogg (`invalid_key`, `unavailable`, `refused`, `invalid_output`).
- Plan-generering kan ikke feile på gyldig input (motoren klemmer verdier); ugyldig input avvises med zod.

## 10. Testing
- Integrasjonstester (Vitest, ekte Supabase, falsk Garmin-adapter med fixtures):
  - synk → `garmin_days`/`activities` → dagsmål og innsjekk-input
  - tilkobling trekker gangtillegg ut av grunnforbruk
  - lag plan → økter kun på tilgjengelige dager, langtur på valgt dag, volumøkning ≤ 10 %, nedtrapping, løpsdag
  - droppet økt → forslag → godta → økt flyttet
  - RLS på nye tabeller, `garmin_accounts` uleselig for innlogget bruker
- Smoke (Playwright): Trening-fanen med seedet plan, økt-detalj, forslag-kort.
- Manuelt (krever brukeren): ekte Garmin-innlogging (+ MFA), synk, økt på klokka.

## 11. Spike (først)
1. Python-funksjon i samme Vercel-prosjekt (Root Directory `apps/web`) ved siden av Next — deploy til preview og kall den.
2. Innlogging (+ MFA-serialisering) og henting med brukerens Garmin-konto lokalt.
3. Opplasting + planlegging av en testøkt, sjekk at den dukker opp på klokka.

## 12. Ikke med nå
Restitusjon (søvn/HRV/hvilepuls/Body Battery), Strava, styrkeøkter i plan, puls-soner som mål, flere aktive planer, lys modus.
