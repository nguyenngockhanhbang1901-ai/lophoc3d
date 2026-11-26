import { lazy, Suspense } from "react";
import { isKnownModel } from "@/lib/slides/model-library";

const GeometryView = lazy(() => import("../GeometryView"));
const LinePairView = lazy(() => import("../LinePairView"));
const CubePracticeView = lazy(() => import("../CubePracticeView"));

/** One library model, drawn by the lesson's own scene component; sized by `.slide-model3d` to fill its box. */
export function ModelView({ id }: { id: string | undefined }) {
  if (!isKnownModel(id))
    return <p className="slide-model-missing">Mô hình không có trong thư viện</p>;
  return (
    <div className="slide-model3d" data-model={id}>
      <Suspense fallback={<p className="slide-model-missing">Đang tải mô hình…</p>}>
        {id === "line-plane-cut" ? (
          <GeometryView index={0} compact />
        ) : id === "line-plane-parallel" ? (
          <GeometryView index={1} compact />
        ) : id === "line-plane-contained" ? (
          <GeometryView index={2} compact />
        ) : id === "pair-parallel" ? (
          <LinePairView kind="parallel" />
        ) : id === "pair-intersecting" ? (
          <LinePairView kind="intersecting" />
        ) : id === "pair-coincident" ? (
          <LinePairView kind="coincident" />
        ) : id === "pair-skew" ? (
          <LinePairView kind="skew" />
        ) : (
          <CubePracticeView />
        )}
      </Suspense>
    </div>
  );
}
