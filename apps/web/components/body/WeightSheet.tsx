"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/common/BottomSheet";
import { NumberField, parseNum } from "@/components/common/NumberField";
import { PhotoPicker } from "@/components/photos/PhotoPicker";
import { uploadPhoto } from "@/lib/photos";
import { postOrQueue } from "@/lib/offline-queue";

export function WeightSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("weight");
  const router = useRouter();
  const [value, setValue] = useState("");
  const [photos, setPhotos] = useState<Blob[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValue("");
      setPhotos([]);
    }
  }, [open]);

  const kg = parseNum(value);

  async function save() {
    if (kg == null) return;
    setSaving(true);
    let photoPaths: string[] = [];
    if (photos.length) {
      try {
        photoPaths = await Promise.all(photos.map((p) => uploadPhoto("body", p)));
      } catch {
        toast.error(t("photoFailed"));
      }
    }
    const result = await postOrQueue("/api/weight", { weightKg: kg, measuredAt: new Date().toISOString(), photoPaths });
    setSaving(false);
    if (result === "error") return toast.error(t("error"));
    toast.success(result === "queued" ? t("queued") : t("saved"));
    onOpenChange(false);
    router.refresh();
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t("title")}>
      <div className="flex flex-col gap-4 pt-2">
        <NumberField label={t("weight")} unit="kg" value={value} onChange={setValue} hint={t("hint")} />
        <PhotoPicker photos={photos} onChange={setPhotos} label={t("addPhoto")} />
        <Button size="lg" className="h-14 text-base" disabled={kg == null || kg < 20 || saving} onClick={save}>
          {t("save")}
        </Button>
      </div>
    </BottomSheet>
  );
}
