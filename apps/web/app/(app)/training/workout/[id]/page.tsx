import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ChevronLeft, Watch } from "lucide-react";
import { formatPace, type Step } from "@loop/core";
import { requireUser } from "@/lib/supabase/server";
import { loadWorkout } from "@/lib/training/view";
import { fmtClock, fmtMinutes, fmtPaceRange, paceFromSpeed, typeColor } from "@/lib/training/format";

function StepLine({ s, t }: { s: Step; t: (k: string, v?: Record<string, string | number>) => string }) {
  const amount =
    s.duration.kind === "distance"
      ? s.duration.m >= 1000
        ? `${Math.round(s.duration.m / 100) / 10} km`
        : `${s.duration.m} m`
      : s.duration.kind === "time"
        ? s.duration.s >= 60
          ? `${Math.round((s.duration.s / 60) * 10) / 10} min`
          : `${s.duration.s} s`
        : t("open");
  const pace = fmtPaceRange(s.target);
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className={s.kind === "recover" ? "text-muted-foreground" : ""}>
        {t(`step.${s.kind}`)} · <span className="num">{amount}</span>
      </span>
      {pace && <span className="num text-muted-foreground">{pace}</span>}
    </div>
  );
}

export default async function WorkoutPage({ params }: PageProps<"/training/workout/[id]">) {
  const { id } = await params;
  const t = await getTranslations("workout");
  const format = await getFormatter();
  const { user } = await requireUser();
  const w = await loadWorkout(user.id, id);
  if (!w) notFound();
  const tt = (k: string, v?: Record<string, string | number>) => t(k as never, v as never);

  const a = w.activity;
  const pace = a && a.distanceKm > 0 ? formatPace((a.movingS ?? a.durationS) / a.distanceKm) : null;

  return (
    <main className="flex flex-col gap-4 px-4 pt-4">
      <Link href="/training" className="flex items-center gap-1 text-sm text-muted-foreground">
        <ChevronLeft className="size-4" />
        {t("back")}
      </Link>

      <section className="rounded-3xl bg-card p-5">
        <p className="text-sm font-semibold" style={{ color: typeColor(w.type) }}>
          {t(`types.${w.type}`)}
        </p>
        <h1 className="mt-1 font-heading text-2xl font-bold">{w.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {format.dateTime(new Date(`${w.date}T00:00:00Z`), { weekday: "long", day: "numeric", month: "long" })} ·{" "}
          {t(w.status)}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{t("plannedKm")}</p>
            <p className="num text-xl font-semibold">
              {w.plannedKm} km <span className="text-sm text-muted-foreground">· {fmtMinutes(w.plannedDurationS)}</span>
            </p>
          </div>
          {a && (
            <div>
              <p className="text-xs text-muted-foreground">{t("actualKm")}</p>
              <p className="num text-xl font-semibold text-success">
                {a.distanceKm} km <span className="text-sm text-muted-foreground">· {fmtClock(a.movingS ?? a.durationS)}</span>
              </p>
            </div>
          )}
        </div>
        {w.status === "planned" && (
          <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Watch className="size-4" />
            {w.push === "pushed" ? t("onWatch") : w.push === "failed" ? t("pushFailed") : t("notOnWatch")}
          </p>
        )}
      </section>

      <section className="rounded-3xl bg-card p-5">
        {w.blocks.map((b, i) =>
          b.kind === "repeat" ? (
            <div key={i} className="my-1 rounded-2xl border border-border px-3 py-1.5">
              <p className="num pt-1 text-xs font-semibold text-primary">{t("repeat", { times: b.times })}</p>
              {b.steps.map((s, j) => (
                <StepLine key={j} s={s} t={tt} />
              ))}
            </div>
          ) : (
            <StepLine key={i} s={b} t={tt} />
          ),
        )}
      </section>

      {a && (
        <section className="rounded-3xl bg-card p-5">
          <div className="mb-3 grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">{t("pace")}</p>
              <p className="num font-semibold">{pace ?? "–"} /km</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("hr")}</p>
              <p className="num font-semibold">{a.avgHr ?? "–"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("duration")}</p>
              <p className="num font-semibold">{fmtClock(a.durationS)}</p>
            </div>
          </div>
          {a.laps.length > 1 && (
            <>
              <h2 className="mb-1 font-heading font-semibold">{t("laps")}</h2>
              <div className="divide-y divide-border text-sm">
                {a.laps.map((l, i) => {
                  const lp = paceFromSpeed(l.avgSpeed);
                  return (
                    <div key={i} className="num grid grid-cols-4 py-1.5">
                      <span className="text-muted-foreground">{i + 1}</span>
                      <span>{Math.round(l.distanceM / 10) / 100} km</span>
                      <span>{lp ? formatPace(lp) : "–"}</span>
                      <span className="text-right text-muted-foreground">{l.avgHr ? Math.round(l.avgHr) : "–"}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}
