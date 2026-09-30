# Teknisk design — arbeidsnotater (fase 1)

Status: under diskusjon. Blir til teknisk spec når alle deler er godkjent.

## Godkjent

### Stack
- **Next.js + TypeScript**, installerbar webapp (PWA): legges til på hjemskjerm, fullskjerm, app-ikon. Ingen app-butikk.
- **Supabase**: Postgres, Auth, Storage, Row Level Security (hver bruker ser kun egne rader).
- Hosting: Vercel (app) + Supabase. Gratis-nivå holder lenge.
- Begrunnelse: ett språk, raskest å bygge, flerbruker + personvern i grunnmuren. Brukeren kan mest Python, kjent med TS/React; Claude skriver det meste.
- Fase 2: Garmin-synk som egen liten **Python-tjeneste** (uoffisielt bibliotek er Python).

### Arkitektur
```
PWA (Next.js + React)
  ├── Supabase Auth     → innlogging (e-post magic link + Google; Apple hvis iOS-app)
  ├── Supabase DB       → Postgres + RLS
  ├── Supabase Storage  → private bilder, komprimert klientside før opplasting
  └── Next.js server-ruter
        ├── /api/food/estimate → Claude API (bilde+tekst → JSON)
        └── ukentlig jobb      → adaptivt forbruk + innsjekk-kort

packages/core (ren TS, ingen rammeverk-avhengighet)
  ├── energy/   BMR, lagdelt startestimat, adaptivt forbruk, makro, sikkerhetsgrenser
  ├── trend/    vekt-trend-glatting, prognose
  └── food-ai/  prompt + validering av AI-svar
```
- `packages/core` holdes rammeverk-uavhengig så en senere **native app (React Native/Expo)** kan gjenbruke logikk + hele Supabase-backend. Kun skjermene skrives på nytt. Expo bygger iOS i skyen (ingen Mac nødvendig), krever Apple-utviklerkonto.
- Testing: grundige enhetstester på `packages/core`. AI-prompt testes mot fast sett testmåltider (eval) ved hver endring.

### AI for matlogging
- Bilde skaleres til ~1024 px klientside.
- Server sender bilde + tekst + fast systemprompt → Claude svarer med fast JSON-skjema (matvarer: navn, gram, kcal, P/K/F, sikkerhet, antakelser; total).
- Server validerer (summer, kcal ≈ 4P + 4K + 9F). Ugyldig → ett nytt forsøk → feilmelding.
- Korrigering sender forrige svar med → AI justerer, starter ikke på nytt.
- **Modell = konfigurasjon (valg C).** Start Opus 5.5 for alt; test billigere modeller mot testmåltider; bytt kun hvis kvalitet holder.
- Systemprompt caches. Bruk (tokens/kost) logges per bruker.
- **Priser ikke verifisert ennå** — hentes fra Claude API-dokumentasjon.

### API-nøkkel: bring your own key (for nå)
- Hver bruker legger inn egen Anthropic-nøkkel i Profil.
- Lagres **kryptert server-side**; krypteringsnøkkel som server-hemmelighet (aldri i DB/kode). Aldri sendt tilbake til klient (vis kun siste 4 tegn). Aldri logget.
- AI-kall går via server med brukerens nøkkel.
- Nøkkel valideres med lite testkall ved lagring.
- Uten nøkkel: AI-logging deaktivert; hurtigtillegg, vekt osv. virker.
- Eieren bruker samme mekanisme (ingen spesialtilfelle).
- Ett sted i koden avgjør hvilken nøkkel brukes → lett å legge til plattformnøkkel + grenser/abonnement hvis produkt.
- Ingen per-bruker-kvote nødvendig nå (hver betaler selv).

### Datamodell
Alle tabeller har `user_id` (→ `auth.users`, `on delete cascade`) + RLS: bruker ser kun egne rader. `id uuid`, `created_at`, `updated_at`. Metrisk kanonisk (kg, cm, g, kcal).

| Tabell | Innhold |
|---|---|
| `profiles` | kjønn (for formel), fødselsdato, høyde, `timezone` (auto fra enhet), innsjekk-ukedag, enheter, språk |
| `activity_baselines` | skritt/dag, løpe-km/uke, timer annen trening/uke, `valid_from` |
| `goals` | målvekt, tempo kg/uke, `valid_from` |
| `energy_plans` | `base_expenditure_kcal`, kilde (formula/adaptive/manual), proteinregel (g/kg), fettandel, `manual_kcal_override` (null), `checkin_id` (null), `valid_from` |
| `food_entries` | `logged_at` (timestamptz), `local_date`, måltidstype, kilde (ai/quick) |
| `food_items` | `food_entry_id`, navn, gram (null), kcal, protein, karbo, fett, sikkerhet (null). **Eneste sted totaler lagres** |
| `ai_estimates` | `food_entry_id` (null), `parent_estimate_id` (null, kjede ved korrigering), input-tekst, modell, `prompt_version`, rått svar (jsonb), tokens inn/ut, kost, latens, feil |
| `weight_entries` | `measured_at`, `local_date`, vekt kg, `source` (manual; senere garmin) |
| `photos` | `storage_path`, `bucket` (food/body), `food_entry_id` / `weight_entry_id` (én satt). Flere bilder per innslag |
| `weekly_checkins` | `week_start` (unik per bruker), vindu, snitt inntak, trendendring, loggede dager, treningskcal, beregnet grunnforbruk, foreslått mål, status (pending/accepted/kept) |
| `api_keys` | leverandør, kryptert nøkkel + IV, siste 4 tegn, `validated_at`. **Ingen RLS-tilgang for klient** — kun server (service role) |

Prinsipper:
- **Dag = `local_date`** (brukerens tidssone ved logging). Alle summer og uker bruker den.
- **Dagsmål lagres ikke** — regnes i `packages/core`: grunnforbruk + trening(dag) − underskudd (eller manuell overstyring). Klar for fase 2.
- **Trendvekt lagres ikke** — regnes fra `weight_entries`. Første måling per dag brukes.
- Hurtigtillegg = innslag med én `food_items`-linje.
- Dagssummer via database-view.
- Mat- og kroppsbilder i **separate buckets**. Kroppsbilder sendes aldri til AI. Sletting av innslag/konto sletter også filer.
- `ai_estimates` (AI-forslag) vs. `food_items` (lagret) = datagrunnlag for prompt-forbedring.

Bevisst utelatt: pose på bilder, fiber/sukker/salt, `daily_targets`-tabell, myk sletting, favoritter (men modellen gjør "logg igjen" enkelt senere).

## Gjenstår
- Ukentlig jobb: hvordan kjøres (cron)
- Bildelagring: struktur, sletting
- Feilhåndtering, observabilitet
- Verifiser AI-priser
