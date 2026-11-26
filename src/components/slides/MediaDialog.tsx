import { useEffect, useMemo, useState } from "react";
import { Box as BoxIcon, Check, Pencil, Search, Trash2, Upload, X } from "lucide-react";
import { MODEL_LIBRARY } from "@/lib/slides/model-library";
import { matchesSearch, type MediaItem } from "@/lib/slides/media-library";
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
import {
  baseName,
  imageFileToDataUrl,
  imageThumb,
  isWebUrl,
  modelFileToDataUrl,
} from "./media-files";

export type MediaPick = { src?: string; modelId?: string; alt?: string };
export type MediaKind = "image" | "model3d";

/** What the dialog needs from the teacher's library (the editor wires it to the database). */
export type MediaLibrary = {
  list: (type: MediaKind) => Promise<MediaItem[]>;
  load: (key: string) => Promise<string>;
  save: (type: MediaKind, name: string, src: string, thumb: string) => Promise<MediaItem>;
  rename: (key: string, name: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

function LibraryItem({
  item,
  busy,
  onInsert,
  onRename,
  onRemove,
}: {
  item: MediaItem;
  busy: boolean;
  onInsert: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setName(item.name), [item.name]);
  return (
    <li className="flex flex-col gap-1 rounded-md border p-1.5" data-testid="library-item">
      <button
        type="button"
        className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded bg-muted hover:ring-2 hover:ring-primary"
        aria-label={`Chèn "${item.name}"`}
        title="Bấm để chèn vào slide"
        disabled={busy}
        onClick={onInsert}
      >
        {item.thumb ? (
          <img src={item.thumb} alt="" className="h-full w-full object-contain" />
        ) : (
          <BoxIcon className="size-8 text-primary" aria-hidden="true" />
        )}
      </button>
      {editing ? (
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onRename(name.trim());
            setEditing(false);
          }}
        >
          <Input
            aria-label="Tên mới"
            className="h-7 px-1 text-xs"
            value={name}
            maxLength={150}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Lưu tên"
          >
            <Check />
          </Button>
        </form>
      ) : confirm ? (
        <div className="flex items-center gap-1 text-xs">
          <span className="flex-1">Xóa khỏi thư viện?</span>
          <Button variant="destructive" size="sm" className="h-6 px-2 text-xs" onClick={onRemove}>
            Xóa
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            aria-label="Không xóa"
            onClick={() => setConfirm(false)}
          >
            <X />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <span className="min-w-0 flex-1 truncate text-xs" title={item.name}>
            {item.name}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            aria-label={`Đổi tên "${item.name}"`}
            onClick={() => setEditing(true)}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            aria-label={`Xóa "${item.name}"`}
            onClick={() => setConfirm(true)}
          >
            <Trash2 />
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * "Thư viện hình ảnh" / "Thư viện mô hình 3D". Pictures: the teacher's own library (upload, name,
 * search, rename, delete, click to insert) or a link. Models: the web's shared models, the
 * teacher's own .glb models, or a link.
 */
export function MediaDialog({
  kind: startKind,
  switchable = false,
  initial,
  library,
  onPick: pickAs,
  onClose,
}: {
  kind: MediaKind | null;
  /** An empty picture/model box of a layout can hold either. */
  switchable?: boolean;
  initial?: MediaPick | undefined;
  library?: MediaLibrary | undefined;
  onPick: (pick: MediaPick, kind: MediaKind) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<MediaKind | null>(startKind);
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<MediaItem[] | null>(null);

  useEffect(() => {
    setKind(startKind);
    setUrl(initial?.src && !initial.src.startsWith("data:") ? initial.src : "");
    setQuery("");
    setError("");
    setNote("");
    setBusy(false);
    // reset only when the dialog opens, not on every parent render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startKind]);

  useEffect(() => {
    if (!kind || !library) return;
    let cancelled = false;
    setItems(null);
    library
      .list(kind)
      .then((list) => !cancelled && setItems(list))
      .catch((e: unknown) => {
        if (!cancelled) {
          setItems([]);
          setError(e instanceof Error ? e.message : "Không tải được thư viện");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [kind, library]);

  const onPick = (pick: MediaPick) => kind && pickAs(pick, kind);
  const shown = useMemo(
    () => (items ?? []).filter((i) => matchesSearch(i.name, query)),
    [items, query],
  );
  const shared = MODEL_LIBRARY.filter((m) => matchesSearch(`${m.name} ${m.group}`, query));

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNote("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi, hãy thử lại");
    } finally {
      setBusy(false);
    }
  }
  function upload(files: FileList | null) {
    if (!files?.length || !kind) return;
    const list = [...files];
    void run(async () => {
      const added: MediaItem[] = [];
      for (const file of list) {
        const src =
          kind === "image" ? await imageFileToDataUrl(file) : await modelFileToDataUrl(file);
        if (!library) {
          onPick(kind === "image" ? { src, alt: baseName(file.name) } : { src });
          return;
        }
        const thumb = kind === "image" ? await imageThumb(src).catch(() => "") : "";
        added.push(await library.save(kind, baseName(file.name), src, thumb));
      }
      setItems((cur) => [...added, ...(cur ?? [])]);
      setQuery("");
      setNote(
        `Đã thêm ${added.length} ${kind === "image" ? "ảnh" : "mô hình"} vào thư viện. Bấm vào để chèn, bấm bút chì để đặt tên.`,
      );
    });
  }
  function fromUrl() {
    const link = url.trim();
    if (!isWebUrl(link)) {
      setError("Đường link phải bắt đầu bằng https://");
      return;
    }
    if (kind === "model3d" && !/\.(glb|gltf)(\?|#|$)/i.test(link)) {
      setError("Link mô hình phải trỏ tới tệp .glb hoặc .gltf");
      return;
    }
    const name =
      baseName(decodeURIComponent(link.split(/[?#]/)[0]?.split("/").pop() || "")) ||
      "Từ đường link";
    // keep the link in the library too, but never let that block inserting it
    if (library && kind)
      void library.save(kind, name, link, kind === "image" ? link : "").catch(() => {});
    onPick(kind === "image" ? { src: link, alt: name } : { src: link });
  }
  function insert(item: MediaItem) {
    if (!library) return;
    void run(async () => {
      const src = await library.load(item.key);
      onPick(kind === "image" ? { src, alt: item.name } : { src });
    });
  }

  const mine = kind === "image" ? "Ảnh của tôi" : "Mô hình của tôi";
  return (
    <Dialog open={kind !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {kind === "image" ? "Thư viện hình ảnh" : "Thư viện mô hình 3D"}
          </DialogTitle>
          <DialogDescription>
            {kind === "image"
              ? "Tải ảnh lên thư viện riêng của bạn, đặt tên, tìm lại và bấm vào ảnh để chèn vào slide."
              : "Chọn mô hình dùng chung của web, hoặc mô hình riêng của bạn (tệp .glb). Học sinh xoay được mô hình bằng chuột hoặc tay."}
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
                  setNote("");
                }}
              >
                {k === "image" ? "Hình ảnh" : "Mô hình 3D"}
              </Button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <Search
              className="absolute left-2 top-2.5 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label={kind === "image" ? "Tìm ảnh theo tên" : "Tìm mô hình theo tên"}
              className="pl-8"
              placeholder="Tìm theo tên…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
            <Upload className="size-4" aria-hidden="true" />
            {busy ? "Đang xử lý…" : kind === "image" ? "Tải ảnh lên" : "Tải tệp .glb lên"}
            <input
              type="file"
              className="sr-only"
              aria-label={kind === "image" ? "Tải ảnh lên" : "Tải tệp mô hình lên"}
              accept={kind === "image" ? "image/*" : ".glb,model/gltf-binary"}
              multiple={kind === "image"}
              disabled={busy}
              onChange={(e) => {
                upload(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {note && (
          <p className="text-sm text-emerald-700" role="status">
            {note}
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {kind === "model3d" && (
          <section aria-label="Mô hình dùng chung" className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Mô hình dùng chung của web</h3>
            {shared.length === 0 ? (
              <p className="text-sm text-muted-foreground">Không có mô hình nào khớp.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {shared.map((m) => (
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
            )}
          </section>
        )}

        {library && (
          <section aria-label={mine} className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{mine}</h3>
            {items === null ? (
              <p className="text-sm text-muted-foreground" role="status">
                Đang tải thư viện…
              </p>
            ) : shown.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {items.length === 0
                  ? kind === "image"
                    ? 'Thư viện chưa có ảnh. Bấm "Tải ảnh lên" để thêm.'
                    : "Bạn chưa có mô hình riêng."
                  : "Không có mục nào khớp."}
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {shown.map((item) => (
                  <LibraryItem
                    key={item.key}
                    item={item}
                    busy={busy}
                    onInsert={() => insert(item)}
                    onRename={(name) =>
                      void run(async () => {
                        await library.rename(item.key, name);
                        setItems((cur) =>
                          (cur ?? []).map((i) => (i.key === item.key ? { ...i, name } : i)),
                        );
                      })
                    }
                    onRemove={() =>
                      void run(async () => {
                        await library.remove(item.key);
                        setItems((cur) => (cur ?? []).filter((i) => i.key !== item.key));
                      })
                    }
                  />
                ))}
              </ul>
            )}
          </section>
        )}

        <div className="flex flex-col gap-2 border-t pt-3">
          <label className="text-sm" htmlFor="media-url">
            {kind === "image"
              ? "Hoặc dùng đường link ảnh"
              : "Hoặc dùng đường link tệp .glb / .gltf"}
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
          <p className="text-xs text-muted-foreground">
            {kind === "image"
              ? "Ảnh tải lên được thu nhỏ để lưu trong tài khoản của bạn; chỉ bạn thấy thư viện này."
              : "Tệp tải lên phải nhỏ (dưới khoảng 290 KB). Mô hình lớn hơn: đưa lên mạng rồi dán link."}
          </p>
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
