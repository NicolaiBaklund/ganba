# Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bytte Form og funnmotoren med løpsklokke, morgenlapp, varsler og stempler på I dag, og en `/progress`-side.

**Architecture:** Garmin-adapteret henter daglige løpsanslag og personlige rekorder ved synk. Ren logikk (velg løp, varsler, stempler, faktaliste til lappen) i `packages/core/src/health/`. Lagring og visning i `apps/web/lib/health/`, kjørt fra `afterGarminSync` (og fra upkeep uten Garmin). Lappen skrives lat ved første visning av I dag, med AI hvis samtykke og nøkkel finnes, ellers mal.

**Tech Stack:** Next.js (se `apps/web/AGENTS.md`), Supabase, Python-adapter (`garminconnect`), Vitest-integrasjonstester, Playwright-smoke, `@rapideditor/country-coder`.

**Spec:** `docs/specs/2026-11-02-health.md` (spikes i §14).

## Global Constraints

- Ingen enhetstester eller TDD (prosjektregel, overstyrer skill-malen). Hver oppgave verifiseres med `pnpm typecheck`; integrasjonstestene kommer samlet i oppgave 7 når flytene står.
- Systemet er flerbruker: ingen hardkodede verdier fra en bestemt bruker.
- Engelsk UI, kort og konkret; ingen tankestreker, ingen «·»-kjeder, ingen etiketter i store bokstaver (`docs/design.md`).
- Docs på norsk. `docs/02-decisions.md` oppdateres ved nye beslutninger.
- Ingen Claude-attribusjon i commits.
- DB-endringer: ny fil i `supabase/migrations/`, så `pnpm db:push` (regenererer `apps/web/lib/db/types.ts`).
- Strava brukes aldri; lappen bygger bare på Garmin, planen og egne tabeller.

## Review Focus

1. **Bruker uten Garmin (Training only eller mat uten klokke):** klokka fra planens VDOT, ingen varsler fra søvn/HRV, lappen fra mal; ingen feil fordi `prediction_days` eller nattedata mangler.
2. **Synk to ganger samme dag eller historikkimport:** ingen doble stempler, `prediction_days` upsertes, stempler fra gammel historikk dukker ikke opp i stempellinja.
3. **«Swap to easy» trykket to ganger eller etter at økta er gjort:** bare én endring; knappen forsvinner når `alert_done` er satt eller økta ikke lenger er planlagt.
4. **Løpsdagen passert eller race-økta slettet:** klokka går til neste løp etter §5.1 uten å vise et utløpt løp.
5. **Garmin svarer uten `personalRecords` eller `predictionDays` (gammel adapter, 403):** synken lykkes og resten virker.

---

### Task 1: Data og adapter

**Files:**
- Create: `supabase/migrations/20261102000000_health.sql`
- Modify: `apps/web/api/py/garmin.py` (`op_fetch`), `apps/web/lib/garmin/adapter.ts` (`FetchResult`), `apps/web/lib/garmin/sync.ts`, `tests/integration/fake-garmin.ts`

**Interfaces:**
- Produces: tabellene `prediction_days`, `daily_notes`, `stamps` (kolonner som spec §11, uten `before_ganba`), kolonnen `garmin_accounts.personal_records jsonb`. `FetchResult.predictionDays?: { calendarDate: string; time5K: number|null; time10K: number|null; timeHalfMarathon: number|null; timeMarathon: number|null }[] | null` og `FetchResult.personalRecords?: { typeId: number; value: number; date: string|null; activityId: number|null }[] | null`. `FakeGarmin.predictionDays` og `FakeGarmin.personalRecords` (offentlige felt, returneres av `fetch`).

- [ ] **Step 1:** Migrasjon: tre tabeller med RLS (eier leser, service role skriver, som `form_days`), unike nøkler (bruker, dato) / (bruker, kind, key), og `personal_records jsonb` + `personal_records_at timestamptz` på `garmin_accounts`. Kjør `pnpm db:push`. Forventet: typene i `apps/web/lib/db/types.ts` har de nye tabellene.
- [ ] **Step 2:** `op_fetch`: etter dagens `get_race_predictions()` også `get_race_predictions(from, to, "daily")` (begrens `from` til maks 365 dager før `to`) og `get_personal_record()` filtrert til `typeId` 1–7, mappet til `{typeId, value, date (activityStartDateTimeLocalFormatted[:10] eller prStartTimeGmtFormatted[:10]), activityId}`. Hver i egen `try`, `None` ved feil.
- [ ] **Step 3:** `sync.ts`: upsert `predictionDays` til `prediction_days` (`source: "garmin"`, onConflict `user_id,local_date`) og lagre `personalRecords` i `garmin_accounts.personal_records` når listen ikke er tom. Fake: felt som returneres som de er.
- [ ] **Step 4:** `pnpm typecheck` → grønn. Lokalt: start adapteret (`.venv/Scripts/python apps/web/scripts/garmin-dev.py`), synk egen konto via appen, sjekk at `prediction_days` har ~90 rader. Commit `feat(health): daily race predictions and records from Garmin`.

