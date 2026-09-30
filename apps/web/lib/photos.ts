"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Downscale to maxSide px and re-encode (~100–200 KB). Prefers WebP; Safari can't encode WebP
 * and silently returns PNG, so fall back to JPEG there.
 */
export async function compressImage(file: Blob, maxSide = 1024, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  const webp = await encode("image/webp");
  if (webp?.type === "image/webp") return webp;
  const jpeg = await encode("image/jpeg");
  if (!jpeg) throw new Error("compress_failed");
  return jpeg;
}

const EXT: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

/** Uploads to "{bucket}/{userId}/{uuid}.{ext}" and returns the object path. */
export async function uploadPhoto(bucket: "food" | "body", blob: Blob): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");
  const type = EXT[blob.type] ? blob.type : "image/jpeg";
  const path = `${user.id}/${crypto.randomUUID()}.${EXT[type]}`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: type });
    if (!error) return path;
    lastError = error;
  }
  throw lastError ?? new Error("upload_failed");
}
