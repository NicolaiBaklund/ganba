# Restitusjon del 1 (data og motor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hente søvn/HRV/hvilepuls fra Garmin, lagre alkohol og måltidstid riktig, og kjøre en deterministisk statistikkmotor etter hver synk som lagrer funn i `recovery_findings`. Ingen UI.

**Architecture:** Python-adapteret får `fetch_recovery`; `syncGarmin` henter 3+ nye netter og 10 historiske per synk inn i `recovery_days`. Ren TS-motor i `packages/core/src/recovery/` (bygg dagsrader → avtrend → 21 spørsmål → tredjedeler/ja-nei → blokkpermutasjon + BH + treningskontroll). `apps/web/lib/recovery/` laster dagsdata fra DB, kjører motoren og lagrer resultatet; kalles fra `afterGarminSync`.

**Tech Stack:** Next.js 16 route handlers, Supabase (Postgres/RLS), Python `garminconnect` 0.3.2, TypeScript + zod v4, Vitest integrasjonstester.

**Spec:** `docs/specs/2026-10-04-restitusjon.md` (§4–§6, §9–§11 del 1). Beslutninger: `docs/02-decisions.md` (2026-10-04, restitusjon).

## Global Constraints

- **Ingen enhetstester / TDD** (prosjektregel, overstyrer skill-standarden): skriv koden først, deretter integrasjonstesten i `tests/integration/`, kjør den. Motortestene (ren TS mot konstruerte data) ligger også der — spec §10 krever dem.
- **Ingen `Co-Authored-By` eller annen Claude-attribusjon i commits.**
- **Aldri `git add -A`/`git add .`** — en annen prosess (Tasuki-redesign) jobber i samme repo. Legg til bare filene oppgaven nevner. Ikke rør `globals.css`, layout, manifest, `components/today/*`, `components/food/*` eller andre UI-filer.
- Jobb på egen gren `restitusjon-del1` (ev. worktree via superpowers:using-git-worktrees). Ikke push/merge uten at brukeren ber om det.
- DB-endringer: ny fil i `supabase/migrations/`, så `pnpm db:push` (pusher + regenererer `apps/web/lib/db/types.ts`). Migrasjonen er rent additiv og trygg mot produksjon.
- Hemmeligheter ligger i `apps/web/.env.local`; aldri skriv dem ut i chat eller logg.
- Kommandoer: `pnpm typecheck`, `pnpm test:int` (alle), `pnpm exec vitest run tests/integration/<fil>` (én fil).
- Motoren: deterministisk (fast frø), ingen I/O, ingen `Date.now()`.
- Navn i core eksporteres med `recovery`/`RECOVERY_`-prefiks (unngå kollisjon i `@loop/core`).
- Søvn hører til **morgenen man våkner** (Garmins `calendarDate`); factor-dag D, utfall morgen D+lag.
- Kode, kommentarer og commit-meldinger på engelsk (som resten av koden); docs på norsk.

## Review Focus

1. **Produksjon før deploy:** Python-adapteret i prod kjenner ikke `fetch_recovery` før koden er deployet → `bad_request`. Synken må fortsette som før (feilen logges, `nights: null`), bare `auth` skal gi `reauth_required`. Test i Task 5.
2. **Hull i nattedata etter synkpause:** brukeren synker ikke på 6 dager → de mellomliggende nettene må hentes (ikke bare siste 3). Test i Task 5 (`recoveryDates`).
3. **Redigering av mat mister alkohol:** redigeringsarket sender ikke `alcohol_g` → må beholdes etter navn. Test i Task 4.
4. **Halvloggede dager og mat logget i etterkant** må ikke gi falske underskudd/sene måltider. Test i Task 7.
5. **Falske funn på autokorrelert støy** (vanlig omstokking ville gitt for mange). Test i Task 6 (AR(1)).

---

## File Structure

| Fil | Ansvar |
|---|---|
| `apps/web/api/py/garmin.py` (endres) | ny op `fetch_recovery` |
| `apps/web/lib/garmin/adapter.ts` (endres) | `GarminSource.fetchRecovery`, `GarminNightRaw`, TE-felt på aktivitet |
| `tests/integration/fake-garmin.ts` (endres) | `nights`, `fetchRecovery`, `night()`-hjelper |
| `tests/integration/recovery-spike.test.ts` (ny) | manuell spike mot ekte konto (hoppes over uten `SPIKE_EMAIL`) |
| `supabase/migrations/20261005000000_recovery.sql` (ny) | tabeller, kolonner, backfill |
| `packages/core/src/dates.ts` (endres) | `zonedTime`, `localHour` |
| `apps/web/lib/validation/food.ts` (endres) | `alcohol_g` på Item, `time` på UpdateEntry |
| `apps/web/lib/food/entries.ts` (ny) | `createFoodEntry`, `updateFoodEntry`, `EntryError` |
| `apps/web/app/api/food/entries/route.ts`, `[id]/route.ts` (endres) | tynne ruter mot `lib/food/entries.ts` |
| `apps/web/lib/recovery/parse.ts` (ny) | Garmin-natt → `recovery_days`-rad |
| `apps/web/lib/recovery/fetch.ts` (ny) | `recoveryDates`, `backfillProgress`, `syncRecovery` |
| `apps/web/lib/garmin/sync.ts` (endres) | kaller `syncRecovery`, TE-kolonner |
| `packages/core/src/recovery/{types,stats,variables,questions,analyze}.ts` (nye) | motoren |
| `packages/core/src/index.ts` (endres) | eksport |
| `apps/web/lib/training/quality.ts` (ny) | `qualityResultsBetween` (flyttet ut av service) |
| `apps/web/lib/training/service.ts` (endres) | bruker `quality.ts`; `afterGarminSync` kaller `computeRecovery` |
| `apps/web/lib/recovery/load.ts` (ny) | DB → `RecoveryDayInput[]` |
| `apps/web/lib/recovery/compute.ts` (ny) | foreldet-sjekk, kjør motor, lagre funn |
| tester: `food-entries.test.ts`, `recovery-sync.test.ts`, `recovery-engine.test.ts`, `recovery-compute.test.ts` (nye) | |

---

### Task 1: Adapter-kommando `fetch_recovery`

**Files:**
- Modify: `apps/web/api/py/garmin.py` (etter `op_fetch`, og `OPS`)
- Modify: `apps/web/lib/garmin/adapter.ts`
- Modify: `tests/integration/fake-garmin.ts`

**Interfaces:**
- Produces: `GarminNightRaw { date: string; sleep: unknown; hrv: unknown }`, `FetchRecoveryResult { nights: GarminNightRaw[]; tokens: string | null }`, `GarminSource.fetchRecovery(tokens: string, dates: string[]): Promise<FetchRecoveryResult>`, `GarminActivityRaw.aerobicTrainingEffect?`, `anaerobicTrainingEffect?`. Fake: `FakeGarmin.nights: Record<string, {sleep: unknown; hrv: unknown}>`, `recoveryFetches: string[][]`, `recoveryFailWith: GarminError | null`, `night(date, opts)`.

- [ ] **Step 1: Python op**

I `garmin.py`, rett etter `op_fetch`:

```python
MAX_RECOVERY_DATES = 24


def op_fetch_recovery(b: dict[str, Any]) -> dict[str, Any]:
    """Sleep (with score, resting HR, overnight HRV, Body Battery) and the HRV summary (baseline) per date."""
    tokens = b["tokens"]
    g = session_from(tokens)
    _profile(g)  # sleep URLs need the display name
    nights = []
    for d in list(b["dates"])[:MAX_RECOVERY_DATES]:
        night: dict[str, Any] = {"date": d, "sleep": None, "hrv": None}
        try:
            night["sleep"] = g.get_sleep_data(d)
        except (GarminConnectConnectionError, requests.exceptions.RequestException):
            pass
        try:
            night["hrv"] = g.get_hrv_data(d)
        except (GarminConnectConnectionError, requests.exceptions.RequestException):
            pass
        nights.append(night)
    return {"nights": nights, "tokens": changed_tokens(g, tokens)}
```

og i `OPS`: `"fetch_recovery": op_fetch_recovery,`. Auth- og rate-limit-feil skal **ikke** fanges her (håndteres i `run`).

- [ ] **Step 2: TS-adapter**

I `adapter.ts`, legg til i `GarminActivityRaw` (før indekssignaturen):

```ts
  aerobicTrainingEffect?: number | null;
  anaerobicTrainingEffect?: number | null;
```

etter `FetchResult`:

```ts
/** One requested morning: Garmin's sleep and HRV payloads, null when Garmin had nothing. */
export interface GarminNightRaw {
  date: string;
  sleep: unknown;
  hrv: unknown;
}

export interface FetchRecoveryResult {
  nights: GarminNightRaw[];
  tokens: string | null;
}
```

i `GarminSource`: `fetchRecovery(tokens: string, dates: string[]): Promise<FetchRecoveryResult>;`
i `httpGarmin`: `fetchRecovery: (tokens, dates) => call({ op: "fetch_recovery", tokens, dates }),`

- [ ] **Step 3: Falsk Garmin**

I `FakeGarmin` (felt øverst + metode etter `fetch`):

```ts
  nights: Record<string, { sleep: unknown; hrv: unknown }> = {};
  recoveryFetches: string[][] = [];
  recoveryFailWith: GarminError | null = null;
```

```ts
  async fetchRecovery(_tokens: string, dates: string[]) {
    if (this.failWith) throw this.failWith;
    if (this.recoveryFailWith) throw this.recoveryFailWith;
    this.recoveryFetches.push(dates);
    return {
      nights: dates.map((date) => ({ date, sleep: this.nights[date]?.sleep ?? null, hrv: this.nights[date]?.hrv ?? null })),
      tokens: null,
    };
  }
```

nederst i fila:

```ts
/** Garmin-shaped sleep + HRV payloads for the morning `date` (field names verified in the Task 2 spike). */
export function night(date: string, o: { score?: number; hrv?: number; rhr?: number; hours?: number } = {}) {
  const s = Math.round((o.hours ?? 7.5) * 3600);
  const end = Date.parse(`${date}T05:00:00Z`);
  return {
    sleep: {
      dailySleepDTO: {
        calendarDate: date,
        sleepTimeSeconds: s,
        deepSleepSeconds: Math.round(s * 0.2),
        lightSleepSeconds: Math.round(s * 0.55),
        remSleepSeconds: Math.round(s * 0.25),
        awakeSleepSeconds: 600,
        sleepStartTimestampGMT: end - (s + 600) * 1000,
        sleepEndTimestampGMT: end,
        sleepScores: { overall: { value: o.score ?? 80 } },
      },
      sleepLevels: [{ startGMT: "x", activityLevel: 1 }],
      restingHeartRate: o.rhr ?? 50,
      avgOvernightHrv: o.hrv ?? 60,
      hrvStatus: "BALANCED",
      bodyBatteryChange: 55,
    },
    hrv: { hrvSummary: { calendarDate: date, lastNightAvg: o.hrv ?? 60, status: "BALANCED", baseline: { balancedLow: 52, balancedUpper: 68 } }, hrvReadings: [{ hrvValue: 60 }] },
  };
}
```

- [ ] **Step 4: Sjekk**

Run: `.venv/Scripts/python -c "import ast,sys; ast.parse(open('apps/web/api/py/garmin.py',encoding='utf-8').read())" && pnpm typecheck`
Expected: ingen feil.

- [ ] **Step 5: Commit**

```bash
git add apps/web/api/py/garmin.py apps/web/lib/garmin/adapter.ts tests/integration/fake-garmin.ts
git commit -m "feat(garmin): fetch_recovery adapter op for sleep and HRV"
```

---

### Task 2: Spike — verifiser feltnavn mot ekte konto

**Files:**
- Create: `tests/integration/recovery-spike.test.ts`
- Modify: `docs/specs/2026-10-04-restitusjon.md` (§4.1: tabell «Feltnavn (verifisert)»)

**Interfaces:**
- Consumes: `httpGarmin().fetchRecovery` (Task 1), `loadTokens(userId)` fra `@/lib/garmin/accounts`.
- Produces: verifisert feltkart brukt av `parse.ts` (Task 5), `night()` (Task 1) og TE-backfill (Task 3).

- [ ] **Step 1: Spike-test (hoppes over i vanlige kjøringer)**

