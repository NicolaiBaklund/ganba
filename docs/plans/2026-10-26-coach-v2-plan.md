# Coach v2 – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coachen blir én coach for alt i egen fane: virker uten plan, henter data selv med verktøy, gir matråd, strømmer svaret med status, og Recovery blir en Form-detaljside.

**Architecture:** Konteksten blir en kort fast blokk (i går/i dag/i morgen, dagens inntak, Form). Detaljer hentes med lesverktøy i `lib/coach/tools.ts` i samme verktøyløkke som `check_plan_changes`. `runCoach` sender hendelser (status, tekst) til en callback, og meldingsruten gjør dem til en NDJSON-strøm. UI flyttes fra arket til en egen `/coach`-side.

**Tech Stack:** Next.js 16 (route handlers, streaming `Response`), Anthropic SDK (`messages.stream`), Supabase, Vitest (integrasjon), Playwright (røyk).

**Spec:** `docs/specs/2026-10-26-coach-v2.md`

## Global Constraints
- Ingen enhetstester eller TDD. Integrasjonstester i `tests/integration/`, røyktester i `tests/smoke/`.
- Ingen Claude-attribusjon i commits. Gren `coach-v2`. Kodegjennomgang og push til main når ferdig.
- UI på engelsk, Tasuki, lys og mørk. Coachen svarer på brukerens språk.
- Modell: Opus (`AI_COACH_MODEL`, standard `claude-opus-5-5`).
- Helsedata (søvn, HRV, hvilepuls, Form, findings) bare med `getAiHealthConsent` = true, i kontekst og verktøy.
- Coachen logger ikke mat og tar ikke kontakt selv.
- Ingen hardkodede matregler i prompten. Bare prinsippene fra spec §5.

## Review Focus
1. **Bruker uten plan** spør om mat: svar uten feil, ingen planverktøy tilbys (test i Task 1).
2. **Samtykke av:** ingen helsedata i kontekst eller verktøyliste, og et kall til helseverktøy gir feiltekst (test i Task 2).
3. **Klienten lukker strømmen midt i svaret:** svaret lagres likevel og vises ved neste åpning (test i Task 3).
4. **Verktøy med for stort intervall** (for eksempel et helt år): kappes til 31 dager, med beskjed i resultatet (test i Task 2).
5. **To meldinger samtidig:** den andre får `busy`, ingen dobbel strøm (test i Task 3).

---

### Task 1: Kontekst uten plan, fast dagsblokk, prompt v5

**Files:**
- Modify: `apps/web/lib/coach/context.ts`, `apps/web/lib/coach/run.ts`, `packages/core/src/training/coach.ts` (prompt), `apps/web/app/api/coach/messages/route.ts`
- Test: `tests/integration/coach-v2.test.ts`

**Interfaces:**
- Produces:
  - `buildCoachContext(userId, threadId, opts: { aboutWorkoutId?: string | null; aboutDate?: string | null; message: string }): Promise<CoachContext>`. Den returnerer aldri `null`. `CoachContext.plan: PlanRow | null`, `ctx`/`workouts` er `null` uten plan, og den har nye felt `consent: boolean` og `today: ISODate`.
  - `runCoach(userId, input: { text; aboutWorkoutId?; aboutDate? }, opts: { ai?: CoachAi; onEvent?: (e: CoachEvent) => void })`. `"no_plan"` fjernes fra `CoachError`.
  - `COACH_PROMPT_VERSION = 5`.

- [ ] **Step 1:** Skriv testene i `coach-v2.test.ts`:
  - `"answers a food question without a plan"`: bruker uten plan og falsk AI som svarer med `reply`. `runCoach` gir `ok: true`. Første kall har ingen verktøy med navn `check_plan_changes`.
  - `"the context always has yesterday/today/tomorrow and today's intake"`: med plan og logget måltid. Konteksten i første kall inneholder `Today's intake:` med kcal og protein mot målet, og linjer for `Yesterday`, `Today` og `Tomorrow` med øktene.
