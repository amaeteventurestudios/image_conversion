import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Dialog({
  open, onOpenChange, title, description, children, footer, className,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" />
        <D.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl focus:outline-none",
            className,
          )}
        >
          <D.Title className="text-lg font-semibold">{title}</D.Title>
          {description ? (
            <D.Description className="mt-1 text-sm text-muted-foreground">{description}</D.Description>
          ) : (
            <D.Description className="sr-only">{title}</D.Description>
          )}
          <div className="mt-4">{children}</div>
          {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
          <D.Close className="absolute top-4 right-4 cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
