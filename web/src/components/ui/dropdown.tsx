import * as M from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const DropdownMenu = M.Root;
export const DropdownTrigger = M.Trigger;

export function DropdownContent({ className, ...props }: M.DropdownMenuContentProps) {
  return (
    <M.Portal>
      <M.Content
        sideOffset={8}
        align="end"
        className={cn("z-50 min-w-52 rounded-lg border border-border bg-card p-1 shadow-xl", className)}
        {...props}
      />
    </M.Portal>
  );
}

export function DropdownItem({ className, ...props }: M.DropdownMenuItemProps) {
  return (
    <M.Item
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none select-none data-[highlighted]:bg-accent [&_svg]:size-4 [&_svg]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export const DropdownSeparator = () => <M.Separator className="my-1 h-px bg-border" />;
export const DropdownLabel = ({ children }: { children: React.ReactNode }) => (
  <M.Label className="px-3 py-2 text-xs text-muted-foreground">{children}</M.Label>
);
