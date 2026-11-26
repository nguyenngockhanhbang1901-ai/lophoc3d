import { LAYOUTS, type LayoutDef } from "@/lib/slides/layouts";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";

export function LayoutThumb({ layout }: { layout: LayoutDef }) {
  return (
    <div className="layout-thumb" aria-hidden="true">
      {layout.slots.map((s) => (
        <span
          key={s.id}
          data-kind={s.kind}
          style={{
            left: `${s.box.x}%`,
            top: `${s.box.y}%`,
            width: `${s.box.w}%`,
            height: `${s.box.h}%`,
          }}
        />
      ))}
    </div>
  );
}

/** "Chọn layout": used when adding a slide and when changing the layout of the current one. */
export function LayoutPicker({
  open,
  title,
  current,
  onPick,
  onClose,
}: {
  open: boolean;
  title: string;
  current?: string | undefined;
  onPick: (layoutId: string) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Đổi layout không làm mất nội dung: chữ và hình được chuyển sang ô cùng loại.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              type="button"
              aria-label={`Layout ${l.name}`}
              aria-pressed={l.id === current}
              className={`flex flex-col gap-1 rounded-md border p-2 text-left text-xs hover:border-primary ${l.id === current ? "border-primary ring-2 ring-primary" : ""}`}
              onClick={() => onPick(l.id)}
            >
              <LayoutThumb layout={l} />
              {l.name}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
