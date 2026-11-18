import { HARD_TYPES, type WorkoutType } from "../training/types";
import { formatPace } from "../training/vdot";
import type { HealthAlert } from "./alerts";

/**
 * What an alert note may say (spec docs/specs/2026-11-02-health.md §7, cut down by docs/specs/2026-11-18-under-klokka.md
 * §10): the alert and the sessions it may change. Days without an alert have no note.
 */
export interface NoteFacts {
  alert: HealthAlert | null;
  /** Today's session still to do (null when it is done or it is a rest day). */
  today: { type: string; title: string; km: number | null; hrMax: number | null } | null;
  /** Tomorrow's session, any kind. */
  tomorrow: { type: string; title: string } | null;
}

const pace = (s: number | null) => (s == null ? null : `${formatPace(s)}/km`);
/** A session an alert may swap for an easy run: hard, but never a race or a fitness test. */
const swappable = (type: string) => HARD_TYPES.has(type as WorkoutType) && type !== "race" && type !== "test";

/** The alert in fixed sentences, at most three: what is off, then what to do about today or tomorrow. */
export function templateNote(f: NoteFacts): string {
  const out: string[] = [];
  const a = f.alert;
  if (a?.kind === "sick") out.push(`Your resting heart rate is up ${a.facts.rhrUp} and HRV has been low two mornings running, often how getting sick starts.`);
  else if (a?.kind === "easy_fast") out.push(`Your easy runs have averaged ${pace(a.facts.avgSecPerKm!)}. Keep them slower than ${pace(a.facts.easyFastSecPerKm!)} so they stay easy.`);
  else if (a?.kind === "sleep") out.push(`You have slept about ${a.facts.avgShortH} h less than you need a night lately. An earlier night would help.`);
  if (!a) return "";

  const t = f.today;
  if (a.kind === "sick") {
    if (t && swappable(t.type)) out.push(`Swap today's ${t.title.toLowerCase()} for an easy run?`);
    else if (f.tomorrow && swappable(f.tomorrow.type)) out.push(`Swap tomorrow's ${f.tomorrow.title.toLowerCase()} for an easy run?`);
    else out.push(t ? `Keep today's ${t.title.toLowerCase()} truly easy, or rest.` : "Rest today.");
  } else if (t) out.push(`Today: ${t.title}${t.hrMax ? `, heart rate under ${t.hrMax}` : ""}.`);
  else if (f.tomorrow) out.push(`Rest today. Tomorrow: ${f.tomorrow.title}.`);
  return out.slice(0, 3).join(" ");
}
