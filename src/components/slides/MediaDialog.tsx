import { useEffect, useState } from "react";
import { Box as BoxIcon, Upload } from "lucide-react";
import { MODEL_LIBRARY } from "@/lib/slides/model-library";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { imageFileToDataUrl, isWebUrl, modelFileToDataUrl } from "./media-files";

export type MediaPick = { src?: string; modelId?: string; alt?: string };

/**
 * Picks a picture (link or file from the computer) or a 3D model (from the web's own library,
 * or the teacher's .glb/.gltf by link or small file).
 */
export type MediaKind = "image" | "model3d";
export function MediaDialog({
  kind: startKind,
  switchable = false,
  initial,
  onPick: pickAs,
  onClose,
}: {
  kind: MediaKind | null;
  /** An empty picture/model box of a layout can hold either. */
  switchable?: boolean;
  initial?: MediaPick | undefined;
  onPick: (pick: MediaPick, kind: MediaKind) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<MediaKind | null>(startKind);
  useEffect(() => setKind(startKind), [startKind]);
  const onPick = (pick: MediaPick) => kind && pickAs(pick, kind);
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!kind) return;
    setUrl(initial?.src && !initial.src.startsWith("data:") ? initial.src : "");
    setAlt(initial?.alt ?? "");
    setError("");
    setBusy(false);
    // reset only when the dialog opens, not on every parent render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startKind]);

  async function fromFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const src =
        kind === "image" ? await imageFileToDataUrl(file) : await modelFileToDataUrl(file);
      onPick(kind === "image" ? { src, alt: alt || file.name.replace(/\.[^.]+$/, "") } : { src });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đọc được tệp");
    } finally {
      setBusy(false);
    }
  }
  function fromUrl() {
    if (!isWebUrl(url)) {
      setError("Đường link phải bắt đầu bằng https://");
      return;
    }
    if (kind === "model3d" && !/\.(glb|gltf)(\?|#|$)/i.test(url.trim())) {
      setError("Link mô hình phải trỏ tới tệp .glb hoặc .gltf");
      return;
    }
    onPick(kind === "image" ? { src: url.trim(), alt } : { src: url.trim() });
  }

  return (
    <Dialog open={kind !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{kind === "image" ? "Chèn hình ảnh" : "Chèn mô hình 3D"}</DialogTitle>
          <DialogDescription>
            {kind === "image"
              ? "Chọn ảnh từ máy (ảnh được thu nhỏ để lưu trong bài) hoặc dán đường link ảnh."
              : "Chọn mô hình có sẵn của web, hoặc dùng mô hình của bạn (tệp .glb)."}
          </DialogDescription>
        </DialogHeader>
        {switchable && (
          <div className="flex gap-2" role="group" aria-label="Loại nội dung">
            {(["image", "model3d"] as MediaKind[]).map((k) => (
              <Button
                key={k}
                size="sm"
                variant={kind === k ? "default" : "outline"}
                aria-pressed={kind === k}
                onClick={() => {
                  setKind(k);
                  setError("");
                }}
              >
                {k === "image" ? "Hình ảnh" : "Mô hình 3D"}
              </Button>
            ))}
          </div>
        )}

        {kind === "model3d" && (
          <section aria-label="Thư viện mô hình" className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Thư viện của web</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {MODEL_LIBRARY.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`flex items-start gap-2 rounded-md border p-2 text-left text-sm hover:border-primary ${initial?.modelId === m.id ? "border-primary ring-2 ring-primary" : ""}`}
                  onClick={() => onPick({ modelId: m.id })}
                >
                  <BoxIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>
                    {m.name}
                    <span className="block text-xs text-muted-foreground">{m.group}</span>
                  </span>
                </button>
              ))}
            </div>
            <h3 className="mt-2 text-sm font-semibold">Mô hình của bạn</h3>
          </section>
        )}

        <div className="flex flex-col gap-2">
          <label className="text-sm" htmlFor="media-url">
            {kind === "image" ? "Đường link ảnh" : "Đường link tệp .glb / .gltf"}
          </label>
          <div className="flex gap-2">
            <Input
              id="media-url"
              value={url}
              placeholder="https://…"
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") fromUrl();
              }}
            />
            <Button variant="outline" onClick={fromUrl} disabled={!url.trim()}>
              Dùng link
            </Button>
          </div>
          {kind === "image" && (
            <>
              <label className="text-sm" htmlFor="media-alt">
                Mô tả ảnh (không bắt buộc)
              </label>
              <Input
                id="media-alt"
                value={alt}
                maxLength={200}
                onChange={(e) => setAlt(e.target.value)}
              />
            </>
          )}
          <label className="mt-1 inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
            <Upload className="size-4" aria-hidden="true" />
            {busy ? "Đang xử lý…" : kind === "image" ? "Chọn ảnh từ máy" : "Chọn tệp .glb từ máy"}
            <input
              type="file"
              className="sr-only"
              aria-label={kind === "image" ? "Chọn ảnh từ máy" : "Chọn tệp mô hình từ máy"}
              accept={kind === "image" ? "image/*" : ".glb,model/gltf-binary"}
              disabled={busy}
              onChange={(e) => {
                void fromFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {kind === "model3d" && (
            <p className="text-xs text-muted-foreground">
              Tệp tải lên được lưu ngay trong bài nên phải nhỏ (dưới khoảng 290 KB). Mô hình lớn
              hơn: đưa lên mạng rồi dán link.
            </p>
          )}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Hủy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