### Task 2: Kjernen (`packages/core/src/health/`)

**Files:**
- Create: `packages/core/src/health/clock.ts`, `alerts.ts`, `stamps.ts`, `note.ts`, `index.ts`
- Modify: `packages/core/src/index.ts` (eksporter `./health`)

**Interfaces (Produces):**
- `type RaceDistance = "5k" | "10k" | "half" | "marathon"`; `RACE_KM: Record<RaceDistance, number>` (5, 10, 21.0975, 42.195).
- `pickRace(input: { today: ISODate; workouts: { date: ISODate; type: string; title: string; plannedKm: number | null }[]; goal: PlanGoal | null }): { name: string; distance: RaceDistance; date: ISODate | null }` etter spec §5.1 (race-økt ≥ i dag → målløp → byggefokus → 10K). Distanse fra `plannedKm` nærmest i `RACE_KM`.
- `predictionSeconds(p: { time5K; time10K; timeHalfMarathon; timeMarathon }, d: RaceDistance): number | null`.
- `planPrediction(vdot: number): Record<RaceDistance, number>` (Daniels, gjenbruk eksisterende VDOT-funksjoner i `training/`).
- `type HealthAlert = { kind: "sick" | "easy_fast" | "sleep"; facts: Record<string, number> }`; `alertFor(input: { days: RecoveryDayInput[]; today: ISODate; easyRuns: { date: ISODate; secPerKm: number }[]; easyMaxSecPerKm: number | null }): HealthAlert | null` med reglene i spec §6 (normal = 28 dager før, median/MAD som `form.ts`; prioritet sick → easy_fast → sleep).
- `type StampKind = "country" | "distance" | "pr" | "volume" | "streak" | "test" | "race"`; `type Stamp = { kind: StampKind; key: string; earnedOn: ISODate; activityId?: string; value?: Record<string, unknown> }`.
- `earnedStamps(input: { runs: { id: string; date: ISODate; km: number; country: string | null }[]; records: { typeId: number; value: number; date: ISODate | null }[]; weeks: { start: ISODate; planned: number; done: number }[]; tests: { date: ISODate; activityId: string }[]; races: { date: ISODate; activityId: string; timeS: number }[] }): Stamp[]` (spec §8.1; jevnhet = lengste løpende rekke av uker med done/planned ≥ 0.8, stempel ved 4/8/12/26; distanse 10/15/21.1/25/30/42.2; volum 50/100/150/200 per kalendermåned; pers-key `pr-<typeId>-<value>`).
- `nextStamp(input: { today: ISODate; earned: Stamp[]; monthKmSoFar: number; plannedRuns: { date: ISODate; km: number }[] }): { kind: StampKind; key: string; label: string; date: ISODate } | null` (bare volum og distanse kan forutses; innen 7 dager).
- `type NoteFacts = { alert: HealthAlert | null; yesterday: { type: string; title: string; km: number; avgSecPerKm: number | null; avgHr: number | null; repsAvgSecPerKm: number | null; bestYet: boolean } | null; today: { type: string; title: string; km: number | null; hrMax: number | null } | null; tomorrow: { title: string } | null; clockDeltaS: number | null; raceName: string | null }`; `templateNote(f: NoteFacts): string` (maks 3 setninger, engelsk) og `NOTE_PROMPT` + `noteMessage(f: NoteFacts, language: string): string` for AI.

- [ ] **Step 1:** Skriv modulene etter signaturene over. Ingen I/O.
- [ ] **Step 2:** `pnpm typecheck` → grønn. Commit `feat(health): core clock, alerts, stamps and note facts`.

### Task 3: Tjenesten (`apps/web/lib/health/`)

