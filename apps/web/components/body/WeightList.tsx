"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Camera, Trash2 } from "lucide-react";
import { toast } from "sonner";

export interface WeightRow {
  id: string;
  local_date: string;
  weight_kg: number;
  photoCount: number;
}

export function WeightList({ rows }: { rows: WeightRow[] }) {
  const t = useTranslations("body");
  const router = useRouter();
  const format = useFormatter();
  const [confirm, setConfirm] = useState<string | null>(null);

  async function remove(id: string) {
    const res = await fetch(`/api/weight/${id}`, { method: "DELETE" });
    if (!res.ok) return toast.error(t("deleteError"));
    setConfirm(null);
    router.refresh();
  }

  return (
    <ul className="divide-y divide-border rounded-3xl bg-card px-4">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between py-3 text-sm">
          <span className="text-muted-foreground">
            {format.dateTime(new Date(`${r.local_date}T00:00:00Z`), { weekday: "short", day: "numeric", month: "short" })}
          </span>
          <span className="flex items-center gap-3">
            {r.photoCount > 0 && <Camera className="size-4 text-muted-foreground" />}
            <span className="num font-semibold">{Number(r.weight_kg).toFixed(1)} kg</span>
            {confirm === r.id ? (
              <button onClick={() => remove(r.id)} className="text-xs font-semibold text-destructive">
                {t("confirmDelete")}
              </button>
            ) : (
              <button onClick={() => setConfirm(r.id)} aria-label={t("delete")} className="text-muted-foreground">
                <Trash2 className="size-4" />
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