```ts
import { describe, expect, it } from "vitest";
import { addDays, localDate } from "@loop/core";
import { loadTokens } from "@/lib/garmin/accounts";
import { httpGarmin } from "@/lib/garmin/adapter";
import { admin } from "./setup";

/** Paths and values of a payload; arrays shown by length only. */
const paths = (v: unknown, p = ""): string[] =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.entries(v).flatMap(([k, x]) => paths(x, p ? `${p}.${k}` : k))
    : [`${p} = ${Array.isArray(v) ? `[${v.length}]` : JSON.stringify(v)}`];

/** Manual: SPIKE_EMAIL=<connected account> pnpm exec vitest run tests/integration/recovery-spike.test.ts (needs the local adapter on :3200). */
describe.skipIf(!process.env.SPIKE_EMAIL)("spike: real Garmin recovery payloads", () => {
  it("prints sleep, HRV and activity Training Effect fields", async () => {
    const { data } = await admin().auth.admin.listUsers({ perPage: 1000 });
    const user = data.users.find((u) => u.email === process.env.SPIKE_EMAIL);
    expect(user).toBeTruthy();
    const { data: profile } = await admin().from("profiles").select("timezone").eq("user_id", user!.id).single();
    const tokens = await loadTokens(user!.id);
    expect(tokens).toBeTruthy();
    const today = localDate(profile?.timezone ?? "UTC");
    const res = await httpGarmin().fetchRecovery(tokens!, [addDays(today, -1), addDays(today, -40)]);
    for (const n of res.nights) {
      console.log(`=== ${n.date} SLEEP\n${paths(n.sleep).join("\n")}\n=== ${n.date} HRV\n${paths(n.hrv).join("\n")}`);
    }
    const { data: acts } = await admin().from("activities").select("type_key, raw").eq("user_id", user!.id).order("start_time", { ascending: false }).limit(3);
    for (const a of acts ?? []) console.log(a.type_key, Object.entries((a.raw ?? {}) as Record<string, unknown>).filter(([k]) => /trainingeffect/i.test(k)));
  });
});
```

- [ ] **Step 2: Kjør mot ekte konto**

Start adapteret i bakgrunnen: `.venv/Scripts/python apps/web/scripts/garmin-dev.py`. Sjekk at `apps/web/.env.local` har `GARMIN_ADAPTER_URL=http://127.0.0.1:3200` (les bare den linja; ikke skriv ut hemmeligheter).
Run: `SPIKE_EMAIL=baklundnicolai@gmail.com pnpm exec vitest run tests/integration/recovery-spike.test.ts`
Expected: PASS, utskrift med stier. Bekreft disse (forventet ut fra `garminconnect`):

| Felt i `recovery_days` | Forventet sti |
|---|---|
| local_date | `sleep.dailySleepDTO.calendarDate` |
| sleep_s / deep_s / light_s / rem_s / awake_s | `sleep.dailySleepDTO.{sleepTimeSeconds,deepSleepSeconds,lightSleepSeconds,remSleepSeconds,awakeSleepSeconds}` |
| sleep_score | `sleep.dailySleepDTO.sleepScores.overall.value` |
| sleep_start / sleep_end | `sleep.dailySleepDTO.sleepStartTimestampGMT` / `sleepEndTimestampGMT` (ms) |
| resting_hr | `sleep.restingHeartRate` |
| hrv_avg | `hrv.hrvSummary.lastNightAvg` (fallback `sleep.avgOvernightHrv`) |
| hrv_baseline_low / high | `hrv.hrvSummary.baseline.balancedLow` / `balancedUpper` |
| hrv_status | `hrv.hrvSummary.status` |
| body_battery_charged | `sleep.bodyBatteryChange` |
| te_aerobic / te_anaerobic | aktivitet `aerobicTrainingEffect` / `anaerobicTrainingEffect` |

Hvis en sti avviker: før en `Ruling:` i ledgeren og bruk den faktiske stien i Task 3 (TE-backfill), Task 5 (`parse.ts`) og `night()` i `fake-garmin.ts`.
Stopp adapteret etterpå.

- [ ] **Step 3: Skriv det verifiserte kartet inn i specen**

I specen §4.1, etter avsnittet om `fetch_recovery`, legg inn tabellen over (med faktiske stier) under overskriften `**Feltnavn (verifisert <dato>):**`. Ingen helseverdier i specen, bare stier.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/recovery-spike.test.ts docs/specs/2026-10-04-restitusjon.md
git commit -m "chore(recovery): spike verifying Garmin sleep and HRV fields"
```

---

### Task 3: Migrasjon

**Files:**
- Create: `supabase/migrations/20261005000000_recovery.sql`
- Modify (generert): `apps/web/lib/db/types.ts`

**Interfaces:**
- Produces: tabeller `recovery_days`, `recovery_findings`; kolonner `food_items.alcohol_g`, `activities.te_aerobic`, `activities.te_anaerobic`, `garmin_accounts.recovery_backfilled_until`, `garmin_accounts.recovery_computed_at`.

- [ ] **Step 1: Skriv migrasjonen**

```sql
-- Recovery part 1: nightly sleep/HRV, engine results, alcohol per food item, Training Effect per activity.

create table recovery_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  local_date date not null, -- the morning you wake up
  sleep_s integer,
  deep_s integer,
  light_s integer,
  rem_s integer,
  awake_s integer,
  sleep_score smallint,
  sleep_start timestamptz,
  sleep_end timestamptz,
  hrv_avg smallint,
  hrv_baseline_low smallint,
  hrv_baseline_high smallint,
  hrv_status text,
  resting_hr smallint,
  body_battery_charged smallint,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date)
);

create table recovery_findings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  computed_at timestamptz not null,
  question_id text not null,
  factor text not null,
  outcome text not null,
  lag smallint not null,
  kind text not null check (kind in ('finding', 'no_effect', 'needs_data')),
  reason text check (reason in ('few_days', 'unclear', 'training')),
  groups jsonb not null,
  effect_sd numeric(6,3),
  p_value numeric(8,6),
  q_value numeric(8,6),
  control_ok boolean,
  source text not null default 'engine' check (source in ('engine', 'ai')),
  rank smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, question_id)
);
create index on recovery_findings (user_id, kind);

alter table food_items add column alcohol_g numeric(6,1) not null default 0 check (alcohol_g >= 0);
-- Earlier AI logs: alcohol was only kept in the estimate. Match the saved estimate's items by name.
update food_items fi
set alcohol_g = round((x->>'alcohol_g')::numeric, 1)
from ai_estimates ae,
  jsonb_array_elements(case when jsonb_typeof(ae.response->'items') = 'array' then ae.response->'items' else '[]'::jsonb end) x
where ae.food_entry_id = fi.food_entry_id
  and lower(trim(x->>'name')) = lower(trim(fi.name))
  and jsonb_typeof(x->'alcohol_g') = 'number'
  and (x->>'alcohol_g')::numeric > 0;

alter table activities add column te_aerobic numeric(3,1), add column te_anaerobic numeric(3,1);
update activities
set te_aerobic = case when jsonb_typeof(raw->'aerobicTrainingEffect') = 'number' then (raw->>'aerobicTrainingEffect')::numeric end,
    te_anaerobic = case when jsonb_typeof(raw->'anaerobicTrainingEffect') = 'number' then (raw->>'anaerobicTrainingEffect')::numeric end
where raw is not null;

alter table garmin_accounts
  add column recovery_backfilled_until date,
  add column recovery_computed_at timestamptz;

