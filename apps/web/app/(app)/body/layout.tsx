import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { modeOf } from "@/lib/db/mode";

/** Training only has no food or body pages. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  if ((await modeOf(user.id)) === "training") redirect("/today");
  return children;
}
