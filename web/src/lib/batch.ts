import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, uploadFile, type ServerFile } from "@/lib/api";
import { settingsKey, type ConvertSettings } from "@shared/settings";
import { duplicateIndexes, finalBase, withExtension, type NamingMode } from "@shared/naming";

export interface Estimate {
  size: number;
  width: number;
  height: number;
  quality?: number;
}

export interface Item {
  key: string;
  originalName: string;
  size: number;
  phase: "uploading" | "ready" | "error" | "queued" | "processing";
  uploadProgress: number;
  error?: string;
  server?: ServerFile;
  customName: string;
  estimates: Record<string, Estimate>;
  estimating: boolean;
  selected: boolean;
}

export interface NamingSettings {
  mode: NamingMode;
  webNormalize: boolean;
  lowercase: boolean;
}

const ACCEPT_EXT = /\.(png|jpe?g|webp|avif|gif|bmp|tiff?|heic|heif)$/i;
const UPLOAD_CONCURRENCY = 3;
const NAMES_KEY = "pic:names";

let seq = 0;
const newKey = () => `k${Date.now().toString(36)}${(seq++).toString(36)}`;

function loadSavedNames(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(NAMES_KEY) ?? "{}");
  } catch {
    return {};
  }
}

/** Run async jobs with a fixed concurrency. Stops pulling new jobs when `alive()` turns false. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>, alive: () => boolean = () => true) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length && alive()) await fn(items[i++]);
  });
  await Promise.all(workers);
}

export function useBatch(settings: ConvertSettings, naming: NamingSettings, maxFileBytes: number) {
  const [items, setItems] = useState<Item[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  // Keys removed by the user; in-flight uploads/conversions check this (state may not have re-rendered yet).
  const removed = useRef(new Set<string>());
  const isRemoved = (k: string) => removed.current.has(k);
  const key = settingsKey(settings);

  const patch = useCallback((k: string, p: Partial<Item> | ((i: Item) => Partial<Item>)) => {
    setItems((list) => list.map((it) => (it.key === k ? { ...it, ...(typeof p === "function" ? p(it) : p) } : it)));
  }, []);

  // Restore files still held on the server (e.g. after a page reload).
  useEffect(() => {
    const names = loadSavedNames();
    api<ServerFile[]>("/files")
      .then((files) =>
        setItems((cur) =>
          cur.length
            ? cur
            : files.map((f) => ({
                key: newKey(), originalName: f.originalName, size: f.size, phase: "ready" as const, uploadProgress: 1, server: f,
                customName: names[f.id] ?? "", estimates: {}, estimating: false, selected: false,
              })),
        ),
      )
      .catch(() => {});
  }, []);

  // Persist custom names per server file for this browser tab.
  useEffect(() => {
    const map: Record<string, string> = {};
    for (const it of items) if (it.server && it.customName) map[it.server.id] = it.customName;
    try {
      sessionStorage.setItem(NAMES_KEY, JSON.stringify(map));
    } catch {
      /* ignore */
    }
  }, [items]);

  // ---------------------------------------------------------------- upload
  const addFiles = useCallback(
    async (files: File[]) => {
      const fresh: (Item & { file?: File })[] = files.map((file) => {
        const base: Item = {
          key: newKey(), originalName: file.name, size: file.size, phase: "uploading", uploadProgress: 0,
          customName: "", estimates: {}, estimating: false, selected: false,
        };
        if (!ACCEPT_EXT.test(file.name) && !/^image\//.test(file.type)) return { ...base, phase: "error", error: "Unsupported file type." };
        if (file.size > maxFileBytes) return { ...base, phase: "error", error: `File is too large (limit ${Math.round(maxFileBytes / 1048576)} MB).` };
        return { ...base, file };
      });
      setItems((list) => [...list, ...fresh.map(({ file: _f, ...it }) => it)]);
      await pool(
        fresh.filter((f) => f.file),
        UPLOAD_CONCURRENCY,
        async (it) => {
          if (isRemoved(it.key)) return;
          try {
            const server = await uploadFile(it.file!, (p) => patch(it.key, { uploadProgress: p }));
            if (isRemoved(it.key)) {
              api(`/files/${server.id}`, { method: "DELETE" }).catch(() => {});
              return;
            }
            patch(it.key, { phase: "ready", server, uploadProgress: 1 });
          } catch (e) {
            patch(it.key, { phase: "error", error: (e as Error).message });
          }
        },
      );
    },
    [maxFileBytes, patch],
  );

  const remove = useCallback((k: string) => {
    const it = itemsRef.current.find((x) => x.key === k);
    removed.current.add(k);
    if (it?.server) api(`/files/${it.server.id}`, { method: "DELETE" }).catch(() => {});
    setItems((list) => list.filter((x) => x.key !== k));
  }, []);

  const clearAll = useCallback(() => {
    itemsRef.current.forEach((it) => removed.current.add(it.key));
    api("/files", { method: "DELETE" }).catch(() => {});
    setItems([]);
  }, []);

  // ---------------------------------------------------------------- names
  const names = useMemo(() => {
    const finals = items.map((it) =>
      withExtension(finalBase({ mode: naming.mode, original: it.originalName, custom: it.customName, webNormalize: naming.webNormalize, lowercase: naming.lowercase }), settings.format),
    );
    const active = items.map((it) => it.phase !== "error");
    const dupes = duplicateIndexes(finals.map((n, i) => (active[i] ? n : `\u0000${i}`)));
    return { finals, dupes };
  }, [items, naming, settings.format]);

  // ---------------------------------------------------------------- estimates
  const readySig = items.filter((i) => i.server && i.phase !== "error").map((i) => i.server!.id).join(",");
  const estimateGen = useRef(0);

  useEffect(() => {
    const gen = ++estimateGen.current;
    const controllers: AbortController[] = [];
    const targets = itemsRef.current.filter(
      (i) => i.server && i.phase !== "error" && !i.estimates[key] && i.server.output?.settingsKey !== key,
    );
    if (!targets.length) return;
    const n = itemsRef.current.filter((i) => i.server).length;
    // 1 image: near-live. Small batch: after the slider settles. Large batch: progressive.
    const delay = n === 1 ? 180 : n <= 30 ? 450 : 800;
    const timer = setTimeout(() => {
      pool(
        targets,
        n === 1 ? 1 : 3,
        async (it) => {
          const ctrl = new AbortController();
          controllers.push(ctrl);
          patch(it.key, { estimating: true });
          try {
            const r = await api<Estimate>(`/files/${it.server!.id}/estimate`, { method: "POST", json: { settings }, signal: ctrl.signal });
            patch(it.key, (cur) => ({ estimates: { ...cur.estimates, [key]: r }, estimating: false }));
          } catch (e) {
            if ((e as Error).name === "AbortError") return;
            if (e instanceof ApiError && e.status === 404) patch(it.key, { phase: "error", error: e.message, estimating: false });
            else patch(it.key, { estimating: false });
          }
        },
        () => estimateGen.current === gen,
      );
    }, delay);
    return () => {
      clearTimeout(timer);
      controllers.forEach((c) => c.abort());
      setItems((list) => (list.some((i) => i.estimating) ? list.map((i) => (i.estimating ? { ...i, estimating: false } : i)) : list));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, readySig]);

  // ---------------------------------------------------------------- convert
  const [progress, setProgress] = useState<{ total: number; done: number; failed: number; running: boolean } | null>(null);

  const isCurrent = useCallback((it: Item) => it.server?.output?.settingsKey === key, [key]);

  const convertable = useMemo(
    () => items.filter((it, i) => it.server && it.phase === "ready" && !names.dupes.has(i) && !isCurrent(it)),
    [items, names.dupes, isCurrent],
  );

  const convert = useCallback(async () => {
    const list = itemsRef.current;
    const targets = list
      .map((it, i) => ({ it, name: names.finals[i], dup: names.dupes.has(i) }))
      .filter(({ it, dup }) => it.server && it.phase === "ready" && !dup && it.server.output?.settingsKey !== key);
    if (!targets.length) return;
    const snapshot = settings;
    targets.forEach(({ it }) => patch(it.key, { phase: "queued", error: undefined }));
    setProgress({ total: targets.length, done: 0, failed: 0, running: true });
    await pool(targets, 3, async ({ it, name }) => {
      if (isRemoved(it.key)) return;
      patch(it.key, { phase: "processing" });
      try {
        const server = await api<ServerFile>(`/files/${it.server!.id}/convert`, {
          method: "POST",
          json: { settings: snapshot, name: name.replace(/\.[^.]+$/, "") },
        });
        patch(it.key, { phase: "ready", server });
        setProgress((p) => p && { ...p, done: p.done + 1 });
      } catch (e) {
        patch(it.key, { phase: "error", error: (e as Error).message });
        setProgress((p) => p && { ...p, done: p.done + 1, failed: p.failed + 1 });
      }
    });
    setProgress((p) => p && { ...p, running: false });
  }, [names, key, settings, patch]);

  const retry = useCallback((k: string) => patch(k, { phase: "ready", error: undefined }), [patch]);

  return { items, setItems, patch, addFiles, remove, clearAll, names, key, convert, convertable, progress, isCurrent, retry };
}
