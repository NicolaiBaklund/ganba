# Loop — Fase 1 teknisk spec

Status: **utkast, venter på gjennomlesing**.
Bygger på: [konsept-spec](2026-09-29-fase1-konsept.md). Beslutninger: [../02-decisions.md](../02-decisions.md). Arbeidsnotater: [../03-tech-notes.md](../03-tech-notes.md).

Valg merket *(Claude-default)* ble ikke diskutert eksplisitt — si fra hvis noe skal endres.

## 1. Stack

| Del | Valg |
|---|---|
| App | **Next.js** (App Router) + **TypeScript**, som installerbar webapp (PWA: manifest, ikon, fullskjerm) |
| UI | Tailwind CSS + shadcn/ui *(Claude-default)* |
| Grafer | Recharts *(Claude-default)* |
| i18n | next-intl, engelsk først *(Claude-default)* |
| Validering | zod (skjema for API-input og AI-svar) |
| Backend | **Supabase**: Postgres + RLS, Auth, Storage |
| AI | Anthropic TypeScript SDK (`@anthropic-ai/sdk`), modell konfigurerbar, start `claude-opus-5-5` |
| Tester | Vitest (enhet), Playwright for noen få kjerneflyter *(Claude-default)* |
| Hosting | Vercel (app) + Supabase (hostet) |
| Pakkehåndtering | pnpm workspaces (monorepo) *(Claude-default)* |

## 2. Repo-struktur

```
loop/
├── apps/web/                 Next.js-app
│   ├── app/                  sider og server-ruter
│   ├── components/
│   ├── lib/supabase/         klient- og server-klienter
│   ├── lib/ai/               Anthropic-kall, nøkkelvalg
│   └── messages/             i18n-tekster
├── packages/core/            ren TS, ingen rammeverk-avhengighet
│   ├── energy/               BMR, startestimat, adaptivt forbruk, dagsmål, makro, grenser
│   ├── trend/                vekt-trend, prognose
│   ├── checkin/              ukentlig innsjekk-beregning
│   └── food-ai/              prompt, JSON-skjema, validering
├── supabase/migrations/      SQL-migrasjoner (tabeller, RLS, views, storage-policies)
├── evals/food/               testmåltider (bilder + fasit) + skript for prompt-eval
└── docs/
```

`packages/core` har null avhengighet til Next.js, React eller Supabase. Input/output er rene data. Gjenbrukbar i senere Expo-app.

## 3. Datamodell

Alle tabeller: `id uuid pk`, `user_id uuid → auth.users on delete cascade`, `created_at`, `updated_at`. RLS på: bruker kan kun lese/skrive rader med egen `user_id`. Metrisk kanonisk.

| Tabell | Felter (utover felles) |
|---|---|
| `profiles` | `sex` (male/female, for formel), `birth_date`, `height_cm`, `timezone` (fra enhet), `checkin_weekday` (default mandag), `locale`, `onboarded_at` |
| `activity_baselines` | `steps_per_day`, `run_km_per_week`, `other_training_hours_per_week`, `valid_from date` |
| `goals` | `target_weight_kg`, `rate_kg_per_week` (negativ = ned), `valid_from date` |
| `energy_plans` | `base_expenditure_kcal`, `source` (formula/adaptive/manual), `protein_g_per_kg`, `fat_pct`, `manual_kcal_override` (null), `checkin_id` (null), `valid_from date` |
| `food_entries` | `logged_at timestamptz`, `local_date date`, `meal_type` (breakfast/lunch/dinner/evening/snack), `source` (ai/quick) |
| `food_items` | `food_entry_id`, `name`, `grams` (null), `kcal`, `protein_g`, `carbs_g`, `fat_g`, `confidence` (null: low/medium/high) |
| `ai_estimates` | `food_entry_id` (null), `parent_estimate_id` (null), `input_text`, `model`, `prompt_version`, `response jsonb`, `input_tokens`, `output_tokens`, `cost_usd`, `latency_ms`, `error` (null) |
| `weight_entries` | `measured_at timestamptz`, `local_date date`, `weight_kg`, `source` (manual) |
| `photos` | `bucket` (food/body), `storage_path`, `food_entry_id` (null), `weight_entry_id` (null). Check: nøyaktig én FK satt |
| `weekly_checkins` | `week_start date` (unik per bruker), `window_start`, `window_end`, `avg_intake_kcal`, `trend_change_kg`, `logged_days`, `avg_training_kcal`, `computed_base_kcal`, `proposed_target_kcal`, `status` (pending/accepted/kept/insufficient_data) |
| `api_keys` | `provider` (anthropic), `ciphertext`, `iv`, `auth_tag`, `last4`, `validated_at`. **RLS på uten policies** → kun service role |

**Views:** `daily_intake` (sum av `food_items` per `user_id`, `local_date`).

**Gjeldende rad** i tabeller med `valid_from`: siste rad med `valid_from <= dato`.

## 4. Kjernelogikk (`packages/core`)

