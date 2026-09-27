import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export function Checkbox({
  checked, indeterminate, onChange, disabled, className, "aria-label": ariaLabel, id,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  id?: string;
}) {
  const on = checked || indeterminate;
  return (
    <button
      id={id}
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-[5px] border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50",
        on ? "border-primary bg-primary text-white" : "border-muted-foreground/50 bg-transparent hover:border-muted-foreground",
        className,
      )}
    >
      {indeterminate ? <Minus className="size-3.5" strokeWidth={3} /> : checked ? <Check className="size-3.5" strokeWidth={3} /> : null}
    </button>
  );
}

export function Radio({ checked, onChange, label, id }: { checked: boolean; onChange: () => void; label: React.ReactNode; id: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-3 py-1.5 text-sm">
      <button
        id={id}
        type="button"
        role="radio"
        aria-checked={checked}
        onClick={onChange}
        className={cn(
          "flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
          checked ? "border-primary" : "border-muted-foreground/50",
        )}
      >
        {checked && <span className="size-2.5 rounded-full bg-primary" />}
      </button>
      <span>{label}</span>
    </label>
  );
}