**Files:**
- Create: `apps/web/lib/health/country.ts`, `stamps.ts`, `compute.ts`, `note.ts`, `view.ts`
- Modify: `apps/web/package.json` (`@rapideditor/country-coder@5`), `apps/web/lib/training/service.ts` (`afterGarminSync`, `upkeepWithoutGarmin`)

**Interfaces:**
- Consumes: alt fra Task 2; `loadRecoveryDays` (`lib/recovery/load.ts`); `activePlan`, `planWorkoutsWithKm`, `savePlanChanges` (`lib/training/service.ts`); `gate`, `anthropicRecoveryAi` (AI som i `form-note.ts`).
- Produces:
  - `countryOf(lat: number | null, lon: number | null): string | null` (ISO alpha-3).
  - `refreshStamps(userId: string, today: ISODate): Promise<void>`: bygger input fra `activities` (løp, land fra `raw.startLatitude/startLongitude`), `garmin_accounts.personal_records`, planens uker/tester/løp; upsert til `stamps` med `ignoreDuplicates` (første `earned_on` står).
  - `computeHealth(userId: string, today: ISODate): Promise<void>`: `refreshStamps`, og for brukere uten Garmin en `prediction_days`-rad fra planens VDOT (`source: "plan"`).
  - `dailyNote(userId: string, today: ISODate): Promise<{ text: string; alert: HealthAlert["kind"] | null; alertDone: boolean }>`: returnerer lagret rad, ellers lager faktaliste + varsel (`alertFor`), skriver med AI (gate ok) eller `templateNote`, lagrer i `daily_notes`. Lages ikke før nattens data er synket når Garmin er koblet til (rad i `recovery_days` for i dag), da returneres mal uten å lagre.
  - `swapToEasy(userId: string, today: ISODate): Promise<boolean>`: finner neste harde økt i dag/i morgen (planned), `savePlanChanges` med `{ op: "replace", workoutId, type: "easy", km }` der km = øktas varighet i rolig tempo, setter `alert_done`.
  - `loadHealthView(userId: string, date: ISODate): Promise<HealthView>` med `{ race: { name, distance, date } | null, seconds: number | null, deltaS: number | null, finished: boolean` (løpsdagen og dagen etter: løp den dagen innen ±5 % av distansen gir sluttiden i `seconds`, spec §5.1)`, line: { date: ISODate; seconds: number }[], tests: ISODate[], note, stampLine: { label: string; date: ISODate | null; earned: boolean } | null }`.

- [ ] **Step 1:** Installer pakken i `apps/web`. Skriv modulene. `afterGarminSync` kaller `computeHealth` i stedet for `computeRecovery` (samme try/catch); `upkeepWithoutGarmin` kaller den også.
- [ ] **Step 2:** `pnpm typecheck` → grønn. Commit `feat(health): stamps, note and view service`.

### Task 4: API og I dag

**Files:**
- Create: `apps/web/app/api/health/note/route.ts` (GET → `dailyNote`), `apps/web/app/api/health/swap/route.ts` (POST → `swapToEasy`), `apps/web/components/health/RaceClock.tsx`, `CourseLine.tsx`, `MorningNote.tsx`, `StampLine.tsx`
- Modify: `apps/web/app/(app)/today/page.tsx` (fjern `form_days`/`FormRing`, legg inn klokke, lapp og stempellinje over startnummeret), `apps/web/messages/en.json` (ny `health`-blokk)

**Interfaces:** Consumes `loadHealthView`, `dailyNote`, `swapToEasy` fra Task 3.

- [ ] **Step 1:** Komponenter etter skissene «Round 3» i Design-artifactet og `docs/design.md`: tiden i `.num` med `[font-stretch:62%]` (største tall-skala), endring i `text-success`/`text-warning`, linja som SVG (hel historikk, rød «Now»-prikk, stiplet videre, hul ring per test, sjakkflagg som i `TrainingMap`). `MorningNote` henter lappen fra API-et klient-side (tekst vises med skjelett til den er klar), knappene «Swap to easy N km» og «Keep the plan» bare ved varsel som ikke er håndtert; «Keep the plan» setter `alert_done` via samme route (`{ keep: true }`). Klokka lenker til `/progress`.
- [ ] **Step 2:** `pnpm typecheck` og `pnpm dev`; åpne `/today` i lys og mørk. Commit `feat(health): race clock and morning note on Today`.

### Task 5: `/progress` og stempelboka

