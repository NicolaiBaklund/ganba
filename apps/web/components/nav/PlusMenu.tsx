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
        className="-mt-5 flex size-[54px] items-center justify-center rounded-[14px] bg-[var(--plus-bg)] text-[var(--plus-fg)] transition-transform active:scale-95"
      >
        <Plus className="size-7" strokeWidth={2.5} />
      </button>

      <BottomSheet open={open} onOpenChange={setOpen} title={t("title")}>
        <div className="grid grid-cols-2 gap-3 pt-2">
          {options.map(({ key, Icon, onClick }) => (
            <button
              key={key}
              onClick={onClick}
              className="flex flex-col items-start gap-3 rounded-md bg-muted p-4 text-left transition-colors active:bg-border"
            >
              <span className="flex size-10 items-center justify-center rounded-md bg-card text-foreground">
                <Icon className="size-5" />
              </span>
              <span>
                <span className="block font-bold">{t(`${key}.title`)}</span>
                <span className="block text-[13px] text-muted-foreground">{t(`${key}.hint`)}</span>
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
