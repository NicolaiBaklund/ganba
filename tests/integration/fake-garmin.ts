import { GarminError, type FetchResult, type GarminActivityRaw, type GarminSource } from "@/lib/garmin/adapter";

/** In-memory Garmin for integration tests: set days/activities, record pushes and deletes. */
export class FakeGarmin implements GarminSource {
  days: FetchResult["days"] = [];
  activities: GarminActivityRaw[] = [];
  failWith: GarminError | null = null;
  pushed: { workout: unknown; date: string; workoutId: number }[] = [];
  deleted: number[] = [];
  fetches: { from: string; to: string; knownIds: number[] }[] = [];
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
