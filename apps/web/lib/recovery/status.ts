import type { InsightError } from "./insights";

export const STATUS: Record<InsightError | "not_due", number> = {
  consent_required: 403,
  no_key: 402,
  not_enough_data: 409,
  not_due: 409,
  invalid_key: 401,
  unavailable: 503,
  refused: 422,
  invalid_output: 422,
};
