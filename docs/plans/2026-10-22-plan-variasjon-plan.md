# Variasjon i treningsplanen – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kvalitetsøkter i roterende familier, stigningsløp hver uke, «bygg form» med fokus og formtest, bakker som valg, og ingen kvalitetsøkt i en påbegynt første uke.

**Architecture:** Øktbyggerne i `packages/core/src/training/workouts.ts` får én bygger per familie bak `qualityFor(kind, …)`. `generate.ts` velger familier fra rotasjonstabeller per plantype, fase og blokk. Lagring: fokuset i `distance_km` for «bygg form», `hills` og økttypen `test` via migrasjon. Testresultatet blir et fartsforslag i det eksisterende forslagssystemet.

**Tech Stack:** TypeScript (core), Next.js, Supabase, Vitest, Playwright.

**Spec:** `docs/specs/2026-10-22-plan-variasjon.md`

## Global Constraints
- Ingen enhetstester. Integrasjonstester i `tests/integration/` (motortester der, som før).
- Ingen Claude-attribusjon i commits. Gren `plan-variety`. Review og push til main når ferdig (brukeren har bedt om det).
- Deterministisk generator: samme input gir samme plan (forlengelsen av «bygg form» regenererer fra start).
- Eksisterende planer endres ikke.
- UI på engelsk, Tasuki-tokens, ny type får fargetoken.

## Review Focus
1. Forlengelse av «bygg form» med fokus og bakker: forlengelsen må sende samme fokus og bakker som da planen ble laget, ellers bytter øktene type midt i planen.
2. Små uker (< 20 km) og 2 løp i uka: nye familier må krympe like pent som i dag (`Shrink`).
3. Formtesten i en uke med 2 løp: den skal ikke skyve ut langturen.
4. Gamle planer uten `hills`/fokus: lest som av og General.
5. Coach og forslag på økttypen `test`: flytting og fjerning virker, og «replace» til test er ikke mulig.

### Task 1: Data og typer
- [ ] Migrasjon: `alter type workout_type add value 'test'`, `training_plans.hills boolean not null default false`. `pnpm db:push`.
- [ ] `WorkoutType` + `test`; `HARD_TYPES`/`KEY_TYPES` inkluderer test; `Goal` build `{ kind: "build"; focus?: RaceDistance | null }`; `PlanInput.hills?: boolean`.
- [ ] Fargetoken `--w-test`, `workout.types.test`, `buildByType` test-gren, alle uttømmende switcher.

### Task 2: Øktfamilier
- [ ] `workouts.ts`: `QualityKind`, byggere `shortReps`, `longReps`, `racePaceReps`, `fartlek`, `hills`, `fitnessTest`; `qualityFor(kind, …)` med samme krympelogikk.

### Task 3: Generator
- [ ] Rotasjonstabeller (§3), «bygg form»-blokker (§4), formtest (§5), stigningsløp hver uke (§6), første uke (§7), langtur for General.

### Task 4: Lagring, forlengelse, veiviser, testforslag
- [ ] Validering + `CreatePlanInput` (focus, hills); `createPlan` lagrer; `goalOf`/forlengelse sender fokus og bakker videre.
- [ ] Veiviser: fokusvalg for «bygg form», bakkebryter.
- [ ] `testProposal` i core + kandidat i forslagsflyten.

### Task 5: Tester, røyk, docs
- [ ] Integrasjonstester (§8); `training-smoke` grønn; `02-decisions.md`, `CLAUDE.md`.
- [ ] Typecheck, test:int, build, review, push.
