"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/common/Chip";
import { NumberField, parseNum } from "@/components/common/NumberField";
import { createClient } from "@/lib/supabase/client";
import {
  updateActivity,
  updateCheckinWeekday,
  updateGoal,
  updateMacros,
} from "@/app/(app)/profile/actions";

export interface ProfileValues {
  targetWeightKg: number;
  rateKgPerWeek: number;
  maxLoss: number;
  stepsPerDay: number;
  runKmPerWeek: number;
  otherTrainingHoursPerWeek: number;
  proteinGPerKg: number;
  fatPct: number;
  manualKcalOverride: number | null;
  checkinWeekday: number;
  email: string;
  /** Garmin users get activity from the watch; manual activity settings are hidden. */
  garmin: boolean;
}

const RATES = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-3xl bg-card p-5">
      <h2 className="font-heading font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function useSave() {
  const t = useTranslations("profile");
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(t("saved"));
        router.refresh();
      } else toast.error(t("error"));
    });
  return { pending, run };
}

export function ProfileCards({ v }: { v: ProfileValues }) {
  const t = useTranslations("profile");
  const tw = useTranslations("weekdays");
  const router = useRouter();
  const { pending, run } = useSave();

  const [target, setTarget] = useState(String(v.targetWeightKg));
  const [rate, setRate] = useState(v.rateKgPerWeek);
  const [steps, setSteps] = useState(String(v.stepsPerDay));
  const [run_, setRun] = useState(String(v.runKmPerWeek));
  const [other, setOther] = useState(String(v.otherTrainingHoursPerWeek));
  const [protein, setProtein] = useState(String(v.proteinGPerKg));
  const [fat, setFat] = useState(String(Math.round(v.fatPct * 100)));
  const [override, setOverride] = useState(v.manualKcalOverride == null ? "" : String(v.manualKcalOverride));
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
  }

  async function deleteAccount() {
    setDeleting(true);
    const res = await fetch("/api/account", { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setDeleting(false);
      return toast.error(t("error"));
    }
    await createClient().auth.signOut();
    router.replace("/login");
  }

  return (
    <>
      <Card title={t("goal.title")}>
        <NumberField label={t("goal.target")} unit="kg" value={target} onChange={setTarget} />
        <div className="flex flex-wrap gap-2">
          {RATES.map((r) => (
            <Chip key={r} selected={rate === r} disabled={r < v.maxLoss} onClick={() => setRate(r)} className="h-9 px-3">
              <span className="num">{r > 0 ? `+${r}` : r}</span>
            </Chip>
          ))}
        </div>
        <Button
          className="h-11 rounded-xl"
          disabled={pending || parseNum(target) == null}
          onClick={() => run(() => updateGoal({ targetWeightKg: parseNum(target)!, rateKgPerWeek: rate }))}
        >
          {t("save")}
        </Button>
      </Card>

      {!v.garmin && (
        <Card title={t("activity.title")}>
          <p className="-mt-2 text-xs text-muted-foreground">{t("activity.hint")}</p>
          <NumberField label={t("activity.steps")} value={steps} onChange={setSteps} decimal={false} />
          <div className="grid grid-cols-2 gap-3">
            <NumberField label={t("activity.run")} unit="km" value={run_} onChange={setRun} />
            <NumberField label={t("activity.other")} unit="h" value={other} onChange={setOther} />
          </div>
          <Button
            className="h-11 rounded-xl"
            disabled={pending || [steps, run_, other].some((x) => parseNum(x) == null)}
            onClick={() =>
              run(() =>
                updateActivity({
                  stepsPerDay: Math.round(parseNum(steps)!),
                  runKmPerWeek: parseNum(run_)!,
                  otherTrainingHoursPerWeek: parseNum(other)!,
                }),
              )
            }
          >
            {t("save")}
          </Button>
        </Card>
      )}

      <Card title={t("macros.title")}>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label={t("macros.protein")} unit="g/kg" value={protein} onChange={setProtein} />
          <NumberField label={t("macros.fat")} unit="%" value={fat} onChange={setFat} />
        </div>
        <NumberField label={t("macros.override")} unit="kcal" value={override} onChange={setOverride} decimal={false} hint={t("macros.overrideHint")} />
        <Button
          className="h-11 rounded-xl"
          disabled={pending || parseNum(protein) == null || parseNum(fat) == null}
          onClick={() =>
            run(() =>
              updateMacros({
                proteinGPerKg: parseNum(protein)!,
                fatPct: parseNum(fat)! / 100,
                manualKcalOverride: parseNum(override),
              }),
            )
          }
        >
          {t("save")}
        </Button>
      </Card>

      <Card title={t("checkinDay")}>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d) => (
            <Chip key={d} selected={v.checkinWeekday === d} onClick={() => run(() => updateCheckinWeekday(d))} className="h-9 px-3">
              {tw(String(d))}
            </Chip>
          ))}
        </div>
      </Card>

      <Card title={t("account.title")}>
        <p className="-mt-2 text-sm text-muted-foreground">{v.email}</p>
        <Button variant="secondary" className="h-11 rounded-xl" onClick={signOut}>
          {t("account.signOut")}
        </Button>
        <div className="rounded-2xl border border-destructive/30 p-4">
          <p className="text-sm font-medium text-destructive">{t("account.deleteTitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("account.deleteExplain")}</p>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            className="mt-3 h-11 w-full rounded-xl border border-border bg-muted px-4 outline-none focus:border-destructive"
          />
          <Button
            variant="destructive"
            className="mt-3 h-11 w-full rounded-xl"
            disabled={confirmText !== "DELETE" || deleting}
            onClick={deleteAccount}
          >
            {t("account.delete")}
          </Button>
        </div>
      </Card>
    </>
  );
}
