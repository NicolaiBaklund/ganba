import { getTranslations } from "next-intl/server";
import type { StrengthProgressRow } from "@/lib/strength/view";

const W = 72;
const H = 24;
const n = (x: number) => String(Math.round(x * 100) / 100);

/** Progress › Strength (spec 2026-11-10 §8): sessions so far and one line per favourite lift. */
export async function StrengthSection({ sessions, rows }: { sessions: number; rows: StrengthProgressRow[] }) {
  const t = await getTranslations("strength");
  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between border-b-2 border-foreground pb-1.5">
        <h2 className="cond text-[22px] leading-none">{t("title")}</h2>
        <span className="num text-[17px] font-extrabold">
          {sessions} <span className="text-[13px] font-semibold text-muted-foreground">{t("sessions")}</span>
        </span>
      </div>
      {rows.map((r) => {
        const lo = Math.min(...r.points), hi = Math.max(...r.points);
        const pts = r.points.map((v, i) => [(i / Math.max(1, r.points.length - 1)) * (W - 4) + 2, hi === lo ? H / 2 : 2 + ((hi - v) / (hi - lo)) * (H - 4)] as const);
        const unit = r.unit === "kg" ? " kg" : r.unit === "s" ? " s" : " reps";
        const month = new Date(`${r.since}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
        return (
          <div key={r.key} className="flex items-center gap-4 border-b border-border py-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{r.name}</span>
              <span className="num block truncate text-[13px] text-muted-foreground">{t("since", { from: n(r.from), to: `${n(r.to)}${unit}`, month })}</span>
            </span>
            <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="shrink-0 overflow-visible" aria-hidden="true">
              <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" className="stroke-muted-foreground" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={pts.at(-1)![0]} cy={pts.at(-1)![1]} r={2.5} className="fill-foreground" />
            </svg>
          </div>
        );
      })}
    </section>
  );
}
