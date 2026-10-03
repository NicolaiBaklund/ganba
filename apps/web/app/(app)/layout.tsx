import { requireUser } from "@/lib/supabase/server";
import { getGarminStatus } from "@/lib/garmin/accounts";
import { GarminSync } from "@/components/common/GarminSync";
import { BottomNav } from "@/components/nav/BottomNav";
import { QueueFlusher } from "@/components/common/QueueFlusher";
import { Toaster } from "@/components/ui/sonner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const garmin = await getGarminStatus(user.id);
  return (
    <>
      <div className="mx-auto min-h-dvh w-full max-w-md pb-32">{children}</div>
      <BottomNav />
      <QueueFlusher />
      <GarminSync enabled={garmin?.status === "active"} />
      <Toaster position="top-center" />
    </>
  );
}