- [ ] **Step 2:** Kjør `pnpm exec vitest run tests/integration/coach-v2.test.ts`. Forventet: FAIL.
- [ ] **Step 3:** Implementer. Den faste blokken bygges i en ny funksjon `dayBlock(userId, today, plan, consent): Promise<string>` i `context.ts`:
  - inntak og mål fra `getDaySnapshot(createAdminSupabase(), userId, today)`,
  - øktene i går, i dag og i morgen fra planen, med `fuelingFor` per økt,
  - Form i dag fra `form_days` hvis samtykke.

  `COACH_TOOLS` blir `coachTools(cc)`, som bare tar med planverktøyene når `cc.plan` finnes.
- [ ] **Step 4:** Skriv om prompten til «coach for training, food, recovery and body» med prinsippene fra spec §5. Kjør testen pluss `coach.test.ts` og `coach-engine.test.ts`. Forventet: PASS.
- [ ] **Step 5:** Commit `feat(coach): coach without a plan, day block in context`.

### Task 2: Lesverktøy

**Files:**
- Create: `apps/web/lib/coach/tools.ts`
- Modify: `apps/web/lib/coach/run.ts` (verktøyløkka kaller lesverktøyene)
- Test: `tests/integration/coach-v2.test.ts`

**Interfaces:**
- Consumes: `CoachContext` (Task 1).
- Produces:
  - `readTools(cc: CoachContext): Anthropic.Tool[]`
  - `runReadTool(cc: CoachContext, name: string, input: unknown): Promise<string>`. Resultatet er kompakt tekst, og ukjent navn eller manglende samtykke gir en feiltekst, ikke et unntak.
  - `TOOL_LABELS: Record<string, string>`, engelske statuslinjer for UI, for eksempel `food_log: "Looking at your food log…"`.

  Verktøy (input `{ from, to }` som `YYYY-MM-DD`, maks 31 dager, eller som oppgitt):

  | Navn | Input | Merknad |
  |---|---|---|
  | `food_log` | | Måltider (tid, retter, kcal, P/K/F) og mål per dag |
  | `session` | `{ ref?: "s3", date?: "YYYY-MM-DD" }` | Planlagt økt med steg og matchet aktivitet: runder (tid, km, fart, puls, watt) |
  | `activities` | | Alle sporter, med kcal |
  | `recovery` | | Samtykke: søvn, HRV, hvilepuls, Form og deler per dag |
  | `findings` | `{}` | Samtykke: findings med styrke og antall dager, eller «not enough data yet» |
  | `weight` | | Vekt, trendvekt, mål og tempo |
  | `plan` | | Bare med plan |

- [ ] **Step 1:** Skriv testene, alle med seedet testbruker:
  - `"food_log returns meals and targets for the day"`: inneholder rettens navn og `protein`.
  - `"session returns laps and heart rate of the matched activity"`: aktivitet med `splits.lapDTOs` og `averageHR`. Resultatet inneholder rundens puls.
  - `"health tools are left out without consent"`: `readTools(cc)` uten `recovery`/`findings`, og `runReadTool(cc, "recovery", …)` gir en tekst som inneholder `health data is off`.
  - `"ranges are capped at 31 days"`: `food_log` med ett års intervall. Resultatet inneholder `capped to 31 days`.
  - `"the loop runs a read tool and feeds the result back"`: falsk AI kaller `food_log` og deretter `reply`. Andre kall har en `tool_result` med måltidet.
- [ ] **Step 2:** Kjør testen. Forventet: FAIL.
- [ ] **Step 3:** Implementer `tools.ts` og koble verktøyene inn i løkka i `run.ts`, ved siden av `check_plan_changes`. Hev `MAX_ROUNDS` fra 6 til 10.
- [ ] **Step 4:** Kjør testen og de eksisterende coach-testene. Forventet: PASS.
- [ ] **Step 5:** Commit `feat(coach): read tools for food, sessions, activities, recovery, findings, weight, plan`.

