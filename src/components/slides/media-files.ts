import { MAX_IMAGE_SRC_LENGTH } from "@/lib/slides/types";

/** Pictures and models are kept inside the lesson itself, so uploads must stay small. */
export const MAX_INLINE_LENGTH = MAX_IMAGE_SRC_LENGTH - 1000;
export const MAX_MODEL_FILE_BYTES = Math.floor((MAX_INLINE_LENGTH * 3) / 4) - 100;

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Không đọc được tệp ảnh"));
    };
    img.src = url;
  });
}

/** Shrinks a picture (JPEG/WebP, max 1600 px) until it fits inside the lesson. */
export async function imageFileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Hãy chọn một tệp ảnh (PNG, JPG, …)");
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Trình duyệt không xử lý được ảnh");
  for (let side = 1600; side >= 400; side = Math.round(side * 0.75)) {
    const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.85, 0.7, 0.55]) {
      const webp = canvas.toDataURL("image/webp", q);
      const url = webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", q);
      if (url.length <= MAX_INLINE_LENGTH) return url;
    }
  }
  throw new Error("Ảnh quá lớn, hãy chọn ảnh nhỏ hơn hoặc dán đường link ảnh");
}

/** A .glb model small enough to keep inside the lesson. */
export function modelFileToDataUrl(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".glb"))
    return Promise.reject(new Error("Hãy chọn tệp mô hình .glb (hoặc dán đường link .glb/.gltf)"));
  if (file.size > MAX_MODEL_FILE_BYTES)
    return Promise.reject(
      new Error(
        `Tệp mô hình lớn quá ${Math.round(MAX_MODEL_FILE_BYTES / 1024)} KB. Hãy dán đường link tới tệp .glb thay vì tải lên.`,
      ),
    );
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result);
      resolve(raw.replace(/^data:[^;]*;/, "data:model/gltf-binary;"));
    };
    reader.onerror = () => reject(new Error("Không đọc được tệp mô hình"));
    reader.readAsDataURL(file);
  });
}

export function isWebUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** A small preview (longest side 240 px) for the library grid. */
export async function imageThumb(src: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Không đọc được ảnh"));
    i.src = src;
  });
  const scale = Math.min(1, 240 / Math.max(img.naturalWidth, img.naturalHeight, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.7);
}
/** File name without its extension, as a starting name for the library. */
export const baseName = (name: string) => name.replace(/\.[^.]+$/, "").slice(0, 150);
