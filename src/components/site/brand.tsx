import { Link } from "@tanstack/react-router";

export const SLOGAN = "Kết nối tri thức – Kiến tạo tương lai";

/** Graduation-cap mark drawn as SVG so it stays crisp at every size. */
export function CapMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 9 3 18.5 24 28l21-9.5L24 9Z" fill="var(--site-navy)" />
      <path d="M24 9 3 18.5 24 28V9Z" fill="var(--site-blue)" />
      <path
        d="M12 23.4v8.3c0 2.8 5.4 5.3 12 5.3s12-2.5 12-5.3v-8.3L24 28.8l-12-5.4Z"
        fill="var(--site-blue)"
      />
      <path d="M41 20.2v10.3" stroke="var(--site-amber)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="41" cy="32" r="2.4" fill="var(--site-amber)" />
    </svg>
  );
}

export function SiteLogo({
  compact = false,
  to = "/",
  className = "",
}: {
  compact?: boolean;
  to?: string;
  className?: string;
}) {
  return (
    <Link to={to} className={`site-logo ${className}`} aria-label="Lớp Học Số – Trang chủ">
      <CapMark size={compact ? 30 : 36} />
      <span>
        <strong>LỚP HỌC SỐ</strong>
        {!compact && <small>{SLOGAN}</small>}
      </span>
    </Link>
  );
}

export function AuthorCredit({ className = "" }: { className?: string }) {
  return (
    <p className={`site-author ${className}`}>
      <span>
        Tác giả: <b>Đặng Vũ Cát Tường</b>
      </span>
      <span>Trường THPT Trần Văn Bảy - Cà Mau</span>
    </p>
  );
}

/**
 * Flat geometric illustration (open book with floating cards) used in the hero banners.
 * `variant` picks the cards: home shows cube · triangle · checklist, teacher shows lesson · cube · axes,
 * login shows cube · pyramid · cone.
 */