### Task 3: Strømming

**Files:**
- Modify: `apps/web/lib/ai/coach.ts`, `apps/web/lib/coach/run.ts`, `apps/web/app/api/coach/messages/route.ts`
- Create: `apps/web/lib/coach/stream.ts`
- Test: `tests/integration/coach-v2.test.ts`

**Interfaces:**
- Produces:
  - `CoachAi.create(apiKey, p, opts?: { timeoutMs?: number; onReplyDelta?: (partialJson: string) => void })`. Den ekte klienten bruker `client.messages.stream(...)` og kaller `onReplyDelta` med akkumulert `input_json` for `reply`-verktøyet. Resultatet er fortsatt `CoachResponse` (`finalMessage()`).
  - `type CoachEvent = { type: "status"; label: string } | { type: "text"; text: string } | { type: "done"; message: CoachMessage } | { type: "error"; error: CoachError }`. `text` er hele meldingsteksten så langt, ikke bare det nye.
  - `partialReplyMessage(json: string): string` i `stream.ts`: henter verdien av `"message"` fra uferdig JSON og dekoder escapes (`\n`, `\"`, `\uXXXX`).
  - Ruten `POST /api/coach/messages` svarer `200` med `content-type: application/x-ndjson`, én `CoachEvent` per linje. Feil før start svarer med JSON og statuskode som nå.

- [ ] **Step 1:** Skriv testene:
  - `"partialReplyMessage reads the message field from unfinished JSON"`: `'{"message":"Eat a \\"big\\" bow'` gir `Eat a "big" bow`.
  - `"the stream sends status, growing text and done"`: den falske AI-en kaller `food_log` og deretter `reply` med `onReplyDelta` i tre biter. Hendelsene er `status` (med `TOOL_LABELS.food_log`), minst to `text` med økende lengde, og `done`. Meldingen er lagret.
  - `"an aborted stream still stores the answer"`: les første linje og avbryt (`reader.cancel()`). Etter at `runCoach` er ferdig, finnes svaret i `recentMessages`.
  - `"a second message while one is running is busy"`: to samtidige kall, og det ene gir `busy`.
- [ ] **Step 2:** Kjør testen. Forventet: FAIL.
- [ ] **Step 3:** Implementer. `runCoach` kaller `onEvent` for status før hvert lesverktøy og for `check_plan_changes` («Trying the plan change…»), og for tekst fra `onReplyDelta`. Ruten bruker en `ReadableStream`, og `runCoach` fortsetter selv om skriving til strømmen feiler (lukket klient).
- [ ] **Step 4:** Kjør testen og coach-testene. Forventet: PASS.
- [ ] **Step 5:** Commit `feat(coach): stream status and the reply as it is written`.

### Task 4: Coach-fanen

**Files:**
- Create: `apps/web/app/(app)/coach/page.tsx`, `apps/web/components/coach/CoachChat.tsx` (fra `CoachSheet.tsx`, som slettes), `apps/web/components/training/EndPlan.tsx`
- Modify: `apps/web/components/nav/BottomNav.tsx`, `apps/web/app/(app)/training/page.tsx`, `apps/web/components/coach/CoachButton.tsx` (slettes), økt-siden og andre steder som åpner arket, `apps/web/messages/en.json`
- Test: `tests/smoke/coach-smoke.mjs` (ny), `tests/smoke/training-smoke.mjs` (oppdateres)

**Interfaces:**
- Consumes: NDJSON-ruten (Task 3).
- Produces: `/coach?about=<workoutId>` og `/coach?day=<YYYY-MM-DD>` åpner samtalen med temaet satt. Klienten sender `aboutWorkoutId` og `aboutDate`.

