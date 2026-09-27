import { useRef } from "react";
import { ChevronDown, FileDown, Loader2, Lock, Settings2, Unlock, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Radio } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ConvertSettings, ResizeMode } from "@shared/settings";
import type { OutputFormat } from "@shared/naming";
import type { NamingSettings } from "@/lib/batch";

const FORMATS: { value: OutputFormat; label: string }[] = [
  { value: "webp", label: "WebP (Recommended)" },
  { value: "avif", label: "AVIF" },
  { value: "jpeg", label: "JPG / JPEG" },
  { value: "png", label: "PNG" },
];

const RESIZE_MODES: { value: Exclude<ResizeMode, "none">; label: string }[] = [
  { value: "width", label: "Width" },
  { value: "height", label: "Height" },
  { value: "exact", label: "Exact" },
  { value: "percent", label: "Percent" },
];

const WIDTH_PRESETS = [3840, 2560, 1920, 1600, 1280, 1080];
const PERCENT_PRESETS = [75, 50, 25];

export function RenamingCard({
  naming, setNaming, onCsvFile, onTemplate,
}: {
  naming: NamingSettings;
  setNaming: (n: NamingSettings) => void;
  onCsvFile: (f: File) => void;
  onTemplate: () => void;
}) {
  const csvInput = useRef<HTMLInputElement>(null);
  const set = (p: Partial<NamingSettings>) => setNaming({ ...naming, ...p });
  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold">1. Renaming Options</h2>
      <div className="mt-3">
        <Radio id="nm-keep" checked={naming.mode === "keep"} onChange={() => set({ mode: "keep" })} label="Keep original names" />
        <Radio id="nm-custom" checked={naming.mode === "custom"} onChange={() => set({ mode: "custom" })} label="Use custom names (edit in table)" />
        <Radio id="nm-csv" checked={naming.mode === "csv"} onChange={() => set({ mode: "csv" })} label="Upload CSV (old name → new name)" />
      </div>
      {naming.mode === "csv" && (
        <div className="mt-3 space-y-2">
          <Button className="h-11 w-full" onClick={() => csvInput.current?.click()}>
            <Upload /> Upload CSV File
          </Button>
          <button onClick={onTemplate} className="flex cursor-pointer items-center gap-1.5 text-xs text-primary hover:underline">
            <FileDown className="size-3.5" /> Download a template with your current filenames
          </button>
          <input
            ref={csvInput}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onCsvFile(f);
            }}
          />
        </div>
      )}
      {naming.mode !== "keep" && (
        <div className="mt-4 space-y-2 border-t border-border pt-4">
          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <Checkbox checked={naming.webNormalize} onChange={(v) => set({ webNormalize: v })} />
            Make names web-safe <span className="text-muted-foreground">(spaces → hyphens)</span>
          </label>
          {naming.webNormalize && (
            <label className="flex cursor-pointer items-center gap-3 pl-8 text-sm">
              <Checkbox checked={naming.lowercase} onChange={(v) => set({ lowercase: v })} />
              Lowercase
            </label>
          )}
        </div>
      )}
    </Card>
  );
}

function NumberField({ value, onChange, suffix, min = 1, max = 16384, label }: { value?: number; onChange: (n: number | undefined) => void; suffix: string; min?: number; max?: number; label: string }) {
  return (
    <div className="relative flex-1">
      <Input
        aria-label={label}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value ?? ""}
        onChange={(e) => {
          const n = e.target.value === "" ? undefined : Math.min(max, Math.max(min, Math.round(Number(e.target.value))));
          onChange(Number.isFinite(n) ? n : undefined);
        }}
        className="pr-9"
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>
    </div>
  );
}