### 4.1 Startestimat
```
BMR (Mifflin-St Jeor) = 10·kg + 6.25·cm − 5·alder + (male: +5 | female: −161)
Grunnforbruk          = BMR · 1.2 + gange-tillegg
gange-tillegg         = max(0, gåskritt − 4000) / 1000 · 0.4 · kg
gåskritt              = steps_per_day − løpeskritt (løpe-km/dag · ~700 skritt/km)
Treningskcal/dag      = (run_km_per_week · kg · 0.9 + other_training_hours_per_week · (MET − 1) · kg) / 7
                        (netto, dvs. minus hvile som allerede er i BMR · 1.2; MET = 5 som snitt for "annen trening")
```
- Vises som tall + område (±7 %) + forklaring per lag.
- `base_expenditure_kcal` lagres **uten** trening. Treningen legges på i dagsmålet.

### 4.2 Dagsmål
```
dagsmål = manual_kcal_override
       ?? base_expenditure_kcal + treningskcal(dag) − rate_kg_per_week · 7700 / 7
```
- Fase 1: `treningskcal(dag)` = snitt fra gjeldende `activity_baselines`.
- Kcal-gulv: male 1500, female 1200. Under gulv → bruk gulv + advarsel "senk tempo".
- Tempo-tak: nedgang maks 1 % kroppsvekt/uke, oppgang maks 0.5 kg/uke (valideres ved mål-oppsett).
- Makro: protein = `protein_g_per_kg` · kg (default 2.0 ved nedgang, 1.8 ellers); fett = `fat_pct` (default 25 %) av kcal / 9; karbo = rest / 4.

### 4.3 Vekt-trend
- Én verdi per dag: første måling på `local_date`.
- Eksponentielt glidende snitt, `trend_i = trend_{i-1} + α·(vekt_i − trend_{i-1})`, α = 0.1 per dag.
- Dager uten veiing: trenden står stille (ingen oppdatering).
- Ukeendring = trend(i dag) − trend(i dag − 7).
- Prognose: lineær fra siste 14 dagers trend-stigning → estimert dato for målvekt.

### 4.4 Ukentlig innsjekk
- **Trigger:** første app-åpning på/etter `checkin_weekday` i brukerens tidssone, hvis ingen rad finnes for `week_start`. Ingen cron. Unik (`user_id`, `week_start`) gjør den idempotent.
- **Aktiveringskrav (adaptiv):** ≥ 14 dager siden første logg, ≥ 10 loggede matdager og ≥ 4 veiinger i vinduet. Ellers `insufficient_data` (fortsatt startestimat).
- **Vindu:** siste 21 dager (min 14).
- **Beregning:**
  ```
  avg_intake    = snitt kcal over dager med matlogg i vinduet
  trend_change  = trend(window_end) − trend(window_start)
  base          = avg_intake − trend_change · 7700 / dager − avg_training_kcal
  ```
- Bruker aldri forrige mål. Kun faktisk inntak og faktisk trendendring.
- Uka før må ha ≥ 5/7 loggede dager, ellers `insufficient_data`.
- Foreslått endring i grunnforbruk begrenses til ±150 kcal mot gjeldende `energy_plans`.
- **Godta** → ny `energy_plans`-rad (`source=adaptive`, `checkin_id`, `valid_from` = i dag). **Behold** → ingen endring. Ubesvart = forrige gjelder.

## 5. Matlogging og AI

### 5.1 Flyt
1. Klient: bilde → skaler til maks 1024 px langside, WebP. Last opp til `food`-bucket (midlertidig sti under brukerens mappe).
2. `POST /api/food/estimate` `{ photoPaths?, text?, parentEstimateId? }`.
3. Server: sjekk sesjon → hent + dekrypter brukerens nøkkel → last bilde fra Storage → kall Claude.
4. Claude: fast systemprompt (cached) + bilde + tekst (+ forrige svar ved korrigering) → **structured output** etter JSON-skjema.
5. Server: valider med zod; sjekk `kcal ≈ 4P + 4K + 9F` (±15 %) per linje. Ugyldig → ett nytt forsøk → feil.
6. Lagre `ai_estimates`-rad (også ved feil). Returner forslag.
7. Klient: bruker redigerer / korrigerer (→ steg 2 med `parentEstimateId`) / lagrer.
8. `POST /api/food/entries` lagrer `food_entries` + `food_items`, kobler `ai_estimates.food_entry_id` og bilder.

### 5.2 AI-svar (skjema)
```json
{
  "items": [
    { "name": "string", "grams": 0, "kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0,
      "confidence": "low|medium|high", "assumptions": "string" }
  ],
  "notes": "string"
}
```
Total regnes i kode, ikke av modellen.

### 5.3 Modell og kall
- Konfig: `AI_FOOD_MODEL` (default `claude-opus-5-5`), `AI_FOOD_EFFORT` (default `medium`).
- Opus 5.5: thinking kan ikke slås av (styres med effort), ingen prefill → structured outputs (`output_config.format`).
- Sjekk `stop_reason` før innhold leses (`refusal` → feilmelding).
- SDK `maxRetries: 2`.
- `prompt_version` konstant i `packages/core/food-ai`, økes ved hver promptendring.
- Kost beregnes fra `usage` og lagres.