- [ ] **Step 1:** Bunnmeny: `LEFT = today, training`, `RIGHT = coach (lucide MessageCircle), body`. Recovery-fanen fjernes. Ny nøkkel `nav.coach = "Coach"`.
- [ ] **Step 2:** `CoachChat` beholder samtalen, alternativkort, notatpanel, ny samtale og arkiv fra arket. «End plan» flyttes ut. Mens et svar kommer: statuslinjen (siste `status`) over en boble som fylles med `text`, og `done` erstatter boblen med den lagrede meldingen.
- [ ] **Step 3:** Trening: «Coach»-knappen fjernes. `EndPlan` legges nederst, som en stille knapp med bekreftelse (`coach.endPlan`, `endExplain` og `endConfirm` flyttes til `training.*`). «Ask the coach» på en økt lenker til `/coach?about=…`.
- [ ] **Step 4:** Skriv `coach-smoke.mjs` med falsk AI via env, slik som i `training-smoke.mjs`. Sjekk:
  - fem punkter i menyen med Coach,
  - sending gir statuslinje og deretter strømmet tekst,
  - svaret står etter omlasting,
  - «End plan» på Trening,
  - ingen konsollfeil,
  - lys og mørk.

  Oppdater `training-smoke.mjs` for nye stier.
- [ ] **Step 5:** Kjør begge røyktestene. Forventet: alle sjekker `true`.
- [ ] **Step 6:** Commit `feat(coach): coach tab, end plan on Training`.

### Task 5: Form-detaljsiden

**Files:**
- Modify: `apps/web/app/(app)/recovery/page.tsx`, `apps/web/components/recovery/RecoveryScreen.tsx`, `apps/web/components/recovery/DaySheet.tsx`
- Delete: `WeeklySummary.tsx`, `WhyButton.tsx`, `FindingsList.tsx` (og `FindingSheet.tsx` hvis den ikke brukes andre steder), med tilhørende API-ruter under `apps/web/app/api/recovery/` (`summary`, `day`) når ingenting bruker dem. Kjernekoden for findings beholdes (brukes av `findings`-verktøyet).
- Test: `tests/smoke/recovery-smoke.mjs` (oppdateres)

- [ ] **Step 1:** Siden får tilbakelenke til Today og overskriften «Form». Den beholder `FormHero`, driverne, `FormCurve`, `RecoveryCurves`, `WeekTiles`, `TonightRow` og `DaySheet`.
- [ ] **Step 2:** `DaySheet`: «Why» blir lenken «Ask the coach about this day» til `/coach?day=<date>`, og den vises bare med samtykke.
- [ ] **Step 3:** Oppdater `recovery-smoke.mjs`. Sjekk:
  - Form-kortet på Today åpner siden,
  - ingen findings-liste eller ukesoppsummering,
  - lenken på en dag går til `/coach?day=`.

  Kjør `recovery-smoke.mjs`. Forventet: alle `true`.
- [ ] **Step 4:** Commit `feat(recovery): Form detail page; interpretation moves to the coach`.

### Task 6: Eval, docs, gjennomgang, push

**Files:**
- Create: `evals/coach/run.mts`, `evals/coach/README.md`
- Modify: `docs/02-decisions.md`, `CLAUDE.md` (Les først og smoke-listen)

- [ ] **Step 1:** `evals/coach/run.mts` kjører faste samtaler mot ekte modell med en syntetisk bruker. Den skriver svarene til `evals/coach/out/` for manuell lesing. Samtalene:
  1. «Kvelden før terskeløkt, 600 kcal igjen, i Tokyo, hva spiser jeg?»
  2. «Ga meg etter ett drag i dag», med lite karbo i går og høy oppvarmingspuls.
  3. «Hva bør jeg spise til lunsj?» uten plan.

  README: koster penger, kjøres manuelt.
- [ ] **Step 2:** Oppdater beslutninger (coach v2, Recovery delt, End plan på Trening, Opus) og CLAUDE.md.
- [ ] **Step 3:** Kjør `pnpm typecheck`, `pnpm build`, `pnpm test:int` og røyktestene for coach, trening, recovery og ride. Forventet: grønt.
- [ ] **Step 4:** Kodegjennomgang (`/code-review`), rett funnene, merge `--no-ff` til main og push.
