# Bare trening – plan

**Spec:** `docs/specs/2026-10-29-bare-trening.md`. Gren `training-mode`. Ingen enhetstester. Integrasjons- og røyktester. Ingen Claude-attribusjon.

**Review Focus:**
1. En eksisterende `full`-bruker med Garmin ser ingen forskjell (eksisterende røyktester er grønne uendret).
2. Kode som leser kroppsfelt (`sex`, `birth_date`, `height_cm`) kjøres aldri for en `training`-bruker (Today, coach-kontekst, innsjekk).
3. En manuell aktivitet blir ikke slettet eller duplisert av Garmin-synk, og blir ikke matchet til to økter.
4. «Done» på en økt fram i tid avvises.
5. «Undo» på en økt gjort med Garmin-aktivitet avvises.

### Task 1: Data og modus
- Migrasjon `20261029000000_training_mode.sql` (spec §8), `pnpm db:push`.
- `getProfile` er uendret for `full`. En ny `profileMode(userId)` leser modus.
- `requireUser` er uendret.

### Task 2: Oppstart og Profile
- `onboarding/page.tsx`: steg 0 er modusvalget. `?food=1` hopper over steget og viser kroppsstegene (Track food too).
- `startTrainingOnly(timezone)`: lagrer profil, `mode = 'training'` og `onboarded_at`.
- `completeOnboarding` setter `mode = 'full'`.
- Profile i `training`: Garmin-kortet, «Track food too» og konto.

### Task 3: Plan uten Garmin
- Fjern Garmin-sperrene i `training/page.tsx`, `training/new/page.tsx` og `api/training/plan`.
- `CreatePlanInput.startKmPerWeek?` og `longestKm?` brukes når det ikke finnes løp siste 28 dager.
- `PlanWizard` spør om disse når serveren sier `needsStart`.
- `todaysWorkout` og formen på Today brukes uten Garmin.

### Task 4: «Done» for hånd
- `POST /api/training/workout/[id]/done` med `{ km, timeS? }`: lag en manuell aktivitet, så `reconcilePlan`.
- `DELETE` på samme rute: slett den manuelle aktiviteten, sett økta til `planned` (eller `missed` hvis den er fra før i dag).
- Knapp og ark på `TodayBib` og øktsiden, bare uten Garmin.

### Task 5: Training only-UI
- `BottomNav` får `mode`.
- Today i `training`: ukestripe, bib, ukeskort (km og økter gjort/planlagt, neste økt), og «Create your plan» uten plan.
- `/food`, `/food/log` og `/body` sender `training` til `/today`.

### Task 6: Coach
- `training`: ingen `food_log`- eller `weight`-verktøy, en linje om modusen i konteksten, treningsknapper, og ingen dagsblokk for mat.

### Task 7: Tester, docs, gjennomgang, merge
- Integrasjon: `tests/integration/training-only.test.ts` (spec §9).
- Røyk: `tests/smoke/training-only-smoke.mjs`.
- Kjør eksisterende røyktester, `02-decisions` og CLAUDE.md.
- Gjennomgang, så merge `--no-ff` og push.
