import { Loader2 } from "lucide-react";
import { cn, FORMAT_LABEL, formatBytes } from "@/lib/utils";
import type { RowView } from "@/components/ImageTable";
import type { ConvertSettings } from "@shared/settings";
import { targetDimensions } from "@shared/settings";

/** Detailed before/after for a single image (spec §8.1). */
export function SinglePreview({ row, settings }: { row: RowView; settings: ConvertSettings }) {
  const f = row.item.server;
  const out = row.actual ?? row.estimate;
  const saved = out ? row.item.size - out.size : null;
  const dims = out ?? (f ? targetDimensions(f.width, f.height, settings.resize) : null);
  const exact = !!row.actual;
  return (
    <div className="grid grid-cols-1 gap-px border-y border-border bg-border sm:grid-cols-3">
      <Tile label="Original">
        <div className="text-2xl font-semibold tabular-nums">{formatBytes(row.item.size)}</div>
        <div className="mt-1 text-sm text-muted-foreground">
          {f ? `${FORMAT_LABEL[f.format] ?? f.format} · ${f.width} × ${f.height}` : "Uploading…"}
        </div>
      </Tile>
      <Tile label={exact ? "Output" : "Estimated Output"} hint={exact ? "actual" : out ? "test-encoded" : undefined}>
        <div className="flex items-center gap-2 text-2xl font-semibold tabular-nums">
          {out ? formatBytes(out.size) : "—"}
          {row.item.estimating && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          {FORMAT_LABEL[settings.format]} · Quality {out?.quality ?? (settings.targetKB ? "auto" : settings.quality)}
          {settings.targetKB && <> · target ≤ {settings.targetKB} KB</>}
          {dims && <> · {dims.width} × {dims.height}</>}
        </div>
      </Tile>
      <Tile label={exact ? "Reduction" : "Estimated Reduction"}>
        {saved != null ? (
          <>
            <div className={cn("text-2xl font-semibold tabular-nums", saved >= 0 ? "text-success" : "text-warning")}>
              {((Math.abs(saved) / row.item.size) * 100).toFixed(1)}% {saved >= 0 ? "smaller" : "larger"}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">{formatBytes(Math.abs(saved))} {saved >= 0 ? "saved" : "added"}</div>
          </>
        ) : (
          <div className="text-2xl font-semibold text-muted-foreground">—</div>
        )}
      </Tile>
    </div>
  );
}

/** Aggregate totals for a batch (spec §9). */
export function BatchSummary({ rows }: { rows: RowView[] }) {
  const active = rows.filter((r) => r.item.server && r.status.kind !== "error");
  const original = active.reduce((s, r) => s + r.item.size, 0);
  const measured = active.filter((r) => r.actual ?? r.estimate);
  const allActual = active.length > 0 && active.every((r) => r.actual);
  const measuredOrig = measured.reduce((s, r) => s + r.item.size, 0);
  const measuredOut = measured.reduce((s, r) => s + (r.actual ?? r.estimate)!.size, 0);
  // Project the unmeasured remainder from the ratio seen so far so the total is useful while estimates stream in.
  const ratio = measuredOrig ? measuredOut / measuredOrig : null;
  const projected = ratio != null ? measuredOut + (original - measuredOrig) * ratio : null;
  const saved = projected != null ? original - projected : null;
  const pending = active.length - measured.length;

  return (
    <div className="grid grid-cols-2 gap-px border-y border-border bg-border lg:grid-cols-4">
      <Tile label="Images">
        <div className="text-2xl font-semibold tabular-nums">{rows.length}</div>
        <div className="mt-1 text-sm text-muted-foreground">{active.length} ready</div>
      </Tile>
      <Tile label="Original Total">
        <div className="text-2xl font-semibold tabular-nums">{formatBytes(original)}</div>
      </Tile>
      <Tile label={allActual ? "Output Total" : "Estimated Output"} hint={allActual ? "actual" : pending > 0 && measured.length ? `${measured.length}/${active.length} measured` : undefined}>
        <div className="flex items-center gap-2 text-2xl font-semibold tabular-nums">
          {projected != null ? formatBytes(Math.round(projected)) : "—"}
          {pending > 0 && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
      </Tile>
      <Tile label={allActual ? "Saved" : "Estimated Savings"}>
        {saved != null ? (
          <>
            <div className={cn("text-2xl font-semibold tabular-nums", saved >= 0 ? "text-success" : "text-warning")}>{formatBytes(Math.round(Math.abs(saved)))}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {((Math.abs(saved) / original) * 100).toFixed(1)}% {saved >= 0 ? "smaller" : "larger"}
            </div>
          </>
        ) : (
          <div className="text-2xl font-semibold text-muted-foreground">—</div>
        )}
      </Tile>
    </div>
  );
}

function Tile({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card px-5 py-4">
      <div className="mb-1 flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
        {hint && <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] tracking-normal normal-case">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

