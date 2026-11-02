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
