import { GarminError, type FetchResult, type GarminActivityRaw, type GarminSource } from "@/lib/garmin/adapter";

/** In-memory Garmin for integration tests: set days/activities, record pushes and deletes. */
export class FakeGarmin implements GarminSource {
  days: FetchResult["days"] = [];
  activities: GarminActivityRaw[] = [];
  failWith: GarminError | null = null;
  pushed: { workout: unknown; date: string; workoutId: number }[] = [];
  deleted: number[] = [];
  fetches: { from: string; to: string; knownIds: number[] }[] = [];
  nights: Record<string, { sleep: unknown; hrv: unknown }> = {};
  recoveryFetches: string[][] = [];
  recoveryFailWith: GarminError | null = null;
  private nextId = 1000;

  async login(): Promise<{ ok: true; tokens: string }> {
    return { ok: true, tokens: JSON.stringify({ di_token: "fake" }) };
  }
  async loginMfa(): Promise<{ ok: true; tokens: string }> {
    return this.login();
  }
  async fetch(_tokens: string, from: string, to: string, knownIds: number[]): Promise<FetchResult> {
    if (this.failWith) throw this.failWith;
    this.fetches.push({ from, to, knownIds });
    return {
      days: this.days.filter((d) => d.calendarDate >= from && d.calendarDate <= to),
      activities: this.activities.filter((a) => a.startTimeLocal.slice(0, 10) >= from && a.startTimeLocal.slice(0, 10) <= to),
      details: Object.fromEntries(
        this.activities
          .filter((a) => a.activityType?.typeKey?.includes("run") && !knownIds.includes(a.activityId))
          .map((a) => [String(a.activityId), { splits: { lapDTOs: [{ distance: 1000, duration: 300, averageSpeed: 3.33, averageHR: 150 }] }, hrZones: [] }]),
      ),
      tokens: null,
    };
  }
  async fetchRecovery(_tokens: string, dates: string[]) {
    if (this.failWith) throw this.failWith;
    if (this.recoveryFailWith) throw this.recoveryFailWith;
    this.recoveryFetches.push(dates);
    return {
      nights: dates.map((date) => ({ date, sleep: this.nights[date]?.sleep ?? null, hrv: this.nights[date]?.hrv ?? null })),
      tokens: null,
    };
  }
  async pushWorkout(_tokens: string, workout: unknown, date: string) {
    if (this.failWith) throw this.failWith;
    const workoutId = this.nextId++;
    this.pushed.push({ workout, date, workoutId });
    return { workoutId, scheduleId: workoutId + 50_000, tokens: null };
  }
  async deleteWorkout(_tokens: string, workoutId: number) {
    this.deleted.push(workoutId);
    return { tokens: null };
  }
}

let seq = 1;
export function run(date: string, km: number, opts: { steps?: number | null; minutes?: number; type?: string } = {}): GarminActivityRaw {
  const id = 7_000_000 + seq++;
  return {
    activityId: id,
    activityName: "Run",
    startTimeLocal: `${date} 07:00:00`,
    startTimeGMT: `${date} 05:00:00`,
    activityType: { typeKey: opts.type ?? "running" },
    distance: km * 1000,
    duration: (opts.minutes ?? km * 5.5) * 60,
    movingDuration: (opts.minutes ?? km * 5.5) * 60,
    averageHR: 150,
    maxHR: 175,
    steps: opts.steps === undefined ? Math.round(km * 850) : opts.steps,
    elevationGain: 20,
    calories: Math.round(km * 70),
  };
}

export const authError = () => new GarminError("auth");

/** Garmin-shaped sleep + HRV payloads for the morning `date` (field names verified in the recovery spike). */
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
    hrv: {
      hrvSummary: { calendarDate: date, lastNightAvg: o.hrv ?? 60, status: "BALANCED", baseline: { balancedLow: 52, balancedUpper: 68 } },
      hrvReadings: [{ hrvValue: 60 }],
    },
  };
}
