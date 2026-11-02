import "server-only";
import { feature, iso1A3Code } from "@rapideditor/country-coder";

/** ISO alpha-3 country where a run started, from built-in borders (no outside service); null when unknown. */
export function countryOf(lat: number | null | undefined, lon: number | null | undefined): string | null {
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return iso1A3Code([lon, lat]) ?? null;
}

/** English name for a stamp, e.g. JPN → Japan. */
export function countryName(iso3: string): string {
  return feature(iso3)?.properties.nameEn ?? iso3;
}

/** For the globe: the ISO numeric id world-atlas uses (JPN → "392") and roughly where it is [lon, lat]. */
export function globeCountry(iso3: string): { id: string; at: [number, number] } | null {
  const f = feature(iso3);
  if (!f?.properties.iso1N3) return null;
  const pts: number[][] = [];
  const walk = (x: unknown): void => {
    if (Array.isArray(x) && typeof x[0] === "number") pts.push(x as number[]);
    else if (Array.isArray(x)) x.forEach(walk);
  };
  walk((f.geometry as { coordinates?: unknown } | null)?.coordinates);
  const mean = (i: number) => (pts.length ? pts.reduce((s, p) => s + p[i]!, 0) / pts.length : 0);
  return { id: f.properties.iso1N3, at: [mean(0), mean(1)] };
}
