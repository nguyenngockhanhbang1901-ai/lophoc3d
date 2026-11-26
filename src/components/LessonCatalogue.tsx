import { useEffect, useState } from "react";
import { Pencil, Plus, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_LESSONS, customLessonText } from "@/lib/lessons";
import { MEDIA_KEY_PATTERNS, isMediaKey } from "@/lib/slides/media-library";
import { isSlideLessonKey } from "@/lib/slides/model";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import type { Tables } from "@/integrations/supabase/types";
export function LessonCatalogue({
  userId,
  value,
  disabled,
  onChange,
}: {
  userId?: string | undefined;
  value: string;
  disabled: boolean;
  onChange: (key: string, title: string, content: unknown) => void;
}) {
  const [lessons, setLessons] = useState<Tables<"lessons">[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const defaultKeys: readonly string[] = DEFAULT_LESSONS.map((l) => l.lesson_key);
  const items = [
    ...DEFAULT_LESSONS.map((l) => lessons.find((row) => row.lesson_key === l.lesson_key) ?? l),
    ...lessons.filter((l) => !defaultKeys.includes(l.lesson_key)),
  ];
  // The list comes straight from the lessons table (the same one Soạn bài giảng saves to), so a lesson saved there shows up here; it is read again whenever this tab regains focus.
  useEffect(() => {
    if (!userId) {
      setLessons([]);
      return;
    }
    let cancelled = false;
    const load = () => {
      void supabase
        .from("lessons")
        .select()
        // pictures and models of the slide library share the table; they are not lessons
        .not("lesson_key", "like", MEDIA_KEY_PATTERNS[0] as string)
        .not("lesson_key", "like", MEDIA_KEY_PATTERNS[1] as string)
        .order("created_at")
        .then(({ data }) => {
          if (!cancelled && data) setLessons(data.filter((l) => !isMediaKey(l.lesson_key)));
        });
    };
    load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId]);
  const current = items.find((l) => l.lesson_key === value);
  async function save() {
    if (!userId || !editing) return;
    setBusy(true);
    setError("");
    const key = editing === "new" ? crypto.randomUUID() : editing;
    const { data, error: err } = await supabase
      .from("lessons")
      .upsert(
        { owner_id: userId, lesson_key: key, title: title.trim(), content: { text } },
        { onConflict: "owner_id,lesson_key" },
      )
      .select()
      .single();
    setBusy(false);
    if (err || !data) {
      setError("Không lưu được bài học");
      return;
    }
    setLessons((rows) => [...rows.filter((r) => r.lesson_key !== key), data]);
    setEditing(null);
    onChange(key, data.title, data.content);
  }
  return (
    <div className="lesson-catalogue">
      <label className="flex items-center gap-2">
        <strong>Bài học</strong>
        <select
          aria-label="Chọn bài học"
          className="entry-select"
          value={value}
          disabled={disabled}
          onChange={(e) => {
            e.target.blur();
            const l = items.find((l) => l.lesson_key === e.target.value);
            if (l) onChange(l.lesson_key, l.title, l.content);
          }}
        >
          {items.map((l) => (
            <option key={l.lesson_key} value={l.lesson_key}>
              {l.title}
            </option>
          ))}
        </select>
      </label>
      {userId && (
        <>
          {isSlideLessonKey(value) && !disabled ? (
            <Button variant="outline" size="icon" asChild>
              <a
                href={`/soan-bai?lesson=${encodeURIComponent(value)}`}
                aria-label="Sửa bài học"
                title="Sửa trong Soạn bài giảng"
              >
                <Pencil />
              </a>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="icon"
              aria-label="Sửa bài học"
              title="Sửa bài học"
              disabled={disabled || isSlideLessonKey(value)}
              onClick={() => {
                setEditing(value);
                setTitle(current?.title ?? "");
                setText(customLessonText(current?.content));
              }}
            >
              <Pencil />
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => {
              setEditing("new");
              setTitle("");
              setText("");
            }}
          >
            <Plus />
            Thêm bài học
          </Button>
        </>
      )}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogTitle>{editing === "new" ? "Thêm bài học" : "Sửa bài học"}</DialogTitle>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label>
              Tên bài học
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={150}
              />
            </label>
            {editing === "new" || !defaultKeys.includes(editing ?? "") ? (
              <label>
                Nội dung bài học
                <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} />
              </label>
            ) : null}
            {error && (
              <p className="error-note" role="alert">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button disabled={busy || !title.trim()} type="submit">
                <Save />
                Lưu bài học
              </Button>
              <Button variant="outline" type="button" onClick={() => setEditing(null)}>
                <X />
                Hủy
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
