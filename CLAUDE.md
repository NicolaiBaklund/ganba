# Loop — kontekst for Claude

Personlig trenings- + ernæringsapp (Runna + MyFitnessPal i ett). Webapp, må fungere på mobil.

**Fase nå:** konsept for fase 1 (mat + vekt) godkjent. Nå: teknisk design (se docs/03-tech-notes.md). Ingen kode før teknisk spec + plan er godkjent.

Systemet er **generelt/flerbruker** — aldri hardkod brukerens personlige verdier.

## Les først
- [docs/specs/2026-09-29-fase1-konsept.md](docs/specs/2026-09-29-fase1-konsept.md) — **gjeldende spec** for fase 1
- [docs/00-idea.md](docs/00-idea.md) — hva appen er
- [docs/02-decisions.md](docs/02-decisions.md) — hva vi er enige om + åpne spørsmål
- [docs/03-tech-notes.md](docs/03-tech-notes.md) — teknisk design under arbeid
- [docs/01-research-notes.md](docs/01-research-notes.md) — fakta om API-er (Strava, Garmin, Anthropic)

## Produktprinsipp
**Minst mulig innsats for brukeren.** Mye data, men samlet automatisk/utledet. Hvis brukeren alltid må fylle ut masse, går de lei. Alt utover det nødvendige er valgfritt og kan hoppes over. Test hver ny funksjon mot dette.

## Regler
- Oppdater `docs/02-decisions.md` hver gang noe blir bestemt.
- Brukeren skriver norsk. Docs på norsk.
- Ett spørsmål om gangen i diskusjon.
