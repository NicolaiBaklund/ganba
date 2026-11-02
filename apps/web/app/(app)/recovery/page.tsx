import { redirect } from "next/navigation";

/** Recovery became Progress (spec docs/specs/2026-11-02-health.md §9); old links land there. */
export default function RecoveryPage() {
  redirect("/progress");
}
