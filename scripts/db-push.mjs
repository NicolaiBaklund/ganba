// Push migrations to the linked Supabase project, then regenerate apps/web/lib/db/types.ts.
// Auth: `supabase login` once, or SUPABASE_ACCESS_TOKEN in apps/web/.env.local (gitignored).
// The types file is only replaced when generation succeeds.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { config } from "dotenv";

config({ path: "apps/web/.env.local", quiet: true });

const supabase = (args, opts = {}) =>
  spawnSync("pnpm", ["exec", "supabase", ...args], { shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });

const push = supabase(["db", "push", "--yes"], { stdio: "inherit" });
if (push.status !== 0) {
  console.error("\ndb push failed. If it says Unauthorized: run `pnpm exec supabase login` in a terminal, or add SUPABASE_ACCESS_TOKEN to apps/web/.env.local.");
  process.exit(push.status ?? 1);
}

const gen = supabase(["gen", "types", "typescript", "--linked"]);
if (gen.status !== 0 || !gen.stdout.includes("export type Database")) {
  console.error(gen.stderr || "type generation failed; apps/web/lib/db/types.ts left unchanged");
  process.exit(gen.status || 1);
}
writeFileSync("apps/web/lib/db/types.ts", gen.stdout);
console.log("Migrations pushed and apps/web/lib/db/types.ts regenerated.");
