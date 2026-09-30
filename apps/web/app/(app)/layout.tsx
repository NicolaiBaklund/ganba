import { requireUser } from "@/lib/supabase/server";
import { BottomNav } from "@/components/nav/BottomNav";
import { QueueFlusher } from "@/components/common/QueueFlusher";
import { Toaster } from "@/components/ui/sonner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <>
      <div className="mx-auto min-h-dvh w-full max-w-md pb-32">{children}</div>
      <BottomNav />
      <QueueFlusher />
      <Toaster position="top-center" />
    </>
  );
}
