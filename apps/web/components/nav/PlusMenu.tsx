"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { localDateNow } from "@/lib/dates";
import { useTranslations } from "next-intl";
import { Camera, PenLine, Plus, Scale, Zap } from "lucide-react";
import { BottomSheet } from "@/components/common/BottomSheet";
import { QuickAddSheet } from "@/components/food/QuickAddSheet";
import { WeightSheet } from "@/components/body/WeightSheet";

export function PlusMenu() {
  const t = useTranslations("plus");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quick, setQuick] = useState(false);
  const [weight, setWeight] = useState(false);
  const pathname = usePathname();
  const params = useSearchParams();
  // When browsing a past day on Today/Food, food is added to that day.
  const viewed = params.get("date");
  const pastDate =
    (pathname.startsWith("/today") || pathname === "/food") && viewed && /^\d{4}-\d{2}-\d{2}$/.test(viewed) && viewed < localDateNow()
      ? viewed
      : undefined;
  const q = pastDate ? `&date=${pastDate}` : "";

  const go = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const options = [
    { key: "photo", Icon: Camera, onClick: go(() => router.push(`/food/log?mode=photo${q}`)) },
    { key: "text", Icon: PenLine, onClick: go(() => router.push(`/food/log?mode=text${q}`)) },
    { key: "quick", Icon: Zap, onClick: go(() => setQuick(true)) },
    { key: "weight", Icon: Scale, onClick: go(() => setWeight(true)) },
  ] as const;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={t("open")}
        className="-mt-6 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_30px_-6px] shadow-primary/60 transition-transform active:scale-95"
      >
        <Plus className="size-7" strokeWidth={2.5} />
      </button>

      <BottomSheet open={open} onOpenChange={setOpen} title={t("title")}>
        <div className="grid grid-cols-2 gap-3 pt-2">
          {options.map(({ key, Icon, onClick }) => (
            <button
              key={key}
              onClick={onClick}
              className="flex flex-col items-start gap-3 rounded-2xl bg-card p-4 text-left transition-colors active:bg-muted"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Icon className="size-5" />
              </span>
              <span>
                <span className="block font-semibold">{t(`${key}.title`)}</span>
                <span className="block text-xs text-muted-foreground">{t(`${key}.hint`)}</span>
              </span>
            </button>
          ))}
        </div>
      </BottomSheet>

      <QuickAddSheet open={quick} onOpenChange={setQuick} date={pastDate} />
      <WeightSheet open={weight} onOpenChange={setWeight} />
    </>
  );
}
