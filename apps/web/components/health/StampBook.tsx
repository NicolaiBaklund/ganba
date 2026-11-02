"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { BottomSheet } from "@/components/common/BottomSheet";
import type { BookStamp } from "@/lib/health/view";

/** Small, varied tilts so the book looks stamped by hand; fixed per stamp so it never jumps. */
const tilt = (key: string) => ((key.split("").reduce((s, c) => s + c.charCodeAt(0), 0) % 13) - 6);

/** The stamp book (spec §8.4): earned stamps in red, the next one in each group dashed. Tap for when and where. */
export function StampBook({ stamps }: { stamps: BookStamp[] }) {
  const t = useTranslations("health");
  const format = useFormatter();
  const [open, setOpen] = useState<BookStamp | null>(null);
  const earned = stamps.filter((s) => s.earnedOn).length;
  const date = (d: string) => format.dateTime(new Date(`${d}T12:00:00Z`), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  return (
    <section id="stamps" className="mt-10 scroll-mt-4">
      <div className="flex items-baseline justify-between border-b-2 border-foreground pb-1.5">
        <h2 className="cond text-[22px] leading-none">{t("stamps")}</h2>
        <span className="num text-[17px] font-extrabold">{earned}</span>
      </div>
      {stamps.length === 0 ? (
        <p className="mt-4 text-[15px] text-muted-foreground">{t("noStamps")}</p>
      ) : (
        <div className="mt-5 grid grid-cols-4 gap-x-2.5 gap-y-5">
          {stamps.map((s) => (
            <button key={`${s.kind}-${s.key}`} type="button" onClick={() => setOpen(s)} className="flex flex-col items-center gap-1.5 text-center">
              <span
                style={{ transform: `rotate(${s.earnedOn ? tilt(s.key) : 0}deg)` }}
                className={`grid size-16 place-items-center rounded-[10px] p-1 ${s.earnedOn ? "border-[3px] border-primary text-primary shadow-[inset_0_0_0_3px_var(--background),inset_0_0_0_4.5px_var(--primary)]" : "border-2 border-dashed border-border text-muted-foreground"}`}
              >
                <span className="num text-[20px] font-black leading-none [font-stretch:62%]">{s.mark}</span>
              </span>
              <span className={`text-[11px] leading-tight ${s.earnedOn ? "" : "text-muted-foreground"}`}>{s.label}</span>
            </button>
          ))}
        </div>
      )}
      <BottomSheet open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={open?.label ?? ""}>
        {open && (
          <p className="text-[15px]">
            {open.earnedOn ? (open.run ? t("earnedRun", { date: date(open.earnedOn), km: open.run.km }) : t("earned", { date: date(open.earnedOn) })) : t("notYet")}
          </p>
        )}
      </BottomSheet>
    </section>
  );
}
