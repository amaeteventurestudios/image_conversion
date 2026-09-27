export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
export const onUnauthorized = (fn: Listener) => {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
};

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: "same-origin",
      ...rest,
      headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...rest.headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("Network connection interrupted. Check your connection and try again.", 0);
  }
  const data = res.headers.get("content-type")?.includes("json") ? await res.json().catch(() => ({})) : {};
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/auth/login") && !path.startsWith("/auth/me")) unauthorizedListeners.forEach((l) => l());
    throw new ApiError((data as { error?: string }).error ?? `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

export interface ServerFile {
  id: string;
  originalName: string;
  size: number;
  format: string;
  width: number;
  height: number;
  pages: number;
  hasAlpha: boolean;
  metadata: { exif: boolean; icc: boolean; xmp: boolean; iptc: boolean };
  createdAt: number;
  output: { size: number; width: number; height: number; format: string; settingsKey: string; name: string } | null;
}

/** Upload one file with progress (fetch cannot report upload progress). */
export function uploadFile(file: File, onProgress: (p: number) => void, signal?: AbortSignal): Promise<ServerFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/files");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response);
      else {
        if (xhr.status === 401) unauthorizedListeners.forEach((l) => l());
        reject(new ApiError(xhr.response?.error ?? `Upload failed (${xhr.status})`, xhr.status));
      }
    };
    xhr.onerror = () => reject(new ApiError("Network connection interrupted during upload.", 0));
    signal?.addEventListener("abort", () => xhr.abort());
    const fd = new FormData();
    fd.append("file", file, file.name);
    xhr.send(fd);
  });
}

/** Trigger a browser download of a same-origin URL without navigating away. */
export function triggerDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
