import { memo } from "react";
import { AlertCircle, ClipboardPaste, Download, Eraser, Loader2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn, FORMAT_LABEL, formatBytes } from "@/lib/utils";
import { baseName, EXTENSIONS, type NamingMode, type OutputFormat } from "@shared/naming";
import type { Estimate, Item } from "@/lib/batch";

export type RowStatus =
  | { kind: "uploading"; progress: number }
  | { kind: "ready" }
  | { kind: "waiting" }
  | { kind: "processing" }
  | { kind: "complete" }
  | { kind: "stale" }
  | { kind: "duplicate" }
  | { kind: "error"; message: string };

export interface RowView {
  item: Item;
  index: number;
  finalName: string;
  status: RowStatus;
  estimate?: Estimate;
  actual?: { size: number; width: number; height: number; quality?: number };
}

const STATUS_STYLE: Record<RowStatus["kind"], string> = {
  uploading: "text-muted-foreground",
  ready: "text-success",
  waiting: "text-muted-foreground",
  processing: "text-primary",
  complete: "text-success",
  stale: "text-warning",
  duplicate: "text-danger",
  error: "text-danger",
};

function StatusCell({ s, onRetry }: { s: RowStatus; onRetry?: () => void }) {
  const label =
    s.kind === "uploading" ? `Uploading ${Math.round(s.progress * 100)}%`
    : s.kind === "ready" ? "Ready"
    : s.kind === "waiting" ? "Waiting"
    : s.kind === "processing" ? "Processing"
    : s.kind === "complete" ? "Complete"
    : s.kind === "stale" ? "Settings changed"
    : s.kind === "duplicate" ? "Duplicate name"
    : "Error";
  return (
    <div className={cn("flex items-center gap-2 text-sm font-medium", STATUS_STYLE[s.kind])}>
      {s.kind === "uploading" || s.kind === "processing" ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : s.kind === "error" || s.kind === "duplicate" ? (
        <AlertCircle className="size-3.5" />
      ) : (
        <span className="size-2 rounded-full bg-current" />
      )}
      <span className="whitespace-nowrap" title={s.kind === "error" ? s.message : undefined}>{label}</span>
      {s.kind === "error" && onRetry && (
        <button onClick={onRetry} className="cursor-pointer rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Retry">
          <RotateCcw className="size-3.5" />
        </button>
      )}
    </div>
  );
}