**Files:**
- Create: `apps/web/app/(app)/progress/page.tsx`, `apps/web/components/health/StampBook.tsx`
- Modify: `apps/web/app/(app)/recovery/page.tsx` (blir `redirect("/progress")`), `apps/web/messages/en.json`

- [ ] **Step 1:** Siden: klokka stort med alle fire distanser, linja over hele perioden, stempelboka (rutenett, tatte stempler røde og litt skjeve med dato, neste i hver gruppe stiplet; trykk → ark med dato og aktiviteten), og under «Body» de eksisterende `TonightRow`, `RecoveryCurves` og `DaySheet` uendret.
- [ ] **Step 2:** `pnpm typecheck`, sjekk siden i nettleser. Commit `feat(health): progress page with stamp book`.

### Task 6: Fjern Form og funnmotoren

**Files:**
- Delete: `packages/core/src/recovery/form.ts` (og eksporten), `apps/web/components/recovery/{FormHero,FormRing,FormSheet,FormCurve,WeekTiles,RecoveryScreen,AiOff,formText}.tsx/ts` (det som ikke lenger brukes), `apps/web/lib/recovery/{form-note,form-session,form-store,findings,insights-delen som bare tjener funn,questions}.ts`, `apps/web/app/api/recovery/{form-note,questions}`, `tests/integration/form-spike.test.ts` og Form-/funntester som tester fjernet kode
- Modify: `apps/web/lib/recovery/compute.ts` (bort, eller bare det `/progress` trenger), `apps/web/lib/coach/context.ts` (bytt «Form today» med dagens varsel og lapp fra `daily_notes`), `apps/web/lib/coach/tools.ts` (fjern Form-verktøy), `CLAUDE.md` (smoke-lista og Les først: Form-spec merket erstattet)

- [ ] **Step 1:** Fjern koden; behold `recovery_days`, nattedata, `DaySheet` og «spør om en dag». Tabellene `form_days`, `recovery_findings`, `recovery_ai_questions` røres ikke her (spec §10: egen migrasjon etter at koden er ute).
- [ ] **Step 2:** `pnpm typecheck` og `pnpm build` → grønt. Commit `refactor(health): remove Form and the findings engine`.

### Task 7: Integrasjonstester og smoke

**Files:**
- Create: `tests/integration/health.test.ts`, `tests/smoke/health-smoke.mjs`
- Modify: `tests/smoke/recovery-smoke.mjs` (pek på `/progress` eller slett), `tests/smoke/redesign-shots.mjs`, `CLAUDE.md`

- [ ] **Step 1:** `health.test.ts` mot `FakeGarmin` med testbruker:
  - `pickRace`: race-økt i planen vinner over målløp; byggeplan med fokus halv gir «half»; uten plan 10K; passert løpsdag hopper videre.
  - Synk med `predictionDays` (3 dager) gir 3 rader; `deltaS` = i dag − i går.
  - `alertFor`: hvilepuls +6 og HRV under baseline to morgener → `sick`; én morgen → null; normale data → null. Tre av fire rolige turer 20 s/km for raskt → `easy_fast`.
  - `swapToEasy`: intervalløkt i dag blir `easy` med `edited = true`; andre kall gjør ingenting.
  - Stempler: løp i Tokyo (35.69, 139.70) → `country/JPN`, Oslo → `NOR`, Seoul (37.56, 126.97) → `KOR`; løp på 15.2 km → `distance/10` og `distance/15`; 100 km i en måned → `volume/50` og `volume/100`; personlige rekorder typeId 5 → `pr`; ny synk gir ingen nye rader.
  - `dailyNote` uten AI-nøkkel lager mal én gang og leser den lagrede andre gang.
- [ ] **Step 2:** `pnpm test:int` → alt grønt (kjent nettverksflak `AuthRetryableFetchError` kjøres om).
- [ ] **Step 3:** `health-smoke.mjs` (seed som `checkin-smoke.mjs`, med predictions og en plan med race-økt): `/today` viser tiden, lappen og startnummeret; `/progress` viser stempelboka; skjermbilder lys og mørk i `tests/smoke/out/`. Kjør mot `http://localhost:3100`.
- [ ] **Step 4:** Commit `test(health): integration and smoke`. Merge `health` til `main` med `--no-ff` og push.

### Etter levering (egen gren)
- Migrasjon som sletter `form_days`, `recovery_findings`, `recovery_ai_questions` når koden har vært ute en stund.
