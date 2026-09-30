"use client";

import { createClient } from "@/lib/supabase/client";

/** Downscale to maxSide px and re-encode as WebP (~100–200 KB). */
export async function compressImage(file: Blob, maxSide = 1024, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("compress_failed"))), "image/webp", quality),
  );
}

/** Uploads to "{bucket}/{userId}/{uuid}.webp" and returns the object path. */
export async function uploadPhoto(bucket: "food" | "body", blob: Blob): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");
  const path = `${user.id}/${crypto.randomUUID()}.webp`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: "image/webp" });
    if (!error) return path;
    lastError = error;
  }
  throw lastError ?? new Error("upload_failed");
}