const Row = memo(function Row({
  row, mode, format, onName, onSelect, onRemove, onDownload, onRetry,
}: {
  row: RowView;
  mode: NamingMode;
  format: OutputFormat;
  onName: (key: string, v: string) => void;
  onSelect: (key: string, v: boolean) => void;
  onRemove: (key: string) => void;
  onDownload: (row: RowView) => void;
  onRetry: (key: string) => void;
}) {
  const { item, status } = row;
  const f = item.server;
  const out = row.actual ?? row.estimate;
  const saved = out ? item.size - out.size : null;
  const savedPct = saved != null && item.size ? (saved / item.size) * 100 : null;
  const typedBase = mode === "keep" ? baseName(item.originalName) : item.customName.trim() || baseName(item.originalName);
  const finalBase = row.finalName.replace(/\.[^.]+$/, "");
  const differs = mode !== "keep" && typedBase && typedBase !== finalBase;

  return (
    <tr className={cn("border-t border-border transition-colors hover:bg-accent/40", item.selected && "bg-primary/5")}>
      <td className="py-3 pr-2 pl-5">
        <Checkbox checked={item.selected} onChange={(v) => onSelect(item.key, v)} aria-label={`Select ${item.originalName}`} />
      </td>
      <td className="px-2 text-sm text-muted-foreground tabular-nums">{row.index + 1}</td>
      <td className="px-2">
        <div className="h-10 w-16 overflow-hidden rounded-md border border-border bg-muted">
          {f && <img src={`/api/files/${f.id}/thumb`} alt="" loading="lazy" className="size-full object-cover" />}
        </div>
      </td>
      <td className="max-w-56 px-2">
        <div className="truncate text-sm" title={item.originalName}>{item.originalName}</div>
        <div className="mt-0.5 text-xs whitespace-nowrap text-muted-foreground">
          {formatBytes(item.size)}
          {f && <> · {f.width}×{f.height} · {FORMAT_LABEL[f.format] ?? f.format.toUpperCase()}</>}
          {f && (f.metadata.exif || f.metadata.xmp) && <span title="Contains EXIF/XMP metadata"> · meta</span>}
          {f && f.pages > 1 && <span> · {f.pages} frames</span>}
        </div>
      </td>
      <td className="min-w-60 px-2">
        <div className="flex items-center rounded-lg border border-border bg-input focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/50">
          <input
            aria-label={`New filename for ${item.originalName}`}
            value={mode === "keep" ? baseName(item.originalName) : item.customName}
            placeholder={baseName(item.originalName)}
            disabled={mode === "keep"}
            onChange={(e) => onName(item.key, e.target.value)}
            className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none disabled:text-muted-foreground"
          />
          <span className="pr-3 text-xs text-muted-foreground">.{EXTENSIONS[format]}</span>
        </div>
        {(differs || status.kind === "duplicate") && (
          <div className={cn("mt-1 truncate text-xs", status.kind === "duplicate" ? "text-danger" : "text-muted-foreground")} title={row.finalName}>
            {status.kind === "duplicate" ? `Another image also saves as ${row.finalName}` : `Saves as ${row.finalName}`}
          </div>
        )}
        {status.kind === "error" && <div className="mt-1 text-xs text-danger">{status.message}</div>}
      </td>
      <td className="px-2 text-right text-sm whitespace-nowrap tabular-nums">
        {out ? (
          <div>
            <div className={cn(row.actual ? "font-semibold" : "text-muted-foreground")}>{row.actual ? "" : "~"}{formatBytes(out.size)}</div>
            <div className="text-xs text-muted-foreground">{out.width}×{out.height}</div>
          </div>
        ) : item.estimating ? (
          <Loader2 className="ml-auto size-3.5 animate-spin text-muted-foreground" />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-2 text-right text-sm whitespace-nowrap tabular-nums">
        {savedPct != null ? (
          <span className={cn(savedPct >= 0 ? "text-success" : "text-warning")} title={`${formatBytes(Math.abs(saved!))} ${saved! >= 0 ? "smaller" : "larger"}`}>
            {savedPct >= 0 ? "−" : "+"}{Math.abs(savedPct).toFixed(0)}%
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3">
        <StatusCell s={status} onRetry={item.server ? () => onRetry(item.key) : undefined} />
      </td>
      <td className="pr-4 pl-1">
        <div className="flex items-center justify-end gap-0.5">
          {status.kind === "complete" && (
            <Button variant="ghost" size="icon" className="size-8" onClick={() => onDownload(row)} aria-label={`Download ${row.finalName}`} title="Download">
              <Download />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" onClick={() => onRemove(item.key)} aria-label={`Remove ${item.originalName}`} title="Remove">
            <X />
          </Button>
        </div>
      </td>
    </tr>
  );
});

export function ImageTable({
  rows, mode, format, onName, onSelect, onSelectAll, onRemove, onDownload, onRetry, onPaste, onClearNames, summary,
}: {
  rows: RowView[];
  mode: NamingMode;
  format: OutputFormat;
  onName: (key: string, v: string) => void;
  onSelect: (key: string, v: boolean) => void;
  onSelectAll: (v: boolean) => void;
  onRemove: (key: string) => void;
  onDownload: (row: RowView) => void;
  onRetry: (key: string) => void;
  onPaste: () => void;
  onClearNames: () => void;
  summary: React.ReactNode;
}) {
  const selected = rows.filter((r) => r.item.selected).length;
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <h2 className="text-lg font-semibold">
          {rows.length} image{rows.length === 1 ? "" : "s"}
          {selected > 0 && <span className="ml-2 text-sm font-normal text-muted-foreground">({selected} selected)</span>}
        </h2>
        <div className="flex-1" />
        <Button size="sm" className="h-9" onClick={onPaste}>
          <ClipboardPaste /> Paste Names
        </Button>
        <Button size="sm" className="h-9" onClick={onClearNames}>
          <Eraser /> Clear Names
        </Button>
      </div>
      {summary}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left">
          <thead className="bg-muted/60 text-xs font-medium text-muted-foreground">
            <tr>
              <th className="py-3 pr-2 pl-5 font-medium">
                <Checkbox
                  checked={selected > 0 && selected === rows.length}
                  indeterminate={selected > 0 && selected < rows.length}
                  onChange={(v) => onSelectAll(v)}
                  aria-label="Select all"
                />
              </th>
              <th className="px-2 font-medium">#</th>
              <th className="px-2 font-medium">Preview</th>
              <th className="px-2 font-medium">Original</th>
              <th className="px-2 font-medium">New Filename (without extension)</th>
              <th className="px-2 text-right font-medium">Output</th>
              <th className="px-2 text-right font-medium">Savings</th>
              <th className="px-3 font-medium">Status</th>
              <th className="pr-4" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Row key={row.item.key} row={row} mode={mode} format={format} onName={onName} onSelect={onSelect} onRemove={onRemove} onDownload={onDownload} onRetry={onRetry} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
