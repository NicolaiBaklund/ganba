# Ganba (tidligere Loop) — kontekst for Claude

Personlig trenings- + ernæringsapp (Runna + MyFitnessPal i ett). Webapp, må fungere på mobil.

**Fase nå:** fase 1 (mat + vekt) ferdig og publisert (Vercel). **Fase 2** (Garmin + treningsplan) under arbeid på grenen `fase2`: spec docs/specs/2026-10-03-fase2-garmin-trening.md, plan docs/plans/2026-10-03-fase2-plan.md.

Systemet er **generelt/flerbruker** — aldri hardkod brukerens personlige verdier.

## Les først
- [docs/specs/2026-10-04-restitusjon.md](docs/specs/2026-10-04-restitusjon.md) — **restitusjon** (søvn/HRV, sammenhenger i egne data); del 1-plan: docs/plans/2026-10-04-restitusjon-del1-plan.md
- [docs/specs/2026-10-04-redesign-tasuki.md](docs/specs/2026-10-04-redesign-tasuki.md) — **redesign** (Tasuki-uttrykket, tokens, komponenter)
- [docs/specs/2026-10-03-fase2-garmin-trening.md](docs/specs/2026-10-03-fase2-garmin-trening.md) — **spec fase 2** (Garmin + treningsplan)
- [docs/specs/2026-09-29-fase1-konsept.md](docs/specs/2026-09-29-fase1-konsept.md) — **konsept-spec** fase 1 (hva og hvorfor)
- [docs/specs/2026-09-30-fase1-teknisk.md](docs/specs/2026-09-30-fase1-teknisk.md) — **teknisk spec** fase 1 (hvordan)
- [docs/00-idea.md](docs/00-idea.md) — hva appen er
- [docs/02-decisions.md](docs/02-decisions.md) — hva vi er enige om + åpne spørsmål
- [docs/design.md](docs/design.md) — designretning + tokens (følg ved all UI)
- [docs/03-tech-notes.md](docs/03-tech-notes.md) — teknisk design under arbeid
- [docs/01-research-notes.md](docs/01-research-notes.md) — fakta om API-er (Strava, Garmin, Anthropic)

## Produktprinsipp
**Minst mulig innsats for brukeren.** Mye data, men samlet automatisk/utledet. Hvis brukeren alltid må fylle ut masse, går de lei. Alt utover det nødvendige er valgfritt og kan hoppes over. Test hver ny funksjon mot dette.

## Kjøre og teste
- `pnpm dev` (port 3000), `pnpm typecheck`, `pnpm build`
- `pnpm test:int` — integrasjonstester (Vitest) mot Supabase-prosjektet i `apps/web/.env.local`, med testbrukere som slettes etterpå
- `node tests/smoke/smoke.mjs [url]` (+ `checkin-smoke.mjs`, `profile-smoke.mjs`, `training-smoke.mjs`, `redesign-shots.mjs` for alle skjermer i lys og mørk) — Playwright-flyter mot kjørende app (default `http://localhost:3100`), skjermbilder i `tests/smoke/out/`
- Garmin-adapter lokalt: `python -m venv .venv && .venv/Scripts/pip install -r apps/web/requirements.txt`, så `.venv/Scripts/python apps/web/scripts/garmin-dev.py` (port 3200, leser `.env.local` selv) og `GARMIN_ADAPTER_URL=http://127.0.0.1:3200` + `GARMIN_ADAPTER_SECRET` i `.env.local`. Integrasjonstestene bruker en falsk Garmin (`tests/integration/fake-garmin.ts`)
- Restitusjon-spike mot ekte konto: start adapteret lokalt, så `SPIKE_EMAIL=<e-post> pnpm exec vitest run tests/integration/recovery-spike.test.ts` (hoppes over ellers)
- `npx tsx evals/food/run.mts` — AI-eval, koster penger (se `evals/food/README.md`)
- DB-endringer: ny fil i `supabase/migrations/`, så `pnpm db:push` (pusher og regenererer `apps/web/lib/db/types.ts`; typene overskrives bare hvis genereringen lykkes). Krever `pnpm exec supabase login` én gang, eller `SUPABASE_ACCESS_TOKEN` i `apps/web/.env.local`

## Regler
- Oppdater `docs/02-decisions.md` hver gang noe blir bestemt.
- Brukeren skriver norsk. Docs på norsk.
- Ett spørsmål om gangen i diskusjon.
- **Ingen `Co-Authored-By: Claude`** eller annen Claude-attribusjon i commits.
- **Ingen enhetstester / TDD.** Kun integrasjonstester, og først når flytene står. Ikke bruk tokens på småtester.