export function HeroArt({ variant }: { variant: "home" | "teacher" | "login" }) {
  return (
    <svg viewBox="0 0 520 300" className="hero-art" role="img" aria-label="Minh họa hình học">
      <defs>
        <linearGradient id={`card-${variant}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#eaf1ff" />
        </linearGradient>
        <linearGradient id={`face-${variant}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9cc0ff" />
          <stop offset="1" stopColor="#4f7fe8" />
        </linearGradient>
        <linearGradient id={`book-${variant}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dbe6fb" />
        </linearGradient>
        <filter id={`shadow-${variant}`} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="8" stdDeviation="9" floodColor="#2f5bd8" floodOpacity="0.16" />
        </filter>
      </defs>
      {/* orbit rings */}
      <ellipse cx="270" cy="200" rx="235" ry="62" fill="none" stroke="#bcd0fb" strokeWidth="1.4" />
      <ellipse
        cx="270"
        cy="190"
        rx="200"
        ry="48"
        fill="none"
        stroke="#d3e0fc"
        strokeWidth="1"
        strokeDasharray="3 6"
      />
      {/* open book */}
      <g filter={`url(#shadow-${variant})`}>
        <path d="M90 236 Q180 206 268 232 L268 262 Q180 238 90 266Z" fill="#2f5bd8" />
        <path d="M446 236 Q356 206 268 232 L268 262 Q356 238 446 266Z" fill="#2549b8" />
        <path
          d="M100 226 Q182 196 268 222 L268 252 Q182 228 100 254Z"
          fill={`url(#book-${variant})`}
        />
        <path
          d="M436 226 Q354 196 268 222 L268 252 Q354 228 436 254Z"
          fill={`url(#book-${variant})`}
        />
        {[0, 1, 2, 3].map((i) => (
          <path
            key={i}
            d={`M${122 + i * 10} ${226 - i * 3} Q190 ${206 - i * 2} 254 ${226 - i}`}
            stroke="#c9d8f6"
            fill="none"
          />
        ))}
        {[0, 1, 2, 3].map((i) => (
          <path
            key={`r${i}`}
            d={`M${414 - i * 10} ${226 - i * 3} Q346 ${206 - i * 2} 282 ${226 - i}`}
            stroke="#c9d8f6"
            fill="none"
          />
        ))}
      </g>
      {/* light beam */}
      <path d="M200 214 L268 120 L336 214Z" fill="#cfe0ff" opacity="0.35" />
      {variant === "login" ? (
        <g transform="translate(-75 -45) scale(1.28)">
          <LoginShapes />
        </g>
      ) : (
        <Cards variant={variant} />
      )}
      {/* sparkles */}
      <circle cx="120" cy="70" r="6" fill="#4f7fe8" />
      <circle cx="470" cy="60" r="4" fill="#4f7fe8" opacity="0.8" />
      <circle cx="60" cy="200" r="7" fill="#4f7fe8" opacity="0.85" />
      <path d="M488 150l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="#9cc0ff" />
    </svg>
  );
}

function Card({
  x,
  y,
  rot,
  variant,
  children,
}: {
  x: number;
  y: number;
  rot: number;
  variant: string;
  children: React.ReactNode;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`} filter={`url(#shadow-${variant})`}>
      <rect width="112" height="112" rx="16" fill={`url(#card-${variant})`} stroke="#d6e2fb" />
      {children}
    </g>
  );
}

function Cube({
  variant,
  s = 1,
  ox = 0,
  oy = 0,
}: {
  variant: string;
  s?: number;
  ox?: number;
  oy?: number;
}) {
  // front square + back square offset, hidden edges dashed
  const p = (x: number, y: number) => `${ox + x * s},${oy + y * s}`;
  return (
    <g strokeLinejoin="round">
      <polygon
        points={`${p(24, 40)} ${p(68, 40)} ${p(68, 84)} ${p(24, 84)}`}
        fill={`url(#face-${variant})`}
        opacity="0.55"
      />
      <polygon points={`${p(24, 40)} ${p(44, 24)} ${p(88, 24)} ${p(68, 40)}`} fill="#cfe0ff" />
      <polygon
        points={`${p(68, 40)} ${p(88, 24)} ${p(88, 68)} ${p(68, 84)}`}
        fill="#7ea6f2"
        opacity="0.7"
      />
      <g stroke="#2549b8" strokeWidth={1.6} fill="none">
        <polyline points={`${p(24, 40)} ${p(68, 40)} ${p(68, 84)} ${p(24, 84)} ${p(24, 40)}`} />
        <polyline points={`${p(24, 40)} ${p(44, 24)} ${p(88, 24)} ${p(68, 40)}`} />
        <polyline points={`${p(88, 24)} ${p(88, 68)} ${p(68, 84)}`} />
      </g>
      <g stroke="#2549b8" strokeWidth={1.2} strokeDasharray="4 4" fill="none">
        <polyline points={`${p(24, 84)} ${p(44, 68)} ${p(88, 68)}`} />
        <line x1={ox + 44 * s} y1={oy + 68 * s} x2={ox + 44 * s} y2={oy + 24 * s} />
      </g>
    </g>
  );
}

function Cards({ variant }: { variant: "home" | "teacher" }) {
  return (
    <>
      {variant === "home" ? (
        <>
          <Card x={118} y={82} rot={-9} variant={variant}>
            <Cube variant={variant} />
          </Card>
          <Card x={232} y={52} rot={2} variant={variant}>
            <polygon points="56,20 20,88 94,82" fill="#e3ecff" stroke="#2549b8" strokeWidth="1.6" />
            <text x="51" y="15" fontSize="12" fontWeight="700" fill="#1b2a5c">
              A
            </text>
            <text x="8" y="95" fontSize="12" fontWeight="700" fill="#1b2a5c">
              B
            </text>
            <text x="96" y="94" fontSize="12" fontWeight="700" fill="#1b2a5c">
              C
            </text>
          </Card>
          <Card x={350} y={74} rot={9} variant={variant}>
            {[0, 1, 2].map((i) => (
              <g key={i} transform={`translate(18 ${24 + i * 26})`}>
                <rect width="16" height="16" rx="4" fill="#2f5bd8" />
                <path d="M4 8l3 3 6-6" stroke="#fff" strokeWidth="2" fill="none" />
                <rect x="24" y="4" width="52" height="8" rx="4" fill="#c9d8f6" />
              </g>
            ))}
          </Card>
        </>
      ) : (
        <>
          <Card x={122} y={86} rot={-8} variant={variant}>
            {[0, 1, 2, 3, 4].map((i) => (
              <rect
                key={i}
                x="20"
                y={22 + i * 15}
                width={i === 0 ? 46 : 72 - (i % 2) * 18}
                height="7"
                rx="3.5"
                fill={i === 0 ? "#2f5bd8" : "#c9d8f6"}
              />
            ))}
          </Card>
          <Card x={236} y={50} rot={0} variant={variant}>
            <Cube variant={variant} />
          </Card>
          <Card x={352} y={78} rot={8} variant={variant}>
            <g stroke="#1b2a5c" strokeWidth="1.6" fill="none" strokeLinecap="round">
              <line x1="46" y1="70" x2="46" y2="18" />
              <line x1="46" y1="70" x2="96" y2="80" />
              <line x1="46" y1="70" x2="22" y2="94" />
              <line x1="46" y1="70" x2="86" y2="40" strokeDasharray="4 4" />
            </g>
            <text x="40" y="14" fontSize="11" fontWeight="700" fill="#1b2a5c">
              z
            </text>
            <text x="98" y="86" fontSize="11" fontWeight="700" fill="#1b2a5c">
              x
            </text>
            <text x="88" y="38" fontSize="11" fontWeight="700" fill="#1b2a5c">
              y
            </text>
          </Card>
        </>
      )}
    </>
  );
}

function LoginShapes() {
  const v = "login";
  return (
    <>
      <g filter={`url(#shadow-${v})`}>
        <Cube variant={v} s={1.35} ox={110} oy={50} />
      </g>
      {/* pyramid */}
      <g filter={`url(#shadow-${v})`}>
        <polygon points="300,40 262,118 300,134" fill="#9cc0ff" />
        <polygon points="300,40 300,134 338,112" fill="#4f7fe8" />
        <polyline points="262,118 300,134 338,112" stroke="#2549b8" strokeWidth="1.6" fill="none" />
        <line x1="262" y1="118" x2="338" y2="112" stroke="#2549b8" strokeDasharray="4 4" />
        <polyline points="262,118 300,40 338,112" stroke="#2549b8" strokeWidth="1.6" fill="none" />
        <line x1="300" y1="40" x2="300" y2="134" stroke="#2549b8" strokeWidth="1.6" />
      </g>
      {/* cone */}
      <g filter={`url(#shadow-${v})`}>
        <path d="M410 70 L370 190 A40 13 0 0 0 450 190Z" fill={`url(#face-${v})`} />
        <ellipse
          cx="410"
          cy="190"
          rx="40"
          ry="13"
          fill="none"
          stroke="#2549b8"
          strokeWidth="1.4"
          strokeDasharray="4 4"
        />
        <path d="M370 190 A40 13 0 0 0 450 190" fill="none" stroke="#2549b8" strokeWidth="1.6" />
        <polyline points="370,190 410,70 450,190" fill="none" stroke="#2549b8" strokeWidth="1.6" />
      </g>
    </>
  );
}