do $$
declare t text;
begin
  foreach t in array array['recovery_days', 'recovery_findings'] loop
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()', t || '_updated', t);
    execute format('alter table %I enable row level security', t);
    execute format('create policy own_rows on %I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;
```

(Bruk stiene fra Task 2 hvis de avvek.)

- [ ] **Step 2: Push og regenerer typer**

Run: `pnpm db:push`
Expected: migrasjonen anvendt, `apps/web/lib/db/types.ts` inneholder `recovery_days`, `recovery_findings`, `alcohol_g`, `te_aerobic`, `recovery_backfilled_until`.
Run: `pnpm typecheck` → ingen feil.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261005000000_recovery.sql apps/web/lib/db/types.ts
git commit -m "feat(db): recovery tables, alcohol per food item, Training Effect"
```

---

### Task 4: Alkohol og måltidstid i mat-API-et

**Files:**
- Modify: `packages/core/src/dates.ts`
- Modify: `apps/web/lib/validation/food.ts`
- Create: `apps/web/lib/food/entries.ts`
- Modify: `apps/web/app/api/food/entries/route.ts`, `apps/web/app/api/food/entries/[id]/route.ts`
- Test: `tests/integration/food-entries.test.ts`

**Interfaces:**
- Produces: `zonedTime(date: ISODate, hhmm: string, tz: string): Date`, `localHour(tz: string, at: Date): number` (core); `createFoodEntry(supabase: DB, userId: string, b: z.output<typeof CreateEntry>): Promise<string>`, `updateFoodEntry(supabase: DB, userId: string, id: string, b: z.output<typeof UpdateEntry>): Promise<void>`, `class EntryError { code: "invalid_input" | "not_found" | "db_error"; status: number }`. `UpdateEntry.time` = `"HH:MM"`.

- [ ] **Step 1: Tidshjelpere i core**

Nederst i `packages/core/src/dates.ts`:

```ts
const zonedParts = (tz: string, at: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: n("year"), mo: n("month"), d: n("day"), h: n("hour"), mi: n("minute"), s: n("second") };
};

/** Hour of day (0–23) in the given IANA timezone. */
export const localHour = (tz: string, at: Date): number => zonedParts(tz, at).h;

/** The instant a wall-clock time ("HH:MM") on `date` happens in `tz`. */
export function zonedTime(date: ISODate, hhmm: string, tz: string): Date {
  const wall = Date.parse(`${date}T${hhmm}:00Z`);
  const offset = (at: number) => {
    const p = zonedParts(tz, new Date(at));
    return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - at;
  };
  const first = wall - offset(wall);
  return new Date(wall - offset(first));
}
```

- [ ] **Step 2: Validering**

I `apps/web/lib/validation/food.ts`, i `Item` etter `fat_g`:

```ts
  alcohol_g: z.number().min(0).max(500).optional(),
```

og `UpdateEntry` blir:

```ts
export const UpdateEntry = z.object({
  mealType: MealTypeSchema.optional(),
  items: z.array(Item).min(1).max(40).optional(),
  /** Local wall-clock time on the entry's own date, e.g. "19:30". */
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
});
```

- [ ] **Step 3: `lib/food/entries.ts`**

```ts
import "server-only";
import type { z } from "zod";
import { localDate, zonedTime } from "@loop/core";
import type { DB } from "@/lib/db/current";
import type { CreateEntry, UpdateEntry } from "@/lib/validation/food";

export class EntryError extends Error {
  constructor(
    readonly code: "invalid_input" | "not_found" | "db_error",
    readonly status: number,
  ) {
    super(code);
  }
}

const nameKey = (s: string) => s.trim().toLowerCase();

/** Alcohol per item name from the AI estimate the entry was saved from (the form does not send it). */
async function alcoholFromEstimate(supabase: DB, estimateId: string): Promise<Map<string, number>> {
  const { data } = await supabase.from("ai_estimates").select("response").eq("id", estimateId).maybeSingle();
  const items = (data?.response as { items?: { name?: string; alcohol_g?: number }[] } | null)?.items ?? [];
  return new Map(items.filter((i) => i.name && (i.alcohol_g ?? 0) > 0).map((i) => [nameKey(i.name!), Number(i.alcohol_g)]));
}

async function timezoneOf(supabase: DB, userId: string): Promise<string> {
  const { data } = await supabase.from("profiles").select("timezone").eq("user_id", userId).single();
  return data?.timezone ?? "UTC";
}

export async function createFoodEntry(supabase: DB, userId: string, b: z.output<typeof CreateEntry>): Promise<string> {
  if (b.photoPaths.some((p) => !p.startsWith(`${userId}/`))) throw new EntryError("invalid_input", 400);
  const tz = await timezoneOf(supabase, userId);
  const loggedAt = b.loggedAt ? new Date(b.loggedAt) : new Date();
  const day = b.localDate ?? localDate(tz, loggedAt);
  if (day > localDate(tz)) throw new EntryError("invalid_input", 400);

  const { data: entry, error } = await supabase
    .from("food_entries")
    .insert({ user_id: userId, logged_at: loggedAt.toISOString(), local_date: day, meal_type: b.mealType, source: b.source })
    .select("id")
    .single();
  if (error) throw new EntryError("db_error", 500);

  const alcohol = b.estimateId ? await alcoholFromEstimate(supabase, b.estimateId) : new Map<string, number>();
  const { error: itemsErr } = await supabase.from("food_items").insert(
    b.items.map((it) => ({ ...it, alcohol_g: it.alcohol_g ?? alcohol.get(nameKey(it.name)) ?? 0, user_id: userId, food_entry_id: entry.id })),
  );
  if (itemsErr) {
    await supabase.from("food_entries").delete().eq("id", entry.id);
    throw new EntryError("db_error", 500);
  }

  if (b.photoPaths.length) {
    await supabase.from("photos").insert(
      b.photoPaths.map((p) => ({ user_id: userId, bucket: "food" as const, storage_path: p, food_entry_id: entry.id })),
    );
  }
  if (b.estimateId) await supabase.from("ai_estimates").update({ food_entry_id: entry.id }).eq("id", b.estimateId);
  return entry.id;
}

/** Edits keep each item's alcohol (matched by name) unless the edit sends a new value. */
export async function updateFoodEntry(supabase: DB, userId: string, id: string, b: z.output<typeof UpdateEntry>): Promise<void> {
  const { data: entry } = await supabase.from("food_entries").select("id, local_date").eq("id", id).maybeSingle();
  if (!entry) throw new EntryError("not_found", 404);

  const patch: { meal_type?: typeof b.mealType; logged_at?: string } = {};
  if (b.mealType) patch.meal_type = b.mealType;
  if (b.time) patch.logged_at = zonedTime(entry.local_date, b.time, await timezoneOf(supabase, userId)).toISOString();
  if (patch.meal_type || patch.logged_at) {
    const { error } = await supabase.from("food_entries").update(patch).eq("id", id);
    if (error) throw new EntryError("db_error", 500);
  }

  if (b.items) {
    const { data: old } = await supabase.from("food_items").select("name, alcohol_g").eq("food_entry_id", id);
    const alcohol = new Map((old ?? []).map((o) => [nameKey(o.name), Number(o.alcohol_g)]));
    await supabase.from("food_items").delete().eq("food_entry_id", id);
    const { error } = await supabase
      .from("food_items")
      .insert(b.items.map((it) => ({ ...it, alcohol_g: it.alcohol_g ?? alcohol.get(nameKey(it.name)) ?? 0, user_id: userId, food_entry_id: id })));
    if (error) throw new EntryError("db_error", 500);
  }
}
```

- [ ] **Step 4: Tynne ruter**

`apps/web/app/api/food/entries/route.ts` blir:

```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { CreateEntry } from "@/lib/validation/food";
import { createFoodEntry, EntryError } from "@/lib/food/entries";

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = CreateEntry.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  try {
    return NextResponse.json({ id: await createFoodEntry(supabase, user.id, body.data) });
  } catch (e) {
    if (e instanceof EntryError) return NextResponse.json({ error: e.code }, { status: e.status });
    throw e;
  }
}
```

I `[id]/route.ts`, erstatt PATCH-kroppen etter `if (!body.success) …`:

```ts
  try {
    await updateFoodEntry(supabase, user.id, id, body.data);
  } catch (e) {
    if (e instanceof EntryError) return NextResponse.json({ error: e.code }, { status: e.status });
    throw e;
  }
  return NextResponse.json({ ok: true });
```

med import `import { EntryError, updateFoodEntry } from "@/lib/food/entries";`. DELETE er uendret.

- [ ] **Step 5: Integrasjonstest**

`tests/integration/food-entries.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localDate, localHour } from "@loop/core";
import { createFoodEntry, updateFoodEntry } from "@/lib/food/entries";
import { CreateEntry, UpdateEntry } from "@/lib/validation/food";
// @ts-expect-error — plain JS helper shared with the smoke scripts
import { seedUser } from "../smoke/seed.mjs";
import { admin, cleanup, createTestUser, type TestUser } from "./setup";

describe("food entries: alcohol and meal time", () => {
  let u: TestUser;
  let today: string;
  let entryId: string;
  const tz = "Europe/Oslo";

  beforeAll(async () => {
    u = await createTestUser("food");
    ({ today } = await seedUser(admin(), u.id, { days: 2 }));
  });
  afterAll(cleanup);

  it("an AI log keeps the estimate's alcohol per item", async () => {
    const { data: est } = await u.client
      .from("ai_estimates")
      .insert({
        user_id: u.id,
        model: "test",
        prompt_version: 1,
        response: {
          items: [
            { name: "Beer", grams: 500, kcal: 215, protein_g: 2, carbs_g: 18, fat_g: 0, alcohol_g: 20, confidence: "high", assumptions: "" },
            { name: "Pizza", grams: 300, kcal: 800, protein_g: 30, carbs_g: 90, fat_g: 35, alcohol_g: 0, confidence: "medium", assumptions: "" },
          ],
          notes: "",
        },
      })
      .select("id")
      .single();
    entryId = await createFoodEntry(
      u.client,
      u.id,
      CreateEntry.parse({
        source: "ai",
        mealType: "dinner",
        estimateId: est!.id,
        items: [
          { name: "beer ", kcal: 215, protein_g: 2, carbs_g: 18, fat_g: 0 },
          { name: "Pizza", kcal: 800, protein_g: 30, carbs_g: 90, fat_g: 35 },
        ],
      }),
    );
    const { data: items } = await u.client.from("food_items").select("name, alcohol_g").eq("food_entry_id", entryId);
    const alcohol = Object.fromEntries(items!.map((i) => [i.name, Number(i.alcohol_g)]));
    expect(alcohol).toEqual({ beer: 20, Pizza: 0 }); // matched by name, case and spaces ignored
  });

  it("editing items without alcohol keeps it", async () => {
    await updateFoodEntry(u.client, u.id, entryId, UpdateEntry.parse({ items: [{ name: "Beer", kcal: 250, carbs_g: 20 }, { name: "Pizza", kcal: 700 }] }));
    const { data: items } = await u.client.from("food_items").select("name, kcal, alcohol_g").eq("food_entry_id", entryId);
    expect(Number(items!.find((i) => i.name === "Beer")!.alcohol_g)).toBe(20);
    expect(Number(items!.find((i) => i.name === "Beer")!.kcal)).toBe(250);
  });

  it("the meal time can be set on the entry's own date", async () => {
    await updateFoodEntry(u.client, u.id, entryId, UpdateEntry.parse({ time: "21:30" }));
    const { data: e } = await u.client.from("food_entries").select("logged_at, local_date").eq("id", entryId).single();
    const at = new Date(e!.logged_at);
    expect(localDate(tz, at)).toBe(e!.local_date);
    expect(localHour(tz, at)).toBe(21);
    expect(e!.local_date).toBe(today);
  });

  it("rejects a bad time", () => {
    expect(UpdateEntry.safeParse({ time: "25:00" }).success).toBe(false);
  });
});
```

- [ ] **Step 6: Kjør**

Run: `pnpm typecheck && pnpm exec vitest run tests/integration/food-entries.test.ts`
Expected: 4 passed. Kjør også `pnpm exec vitest run tests/integration/flow.test.ts` (uendret oppførsel) → PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/dates.ts apps/web/lib/validation/food.ts apps/web/lib/food/entries.ts apps/web/app/api/food/entries/route.ts "apps/web/app/api/food/entries/[id]/route.ts" tests/integration/food-entries.test.ts
git commit -m "feat(food): store alcohol per item and allow editing the meal time"
```

---

### Task 5: Søvn og HRV i Garmin-synken

**Files:**
- Create: `apps/web/lib/recovery/parse.ts`, `apps/web/lib/recovery/fetch.ts`
- Modify: `apps/web/lib/garmin/sync.ts`
- Test: `tests/integration/recovery-sync.test.ts`

**Interfaces:**
- Consumes: `GarminSource.fetchRecovery`, `GarminNightRaw` (Task 1); tabeller fra Task 3.
- Produces: `toRecoveryRow(userId, night)`, `recoveryDates(today, lastNight, backfilledUntil): { dates: ISODate[]; cursor: ISODate }`, `backfillProgress(today, backfilledUntil): number`, `syncRecovery(userId, tokens, today, source): Promise<{ nights: number; tokens: string | null }>`, `RECOVERY_HISTORY_DAYS = 90`, `BACKFILL_PER_SYNC = 10`. `SyncOutcome` (ok) får `nights: number | null`.

- [ ] **Step 1: `parse.ts`**

```ts
import "server-only";
import type { Json } from "@/lib/db/types";
import type { GarminNightRaw } from "@/lib/garmin/adapter";

interface SleepDto {
  calendarDate?: string | null;
  sleepTimeSeconds?: number | null;
  deepSleepSeconds?: number | null;
  lightSleepSeconds?: number | null;
  remSleepSeconds?: number | null;
  awakeSleepSeconds?: number | null;
  sleepStartTimestampGMT?: number | null;
  sleepEndTimestampGMT?: number | null;
  sleepScores?: { overall?: { value?: number | null } | null } | null;
}
interface SleepRaw {
  dailySleepDTO?: SleepDto | null;
  restingHeartRate?: number | null;
  avgOvernightHrv?: number | null;
  hrvStatus?: string | null;
  bodyBatteryChange?: number | null;
}
interface HrvRaw {
  hrvSummary?: { lastNightAvg?: number | null; status?: string | null; baseline?: { balancedLow?: number | null; balancedUpper?: number | null } | null } | null;
}

const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
const iso = (ms: unknown) => (typeof ms === "number" && ms > 0 ? new Date(ms).toISOString() : null);
/** Top-level fields without the per-minute series (large, unused). */
const slim = (o: unknown) =>
  o && typeof o === "object" ? Object.fromEntries(Object.entries(o).filter(([, v]) => !Array.isArray(v))) : null;

/** One night → a recovery_days row keyed to the morning you wake up; null when the watch recorded no sleep. */
export function toRecoveryRow(userId: string, n: GarminNightRaw) {
  const s = (n.sleep ?? {}) as SleepRaw;
  const dto = s.dailySleepDTO;
  if (!dto?.sleepTimeSeconds) return null;
  const h = ((n.hrv ?? {}) as HrvRaw).hrvSummary ?? null;
  return {
    user_id: userId,
    local_date: dto.calendarDate ?? n.date,
    sleep_s: int(dto.sleepTimeSeconds),
    deep_s: int(dto.deepSleepSeconds),
    light_s: int(dto.lightSleepSeconds),
    rem_s: int(dto.remSleepSeconds),
    awake_s: int(dto.awakeSleepSeconds),
    sleep_score: int(dto.sleepScores?.overall?.value),
    sleep_start: iso(dto.sleepStartTimestampGMT),
    sleep_end: iso(dto.sleepEndTimestampGMT),
    hrv_avg: int(h?.lastNightAvg ?? s.avgOvernightHrv),
    hrv_baseline_low: int(h?.baseline?.balancedLow),
    hrv_baseline_high: int(h?.baseline?.balancedUpper),
    hrv_status: h?.status ?? s.hrvStatus ?? null,
    resting_hr: int(s.restingHeartRate),
    body_battery_charged: int(s.bodyBatteryChange),
    raw: { sleep: slim(n.sleep), hrv: slim(n.hrv) } as unknown as Json,
  };
}
```

- [ ] **Step 2: `fetch.ts`**

```ts
import "server-only";
import { addDays, daysBetween, type ISODate } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { GarminSource } from "@/lib/garmin/adapter";
import { toRecoveryRow } from "./parse";

export const RECOVERY_HISTORY_DAYS = 90;
export const BACKFILL_PER_SYNC = 10;
const RECENT_DAYS = 3;
const MAX_RECENT_DAYS = 10;

/**
 * Mornings to fetch this sync: the recent ones (at least 3, back to the day before the last stored
 * night so a pause leaves no gap, at most 10) plus the next 10 older ones until 90 days are covered.
 * `cursor` = oldest morning fetched so far (stored as recovery_backfilled_until).
 */
export function recoveryDates(today: ISODate, lastNight: ISODate | null, backfilledUntil: ISODate | null): { dates: ISODate[]; cursor: ISODate } {
  const minRecent = addDays(today, -(RECENT_DAYS - 1));
  const maxRecent = addDays(today, -(MAX_RECENT_DAYS - 1));
  const gapFrom = lastNight ? addDays(lastNight, -1) : minRecent;
  const recentFrom = gapFrom < minRecent ? (gapFrom > maxRecent ? gapFrom : maxRecent) : minRecent;
  const recent: ISODate[] = [];
  for (let d = today; d >= recentFrom; d = addDays(d, -1)) recent.push(d);

  const oldest = addDays(today, -(RECOVERY_HISTORY_DAYS - 1));
  let cursor = backfilledUntil && backfilledUntil < recentFrom ? backfilledUntil : recentFrom;
  const batch: ISODate[] = [];
  for (let d = addDays(cursor, -1); d >= oldest && batch.length < BACKFILL_PER_SYNC; d = addDays(d, -1)) batch.push(d);
  if (batch.length) cursor = batch.at(-1)!;
  return { dates: [...recent, ...batch], cursor };
}

/** Days of history covered so far, for "Fetching sleep data: 40 of 90 days". */
export const backfillProgress = (today: ISODate, backfilledUntil: ISODate | null): number =>
  backfilledUntil ? Math.min(RECOVERY_HISTORY_DAYS, daysBetween(backfilledUntil, today) + 1) : 0;

export async function syncRecovery(userId: string, tokens: string, today: ISODate, source: GarminSource): Promise<{ nights: number; tokens: string | null }> {
  const db = createAdminSupabase();
  const [{ data: acct }, { data: last }] = await Promise.all([
    db.from("garmin_accounts").select("recovery_backfilled_until").eq("user_id", userId).single(),
    db.from("recovery_days").select("local_date").eq("user_id", userId).order("local_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const { dates, cursor } = recoveryDates(today, last?.local_date ?? null, acct?.recovery_backfilled_until ?? null);
  const res = await source.fetchRecovery(tokens, dates);
  const rows = res.nights
    .map((n) => toRecoveryRow(userId, n))
    .filter((r): r is NonNullable<typeof r> => !!r && r.local_date <= today);
  const unique = [...new Map(rows.map((r) => [r.local_date, r])).values()];
  if (unique.length) {
    const { error } = await db.from("recovery_days").upsert(unique, { onConflict: "user_id,local_date" });
    if (error) throw error;
  }
  await db.from("garmin_accounts").update({ recovery_backfilled_until: cursor }).eq("user_id", userId);
  return { nights: unique.length, tokens: res.tokens };
}
```

- [ ] **Step 3: Koble inn i `syncGarmin`**

I `apps/web/lib/garmin/sync.ts`:
- import: `import { syncRecovery } from "@/lib/recovery/fetch";`
- `SyncOutcome` ok-varianten: legg til `nights: number | null;`
- `toActivityRow`: legg til
  ```ts
  te_aerobic: a.aerobicTrainingEffect ?? null,
  te_anaerobic: a.anaerobicTrainingEffect ?? null,
  ```
- rett før «Activities deleted in Garmin…»-blokken:
  ```ts
    // Sleep/HRV: a failure here never fails the sync (e.g. an adapter without fetch_recovery); only auth does.
    let nights: number | null = null;
    try {
      const r = await syncRecovery(userId, res.tokens ?? tokens, today, source);
      if (r.tokens) await updateTokens(userId, r.tokens);
      nights = r.nights;
    } catch (e) {
      if (e instanceof GarminError && e.kind === "auth") throw e;
      console.error("garmin recovery fetch failed", userId, e instanceof Error ? e.message : e);
    }
  ```
- return: `return { status: "ok", from, to: today, days: dayRows.length, activities: actRows.length, nights, firstSync };`

- [ ] **Step 4: Integrasjonstest**

`tests/integration/recovery-sync.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays } from "@loop/core";
import { saveTokens } from "@/lib/garmin/accounts";
import { GarminError } from "@/lib/garmin/adapter";
import { syncGarmin } from "@/lib/garmin/sync";
import { backfillProgress, recoveryDates } from "@/lib/recovery/fetch";
// @ts-expect-error — plain JS helper shared with the smoke scripts
import { seedUser } from "../smoke/seed.mjs";
import { admin, cleanup, createTestUser, type TestUser } from "./setup";
import { FakeGarmin, night, run } from "./fake-garmin";

describe("recovery: sleep and HRV from Garmin", () => {
  let u: TestUser;
  let today: string;
  const garmin = new FakeGarmin();
  const unlock = () => admin().from("garmin_accounts").update({ sync_started_at: null }).eq("user_id", u.id);

  beforeAll(async () => {
    u = await createTestUser("recovery-sync");
    ({ today } = await seedUser(admin(), u.id, { days: 2 }));
    for (let i = 0; i < 90; i++) {
      const d = addDays(today, -i);
      if (i !== 5) garmin.nights[d] = night(d, { score: 70 + (i % 10), hrv: 55 + (i % 7), rhr: 48 + (i % 4) });
    }
    garmin.days = [{ calendarDate: today, totalSteps: 4000 }];
    garmin.activities = [{ ...run(addDays(today, -1), 8), aerobicTrainingEffect: 3.8, anaerobicTrainingEffect: 2.4 }];
    await saveTokens(u.id, JSON.stringify({ di_token: "fake" }));
  });
  afterAll(cleanup);

  it("first sync stores the last 3 mornings plus 10 days of history, keyed to the wake-up date", async () => {
    const out = await syncGarmin(u.id, { source: garmin });
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(garmin.recoveryFetches[0]).toHaveLength(13);
    expect(out.nights).toBe(12); // morning today-5 had no sleep: no row, never filled in
    const { data: rows } = await admin().from("recovery_days").select("*").eq("user_id", u.id).order("local_date", { ascending: false });
    expect(rows![0]!.local_date).toBe(today);
    expect(rows!.some((r) => r.local_date === addDays(today, -5))).toBe(false);
    const r0 = rows![0]!;
    expect(r0.sleep_score).toBe(70);
    expect(r0.hrv_avg).toBe(55);
    expect(r0.resting_hr).toBe(48);
    expect(r0.hrv_baseline_low).toBe(52);
    expect(r0.sleep_s).toBe(27000);
    expect(JSON.stringify(r0.raw)).not.toContain("sleepLevels");
    const { data: acct } = await admin().from("garmin_accounts").select("recovery_backfilled_until").eq("user_id", u.id).single();
    expect(acct!.recovery_backfilled_until).toBe(addDays(today, -12));
    expect(backfillProgress(today, acct!.recovery_backfilled_until)).toBe(13);
    const { data: act } = await admin().from("activities").select("te_aerobic, te_anaerobic").eq("user_id", u.id).single();
    expect(Number(act!.te_anaerobic)).toBe(2.4);
  });

  it("each later sync goes 10 days further back until 90 days are covered", async () => {
    for (let i = 0; i < 9; i++) {
      await unlock();
      await syncGarmin(u.id, { source: garmin });
    }
    const { data: acct } = await admin().from("garmin_accounts").select("recovery_backfilled_until").eq("user_id", u.id).single();
    expect(acct!.recovery_backfilled_until).toBe(addDays(today, -89));
    expect(garmin.recoveryFetches.at(-1)).toHaveLength(3); // only recent mornings left
    const { count } = await admin().from("recovery_days").select("id", { count: "exact", head: true }).eq("user_id", u.id);
    expect(count).toBe(89);
  });

  it("a pause in syncing leaves no gap: recent mornings reach back to the last stored night", () => {
    const { dates } = recoveryDates(today, addDays(today, -6), addDays(today, -89));
    expect(dates).toEqual(Array.from({ length: 8 }, (_, i) => addDays(today, -i)));
    expect(recoveryDates(today, addDays(today, -40), null).dates).toHaveLength(20); // 10 recent (cap) + 10 history
  });

  it("an adapter without fetch_recovery does not break the sync", async () => {
    await unlock();
    garmin.recoveryFailWith = new GarminError("bad_request");
    const out = await syncGarmin(u.id, { source: garmin });
    expect(out.status).toBe("ok");
    if (out.status === "ok") expect(out.nights).toBeNull();
    garmin.recoveryFailWith = null;
  });

  it("expired tokens during the sleep fetch ask for a new login", async () => {
    await unlock();
    garmin.recoveryFailWith = new GarminError("auth");
    expect((await syncGarmin(u.id, { source: garmin })).status).toBe("reauth_required");
    garmin.recoveryFailWith = null;
    await saveTokens(u.id, JSON.stringify({ di_token: "fake" }));
  });

  it("the signed-in user reads only their own nights", async () => {
    const { data } = await u.client.from("recovery_days").select("local_date");
    expect(data?.length).toBe(89);
  });
});
```

- [ ] **Step 5: Kjør**

Run: `pnpm typecheck && pnpm exec vitest run tests/integration/recovery-sync.test.ts tests/integration/garmin.test.ts`
Expected: alle PASS (garmin.test.ts uendret oppførsel; FakeGarmin uten `nights` gir `nights: 0`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/recovery/parse.ts apps/web/lib/recovery/fetch.ts apps/web/lib/garmin/sync.ts tests/integration/recovery-sync.test.ts
git commit -m "feat(recovery): fetch sleep and HRV on every Garmin sync with 90-day backfill"
```

---

### Task 6: Motoren (`packages/core/src/recovery/`)

**Files:**
- Create: `packages/core/src/recovery/types.ts`, `stats.ts`, `variables.ts`, `questions.ts`, `analyze.ts`
- Modify: `packages/core/src/index.ts`
- Test: `tests/integration/recovery-engine.test.ts`

**Interfaces:**
- Produces (eksportert fra `@loop/core`): `RecoveryDayInput`, `RecoveryFactor`, `RecoveryOutcome`, `RecoveryRow`, `buildRecoveryRows(days, from, to): RecoveryRow[]`, `RecoveryQuestion`, `RECOVERY_QUESTIONS` (21), `RECOVERY_RULES`, `RecoveryResult`, `analyzeRecovery(rows, questions?, opts?): RecoveryResult[]`, `LATE_MEAL_KCAL`.

- [ ] **Step 1: `types.ts`**

```ts
import type { ISODate } from "../dates";

/**
 * One calendar day. Food and training describe day D; sleepScore/hrv/restingHr describe the
 * morning of D (the night before). Null = no data, never a filled-in average.
 */
export interface RecoveryDayInput {
  date: ISODate;
  sleepScore: number | null;
  hrv: number | null;
  restingHr: number | null;
  /** Null when D is not a logged food day. lateKcal null = meal times unknown (logged afterwards). */
  food: { deficitKcal: number; carbsPerKg: number; proteinPerKg: number; alcoholG: number; lateKcal: number | null } | null;
  hard: boolean;
  long: boolean;
  steps: number | null;
  /** Easy outdoor runs ≥ 20 min: metres per heartbeat (mean of the day's runs). */
  easyMetersPerBeat: number | null;
  /** Quality sessions: actual / planned pace of the hard parts (> 1 = slower). */
  qualityPaceRatio: number | null;
}
```

- [ ] **Step 2: `stats.ts`**

```ts
/** Small seeded PRNG: the same seed gives the same permutations, so results never flicker. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const mean = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

export function sd(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

export function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const k = s.length >> 1;
  return s.length % 2 ? s[k]! : (s[k - 1]! + s[k]!) / 2;
}

/** Labels: 1 = high/yes group, -1 = low/no group, 0 = not compared. */
export function groupMeanDiff(labels: readonly number[], ys: readonly number[]): number {
  let sh = 0;
  let nh = 0;
  let sl = 0;
  let nl = 0;
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === 1) {
      sh += ys[i]!;
      nh++;
    } else if (labels[i] === -1) {
      sl += ys[i]!;
      nl++;
    }
  }
  return nh && nl ? sh / nh - sl / nl : 0;
}

/**
 * Two-sided p-value for the group difference. Labels are shuffled in whole blocks (calendar weeks),
 * not day by day, because neighbouring days depend on each other (HRV runs in streaks, big deficits
 * come in weeks); a day-by-day shuffle would find too many false links.
 */
export function blockPermutationP(
  labels: readonly number[],
  ys: readonly number[],
  blockOf: readonly number[],
  permutations: number,
  rng: () => number,
): number {
  const observed = Math.abs(groupMeanDiff(labels, ys));
  const byBlock = new Map<number, number[]>();
  labels.forEach((l, i) => byBlock.set(blockOf[i]!, [...(byBlock.get(blockOf[i]!) ?? []), l]));
  const blocks = [...byBlock.values()];
  let hits = 0;
  for (let p = 0; p < permutations; p++) {
    for (let i = blocks.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [blocks[i], blocks[j]] = [blocks[j]!, blocks[i]!];
    }
    if (Math.abs(groupMeanDiff(blocks.flat(), ys)) >= observed - 1e-12) hits++;
  }
  return (hits + 1) / (permutations + 1);
}

/** Benjamini–Hochberg adjusted p-values (q), in input order. */
export function benjaminiHochberg(ps: readonly number[]): number[] {
  const m = ps.length;
  const order = ps.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
  const q = new Array<number>(m);
  let min = 1;
  for (let r = m - 1; r >= 0; r--) {
    const [p, i] = order[r]!;
    min = Math.min(min, (p * m) / (r + 1));
    q[i] = min;
  }
  return q;
}
```

- [ ] **Step 3: `variables.ts`**

```ts
import { addDays, type ISODate } from "../dates";
import { mean, median, sd } from "./stats";
import type { RecoveryDayInput } from "./types";

export const RECOVERY_FACTORS = ["deficit", "carbs", "protein", "alcohol", "late", "hard", "long", "steps", "sleepScore", "hrv", "deficit3", "daysSinceHard"] as const;
export type RecoveryFactor = (typeof RECOVERY_FACTORS)[number];
export const RECOVERY_OUTCOMES = ["sleepScore", "hrv", "restingHr", "runForm"] as const;
export type RecoveryOutcome = (typeof RECOVERY_OUTCOMES)[number];

/** Factors of day D (binary as 1/0) and outcomes measured on D, detrended. */
export interface RecoveryRow {
  date: ISODate;
  factors: Record<RecoveryFactor, number | null>;
  outcomes: Record<RecoveryOutcome, number | null>;
}

export const RECOVERY_DETREND = { days: 28, runDays: 30, minValues: 14, minRunValues: 5 } as const;
export const LATE_MEAL_KCAL = 300;
const REST_CAP_DAYS = 14;

/** Value minus the median of the previous `lookback` days; null with too little history. */
function residual(series: Map<ISODate, number>, date: ISODate, lookback: number, min: number): number | null {
  const v = series.get(date);
  if (v == null) return null;
  const prev: number[] = [];
  for (let i = 1; i <= lookback; i++) {
    const p = series.get(addDays(date, -i));
    if (p != null) prev.push(p);
  }
  return prev.length >= min ? v - median(prev) : null;
}

function seriesOf(days: readonly RecoveryDayInput[], pick: (d: RecoveryDayInput) => number | null): Map<ISODate, number> {
  const m = new Map<ISODate, number>();
  for (const d of days) {
    const v = pick(d);
    if (v != null) m.set(d.date, v);
  }
  return m;
}

/** Run form per day: each measure against its own recent median, scaled by its own spread, higher = better; then averaged. */
function runForm(days: readonly RecoveryDayInput[]): Map<ISODate, number> {
  const parts = [
    { s: seriesOf(days, (d) => d.easyMetersPerBeat), sign: 1 },
    { s: seriesOf(days, (d) => d.qualityPaceRatio), sign: -1 },
  ].map(({ s, sign }) => {
    const res = new Map<ISODate, number>();
    for (const date of s.keys()) {
      const r = residual(s, date, RECOVERY_DETREND.runDays, RECOVERY_DETREND.minRunValues);
      if (r != null) res.set(date, r);
    }
    const spread = sd([...res.values()]);
    return new Map([...res].map(([d, r]) => [d, spread > 0 ? (sign * r) / spread : 0] as const));
  });
  const out = new Map<ISODate, number>();
  for (const date of new Set(parts.flatMap((p) => [...p.keys()]))) {
    out.set(date, mean(parts.flatMap((p) => (p.has(date) ? [p.get(date)!] : []))));
  }
  return out;
}

/** Rows for every date in [from, to]; `days` should reach ~30 days further back for the normals. */
export function buildRecoveryRows(days: readonly RecoveryDayInput[], from: ISODate, to: ISODate): RecoveryRow[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const sleep = seriesOf(days, (d) => d.sleepScore);
  const hrv = seriesOf(days, (d) => d.hrv);
  const rhr = seriesOf(days, (d) => d.restingHr);
  const form = runForm(days);
  const D = RECOVERY_DETREND;

  const rows: RecoveryRow[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const d = byDate.get(date);
    const food = d?.food ?? null;
    const last3 = [-2, -1, 0].map((i) => byDate.get(addDays(date, i))?.food?.deficitKcal ?? null);
    let since = REST_CAP_DAYS;
    for (let i = 1; i < REST_CAP_DAYS; i++) {
      if (byDate.get(addDays(date, -i))?.hard) {
        since = i;
        break;
      }
    }
    rows.push({
      date,
      factors: {
        deficit: food?.deficitKcal ?? null,
        carbs: food?.carbsPerKg ?? null,
        protein: food?.proteinPerKg ?? null,
        alcohol: food ? (food.alcoholG > 0 ? 1 : 0) : null,
        late: food && food.lateKcal != null ? (food.lateKcal >= LATE_MEAL_KCAL ? 1 : 0) : null,
        hard: d ? (d.hard ? 1 : 0) : null,
        long: d ? (d.long ? 1 : 0) : null,
        steps: d?.steps ?? null,
        sleepScore: d?.sleepScore ?? null,
        hrv: d?.hrv ?? null,
        deficit3: last3.every((x) => x != null) ? mean(last3 as number[]) : null,
        daysSinceHard: d ? since : null,
      },
      outcomes: {
        sleepScore: residual(sleep, date, D.days, D.minValues),
        hrv: residual(hrv, date, D.days, D.minValues),
        restingHr: residual(rhr, date, D.days, D.minValues),
        runForm: form.get(date) ?? null,
      },
    });
  }
  return rows;
}
```

- [ ] **Step 4: `questions.ts`**

```ts
import type { RecoveryFactor, RecoveryOutcome } from "./variables";

/** Factor on day D compared with the outcome on D + lag (night outcomes: lag 1 = the next morning). */
export interface RecoveryQuestion {
  id: string;
  factor: RecoveryFactor;
  transform: "tertile" | "binary";
  outcome: RecoveryOutcome;
  lag: 0 | 1;
}

const q = (id: string, factor: RecoveryFactor, transform: RecoveryQuestion["transform"], outcome: RecoveryOutcome, lag: 0 | 1): RecoveryQuestion => ({
  id,
  factor,
  transform,
  outcome,
  lag,
});

/** v1 catalog (spec §5.3): 13 factor–outcome groups = 21 tests. deficit3 on D covers D−2..D, so lag 1 = the run after three days. */
export const RECOVERY_QUESTIONS: readonly RecoveryQuestion[] = [
  q("deficit-sleep", "deficit", "tertile", "sleepScore", 1),
  q("deficit-hrv", "deficit", "tertile", "hrv", 1),
  q("deficit-rhr", "deficit", "tertile", "restingHr", 1),
  q("carbs-sleep", "carbs", "tertile", "sleepScore", 1),
  q("carbs-hrv", "carbs", "tertile", "hrv", 1),
  q("protein-sleep", "protein", "tertile", "sleepScore", 1),
  q("protein-hrv", "protein", "tertile", "hrv", 1),
  q("alcohol-sleep", "alcohol", "binary", "sleepScore", 1),
  q("alcohol-hrv", "alcohol", "binary", "hrv", 1),
  q("alcohol-rhr", "alcohol", "binary", "restingHr", 1),
  q("late-sleep", "late", "binary", "sleepScore", 1),
  q("hard-hrv", "hard", "binary", "hrv", 1),
  q("hard-rhr", "hard", "binary", "restingHr", 1),
  q("long-hrv", "long", "binary", "hrv", 1),
  q("long-rhr", "long", "binary", "restingHr", 1),
  q("steps-sleep", "steps", "tertile", "sleepScore", 1),
  q("sleep-run", "sleepScore", "tertile", "runForm", 0),
  q("hrv-run", "hrv", "tertile", "runForm", 0),
  q("carbs-run", "carbs", "tertile", "runForm", 1),
  q("deficit3-run", "deficit3", "tertile", "runForm", 1),
  q("rest-run", "daysSinceHard", "tertile", "runForm", 0),
];

const NIGHT_OUTCOMES = new Set<RecoveryOutcome>(["sleepScore", "hrv", "restingHr"]);
const TRAINING_FACTORS = new Set<RecoveryFactor>(["hard", "long"]);

/** Night outcomes whose factor is not training itself must survive without hard and long days. */
export const needsTrainingControl = (q: RecoveryQuestion): boolean => NIGHT_OUTCOMES.has(q.outcome) && !TRAINING_FACTORS.has(q.factor);
```

- [ ] **Step 5: `analyze.ts`**

```ts
import { addDays, daysBetween } from "../dates";
import { benjaminiHochberg, blockPermutationP, groupMeanDiff, hashString, mean, mulberry32, sd } from "./stats";
import { needsTrainingControl, RECOVERY_QUESTIONS, type RecoveryQuestion } from "./questions";
import { RECOVERY_OUTCOMES, type RecoveryFactor, type RecoveryOutcome, type RecoveryRow } from "./variables";

export const RECOVERY_RULES = {
  minPerGroup: 8,
  minEffectSd: 0.4,
  maxQ: 0.1,
  controlMinPerGroup: 5,
  controlEffectSd: 0.25,
  noEffectMinPerGroup: 20,
  noEffectMaxSd: 0.2,
  permutations: 2000,
  blockDays: 7,
  minDrinkDays: 4,
  seed: 20261004,
} as const;

export interface RecoveryGroup {
  n: number;
  mean: number | null;
  /** Tertiles: the factor's cut (low ≤ bound, high ≥ bound). Binary: null. */
  bound: number | null;
}

export interface RecoveryResult {
  questionId: string;
  factor: RecoveryFactor;
  outcome: RecoveryOutcome;
  lag: number;
  kind: "finding" | "no_effect" | "needs_data";
  reason: "few_days" | "unclear" | "training" | null;
  groups: { high: RecoveryGroup; low: RecoveryGroup; needed: number };
  /** (high − low) / SD of the detrended outcome; signed. */
  effectSd: number | null;
  pValue: number | null;
  qValue: number | null;
  controlOk: boolean | null;
  /** 1 = strongest finding. */
  rank: number | null;
}

interface Split {
  labels: number[];
  low: number | null;
  high: number | null;
}

function split(values: number[], transform: RecoveryQuestion["transform"]): Split | null {
  if (transform === "binary") return { labels: values.map((v) => (v === 1 ? 1 : -1)), low: null, high: null };
  const s = [...values].sort((a, b) => a - b);
  const k = Math.floor(s.length / 3);
  if (k < 1) return null;
  const low = s[k - 1]!;
  const high = s[s.length - k]!;
  if (!(low < high)) return null;
  return { labels: values.map((v) => (v <= low ? -1 : v >= high ? 1 : 0)), low, high };
}

const groupOf = (labels: number[], ys: number[], which: 1 | -1, bound: number | null): RecoveryGroup => {
  const v = ys.filter((_, i) => labels[i] === which);
  return { n: v.length, mean: v.length ? mean(v) : null, bound };
};

/** Runs every question on the rows (spec §5.4–§5.6). Deterministic. */
export function analyzeRecovery(rows: readonly RecoveryRow[], questions: readonly RecoveryQuestion[] = RECOVERY_QUESTIONS, opts: { maxQ?: number } = {}): RecoveryResult[] {
  const R = RECOVERY_RULES;
  const maxQ = opts.maxQ ?? R.maxQ;
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const first = rows[0]?.date;
  const drinkDays = rows.filter((r) => r.factors.alcohol === 1).length;
  const asked = questions.filter((q) => q.factor !== "alcohol" || drinkDays >= R.minDrinkDays);
  const spreadOf = new Map(RECOVERY_OUTCOMES.map((o) => [o, sd(rows.flatMap((r) => (r.outcomes[o] == null ? [] : [r.outcomes[o]!])))]));

  const tested = asked.map((q) => {
    const pairs = rows.flatMap((r) => {
      const x = r.factors[q.factor];
      const y = byDate.get(addDays(r.date, q.lag))?.outcomes[q.outcome];
      return x == null || y == null ? [] : [{ row: r, x, y }];
    });
    const s = split(pairs.map((p) => p.x), q.transform);
    const ys = pairs.map((p) => p.y);
    const high = s ? groupOf(s.labels, ys, 1, s.high) : { n: 0, mean: null, bound: null };
    const low = s ? groupOf(s.labels, ys, -1, s.low) : { n: 0, mean: null, bound: null };
    const spread = spreadOf.get(q.outcome)!;
    const effect = s && high.n && low.n && spread > 0 ? groupMeanDiff(s.labels, ys) / spread : null;
    const enough = !!s && high.n >= R.minPerGroup && low.n >= R.minPerGroup && effect != null;
    const p = enough
      ? blockPermutationP(
          s!.labels,
          ys,
          pairs.map((pp) => Math.floor(daysBetween(first!, pp.row.date) / R.blockDays)),
          R.permutations,
          mulberry32(R.seed ^ hashString(q.id)),
        )
      : null;
    return { q, pairs, s, ys, high, low, spread, effect, enough, p };
  });

  const withP = tested.filter((t) => t.p != null);
  const qs = benjaminiHochberg(withP.map((t) => t.p!));
  const qOf = new Map(withP.map((t, i) => [t.q.id, qs[i]!]));

  const results: RecoveryResult[] = tested.map((t) => {
    const qv = qOf.get(t.q.id) ?? null;
    let kind: RecoveryResult["kind"] = "needs_data";
    let reason: RecoveryResult["reason"] = "unclear";
    let controlOk: boolean | null = null;
    if (!t.enough) {
      reason = "few_days";
    } else if (Math.abs(t.effect!) >= R.minEffectSd && qv! <= maxQ) {
      if (needsTrainingControl(t.q)) {
        const labels = t.s!.labels.map((l, i) => (t.pairs[i]!.row.factors.hard === 1 || t.pairs[i]!.row.factors.long === 1 ? 0 : l));
        const nh = labels.filter((l) => l === 1).length;
        const nl = labels.filter((l) => l === -1).length;
        const ce = nh >= R.controlMinPerGroup && nl >= R.controlMinPerGroup ? groupMeanDiff(labels, t.ys) / t.spread : null;
        controlOk = ce != null && Math.sign(ce) === Math.sign(t.effect!) && Math.abs(ce) >= R.controlEffectSd;
        if (controlOk) [kind, reason] = ["finding", null];
        else reason = ce == null ? "unclear" : "training";
      } else {
        [kind, reason] = ["finding", null];
      }
    } else if (Math.min(t.high.n, t.low.n) >= R.noEffectMinPerGroup && Math.abs(t.effect!) < R.noEffectMaxSd) {
      [kind, reason] = ["no_effect", null];
    }
    return {
      questionId: t.q.id,
      factor: t.q.factor,
      outcome: t.q.outcome,
      lag: t.q.lag,
      kind,
      reason,
      groups: { high: t.high, low: t.low, needed: R.minPerGroup },
      effectSd: t.effect,
      pValue: t.p,
      qValue: qv,
      controlOk,
      rank: null,
    };
  });

  results
    .filter((r) => r.kind === "finding")
    .sort((a, b) => Math.abs(b.effectSd!) - Math.abs(a.effectSd!) || a.qValue! - b.qValue!)
    .forEach((r, i) => (r.rank = i + 1));
  return results;
}
```

- [ ] **Step 6: Eksport**

I `packages/core/src/index.ts`, nederst:

```ts
export * from "./recovery/types";
export * from "./recovery/variables";
export * from "./recovery/questions";
export * from "./recovery/analyze";
```

(`stats.ts` eksporteres ikke; navnene `mean`/`sd` skal ikke lekke inn i `@loop/core`.)

- [ ] **Step 7: Motortest mot konstruerte data**

`tests/integration/recovery-engine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { addDays, analyzeRecovery, buildRecoveryRows, type RecoveryDayInput, type RecoveryResult } from "@loop/core";

const END = "2026-09-30";
const DAYS = 120;
const FROM = addDays(END, -89);

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Synth {
  seed: number;
  rho?: number;
  /** HRV next morning drops with the deficit. */
  plant?: boolean;
  /** Hard days raise the deficit and lower next morning's HRV; the deficit itself does nothing. */
  confound?: boolean;
  /** Share of days with a drink. */
  drinkShare?: number;
  /** Carbs and HRV both drift up over the period, unrelated. */
  trend?: boolean;
}

/** 120 days of fake data: AR(1) noise per series, every day food-logged, runs on ~half the days. */
function synth(o: Synth): RecoveryDayInput[] {
  const r = prng(o.seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const rho = o.rho ?? 0;
  const ar = () => {
    let x = gauss();
    return () => (x = rho * x + Math.sqrt(1 - rho * rho) * gauss());
  };
  const [def, carb, prot, steps, sleepN, hrvN, rhrN, runN] = Array.from({ length: 8 }, ar);
  const days: RecoveryDayInput[] = [];
  let prev: { deficit: number; hard: boolean; carbs: number } | null = null;
  for (let t = 0; t < DAYS; t++) {
    const date = addDays(END, t - (DAYS - 1));
    const hard = r() < 0.25;
    const deficit = 500 + 300 * def!() + (o.confound && hard ? 700 : 0);
    const carbs = 4 + carb!() + (o.trend ? (2 * t) / DAYS : 0);
    let hrv = 60 + 6 * hrvN!() + (o.trend ? (15 * t) / DAYS : 0);
    if (prev && o.plant) hrv -= (4 * (prev.deficit - 500)) / 300;
    if (prev && o.confound && prev.hard) hrv -= 10;
    const runs = r() < 0.5;
    days.push({
      date,
      sleepScore: 78 + 6 * sleepN!(),
      hrv,
      restingHr: 50 + 3 * rhrN!(),
      food: { deficitKcal: deficit, carbsPerKg: carbs, proteinPerKg: 1.8 + 0.3 * prot!(), alcoholG: r() < (o.drinkShare ?? 0) ? 30 : 0, lateKcal: r() < 0.3 ? 500 : 0 },
      hard,
      long: t % 7 === 0,
      steps: 9000 + 3000 * steps!(),
      easyMetersPerBeat: runs && !hard ? 1.5 + 0.08 * runN!() : null,
      qualityPaceRatio: hard ? 1 + 0.03 * runN!() : null,
    });
    prev = { deficit, hard, carbs };
  }
  return days;
}

const run = (o: Synth): RecoveryResult[] => analyzeRecovery(buildRecoveryRows(synth(o), FROM, END));
const byId = (rs: RecoveryResult[], id: string) => rs.find((x) => x.questionId === id);
const seeds = Array.from({ length: 20 }, (_, i) => i + 1);

describe("recovery engine on constructed data", () => {
  it("finds a planted link with the right direction and size", () => {
    const f = byId(run({ seed: 7, plant: true }), "deficit-hrv")!;
    expect(f.kind).toBe("finding");
    expect(f.effectSd!).toBeLessThan(-0.4);
    expect(f.controlOk).toBe(true);
    expect(f.rank).toBeGreaterThanOrEqual(1);
  });

  it("pure noise: at most 4 of 20 datasets show any finding", () => {
    const withFinding = seeds.filter((s) => run({ seed: s }).some((x) => x.kind === "finding"));
    expect(withFinding.length).toBeLessThanOrEqual(4);
  });

  it("noise where neighbouring days depend on each other (AR(1), ρ = 0.6): at most 4 of 20", () => {
    const withFinding = seeds.filter((s) => run({ seed: 100 + s, rho: 0.6 }).some((x) => x.kind === "finding"));
    expect(withFinding.length).toBeLessThanOrEqual(4);
  });

  it("a link that only comes from hard days is stopped by the training control", () => {
    const rs = run({ seed: 11, confound: true });
    expect(byId(rs, "deficit-hrv")!.kind).toBe("needs_data");
    expect(byId(rs, "deficit-hrv")!.reason).toBe("training");
    expect(byId(rs, "hard-hrv")!.kind).toBe("finding");
  });

  it("alcohol questions stay hidden until at least 4 drink days", () => {
    expect(run({ seed: 3 }).some((x) => x.factor === "alcohol")).toBe(false);
    expect(run({ seed: 3, drinkShare: 0.02 }).filter((x) => x.factor === "alcohol").length).toBeLessThanOrEqual(3);
    expect(run({ seed: 3, drinkShare: 0.25 }).filter((x) => x.factor === "alcohol")).toHaveLength(3);
  });

  it("detrending: carbs and HRV drifting up together give no finding", () => {
    expect(byId(run({ seed: 5, trend: true }), "carbs-hrv")!.kind).not.toBe("finding");
  });

  it("too few days → needs data with progress, nothing else", () => {
    const rs = analyzeRecovery(buildRecoveryRows(synth({ seed: 9 }), addDays(END, -9), END));
    expect(rs.every((x) => x.kind === "needs_data" && x.reason === "few_days")).toBe(true);
    expect(rs[0]!.groups.needed).toBe(8);
  });

  it("'no clear link' only with ≥ 20 days per group and a small effect; it does occur", () => {
    const all = seeds.slice(0, 5).flatMap((s) => run({ seed: s }));
    const none = all.filter((x) => x.kind === "no_effect");
    expect(none.length).toBeGreaterThan(0);
    for (const x of none) {
      expect(Math.min(x.groups.high.n, x.groups.low.n)).toBeGreaterThanOrEqual(20);
      expect(Math.abs(x.effectSd!)).toBeLessThan(0.2);
    }
  });

  it("same input → same answer; 21 questions with alcohol", () => {
    const a = run({ seed: 4, drinkShare: 0.25 });
    expect(a).toEqual(run({ seed: 4, drinkShare: 0.25 }));
    expect(a).toHaveLength(21);
  });
});
```

(Testen for `drinkShare: 0.02` sjekker bare at det aldri blir flere enn 3 alkoholspørsmål; med ~2 drikkedager på 90 skal det være 0. Hvis frøet gir ≥ 4 drikkedager, bytt frø og før en `Ruling:`.)

- [ ] **Step 8: Kjør**

Run: `pnpm typecheck && pnpm exec vitest run tests/integration/recovery-engine.test.ts`
Expected: 9 passed, under ~30 s.
Feiler støytestene: **ikke** løs grensen. Feilsøk (systematic-debugging): sjekk at `blockOf` er kalenderuker, at BH bare går over tester med `p`, at effekten deles på SD av hele utfallet. Feiler bare AR(1)-testen, er blokkpermutasjonen svak; før en `Ruling:` og spør brukeren før du endrer metoden.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/recovery packages/core/src/index.ts tests/integration/recovery-engine.test.ts
git commit -m "feat(core): recovery engine with block permutation, BH and training control"
```

---

### Task 7: Last data, beregn etter synk, lagre funn

**Files:**
- Create: `apps/web/lib/training/quality.ts`, `apps/web/lib/recovery/load.ts`, `apps/web/lib/recovery/compute.ts`
- Modify: `apps/web/lib/training/service.ts` (fjern `qualityResults`-kroppen, bruk `quality.ts`; `afterGarminSync`)
- Test: `tests/integration/recovery-compute.test.ts`

**Interfaces:**
- Consumes: `analyzeRecovery`, `buildRecoveryRows`, `RecoveryDayInput` (Task 6); `localHour` (Task 4); tabeller (Task 3); `syncGarmin` (Task 5).
- Produces: `qualityResultsBetween(userId, from, to, planId?): Promise<QualityResultRow[]>` (`QualityResultRow = QualityResult & { activityId: string }`); `loadRecoveryDays(userId, today): Promise<RecoveryDayInput[]>`; `computeRecovery(userId, today, opts?: { force?: boolean }): Promise<"computed" | "fresh" | "not_connected">`; `RECOVERY_WINDOW_DAYS = 90`, `RECOMPUTE_AFTER_MS`.

- [ ] **Step 1: `lib/training/quality.ts` (flyttet logikk)**

```ts
import "server-only";
import { pacesFor, type Block, type ISODate, type QualityResult } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";

export type QualityResultRow = QualityResult & { activityId: string };

/**
 * How the hard parts of completed quality sessions in [from, to] went: planned pace of the non-easy
 * run steps vs. the pace of laps clearly faster than easy (the reps), weighted by distance. Needs Garmin laps.
 */
export async function qualityResultsBetween(userId: string, from: ISODate, to: ISODate, planId?: string): Promise<QualityResultRow[]> {
  const db = createAdminSupabase();
  let query = db
    .from("planned_workouts")
    .select("date, blocks, activity_id, plan_id, plan:training_plans!inner(vdot)")
    .eq("user_id", userId)
    .eq("status", "done")
    .in("type", ["intervals", "threshold", "tempo"])
    .gte("date", from)
    .lte("date", to)
    .not("activity_id", "is", null);
  if (planId) query = query.eq("plan_id", planId);
  const { data: done } = await query;
  if (!done?.length) return [];
  const { data: acts } = await db.from("activities").select("id, splits").in("id", done.map((w) => w.activity_id!));
  const lapsOf = new Map(
    (acts ?? []).map((a) => [a.id, (a.splits as { lapDTOs?: { distance?: number | null; duration?: number | null }[] } | null)?.lapDTOs ?? []]),
  );

  const out: QualityResultRow[] = [];
  for (const w of done) {
    const easyFastest = pacesFor(Number((w.plan as { vdot: number | string }).vdot)).easy.min;
    const steps = (w.blocks as unknown as Block[]).flatMap((b) => (b.kind === "repeat" ? b.steps : [b]));
    const hard = steps.filter((s) => s.kind === "run" && s.target.kind === "pace" && s.target.zone !== "easy");
    if (!hard.length || hard[0]!.target.kind !== "pace") continue;
    const zone = hard[0]!.target.zone as QualityResult["zone"];
    if (zone !== "interval" && zone !== "threshold" && zone !== "marathon") continue;
    const planned = hard.reduce((s, x) => s + (x.target.kind === "pace" ? (x.target.minSecPerKm + x.target.maxSecPerKm) / 2 : 0), 0) / hard.length;
    const work = (lapsOf.get(w.activity_id!) ?? [])
      .map((l) => ({ m: Number(l.distance ?? 0), s: Number(l.duration ?? 0) }))
      .filter((l) => l.m >= 200 && l.s >= 45 && l.s / (l.m / 1000) < easyFastest);
    const m = work.reduce((a, l) => a + l.m, 0);
    if (m < 1000) continue;
    out.push({
      date: w.date,
      zone,
      plannedSecPerKm: planned,
      actualSecPerKm: work.reduce((a, l) => a + l.s, 0) / (m / 1000),
      activityId: w.activity_id!,
    });
  }
  return out;
}
```

I `service.ts`: slett hele `qualityResults`-funksjonen (med doc-kommentar) og bytt kallet i `refreshProposals` til
`slowerPacesProposal(Number(plan.vdot), await qualityResultsBetween(userId, addDays(today, -21), today, plan.id), today)`
med import `import { qualityResultsBetween } from "./quality";`. Fjern importer som da blir ubrukt (`pacesFor`, `Block`, `QualityResult` hvis ikke brukt andre steder — `pnpm typecheck`/eslint viser dem).

- [ ] **Step 2: `lib/recovery/load.ts`**

```ts
import "server-only";
import { activityKcal, addDays, dailyTarget, isRun, localDate, localHour, trendAt, trendSeries, type ActivityLike, type ISODate, type RecoveryDayInput } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { toEnergyPlan } from "@/lib/db/current";
import { qualityResultsBetween } from "@/lib/training/quality";

/** 90-day window + 30 days so every day in it has a normal to compare with. */
export const RECOVERY_LOAD_DAYS = 120;
const FALLBACK_DAYS = 14;
export const MIN_MEALS = 2;
export const MIN_SHARE_OF_TARGET = 0.5;
const QUALITY_TYPES = new Set(["intervals", "threshold", "tempo", "race"]);
export const HARD_TE = { aerobic: 3.5, anaerobic: 2.0 } as const;
const LONG_RUN_S = 90 * 60;
const EASY_MIN_S = 20 * 60;
const INDOOR = /treadmill|indoor|virtual/;

const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const num = (v: unknown) => Number(v ?? 0);

/** Latest versioned row on or before `date`, else the earliest (same rule as rowForDate). */
function versionAt<T extends { valid_from: string }>(rows: readonly T[], date: ISODate): T | undefined {
  let pick: T | undefined;
  for (const r of rows) if (r.valid_from <= date) pick = r;
  return pick ?? rows[0];
}

function must<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data as T;
}

/** Everything the engine needs per day, from what the app already stores (spec §4.4–§4.5). */
export async function loadRecoveryDays(userId: string, today: ISODate): Promise<RecoveryDayInput[]> {
  const db = createAdminSupabase();
  const from = addDays(today, -(RECOVERY_LOAD_DAYS - 1));
  const early = addDays(from, -FALLBACK_DAYS);
  const [profile, nights, entries, weights, plans, goals, gdays, acts, planned, quality] = await Promise.all([
    db.from("profiles").select("sex, timezone").eq("user_id", userId).single().then(must),
    db.from("recovery_days").select("local_date, sleep_score, hrv_avg, resting_hr").eq("user_id", userId).gte("local_date", from).then(must),
    db
      .from("food_entries")
      .select("local_date, logged_at, items:food_items(kcal, protein_g, carbs_g, alcohol_g)")
      .eq("user_id", userId)
      .gte("local_date", from)
      .lt("local_date", today)
      .then(must),
    db.from("weight_entries").select("local_date, measured_at, weight_kg").eq("user_id", userId).order("local_date").then(must),
    db.from("energy_plans").select("*").eq("user_id", userId).order("valid_from").order("created_at").then(must),
    db.from("goals").select("*").eq("user_id", userId).order("valid_from").order("created_at").then(must),
    db.from("garmin_days").select("local_date, steps").eq("user_id", userId).gte("local_date", early).then(must),
    db
      .from("activities")
      .select("id, local_date, type_key, distance_m, duration_s, moving_s, avg_hr, steps, te_aerobic, te_anaerobic")
      .eq("user_id", userId)
      .gte("local_date", early)
      .then(must),
    db.from("planned_workouts").select("date, type, activity_id").eq("user_id", userId).eq("status", "done").gte("date", from).then(must),
    qualityResultsBetween(userId, from, today),
  ]);

  const tz = profile.timezone;
  const trend = trendSeries(weights.map((w) => ({ localDate: w.local_date, measuredAt: w.measured_at, weightKg: Number(w.weight_kg) })));
  const nightBy = new Map(nights.map((n) => [n.local_date, n]));

  const dayData = new Map<ISODate, { steps: number | null; activities: ActivityLike[] }>();
  for (const g of gdays) dayData.set(g.local_date, { steps: g.steps, activities: [] });
  const actsBy = new Map<ISODate, typeof acts>();
  for (const a of acts) {
    const d = dayData.get(a.local_date) ?? { steps: null, activities: [] };
    d.activities.push({ typeKey: a.type_key, distanceM: a.distance_m == null ? null : Number(a.distance_m), durationS: a.duration_s == null ? null : Number(a.duration_s), steps: a.steps });
    dayData.set(a.local_date, d);
    actsBy.set(a.local_date, [...(actsBy.get(a.local_date) ?? []), a]);
  }
  const hasData = (d: { steps: number | null; activities: ActivityLike[] } | undefined) => !!d && ((d.steps ?? 0) > 0 || d.activities.length > 0);
  /** Same activity energy as the daily target, incl. the 14-day average for days without watch data. */
  const activityOn = (date: ISODate, kg: number): number => {
    const d = dayData.get(date);
    if (hasData(d)) return activityKcal(d!, kg).total;
    const prev: number[] = [];
    for (let i = 1; i <= FALLBACK_DAYS; i++) {
      const p = dayData.get(addDays(date, -i));
      if (hasData(p)) prev.push(activityKcal(p!, kg).total);
    }
    return prev.length ? avg(prev) : 0;
  };

  const foodBy = new Map<ISODate, typeof entries>();
  for (const e of entries) foodBy.set(e.local_date, [...(foodBy.get(e.local_date) ?? []), e]);
  const plannedBy = new Map<ISODate, string[]>();
  for (const p of planned) plannedBy.set(p.date, [...(plannedBy.get(p.date) ?? []), p.type]);
  const qualityIds = new Set(planned.filter((p) => QUALITY_TYPES.has(p.type) && p.activity_id).map((p) => p.activity_id!));
  const qualityBy = new Map<ISODate, number[]>();
  for (const q of quality) qualityBy.set(q.date, [...(qualityBy.get(q.date) ?? []), q.actualSecPerKm / q.plannedSecPerKm]);

  const foodOn = (date: ISODate): RecoveryDayInput["food"] => {
    const es = foodBy.get(date) ?? [];
    if (es.length < MIN_MEALS) return null;
    const kg = trendAt(trend, date) ?? trend[0]?.trendKg ?? null;
    const plan = versionAt(plans, date);
    const goal = versionAt(goals, date);
    if (kg == null || !plan || !goal) return null;
    const items = es.flatMap((e) => e.items);
    const kcal = items.reduce((s, i) => s + num(i.kcal), 0);
    const activity = activityOn(date, kg);
    const target = dailyTarget({ plan: toEnergyPlan(plan), trainingKcal: activity, rateKgPerWeek: Number(goal.rate_kg_per_week), sex: profile.sex }).kcal;
    if (kcal < MIN_SHARE_OF_TARGET * target) return null; // half-logged day
    const timeKnown = es.every((e) => localDate(tz, new Date(e.logged_at)) === date);
    return {
      deficitKcal: Number(plan.base_expenditure_kcal) + activity - kcal,
      carbsPerKg: items.reduce((s, i) => s + num(i.carbs_g), 0) / kg,
      proteinPerKg: items.reduce((s, i) => s + num(i.protein_g), 0) / kg,
      alcoholG: items.reduce((s, i) => s + num(i.alcohol_g), 0),
      lateKcal: timeKnown
        ? es.filter((e) => localHour(tz, new Date(e.logged_at)) >= 20).reduce((s, e) => s + e.items.reduce((t, i) => t + num(i.kcal), 0), 0)
        : null,
    };
  };

  const out: RecoveryDayInput[] = [];
  for (let date = from; date <= today; date = addDays(date, 1)) {
    const n = nightBy.get(date);
    const dayActs = actsBy.get(date) ?? [];
    const types = plannedBy.get(date) ?? [];
    const easy = dayActs
      .filter(
        (a) =>
          isRun(a.type_key) &&
          !INDOOR.test(a.type_key) &&
          num(a.duration_s) >= EASY_MIN_S &&
          num(a.avg_hr) > 0 &&
          num(a.distance_m) > 0 &&
          !qualityIds.has(a.id) &&
          num(a.te_anaerobic) < HARD_TE.anaerobic,
      )
      .map((a) => num(a.distance_m) / (num(a.moving_s ?? a.duration_s) / 60) / num(a.avg_hr));
    const ratios = qualityBy.get(date) ?? [];
    out.push({
      date,
      sleepScore: n?.sleep_score ?? null,
      hrv: n?.hrv_avg ?? null,
      restingHr: n?.resting_hr ?? null,
      food: date < today ? foodOn(date) : null,
      hard: types.some((t) => QUALITY_TYPES.has(t)) || dayActs.some((a) => num(a.te_aerobic) >= HARD_TE.aerobic || num(a.te_anaerobic) >= HARD_TE.anaerobic),
      long: types.includes("long") || dayActs.some((a) => isRun(a.type_key) && num(a.duration_s) >= LONG_RUN_S),
      steps: dayData.get(date)?.steps ?? null,
      easyMetersPerBeat: easy.length ? avg(easy) : null,
      qualityPaceRatio: ratios.length ? avg(ratios) : null,
    });
  }
  return out;
}
```

(Hvis `.then(must)` gir typeproblemer med supabase-js' builder, bruk `const r = await …; if (r.error) throw r.error;` per spørring — samme oppførsel; ingen ruling trengs.)

- [ ] **Step 3: `lib/recovery/compute.ts`**

```ts
import "server-only";
import { addDays, analyzeRecovery, buildRecoveryRows, type ISODate } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Json } from "@/lib/db/types";
import { loadRecoveryDays } from "./load";

export const RECOVERY_WINDOW_DAYS = 90;
export const RECOMPUTE_AFTER_MS = 6 * 3600_000;

/** New nights or new activities since the last run, or the last run is over 6 h old (catches edited food). */
async function isStale(userId: string, computedAt: string | null): Promise<boolean> {
  if (!computedAt) return true;
  if (Date.now() - Date.parse(computedAt) > RECOMPUTE_AFTER_MS) return true;
  const db = createAdminSupabase();
  const [n, a] = await Promise.all([
    db.from("recovery_days").select("id", { count: "exact", head: true }).eq("user_id", userId).gt("created_at", computedAt),
    db.from("activities").select("id", { count: "exact", head: true }).eq("user_id", userId).gt("created_at", computedAt),
  ]);
  return (n.count ?? 0) > 0 || (a.count ?? 0) > 0;
}

/** Runs the engine for one user and replaces their stored results (spec §5.7). */
export async function computeRecovery(userId: string, today: ISODate, opts: { force?: boolean } = {}): Promise<"computed" | "fresh" | "not_connected"> {
  const db = createAdminSupabase();
  const { data: acct } = await db.from("garmin_accounts").select("recovery_computed_at").eq("user_id", userId).maybeSingle();
  if (!acct) return "not_connected";
  if (!opts.force && !(await isStale(userId, acct.recovery_computed_at))) return "fresh";

  const days = await loadRecoveryDays(userId, today);
  const results = analyzeRecovery(buildRecoveryRows(days, addDays(today, -(RECOVERY_WINDOW_DAYS - 1)), today));
  const computedAt = new Date().toISOString();

  const { error: delErr } = await db.from("recovery_findings").delete().eq("user_id", userId);
  if (delErr) throw delErr;
  if (results.length) {
    const { error } = await db.from("recovery_findings").insert(
      results.map((r) => ({
        user_id: userId,
        computed_at: computedAt,
        question_id: r.questionId,
        factor: r.factor,
        outcome: r.outcome,
        lag: r.lag,
        kind: r.kind,
        reason: r.reason,
        groups: r.groups as unknown as Json,
        effect_sd: r.effectSd,
        p_value: r.pValue,
        q_value: r.qValue,
        control_ok: r.controlOk,
        rank: r.rank,
      })),
    );
    if (error) throw error;
  }
  await db.from("garmin_accounts").update({ recovery_computed_at: computedAt }).eq("user_id", userId);
  return "computed";
}
```

- [ ] **Step 4: Kall etter synk**

I `service.ts`, `afterGarminSync` blir:

```ts
export async function afterGarminSync(userId: string, today: ISODate, source?: GarminSource): Promise<void> {
  await reconcilePlan(userId, today);
  await refreshProposals(userId, today);
  await pushToGarmin(userId, today, source);
  // Recovery never blocks training upkeep.
  try {
    await computeRecovery(userId, today);
  } catch (e) {
    console.error("recovery compute failed", userId, e instanceof Error ? e.message : e);
  }
}
```

med import `import { computeRecovery } from "@/lib/recovery/compute";` (ingen sirkel: compute → load → training/quality, ikke service).

- [ ] **Step 5: Integrasjonstest**

`tests/integration/recovery-compute.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, zonedTime } from "@loop/core";
import { saveTokens } from "@/lib/garmin/accounts";
import { syncGarmin } from "@/lib/garmin/sync";
import { computeRecovery } from "@/lib/recovery/compute";
import { loadRecoveryDays } from "@/lib/recovery/load";
import { afterGarminSync } from "@/lib/training/service";
// @ts-expect-error — plain JS helper shared with the smoke scripts
import { seedUser } from "../smoke/seed.mjs";
import { admin, cleanup, createTestUser, type TestUser } from "./setup";
import { FakeGarmin, run } from "./fake-garmin";

