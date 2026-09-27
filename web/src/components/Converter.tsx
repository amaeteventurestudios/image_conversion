import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, FileDown, FolderArchive, Info, Loader2, Trash2 } from "lucide-react";
import { api, triggerDownload } from "@/lib/api";
import { useBatch, type NamingSettings } from "@/lib/batch";
import { usePersistentState } from "@/lib/theme";
import { cn, formatBytes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Header } from "@/components/Header";
import { Dropzone } from "@/components/Dropzone";
import { ImageTable, type RowStatus, type RowView } from "@/components/ImageTable";
import { OutputCard, RenamingCard } from "@/components/SettingsPanel";
import { BatchSummary, SinglePreview } from "@/components/Summary";
import { CsvReviewDialog, downloadCsvTemplate, PasteNamesDialog } from "@/components/NameDialogs";
import { DEFAULT_SETTINGS, parseSettings, type ConvertSettings } from "@shared/settings";
import type { Me } from "@/App";

const DEFAULT_NAMING: NamingSettings = { mode: "custom", webNormalize: true, lowercase: true };

export function Converter({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const [settings, setSettings] = usePersistentState<ConvertSettings>("pic:settings", DEFAULT_SETTINGS);
  const [naming, setNaming] = usePersistentState<NamingSettings>("pic:naming", DEFAULT_NAMING);
  const [limits, setLimits] = useState({ maxFileBytes: 60 * 1048576, fileTtlHours: 6 });
  useEffect(() => {
    api<typeof limits>("/config").then(setLimits).catch(() => {});
  }, []);

  // Incomplete resize inputs (e.g. an empty width box) should not fire requests.
  const settingsError = useMemo(() => {
    try {
      parseSettings(settings);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, [settings]);
  const [validSettings, setValidSettings] = useState(settings);
  useEffect(() => {
    if (!settingsError) setValidSettings(settings);
  }, [settings, settingsError]);

  const batch = useBatch(validSettings, naming, limits.maxFileBytes);
  const { items, setItems, names, progress } = batch;

  const [pasteOpen, setPasteOpen] = useState(false);
  const [csv, setCsv] = useState<{ text: string; name: string } | null>(null);
  const [multiNotice, setMultiNotice] = useState<null | (() => void)>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // ------------------------------------------------------------------ rows
  const rows: RowView[] = useMemo(
    () =>
      items.map((item, index) => {
        const out = item.server?.output;
        const current = batch.isCurrent(item);
        let status: RowStatus;
        if (item.phase === "uploading") status = { kind: "uploading", progress: item.uploadProgress };
        else if (item.phase === "error") status = { kind: "error", message: item.error ?? "Failed" };
        else if (item.phase === "queued") status = { kind: "waiting" };
        else if (item.phase === "processing") status = { kind: "processing" };
        else if (names.dupes.has(index)) status = { kind: "duplicate" };
        else if (out && current) status = { kind: "complete" };
        else if (out) status = { kind: "stale" };
        else status = { kind: "ready" };
        return {
          item,
          index,
          finalName: names.finals[index],
          status,
          estimate: item.estimates[batch.key],
          actual: out && current ? { size: out.size, width: out.width, height: out.height } : undefined,
        };
      }),
    [items, names, batch],
  );

  const completed = rows.filter((r) => r.status.kind === "complete");
  const selectedDone = completed.filter((r) => r.item.selected);
  const uploading = rows.some((r) => r.status.kind === "uploading");
  const converting = !!progress?.running;
  const dupes = names.dupes.size;

  // ------------------------------------------------------------------ actions
  const onName = useCallback((key: string, v: string) => {
    setItems((list) => list.map((it) => (it.key === key ? { ...it, customName: v } : it)));
    setNaming((n) => (n.mode === "keep" ? { ...n, mode: "custom" } : n));
  }, [setItems, setNaming]);
  const onSelect = useCallback((key: string, v: boolean) => setItems((list) => list.map((it) => (it.key === key ? { ...it, selected: v } : it))), [setItems]);
  const onSelectAll = (v: boolean) => setItems((list) => list.map((it) => ({ ...it, selected: v })));

  const download = useCallback((row: RowView) => {
    triggerDownload(`/api/files/${row.item.server!.id}/download?name=${encodeURIComponent(row.finalName.replace(/\.[^.]+$/, ""))}`);
  }, []);

  const noticeSeen = () => {
    try {
      return localStorage.getItem("pic:multi-ok") === "1";
    } catch {
      return false;
    }
  };

  function downloadMany(list: RowView[]) {
    if (list.length === 1) return download(list[0]);
    const run = () => list.forEach((r, i) => setTimeout(() => download(r), i * 350));
    if (noticeSeen()) run();
    else setMultiNotice(() => run);
  }

  async function downloadZip(list: RowView[], label: string) {
    const { token } = await api<{ token: string }>("/zip", {
      method: "POST",
      json: { items: list.map((r) => ({ id: r.item.server!.id, name: r.finalName.replace(/\.[^.]+$/, "") })) },
    });
    triggerDownload(`/api/zip/${token}?filename=${encodeURIComponent(label)}`);
  }

  function applyNames(list: string[]) {
    setItems((cur) => cur.map((it, i) => (i < list.length ? { ...it, customName: list[i] } : it)));
    if (naming.mode === "keep") setNaming({ ...naming, mode: "custom" });
  }

  const originals = useMemo(() => items.map((i) => i.originalName), [items]);
  const pendingCount = batch.convertable.length;
  const convertLabel = converting
    ? `Converting ${progress!.done} of ${progress!.total}`
    : !items.length
      ? "Convert Images"
      : pendingCount === 0 && completed.length
        ? "All Images Converted"
        : pendingCount === rows.length
          ? `Convert All Images`
          : `Convert ${pendingCount} Image${pendingCount === 1 ? "" : "s"}`;

  const singleRow = rows.length === 1 ? rows[0] : null;

  return (
    <div className="min-h-screen pb-32">
      <Header me={me} onLogout={onLogout} />
      <main className="mx-auto max-w-[1600px] px-4 pt-8 sm:px-8">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Convert &amp; Rename Images</h1>
            <p className="mt-2 text-muted-foreground">
              Batch convert, rename, and optimize your images. Upload PNG, JPG and more — get WebP, AVIF, or JPG in seconds.
            </p>
          </div>
          <div className="flex gap-2">
            <Button className="h-11" onClick={() => downloadCsvTemplate(originals)}>
              <FileDown /> Download Template
            </Button>
            <Button className="h-11" onClick={() => setConfirmClear(true)} disabled={!items.length}>
              <Trash2 /> Clear All
            </Button>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="min-w-0 space-y-6">
            <Dropzone onFiles={batch.addFiles} compact={items.length > 0} />
            {items.length > 0 && (
              <ImageTable
                rows={rows}
                mode={naming.mode}
                format={validSettings.format}
                onName={onName}
                onSelect={onSelect}
                onSelectAll={onSelectAll}
                onRemove={batch.remove}
                onDownload={download}
                onRetry={batch.retry}
                onPaste={() => setPasteOpen(true)}
                onClearNames={() => setItems((l) => l.map((it) => ({ ...it, customName: "" })))}
                summary={singleRow ? <SinglePreview row={singleRow} settings={validSettings} /> : <BatchSummary rows={rows} />}
              />
            )}
          </div>
          <div className="space-y-6">
            <RenamingCard
              naming={naming}
              setNaming={setNaming}
              onTemplate={() => downloadCsvTemplate(originals)}
              onCsvFile={async (f) => setCsv({ text: await f.text(), name: f.name })}
            />
            <OutputCard
              settings={settings}
              setSettings={setSettings}
              onConvert={batch.convert}
              convertLabel={convertLabel}
              canConvert={!settingsError && pendingCount > 0 && !uploading}
              converting={converting}
            />
            {settingsError && <p className="-mt-3 text-sm text-warning">{settingsError}</p>}
            {dupes > 0 && (
              <p className="-mt-3 text-sm text-danger">
                {dupes} images share an output name. Rename them to convert.
              </p>
            )}
          </div>
        </div>
      </main>

      {items.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 px-4 pb-4 sm:px-8">
          <Card className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-4 px-5 py-4 shadow-xl">
            <StatusLine rows={rows} completed={completed.length} progress={progress} uploading={uploading} />
            <div className="flex-1" />
            {completed.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {rows.length === 1 ? (
                  <Button variant="primary" onClick={() => download(completed[0])}>
                    <Download /> Download Image
                  </Button>
                ) : (
                  <>
                    {selectedDone.length > 0 && (
                      <Button onClick={() => downloadMany(selectedDone)}>
                        <Download /> Download Selected ({selectedDone.length})
                      </Button>
                    )}
                    {selectedDone.length > 1 && (
                      <Button onClick={() => downloadZip(selectedDone, "images-selected")}>
                        <FolderArchive /> Selected as ZIP
                      </Button>
                    )}
                    <Button onClick={() => downloadMany(completed)}>
                      <Download /> Download All ({completed.length})
                    </Button>
                    {completed.length > 1 && (
                      <Button variant="primary" onClick={() => downloadZip(completed, "images")}>
                        <FolderArchive /> Download All as ZIP
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      <PasteNamesDialog open={pasteOpen} onOpenChange={setPasteOpen} imageCount={items.length} onApply={applyNames} />
      {csv && (
        <CsvReviewDialog
          open
          onOpenChange={(o) => !o && setCsv(null)}
          csvText={csv.text}
          fileName={csv.name}
          originals={originals}
          onApply={(m) => {
            setItems((cur) => cur.map((it) => (m.mapping.has(it.originalName.toLowerCase()) ? { ...it, customName: m.mapping.get(it.originalName.toLowerCase())! } : it)));
            setNaming({ ...naming, mode: "csv" });
          }}
        />
      )}
      <Dialog
        open={!!multiNotice}
        onOpenChange={(o) => !o && setMultiNotice(null)}
        title="Downloading several files"
        description="Your browser may ask for permission to download multiple files from this site. Choose Allow so every image arrives."
        footer={
          <>
            <Button onClick={() => setMultiNotice(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                try {
                  localStorage.setItem("pic:multi-ok", "1");
                } catch {
                  /* ignore */
                }
                multiNotice?.();
                setMultiNotice(null);
              }}
            >
              Start downloads
            </Button>
          </>
        }
      />
      <Dialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear all images?"
        description="This removes every image from the list and deletes the uploaded and converted files from the server."
        footer={
          <>
            <Button onClick={() => setConfirmClear(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => (batch.clearAll(), setConfirmClear(false))}>
              Clear all
            </Button>
          </>
        }
      />
      <p className="mx-auto mt-8 flex max-w-[1600px] items-center gap-1.5 px-4 text-xs text-muted-foreground sm:px-8">
        <Info className="size-3.5" /> Files are private to your account and deleted from the server automatically after {limits.fileTtlHours} hours.
      </p>
    </div>
  );
}

function StatusLine({
  rows, completed, progress, uploading,
}: {
  rows: RowView[];
  completed: number;
  progress: { total: number; done: number; failed: number; running: boolean } | null;
  uploading: boolean;
}) {
  const errors = rows.filter((r) => r.status.kind === "error").length;
  const ready = rows.filter((r) => ["ready", "complete", "stale"].includes(r.status.kind)).length;
  if (progress?.running) {
    const pct = Math.round((progress.done / progress.total) * 100);
    return (
      <div className="min-w-64 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Loader2 className="size-4 animate-spin text-primary" /> Converting {Math.min(progress.done + 1, progress.total)} of {progress.total}
          <span className="text-muted-foreground">{pct}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-accent">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }
  const done = rows.filter((r) => r.actual);
  const orig = done.reduce((s, r) => s + r.item.size, 0);
  const out = done.reduce((s, r) => s + r.actual!.size, 0);
  return (
    <div className="flex items-center gap-3 text-sm">
      {uploading ? <Loader2 className="size-5 animate-spin text-primary" /> : <CheckCircle2 className={cn("size-5", errors ? "text-warning" : "text-success")} />}
      <div>
        <div className="font-medium">
          {completed > 0 ? `${completed} of ${rows.length} images converted` : uploading ? "Uploading and analysing…" : `${ready} of ${rows.length} images ready`}
          {errors > 0 && <span className="ml-2 text-danger">· {errors} error{errors === 1 ? "" : "s"}</span>}
        </div>
        {completed > 0 && (
          <div className="text-xs text-muted-foreground">
            {formatBytes(orig)} → {formatBytes(out)} · {formatBytes(orig - out)} saved ({orig ? (((orig - out) / orig) * 100).toFixed(1) : 0}%)
          </div>
        )}
      </div>
    </div>
  );
}
