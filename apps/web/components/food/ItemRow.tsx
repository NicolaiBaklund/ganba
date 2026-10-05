"use client";

import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { parseNum } from "@/components/common/NumberField";
import { cn } from "@/lib/utils";

export interface EditableItem {
  key: string;
  name: string;
  grams: number | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /** Grams of alcohol (from the AI estimate); not shown, but saved with the item. */
  alcohol_g?: number;
  confidence: "low" | "medium" | "high" | null;
  assumptions?: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Changing grams scales kcal and macros proportionally. */
export function scaleItem(item: EditableItem, grams: number): EditableItem {
  if (!item.grams || item.grams <= 0) return { ...item, grams };
  const f = grams / item.grams;
  return {
    ...item,
    grams,
    kcal: Math.round(item.kcal * f),
    protein_g: round1(item.protein_g * f),
    carbs_g: round1(item.carbs_g * f),
    fat_g: round1(item.fat_g * f),
    ...(item.alcohol_g != null ? { alcohol_g: round1(item.alcohol_g * f) } : {}),
  };
}

const DOT = { low: "bg-warning", medium: "bg-muted-foreground", high: "bg-success" } as const;

export function ItemRow({
  item,
  onChange,
  onRemove,
}: {
  item: EditableItem;
  onChange: (item: EditableItem) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("foodLog");
  const numInput = "num w-full bg-transparent text-right text-sm font-bold outline-none";
  return (
    <div className="border-b border-border py-3">
      <div className="flex items-center gap-2">
        {item.confidence && <span className={cn("size-2 shrink-0 rounded-full", DOT[item.confidence])} title={t(`confidence.${item.confidence}`)} />}
        <input
          value={item.name}
          onChange={(e) => onChange({ ...item, name: e.target.value })}
          className="min-w-0 flex-1 bg-transparent font-bold outline-none"
        />
        <button onClick={onRemove} aria-label={t("removeItem")} className="text-muted-foreground">
          <Trash2 className="size-4" />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1.5 text-xs">
        <label className="flex flex-col rounded-md bg-card px-2 py-1.5">
          <span className="text-muted-foreground">g</span>
          <input
            inputMode="decimal"
            defaultValue={item.grams ?? ""}
            onBlur={(e) => {
              const g = parseNum(e.target.value);
              if (g != null && g !== item.grams) onChange(scaleItem(item, g));
            }}
            className={numInput}
          />
        </label>
        {(["kcal", "protein_g", "carbs_g", "fat_g"] as const).map((k) => (
          <label key={k} className="flex flex-col rounded-md bg-card px-2 py-1.5">
            <span className={cn("text-muted-foreground", k === "protein_g" && "text-protein-ink", k === "carbs_g" && "text-carbs-ink", k === "fat_g" && "text-fat-ink")}>
              {t(`short.${k}`)}
            </span>
            <input
              key={`${k}-${item[k]}`}
              inputMode="decimal"
              defaultValue={item[k]}
              onBlur={(e) => {
                const v = parseNum(e.target.value);
                if (v != null && v !== item[k]) onChange({ ...item, [k]: v });
              }}
              className={numInput}
            />
          </label>
        ))}
      </div>
      {item.assumptions && <p className="mt-2 text-[13px] text-muted-foreground">{item.assumptions}</p>}
    </div>
  );
}
