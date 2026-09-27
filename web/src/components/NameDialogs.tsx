import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { buildCsvMapping, csvEscape, type CsvMappingResult } from "@shared/naming";

export function PasteNamesDialog({
  open, onOpenChange, imageCount, onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  imageCount: number;
  onApply: (names: string[]) => void;
}) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (open) setText("");
  }, [open]);
  const names = useMemo(() => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean), [text]);
  const mismatch = names.length > 0 && names.length !== imageCount;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Paste names"
      description="One name per line. Names are assigned to images in table order."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!names.length} onClick={() => (onApply(names), onOpenChange(false))}>
            Apply {Math.min(names.length, imageCount)} name{Math.min(names.length, imageCount) === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder={"african-barbershop-lofi\nevening-veranda-radio\ncassette-repair-shop"}
        className="w-full rounded-lg border border-border bg-input p-3 font-mono text-sm focus:ring-2 focus:ring-primary/50 focus:outline-none"
      />
      <div className="mt-3 flex gap-6 text-sm">
        <span>
          <span className="text-muted-foreground">Uploaded images:</span> <b>{imageCount}</b>
        </span>
        <span>
          <span className="text-muted-foreground">Pasted names:</span> <b>{names.length}</b>
        </span>
      </div>
      {mismatch && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {names.length < imageCount
            ? `Only the first ${names.length} images will be renamed; the remaining ${imageCount - names.length} keep their current names.`
            : `${names.length - imageCount} extra name(s) will be ignored.`}
        </p>
      )}
    </Dialog>
  );
}

export function CsvReviewDialog({
  open, onOpenChange, csvText, fileName, originals, onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  csvText: string;
  fileName: string;
  originals: string[];
  onApply: (m: CsvMappingResult) => void;
}) {
  const result = useMemo(() => buildCsvMapping(csvText, originals), [csvText, originals]);
  const list = (arr: string[]) => (arr.length > 5 ? `${arr.slice(0, 5).join(", ")} and ${arr.length - 5} more` : arr.join(", "));

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Review CSV mapping"
      description={fileName}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!result.matched} onClick={() => (onApply(result), onOpenChange(false))}>
            Apply {result.matched} name{result.matched === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-success" /> <b>{result.matched}</b> of {originals.length} uploaded images matched a CSV row.
        </p>
        {result.unmatchedImages.length > 0 && (
          <Warn>
            {result.unmatchedImages.length} image(s) have no CSV row and will keep their current names: {list(result.unmatchedImages)}
          </Warn>
        )}
        {result.unknownRows.length > 0 && (
          <Warn>{result.unknownRows.length} CSV row(s) name files that are not uploaded: {list(result.unknownRows)}</Warn>
        )}
        {result.duplicateRows.length > 0 && <Warn>Listed more than once (last row wins): {list(result.duplicateRows)}</Warn>}
        {result.errors.map((e) => (
          <Warn key={e}>{e}</Warn>
        ))}
      </div>
    </Dialog>
  );
}

const Warn = ({ children }: { children: React.ReactNode }) => (
  <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-warning">
    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
    <span>{children}</span>
  </p>
);

export function downloadCsvTemplate(originals: string[]) {
  const rows = originals.length ? originals.map((o) => [o, ""]) : [["IMG_001.png", "african-barbershop-lofi"], ["IMG_002.png", "evening-veranda-radio"]];
  const csv = ["original_name,new_name", ...rows.map((r) => r.map(csvEscape).join(","))].join("\r\n") + "\r\n";
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "image-names-template.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
