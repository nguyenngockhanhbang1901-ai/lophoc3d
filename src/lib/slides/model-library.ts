/** The 3D models a slide can show. Ids are stored in slides; the scenes themselves are the lesson's existing views. */
export type ModelEntry = { id: string; name: string; group: string };
export const MODEL_LIBRARY: readonly ModelEntry[] = [
  { id: "line-plane-cut", name: "Đường thẳng cắt mặt phẳng", group: "Đường thẳng và mặt phẳng" },
  {
    id: "line-plane-parallel",
    name: "Đường thẳng song song mặt phẳng",
    group: "Đường thẳng và mặt phẳng",
  },
  {
    id: "line-plane-contained",
    name: "Đường thẳng nằm trong mặt phẳng",
    group: "Đường thẳng và mặt phẳng",
  },
  { id: "pair-parallel", name: "Hai đường thẳng song song", group: "Hai đường thẳng" },
  { id: "pair-intersecting", name: "Hai đường thẳng cắt nhau", group: "Hai đường thẳng" },
  { id: "pair-coincident", name: "Hai đường thẳng trùng nhau", group: "Hai đường thẳng" },
  { id: "pair-skew", name: "Hai đường thẳng chéo nhau", group: "Hai đường thẳng" },
  { id: "cube", name: "Hình lập phương MNPQ.M′N′P′Q′", group: "Hình khối" },
  { id: "goal", name: "Khung thành bóng đá (thanh thép và mặt sân)", group: "Mô hình thực tế" },
];
export function modelName(id: string | undefined): string {
  return MODEL_LIBRARY.find((m) => m.id === id)?.name ?? "Mô hình 3D";
}
export function isKnownModel(id: string | undefined): boolean {
  return MODEL_LIBRARY.some((m) => m.id === id);
}
