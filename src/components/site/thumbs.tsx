/** Small line drawings used as lesson thumbnails. */
export function LessonThumb({
  kind,
  className = "",
}: {
  kind: "plane" | "cube" | "pyramid" | "lines";
  className?: string;
}) {
  const stroke = "var(--site-blue)";
  return (
    <svg viewBox="0 0 120 72" className={className} aria-hidden="true">
      {kind === "plane" && (
        <>
          <line
            x1="22"
            y1="16"
            x2="98"
            y2="16"
            stroke="oklch(0.72 0.18 47)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <polygon
            points="30,34 104,34 90,60 16,60"
            fill="oklch(0.9 0.05 258)"
            stroke={stroke}
            strokeWidth="1.6"
          />
          <line
            x1="28"
            y1="47"
            x2="92"
            y2="47"
            stroke={stroke}
            strokeWidth="1.6"
            strokeDasharray="4 3"
          />
        </>
      )}
      {kind === "lines" && (
        <>
          <polygon
            points="30,30 104,30 90,60 16,60"
            fill="oklch(0.92 0.04 258)"
            stroke={stroke}
            strokeWidth="1.4"
          />
          <line
            x1="18"
            y1="12"
            x2="102"
            y2="12"
            stroke="oklch(0.72 0.18 47)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <line
            x1="26"
            y1="45"
            x2="94"
            y2="45"
            stroke={stroke}
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}
      {kind === "cube" && (
        <g fill="none" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round">
          <polygon points="40,24 74,24 74,60 40,60" fill="oklch(0.92 0.04 258)" />
          <polyline points="40,24 54,12 88,12 74,24" />
          <polyline points="88,12 88,48 74,60" />
          <polyline points="40,60 54,48 88,48" strokeDasharray="3 3" />
          <line x1="54" y1="48" x2="54" y2="12" strokeDasharray="3 3" />
        </g>
      )}
      {kind === "pyramid" && (
        <g fill="none" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round">
          <polygon points="60,8 30,58 60,66" fill="oklch(0.88 0.06 258)" />
          <polygon points="60,8 60,66 92,54" fill="oklch(0.8 0.09 258)" />
          <line x1="30" y1="58" x2="92" y2="54" strokeDasharray="3 3" />
        </g>
      )}
    </svg>
  );
}
