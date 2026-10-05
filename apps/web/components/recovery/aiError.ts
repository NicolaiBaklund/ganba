/** Message key (under recovery.ai) for an AI error code from the recovery routes. */
export function aiErrorKey(error: string): "noKey" | "consentOff" | "badKey" | "notEnough" | "error" {
  if (error === "no_key") return "noKey";
  if (error === "consent_required") return "consentOff";
  if (error === "invalid_key") return "badKey";
  if (error === "not_enough_data") return "notEnough";
  return "error";
}
