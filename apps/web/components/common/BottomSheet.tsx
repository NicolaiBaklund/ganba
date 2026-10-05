"use client";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "mx-auto max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[18px] border-border bg-popover px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3",
          className,
        )}
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted" />
        <SheetTitle className="cond text-2xl leading-none">{title}</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  );
}