### 5.4 Eval
- `evals/food/`: 15–30 testmåltider (bilde/tekst + fasit kcal/makro). Skript kjører gjeldende prompt/modell og rapporterer avvik. Kjøres manuelt ved promptendring (koster penger).

### 5.5 Hurtigtillegg
- `POST /api/food/entries` med `source=quick` og én linje (`name` default "Quick add", `kcal` påkrevd, makro valgfritt).

## 6. API-nøkler (BYOK)

- `PUT /api/settings/api-key` → valider med minimalt kall → krypter (AES-256-GCM, Node `crypto`) med `API_KEY_ENCRYPTION_SECRET` → lagre via service role.
- `DELETE /api/settings/api-key`.
- Klienten ser kun `last4` + `validated_at`.
- Nøkkel aldri i logger, feilmeldinger eller respons.
- `lib/ai/resolveKey(userId)` er eneste sted som velger nøkkel (senere: plattformnøkkel).
- Uten nøkkel: AI-knapper viser "Legg inn API-nøkkel i Profil".

## 7. Bilder

- Buckets: `food`, `body` — begge private.
- Sti: `{bucket}/{user_id}/{entry_id}/{uuid}.webp`. Storage-policy: bruker kan kun lese/skrive under egen `user_id`-prefiks.
- Visning via signerte URL-er med kort levetid.
- Kroppsbilder sendes aldri til AI.
- Sletting av innslag → slett filer. Kontosletting (`DELETE /api/account`) → slett alle filer under `user_id` i begge buckets → slett auth-bruker (cascade).
- Bilder lastet opp under estimering men aldri lagret: ryddes når utkast forkastes. *(Opprydningsjobb for foreldreløse filer: senere.)*

## 8. Skjermer

| Skjerm | Innhold |
|---|---|
| Innlogging | E-post magic link, Google |
| Oppstart (wizard) | 1) kjønn, fødselsdato, høyde, vekt → 2) aktivitet (skritt, løpe-km, annen trening) → 3) mål (målvekt, tempo, med advarsler) → 4) resultat: kcal-mål med forklaring + makro → 5) valgfritt: API-nøkkel |
| I dag | kcal-kort (ring + tall + makrobarer), dagens måltider, trendvekt-kort, mini-graf, innsjekk-kort ved behov. Dato-navigasjon |
| "+"-meny | Bilde / Tekst / Hurtig / Vekt |
| AI-logg | kamera/galleri + tekst → forslag med redigerbare linjer + korrigeringsfelt → lagre |
| Mat | historikk per dag, rediger/slett |
| Kropp | vektgraf (målinger, trend, prognose), liste, bilder, side-om-side (velg to) |
| Profil | mål, aktivitet, makro-overstyring, API-nøkkel, språk, slett konto |

## 9. Feilhåndtering

| Situasjon | Oppførsel |
|---|---|
| Ugyldig/utløpt nøkkel (401) | "Nøkkelen virker ikke" + lenke til Profil |
| 429 / 5xx / nettverk | SDK prøver 2 ganger → feilmelding, bilde/tekst beholdes |
| `refusal` / ugyldig svar etter nytt forsøk | "Klarte ikke anslå" → tilby hurtigtillegg, bilde beholdes |
| Bildeopplasting feiler | Nytt forsøk; kan lagre innslag uten bilde |
| Offline | Utkast i lokal lagring, sendes når nett er tilbake |

Observabilitet: `ai_estimates` (AI-feil, kost, latens) + Vercel-logger. Sentry senere ved behov.

## 10. Sikkerhet og personvern

- RLS på alle tabeller; test at bruker A ikke ser B sine rader.
- Service role-nøkkel kun på server.
- Env-hemmeligheter: `SUPABASE_SERVICE_ROLE_KEY`, `API_KEY_ENCRYPTION_SECRET`.
- Kontosletting fjerner alt (DB + filer).
- Før åpning for andre: personvernerklæring, GDPR-vurdering (helsedata).

## 11. Testing

- **`packages/core`:** grundige enhetstester (BMR, startestimat, dagsmål, gulv/tak, makro, trend med hull, innsjekk inkl. aktiveringskrav, ±150-grense, insufficient_data). Kjente tall som fasit.
- **RLS:** integrasjonstest mot lokal Supabase (to brukere).
- **API-ruter:** zod-validering, nøkkelhåndtering (ingen lekkasje), AI-kall mocket.
- **E2E (Playwright):** oppstart → hurtigtillegg → vekt → I dag viser riktige tall.
- **AI-eval:** manuelt skript (§5.4).

## 12. Utenfor fase 1

Garmin/Strava, treningsplan, AI-coach, økter til klokka, matdatabase, strekkode, favoritter, fiber, imperiale enheter, Sentry, opprydningsjobb for foreldreløse filer, plattform-API-nøkkel.
