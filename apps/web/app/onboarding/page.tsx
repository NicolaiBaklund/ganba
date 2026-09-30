"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import {
  ageOn,
  dailyTarget,
  DEFAULT_FAT_PCT,
  defaultProteinGPerKg,
  localDate,
  macrosFor,
  rateLimits,
  startEstimate,
  type Sex,
} from "@loop/core";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/common/Chip";
import { NumberField, parseNum } from "@/components/common/NumberField";
import { completeOnboarding } from "./actions";

const RATES = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5];
const STEPS = 4;

export default function OnboardingPage() {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [sex, setSex] = useState<Sex | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [steps, setSteps] = useState("8000");
  const [runKm, setRunKm] = useState("0");
  const [otherHours, setOtherHours] = useState("0");
  const [target, setTarget] = useState("");
  const [rate, setRate] = useState(-0.5);

  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const weightKg = parseNum(weight);
  const limits = weightKg ? rateLimits(weightKg) : null;

  const input = useMemo(() => {
    const h = parseNum(height), w = parseNum(weight), tw = parseNum(target);
    const s = parseNum(steps), r = parseNum(runKm), o = parseNum(otherHours);
    if (!sex || !birthDate || h == null || w == null || tw == null || s == null || r == null || o == null) return null;
    return {
      sex, birthDate, heightCm: h, weightKg: w, timezone,
      stepsPerDay: Math.round(s), runKmPerWeek: r, otherTrainingHoursPerWeek: o,
      targetWeightKg: tw, rateKgPerWeek: rate,
    };
  }, [sex, birthDate, height, weight, target, steps, runKm, otherHours, rate, timezone]);

  const result = useMemo(() => {
    if (!input) return null;
    const est = startEstimate(
      { sex: input.sex, ageYears: ageOn(input.birthDate, localDate(timezone)), heightCm: input.heightCm, weightKg: input.weightKg },
      input,
    );
    const plan = {
      baseExpenditureKcal: est.baseKcal,
      proteinGPerKg: defaultProteinGPerKg(rate),
      fatPct: DEFAULT_FAT_PCT,
      manualKcalOverride: null,
    };
    const target = dailyTarget({ plan, trainingKcal: est.trainingKcal, rateKgPerWeek: rate, sex: input.sex });
    return { est, target, macros: macrosFor(target.kcal, input.weightKg, plan) };
  }, [input, rate, timezone]);

  const canNext = [
    !!sex && !!birthDate && parseNum(height) != null && weightKg != null,
    parseNum(steps) != null && parseNum(runKm) != null && parseNum(otherHours) != null,
    parseNum(target) != null,
    true,
  ][step];

  function finish() {
    if (!input) return;
    setError(null);
    startTransition(async () => {
      const res = await completeOnboarding(input);
      if (res.ok) router.replace("/today");
      else setError(t("error"));
    });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-8 pt-6">
      <div className="mb-8 flex items-center gap-3">
        {step > 0 ? (
          <button onClick={() => setStep(step - 1)} aria-label={t("back")} className="-ml-1 p-1">
            <ArrowLeft className="size-5" />
          </button>
        ) : (
          <div className="size-7" />
        )}
        <div className="flex flex-1 gap-1.5">
          {Array.from({ length: STEPS }).map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>
      </div>

      {step === 0 && (
        <section className="flex flex-col gap-5">
          <Header title={t("body.title")} subtitle={t("body.subtitle")} />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-muted-foreground">{t("body.sex")}</span>
            <div className="flex gap-2">
              <Chip selected={sex === "male"} onClick={() => setSex("male")} className="flex-1">{t("body.male")}</Chip>
              <Chip selected={sex === "female"} onClick={() => setSex("female")} className="flex-1">{t("body.female")}</Chip>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-muted-foreground" htmlFor="birth">{t("body.birthDate")}</label>
            <input
              id="birth"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="h-14 rounded-xl border border-border bg-muted px-4 text-lg outline-none focus:border-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label={t("body.height")} unit="cm" value={height} onChange={setHeight} />
            <NumberField label={t("body.weight")} unit="kg" value={weight} onChange={setWeight} />
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="flex flex-col gap-5">
          <Header title={t("activity.title")} subtitle={t("activity.subtitle")} />
          <NumberField label={t("activity.steps")} value={steps} onChange={setSteps} decimal={false} hint={t("activity.stepsHint")} />
          <NumberField label={t("activity.runKm")} unit="km" value={runKm} onChange={setRunKm} />
          <NumberField label={t("activity.otherHours")} unit="h" value={otherHours} onChange={setOtherHours} hint={t("activity.otherHint")} />
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-col gap-5">
          <Header title={t("goal.title")} subtitle={t("goal.subtitle")} />
          <NumberField label={t("goal.target")} unit="kg" value={target} onChange={setTarget} />
          <div className="flex flex-col gap-2">
            <span className="text-sm text-muted-foreground">{t("goal.rate")}</span>
            <div className="flex flex-wrap gap-2">
              {RATES.map((r) => {
                const blocked = !!limits && (r < limits.maxLossPerWeek || r > limits.maxGainPerWeek);
                return (
                  <Chip key={r} selected={rate === r} disabled={blocked} onClick={() => setRate(r)}>
                    <span className="num">{r > 0 ? `+${r}` : r}</span>
                  </Chip>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {limits ? t("goal.limit", { max: Math.abs(limits.maxLossPerWeek) }) : t("goal.unit")}
            </p>
          </div>
        </section>
      )}

      {step === 3 && result && (
        <section className="flex flex-col gap-5">
          <Header title={t("result.title")} subtitle={t("result.subtitle")} />
          <div className="rounded-2xl bg-card p-5">
            <p className="text-sm text-muted-foreground">{t("result.daily")}</p>
            <p className="num mt-1 text-5xl font-bold text-primary">{result.target.kcal}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("result.maintenance", { low: result.est.low, high: result.est.high })}
            </p>
            {result.target.floored && <p className="mt-3 text-sm text-warning">{t("result.floored")}</p>}
          </div>
          <div className="rounded-2xl bg-card p-5 text-sm">
            <p className="mb-3 font-medium">{t("result.breakdown")}</p>
            <Row label={t("result.rest")} value={Math.round(result.est.bmr * 1.2)} />
            <Row label={t("result.walking")} value={result.est.walkingKcal} />
            <Row label={t("result.training")} value={result.est.trainingKcal} />
            <Row label={t("result.goalAdjust")} value={result.target.kcal - result.est.maintenanceKcal} signed />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Macro label={t("result.protein")} grams={result.macros.proteinG} color="text-protein" />
            <Macro label={t("result.carbs")} grams={result.macros.carbsG} color="text-carbs" />
            <Macro label={t("result.fat")} grams={result.macros.fatG} color="text-fat" />
          </div>
          <p className="text-xs text-muted-foreground">{t("result.adaptiveNote")}</p>
        </section>
      )}

      <div className="mt-auto pt-8">
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
        <Button
          size="lg"
          className="h-14 w-full rounded-2xl text-base"
          disabled={!canNext || pending}
          onClick={() => (step < STEPS - 1 ? setStep(step + 1) : finish())}
        >
          {step < STEPS - 1 ? t("next") : t("start")}
        </Button>
      </div>
    </main>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-2">
      <h1 className="font-heading text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function Row({ label, value, signed }: { label: string; value: number; signed?: boolean }) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="num">{signed && value > 0 ? `+${value}` : value} kcal</span>
    </div>
  );
}

function Macro({ label, grams, color }: { label: string; grams: number; color: string }) {
  return (
    <div className="rounded-2xl bg-card p-4">
      <p className={`num text-2xl font-bold ${color}`}>{grams}g</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