const TZ = "Europe/Oslo";
const KCAL = [1500, 2100, 2700];

describe("recovery: load days, compute after sync, store results", () => {
  let u: TestUser;
  let today: string;
  const garmin = new FakeGarmin();

  beforeAll(async () => {
    u = await createTestUser("recovery-compute");
    ({ today } = await seedUser(admin(), u.id, { days: 2 })); // food on today-2 and today-1 only (1 entry each)
    const a = admin();
    // 100 days: two meals a day; HRV next morning falls with the deficit (expenditure − intake).
    const entries: { user_id: string; logged_at: string; local_date: string; meal_type: "lunch" | "dinner"; source: "quick" }[] = [];
    const kcalOf = new Map<string, number>();
    for (let i = 3; i <= 102; i++) {
      const d = addDays(today, -i);
      const kcal = KCAL[(i * 7) % 3]!;
      kcalOf.set(d, kcal);
      entries.push({ user_id: u.id, logged_at: zonedTime(d, "12:00", TZ).toISOString(), local_date: d, meal_type: "lunch", source: "quick" });
      entries.push({ user_id: u.id, logged_at: zonedTime(d, i % 4 === 0 ? "21:00" : "18:00", TZ).toISOString(), local_date: d, meal_type: "dinner", source: "quick" });
    }
    const { data: saved } = await a.from("food_entries").insert(entries).select("id, local_date, meal_type");
    await a.from("food_items").insert(
      saved!.map((e) => ({ user_id: u.id, food_entry_id: e.id, name: "Meal", kcal: kcalOf.get(e.local_date)! / 2, protein_g: 70, carbs_g: 150, fat_g: 30 })),
    );
    const nights = [];
    for (let i = 0; i <= 102; i++) {
      const d = addDays(today, -i);
      const prevKcal = kcalOf.get(addDays(d, -1)) ?? 2100;
      nights.push({ user_id: u.id, local_date: d, sleep_s: 27000, sleep_score: 75 + (i % 5), hrv_avg: Math.round(60 + (prevKcal - 2100) / 100 + (i % 3)), resting_hr: 50 });
    }
    await a.from("recovery_days").insert(nights);
    await saveTokens(u.id, JSON.stringify({ di_token: "fake" }));
  });
  afterAll(cleanup);

  it("builds day inputs: logged days, half-logged days, late meals, logged-afterwards times", async () => {
    const a = admin();
    const half = addDays(today, -110); // two meals, 600 kcal → under half the target
    const { data: es } = await a
      .from("food_entries")
      .insert([
        { user_id: u.id, logged_at: zonedTime(half, "08:00", TZ).toISOString(), local_date: half, meal_type: "breakfast", source: "quick" },
        { user_id: u.id, logged_at: zonedTime(half, "12:00", TZ).toISOString(), local_date: half, meal_type: "lunch", source: "quick" },
      ])
      .select("id");
    await a.from("food_items").insert(es!.map((e) => ({ user_id: u.id, food_entry_id: e.id, name: "Snack", kcal: 300 })));
    const after = addDays(today, -104); // dinner logged the next morning
    const { data: e2 } = await a
      .from("food_entries")
      .insert([
        { user_id: u.id, logged_at: zonedTime(after, "12:00", TZ).toISOString(), local_date: after, meal_type: "lunch", source: "quick" },
        { user_id: u.id, logged_at: zonedTime(addDays(after, 1), "08:00", TZ).toISOString(), local_date: after, meal_type: "dinner", source: "quick" },
      ])
      .select("id");
    await a.from("food_items").insert(e2!.map((e) => ({ user_id: u.id, food_entry_id: e.id, name: "Meal", kcal: 1100, alcohol_g: 15 })));

    const days = await loadRecoveryDays(u.id, today);
    const at = (d: string) => days.find((x) => x.date === d)!;
    expect(days).toHaveLength(120);
    expect(at(half).food).toBeNull();
    expect(at(after).food!.lateKcal).toBeNull();
    expect(at(after).food!.alcoholG).toBe(30);
    expect(at(addDays(today, -4)).food!.lateKcal).toBeGreaterThanOrEqual(300); // i = 4: dinner at 21:00
    expect(at(addDays(today, -5)).food!.lateKcal).toBe(0);
    expect(at(addDays(today, -1)).food).toBeNull(); // seeded day: one entry only
    expect(at(today).food).toBeNull();
    expect(at(today).hrv).not.toBeNull();
  });

  it("hard, long and easy runs come from Garmin activities", async () => {
    const d = addDays(today, -1);
    garmin.activities = [
      { ...run(addDays(today, -3), 8), anaerobicTrainingEffect: 2.5, aerobicTrainingEffect: 3.0 },
      run(addDays(today, -2), 18, { minutes: 100 }),
      run(d, 6, { minutes: 35 }),
    ];
    await syncGarmin(u.id, { source: garmin });
    const days = await loadRecoveryDays(u.id, today);
    const at = (x: string) => days.find((y) => y.date === x)!;
    expect(at(addDays(today, -3)).hard).toBe(true);
    expect(at(addDays(today, -3)).easyMetersPerBeat).toBeNull();
    expect(at(addDays(today, -2)).long).toBe(true);
    expect(at(d).easyMetersPerBeat).toBeCloseTo(6000 / 35 / 150, 3);
    expect(at(d).hard).toBe(false);
  });

  it("computes and stores results: the deficit→HRV link is found, alcohol stays hidden", async () => {
    expect(await computeRecovery(u.id, today, { force: true })).toBe("computed");
    const { data: rows } = await admin().from("recovery_findings").select("*").eq("user_id", u.id);
    expect(rows!.some((r) => r.factor === "alcohol")).toBe(false); // only 1 drink day
    expect(rows).toHaveLength(18);
    const f = rows!.find((r) => r.question_id === "deficit-hrv")!;
    expect(f.kind).toBe("finding");
    expect(Number(f.effect_sd)).toBeLessThan(-0.4);
    expect(f.rank).not.toBeNull();
    const { data: own } = await u.client.from("recovery_findings").select("question_id");
    expect(own).toHaveLength(18);
  });

  it("recomputes only when there is something new (or it is over 6 h old)", async () => {
    expect(await computeRecovery(u.id, today)).toBe("fresh");
    await admin().from("recovery_days").insert({ user_id: u.id, local_date: addDays(today, -103), sleep_s: 27000, sleep_score: 70, hrv_avg: 60, resting_hr: 50 });
    expect(await computeRecovery(u.id, today)).toBe("computed");
    await admin().from("garmin_accounts").update({ recovery_computed_at: new Date(Date.now() - 7 * 3600_000).toISOString() }).eq("user_id", u.id);
    expect(await computeRecovery(u.id, today)).toBe("computed");
  });

  it("a Garmin sync runs it through afterGarminSync", async () => {
    await admin().from("garmin_accounts").update({ recovery_computed_at: null, sync_started_at: null }).eq("user_id", u.id);
    await syncGarmin(u.id, { source: garmin, afterSync: (id, t) => afterGarminSync(id, t, garmin) });
    const { data: acct } = await admin().from("garmin_accounts").select("recovery_computed_at").eq("user_id", u.id).single();
    expect(acct!.recovery_computed_at).not.toBeNull();
  });
});
```

Merk: `run()` i fake-garmin har `averageHR: 150`. Den falske Garmin har ingen `nights`, så synken legger ikke til netter. Feiler `deficit-hrv` som funn på grunn av konstruksjonen (ikke motoren), juster bare testdataene (sterkere sammenheng) og før en `Ruling:`.

- [ ] **Step 6: Kjør**

Run: `pnpm typecheck && pnpm exec vitest run tests/integration/recovery-compute.test.ts tests/integration/training.test.ts`
Expected: alle PASS (training.test.ts dekker tempo-ned-forslaget som nå bruker `qualityResultsBetween`).

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/training/quality.ts apps/web/lib/training/service.ts apps/web/lib/recovery/load.ts apps/web/lib/recovery/compute.ts tests/integration/recovery-compute.test.ts
git commit -m "feat(recovery): load daily data, run the engine after each sync, store results"
```

