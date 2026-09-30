"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { compressImage } from "@/lib/photos";

/** Picks and compresses photos. Parent owns the resulting blobs. */
export function PhotoPicker({
  photos,
  onChange,
  max = 3,
  label,
  autoOpen = false,
}: {
  photos: Blob[];
  onChange: (photos: Blob[]) => void;
  max?: number;
  label: string;
  autoOpen?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const u = photos.map((p) => URL.createObjectURL(p));
    setUrls(u);
    return () => u.forEach(URL.revokeObjectURL);
  }, [photos]);

  useEffect(() => {
    if (autoOpen) input.current?.click();
  }, [autoOpen]);

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    const compressed = await Promise.all([...files].slice(0, max - photos.length).map((f) => compressImage(f)));
    onChange([...photos, ...compressed]);
  }

  return (
    <div className="flex gap-2 overflow-x-auto">
      {urls.map((u, i) => (
        <div key={u} className="relative size-20 shrink-0 overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u} alt="" className="size-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(photos.filter((_, j) => j !== i))}
            className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5"
            aria-label="Remove"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      {photos.length < max && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex size-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-xs text-muted-foreground"
        >
          <Camera className="size-5" />
          {label}
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
