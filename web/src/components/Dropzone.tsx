import { useRef, useState } from "react";
import { CloudUpload, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Dropzone({ onFiles, compact }: { onFiles: (f: File[]) => void; compact: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current++;
        setOver(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        depth.current--;
        if (depth.current <= 0) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        const files = [...e.dataTransfer.files];
        if (files.length) onFiles(files);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:outline-none",
        over ? "border-primary bg-primary/10" : "border-primary/35 bg-card/40 hover:border-primary/60 hover:bg-card/70",
        compact ? "px-6 py-6" : "px-6 py-10",
      )}
    >
      <CloudUpload className={cn("text-muted-foreground", compact ? "size-8" : "size-12")} strokeWidth={1.5} />
      <p className={cn("font-semibold", compact ? "mt-2 text-base" : "mt-3 text-lg")}>
        {compact ? "Drop more images to add them" : "Drag and drop images here"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">or click to select files</p>
      {!compact && (
        <p className="mt-4 text-xs text-muted-foreground">
          Supports: PNG, JPG, JPEG, WebP, AVIF, GIF, BMP, TIFF <span className="mx-1.5">•</span> You can upload multiple files
        </p>
      )}
      {!compact && (
        <Button variant="primary" className="mt-4" onClick={(e) => (e.stopPropagation(), input.current?.click())}>
          <ImagePlus /> Select Images
        </Button>
      )}
      <input
        ref={input}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/avif,image/gif,image/bmp,image/tiff,.png,.jpg,.jpeg,.webp,.avif,.gif,.bmp,.tif,.tiff"
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}
