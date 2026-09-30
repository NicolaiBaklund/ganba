"use client";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border-border px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3"
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted" />
        <SheetTitle className="font-heading text-xl font-bold">{title}</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  );
}
