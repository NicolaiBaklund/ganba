# Sykling del 1 – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sykkelplan (ritt eller bygg form) styrt etter tid og puls, til Garmin som sykkeløkter, med coach, riktig energi og skjermer.

**Architecture:** `packages/core/src/training/ride.ts` (form, soner, generator), og pulsmål som ny `Target`-variant. Planen får `sport`, og service, coach, Garmin-JSON og UI forgrener på den. Planer, økter, forslag, push og coach gjenbruker løpeinfrastrukturen. Km for sykkeløkter er anslag fra typisk fart.

**Tech Stack:** TypeScript, Next.js, Supabase, Python-adapter (garminconnect), Vitest, Playwright.

**Spec:** `docs/specs/2026-10-23-sykling.md`

## Global Constraints
- Ingen enhetstester. Integrasjonstester i `tests/integration/`.
- Ingen Claude-attribusjon. Gren `cycling`. Review og push til main når ferdig.
- Løpeplaner skal oppføre seg helt som før (alle eksisterende tester grønne).
- Uten watt nevnes ikke watt i UI.
- UI på engelsk, Tasuki.

## Review Focus
1. Løpekode som antar pace-mål (`repaceBlocks`, `measure`, `describeBlocks`, kvalitetsmåling, fueling) møter pulssteg: ingen krasj, ingen feil km.
2. Coach på sykkelplan: soner og minutter, aldri pace.
3. Garmin-JSON for sykkel: sporttype og pulsmål, aldri pace.
4. Sykkelplan uten sykkelhistorikk: forsiktig start, ingen deling på null.
5. Bytte fra løpe- til sykkelplan: løpeøktene fjernes fra klokka (avsluttet plan), som i dag.

### Task 1: Data, typer, adapter
- [ ] Migrasjon (§10), `db:push`. `Target` + `hr`. `PlanInput` + `sport`-varianter via egen `RidePlanInput`. Adapter `fetch_thresholds` + TS-klient + falsk Garmin.

### Task 2: Kjerne for sykling
- [ ] `ride.ts`: `rideFitnessFrom`, `rideZones`, `generateRidePlan`, `rideTestProposal`. `measure` med typisk fart for pulssteg. `rezone` i `applyChanges`. `describeBlocks` for pulssteg.

### Task 3: Service og Garmin
- [ ] `previewPlan`/`createPlan`/forlengelse forgrener på sport. Henting av terskel. `toGarminWorkout(sport)`. Forslag (testsoner). Energi fra Garmin-kcal.

### Task 4: Coach
- [ ] Kontekst, stegsoner, «replace» i minutter, promptdel.

### Task 5: UI
- [ ] Veiviser, forhåndsvisning, treningsside, ukekart, øktside, bib, matråd.

### Task 6: Tester, røyk, docs, review, push
