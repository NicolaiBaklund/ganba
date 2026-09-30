import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <div className="mx-auto min-h-dvh w-full max-w-md pb-28">{children}</div>;
}
