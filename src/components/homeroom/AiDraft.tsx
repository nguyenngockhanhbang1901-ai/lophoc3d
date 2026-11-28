// Shared AI pieces for the homeroom pages: the teacher's Gemini key (same browser storage as the
// lesson AI), one call helper with the browser fallback, and a draft dialog the teacher edits.
import { useCallback, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, KeyRound, Printer, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AI_KEY_STORAGE } from "@/components/LessonAiKey";
import { writeWithAi } from "@/lib/homeroom/ai.functions";
import { requestHomeroomAi, type AiResult, type AiTask } from "@/lib/homeroom/ai";
import { printTable } from "./sheets";

function storedKey(): string {
  try {
    return localStorage.getItem(AI_KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

/** The teacher's Gemini key and a `run` that relays through the server (browser retry on location refusal). */
export function useHomeroomAi() {
  const relay = useServerFn(writeWithAi);
  const [apiKey, setApiKey] = useState(storedKey);
  const [saved, setSaved] = useState(() => !!storedKey());
  const save = useCallback(
    (remember: boolean) => {
      try {
        if (remember && apiKey.trim()) localStorage.setItem(AI_KEY_STORAGE, apiKey.trim());
        else if (!remember) localStorage.removeItem(AI_KEY_STORAGE);
        setSaved(remember && !!apiKey.trim());
      } catch {
        /* storage blocked */
      }
    },
    [apiKey],
  );
  const run = useCallback(
    async (task: AiTask, prompt: string): Promise<AiResult> => {
      const key = apiKey.trim();
      if (!key) return { text: "", error: "Hãy nhập API key Gemini trước." };
      const first = await relay({ data: { apiKey: key, task, prompt } }).catch((): AiResult => ({
        text: "",
        error: "Không gửi được yêu cầu. Hãy thử lại.",
      }));
      return first.locationBlocked ? requestHomeroomAi(key, task, prompt) : first;
    },
    [apiKey, relay],
  );
  return { apiKey, setApiKey: (v: string) => (setApiKey(v), setSaved(false)), saved, save, run };
}

export type HomeroomAi = ReturnType<typeof useHomeroomAi>;

export function AiKeyField({ ai }: { ai: HomeroomAi }) {
  if (ai.saved) return null;
  return (
    <div className="grid gap-1 rounded-lg border border-dashed p-2 text-sm">
      <label className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-muted-foreground" />
        <Input
          type="password"
          autoComplete="off"
          placeholder="API key Gemini (Google AI Studio)"
          value={ai.apiKey}
          onChange={(e) => ai.setApiKey(e.target.value)}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={!ai.apiKey.trim()}
          onClick={() => ai.save(true)}
        >
          Lưu trên máy này
        </Button>
      </label>
      <p className="text-xs text-muted-foreground">
        Dùng cùng khóa với “Gửi AI” trong bài giảng. Khóa chỉ lưu trong trình duyệt này, không lưu
        lên máy chủ.
      </p>
    </div>
  );
}

/**
 * A titled draft: the teacher presses "Tạo bằng AI", edits the text, then copies, prints or uses it.
 * Nothing is saved unless `onUse` is given and pressed.
 */
export function AiDraftDialog({
  title,
  description,
  task,
  buildPrompt,
  finish,
  onUse,
  useLabel = "Dùng nội dung này",
  onClose,
}: {
  title: string;
  description: string;
  task: AiTask;
  buildPrompt: () => Promise<string> | string;
  finish?: (text: string) => string;
  onUse?: (text: string) => Promise<void> | void;
  useLabel?: string;
  onClose: () => void;
}) {
  const ai = useHomeroomAi();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const r = await ai.run(task, await buildPrompt());
      if (r.error) setError(r.error);
      else setText(finish ? finish(r.text) : r.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi, hãy thử lại");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" /> {title}
        </DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <AiKeyField ai={ai} />
        {text ? (
          <Textarea
            rows={14}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="text-sm leading-relaxed"
          />
        ) : (
          <p className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
            AI chỉ nhận số liệu, không nhận họ tên học sinh, dân tộc hay ghi chú riêng. Bản nháp
            hiện ở đây để thầy/cô sửa trước khi dùng.
          </p>
        )}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          {text ? (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  void navigator.clipboard?.writeText(text).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
              >
                <Copy /> {copied ? "Đã sao chép" : "Sao chép"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  if (
                    !printTable(
                      title,
                      "",
                      [title],
                      text
                        .split("\n")
                        .filter(Boolean)
                        .map((l) => [l]),
                    )
                  )
                    setError("Trình duyệt đã chặn cửa sổ in.");
                }}
              >
                <Printer /> In
              </Button>
            </>
          ) : null}
          <Button
            variant={text ? "outline" : "default"}
            disabled={busy || !ai.apiKey.trim()}
            onClick={() => void generate()}
          >
            {text ? <RefreshCw /> : <Sparkles />}
            {busy ? "AI đang viết…" : text ? "Viết lại" : "Tạo bằng AI"}
          </Button>
          {onUse && text ? (
            <Button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void Promise.resolve(onUse(text.trim())).finally(() => setBusy(false));
              }}
            >
              {useLabel}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
