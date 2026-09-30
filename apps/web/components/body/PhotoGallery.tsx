"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export interface BodyPhoto {
  id: string;
  url: string;
  date: string;
}

/** Grid of body photos. Tap two to compare side by side. */
export function PhotoGallery({ photos }: { photos: BodyPhoto[] }) {
  const t = useTranslations("body");
  const [picked, setPicked] = useState<string[]>([]);
  const format = useFormatter();
  const fmt = (d: string) => format.dateTime(new Date(`${d}T00:00:00Z`), { day: "numeric", month: "short", year: "numeric" });

  if (!photos.length) return <p className="py-6 text-center text-sm text-muted-foreground">{t("noPhotos")}</p>;

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-2)));
  const compare = picked.map((id) => photos.find((p) => p.id === id)!).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="flex flex-col gap-4">
      {compare.length === 2 && (
        <div className="grid grid-cols-2 gap-2">
          {compare.map((p) => (
            <figure key={p.id} className="overflow-hidden rounded-2xl bg-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="aspect-[3/4] w-full object-cover" />
              <figcaption className="p-2 text-center text-xs text-muted-foreground">{fmt(p.date)}</figcaption>
            </figure>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("compareHint")}</p>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((p) => (
          <button
            key={p.id}
            onClick={() => toggle(p.id)}
            className={cn("relative overflow-hidden rounded-xl ring-2 ring-transparent", picked.includes(p.id) && "ring-primary")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" className="aspect-square w-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 bg-black/50 py-0.5 text-[10px]">{fmt(p.date)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