export function OutputCard({
  settings, setSettings, onConvert, convertLabel, canConvert, converting,
}: {
  settings: ConvertSettings;
  setSettings: (s: ConvertSettings) => void;
  onConvert: () => void;
  convertLabel: string;
  canConvert: boolean;
  converting: boolean;
}) {
  const set = (p: Partial<ConvertSettings>) => setSettings({ ...settings, ...p });
  const r = settings.resize;
  const setR = (p: Partial<ConvertSettings["resize"]>) => set({ resize: { ...r, ...p } });
  const resizing = r.mode !== "none";
  const lastMode = useRef<Exclude<ResizeMode, "none">>("width");
  if (r.mode !== "none") lastMode.current = r.mode;

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold">2. Output Format</h2>

      <label htmlFor="format" className="mt-4 mb-2 block text-sm font-medium">Format</label>
      <div className="relative">
        <select
          id="format"
          value={settings.format}
          onChange={(e) => set({ format: e.target.value as OutputFormat })}
          className="h-12 w-full cursor-pointer appearance-none rounded-lg border border-border bg-input px-4 pr-10 text-sm focus:ring-2 focus:ring-primary/50 focus:outline-none"
        >
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <label htmlFor="quality" className="text-sm font-semibold">Quality: {settings.quality}%</label>
      </div>
      <div className="mt-3 flex items-center gap-4">
        <input
          id="quality"
          type="range"
          min={1}
          max={100}
          value={settings.quality}
          onChange={(e) => set({ quality: Number(e.target.value) })}
          className="slider flex-1"
          style={{ "--fill": `${settings.quality}%` } as React.CSSProperties}
        />
        <Input
          aria-label="Quality value"
          type="number"
          min={1}
          max={100}
          value={settings.quality}
          onChange={(e) => {
            const n = Math.round(Number(e.target.value));
            if (Number.isFinite(n)) set({ quality: Math.min(100, Math.max(1, n)) });
          }}
          className="h-11 w-16 text-center"
        />
      </div>
      {settings.format === "png" && (
        <p className="mt-2 text-xs text-muted-foreground">
          PNG is lossless. Below 100, colours are reduced to a palette (like pngquant) to shrink files; 100 keeps full colour.
        </p>
      )}

      <div className="mt-6 space-y-3">
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <Checkbox checked={resizing} onChange={(v) => setR({ mode: v ? lastMode.current : "none" })} />
          Resize images
        </label>
        {resizing && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/50 p-3">
            <div className="grid grid-cols-4 gap-1 rounded-lg bg-accent p-1">
              {RESIZE_MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setR({ mode: m.value })}
                  className={cn(
                    "cursor-pointer rounded-md py-1.5 text-xs font-medium transition",
                    r.mode === m.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {(r.mode === "width" || r.mode === "exact") && (
              <div className="flex items-center gap-2">
                <span className="w-12 text-xs text-muted-foreground">Width</span>
                <NumberField label="Width" value={r.width} onChange={(width) => setR({ width })} suffix="px" />
              </div>
            )}
            {(r.mode === "height" || r.mode === "exact") && (
              <div className="flex items-center gap-2">
                <span className="w-12 text-xs text-muted-foreground">Height</span>
                <NumberField label="Height" value={r.height} onChange={(height) => setR({ height })} suffix="px" />
              </div>
            )}
            {r.mode === "percent" && (
              <div className="flex items-center gap-2">
                <span className="w-12 text-xs text-muted-foreground">Scale</span>
                <NumberField label="Percent" value={r.percent} onChange={(percent) => setR({ percent })} suffix="%" max={400} />
              </div>
            )}
            {r.mode === "width" && (
              <div className="flex flex-wrap gap-1.5">
                {WIDTH_PRESETS.map((w) => (
                  <Chip key={w} active={r.width === w} onClick={() => setR({ width: w })}>{w}px</Chip>
                ))}
              </div>
            )}
            {r.mode === "percent" && (
              <div className="flex flex-wrap gap-1.5">
                {PERCENT_PRESETS.map((p) => (
                  <Chip key={p} active={r.percent === p} onClick={() => setR({ percent: p })}>{p}%</Chip>
                ))}
              </div>
            )}
            {r.mode === "exact" && (
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <Checkbox checked={r.lockAspect} onChange={(v) => setR({ lockAspect: v })} />
                {r.lockAspect ? <Lock className="size-3.5 text-muted-foreground" /> : <Unlock className="size-3.5 text-muted-foreground" />}
                Lock aspect ratio <span className="text-xs text-muted-foreground">(fit within the box)</span>
              </label>
            )}
            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <Checkbox checked={r.withoutEnlargement} onChange={(v) => setR({ withoutEnlargement: v })} />
              Do not enlarge images smaller than the target
            </label>
          </div>
        )}
      </div>

      <div className="mt-6">
        <div className="mb-1 text-sm font-medium">Metadata</div>
        <Radio id="md-strip" checked={settings.metadata === "strip"} onChange={() => set({ metadata: "strip" })} label={<>Strip metadata <span className="text-muted-foreground">(recommended for web)</span></>} />
        <Radio id="md-keep" checked={settings.metadata === "preserve"} onChange={() => set({ metadata: "preserve" })} label="Preserve metadata (EXIF, XMP, ICC)" />
        <p className="mt-1 text-xs text-muted-foreground">
          {settings.metadata === "strip"
            ? "Removes EXIF (camera, GPS), XMP, IPTC and the ICC profile that libvips can read. Colours are converted to sRGB."
            : "Keeps EXIF, XMP, IPTC and ICC data. Orientation is applied to the pixels."}
        </p>
      </div>

      <Button variant="primary" size="lg" className="mt-6 h-14 w-full text-base" disabled={!canConvert || converting} onClick={onConvert}>
        {converting ? <Loader2 className="size-5! animate-spin" /> : <Settings2 className="size-5!" />}
        {convertLabel}
      </Button>
    </Card>
  );
}

const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className={cn(
      "cursor-pointer rounded-md border px-2 py-1 text-xs transition",
      active ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground",
    )}
  >
    {children}
  </button>
);