---

### Task 8: Hele suiten og docs

**Files:**
- Modify: `CLAUDE.md` (Les først: restitusjon-spec + plan; kjøre-seksjonen: spike-kommandoen)
- Modify: `docs/02-decisions.md` (rader for rulings fra ledgeren, hvis noen endrer oppførsel)

- [ ] **Step 1: Full verifisering**

Run: `pnpm typecheck && pnpm test:int && pnpm build`
Expected: typecheck rent; alle integrasjonstester PASS (25 gamle + nye); build OK.

- [ ] **Step 2: Docs**

I `CLAUDE.md` under «Les først», øverst:
`- [docs/specs/2026-10-04-restitusjon.md](docs/specs/2026-10-04-restitusjon.md) — **restitusjon** (søvn/HRV, sammenhenger); del 1-plan: docs/plans/2026-10-04-restitusjon-del1-plan.md`
I «Kjøre og teste», etter Garmin-adapter-linja:
`- Restitusjon-spike mot ekte konto: start adapteret lokalt, så SPIKE_EMAIL=<e-post> pnpm exec vitest run tests/integration/recovery-spike.test.ts (hoppes over ellers)`

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/02-decisions.md
git commit -m "docs: recovery part 1 in CLAUDE.md"
```

- [ ] **Step 4: Overlevering**

Ikke push/merge. Rapporter: commits, testresultat, rulings, og at prod-synken logger `recovery fetch failed` (bad_request) til koden er deployet — ufarlig.
