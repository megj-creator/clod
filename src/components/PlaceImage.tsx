import type { Category, Place } from "@/lib/types";

// Sky top → horizon, sun, water, silhouette ink
const PALETTES: Record<Category, { sky: [string, string, string]; sun: string; water: string; ink: string }> = {
  eat: { sky: ["#3a1830", "#c9503b", "#f6b37a"], sun: "#ffe0a3", water: "#2a1224", ink: "#1a0b16" },
  music: { sky: ["#140f33", "#4b3aa3", "#d08fc4"], sun: "#ffd6e8", water: "#120c28", ink: "#0a0719" },
  explore: { sky: ["#0f2e3a", "#2f8a78", "#f2d39a"], sun: "#fff1c9", water: "#0c2530", ink: "#061518" },
  family: { sky: ["#2b4a78", "#e0876a", "#ffd88f"], sun: "#fff4d2", water: "#1f3456", ink: "#101b30" },
  history: { sky: ["#241623", "#8a4f3a", "#e9b98a"], sun: "#ffe4bd", water: "#1e1219", ink: "#110a0e" },
};

export function PlaceImage({ place, index = 0, className = "" }: { place: Place; index?: number; className?: string }) {
  const photo = place.photos[index % Math.max(1, place.photos.length)];
  if (photo) {
    return <img className={`place-img ${className}`} src={photo.src} alt={photo.caption ?? place.name} draggable={false} loading="lazy" decoding="async" />;
  }
  return <VibeArt place={place} className={className} />;
}

// Seeded variety so each poster looks a little different.
const seed = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

// A vintage Lowcountry travel poster for places whose licensed photos aren't in yet.
export function VibeArt({ place, className = "" }: { place: Place; className?: string }) {
  const base = PALETTES[place.category];
  const h = seed(place.id);
  const id = `va-${place.id}`;
  // Each place gets its own time of day: dusk, night, or morning
  const scene = (["dusk", "night", "morning"] as const)[h % 3];
  const p =
    scene === "night"
      ? { ...base, sky: ["#05071a", base.sky[0], base.sky[1]] as [string, string, string], water: "#070918" }
      : scene === "morning"
        ? { ...base, sky: ["#8fb7cf", base.sky[2], base.sun] as [string, string, string], water: base.sky[1] }
        : base;
  const sunX = 230 + (h % 90);
  const sunY = scene === "morning" ? 150 + (h % 40) : scene === "night" ? 120 + (h % 40) : 250 - (h % 50);
  const treeX = h % 2 ? 78 : 322;
  const flip = h % 2 ? 1 : -1;
  const horizon = 338;

  const fronds = Array.from({ length: 11 }, (_, i) => {
    const a = (-175 + i * 17 + ((h >> i) % 7)) * (Math.PI / 180);
    const len = 58 + ((h >> (i + 2)) % 26);
    const ex = Math.cos(a) * len;
    const ey = Math.sin(a) * len * 0.8 + len * 0.35; // droop
    const cx = Math.cos(a) * len * 0.55;
    const cy = Math.sin(a) * len * 0.75 - 6;
    return `M0 0 Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
  });

  return (
    <svg className={`place-img vibe-art ${className}`} viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`${place.name} (illustration)`}>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.sky[0]} />
          <stop offset="55%" stopColor={p.sky[1]} />
          <stop offset="100%" stopColor={p.sky[2]} />
        </linearGradient>
        <linearGradient id={`${id}-water`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.sky[1]} stopOpacity="0.55" />
          <stop offset="100%" stopColor={p.water} />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={p.sun} stopOpacity="0.55" />
          <stop offset="100%" stopColor={p.sun} stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-sunclip`}>
          <rect x="0" y="0" width="400" height={horizon} />
        </clipPath>
        <filter id={`${id}-grain`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .5 0" />
          <feComposite operator="in" in2="SourceGraphic" />
        </filter>
      </defs>

      {/* sky */}
      <rect width="400" height={horizon} fill={`url(#${id}-sky)`} />
      <circle cx={sunX} cy={sunY} r="150" fill={`url(#${id}-glow)`} />
      {scene === "night" &&
        Array.from({ length: 46 }, (_, i) => {
          const sx = (h * (i + 3) * 37) % 400;
          const sy = (h * (i + 7) * 13) % 230;
          return <circle key={i} cx={sx} cy={sy} r={i % 7 === 0 ? 1.6 : 0.9} fill="#fff" opacity={0.35 + ((i * 17) % 50) / 100} />;
        })}
      {scene !== "night" && (
        // crescent moon (a nod to the SC flag)
        <g transform={`translate(${treeX === 78 ? 330 : 70} 70)`} opacity={scene === "morning" ? 0.5 : 0.85}>
          <mask id={`${id}-cres`}>
            <circle r="16" fill="#fff" />
            <circle r="15" cx="7" cy="-5" fill="#000" />
          </mask>
          <circle r="16" fill={p.sun} mask={`url(#${id}-cres)`} />
        </g>
      )}
      {scene === "night" ? (
        // big palmetto-flag crescent moon, cut with a mask so the sky shows through
        <g>
          <mask id={`${id}-moon`}>
            <circle cx={sunX} cy={sunY} r="46" fill="#fff" />
            <circle cx={sunX + 20} cy={sunY - 12} r="42" fill="#000" />
          </mask>
          <circle cx={sunX} cy={sunY} r="46" fill={p.sun} mask={`url(#${id}-moon)`} />
        </g>
      ) : (
        // striped retro sun, setting into (or rising from) the horizon
        <g clipPath={`url(#${id}-sunclip)`}>
          <circle cx={sunX} cy={sunY} r={scene === "morning" ? 52 : 74} fill={p.sun} />
          {(scene === "morning" ? [0, 1] : [0, 1, 2, 3, 4]).map((i) => (
            <rect key={i} x={sunX - 80} y={sunY + (scene === "morning" ? 22 : 14) + i * 13} width="160" height={3 + i * 1.6} fill={p.sky[1]} opacity="0.9" />
          ))}
        </g>
      )}

      {/* water with the sun's reflection */}
      <rect y={horizon} width="400" height={500 - horizon} fill={`url(#${id}-water)`} />
      {Array.from({ length: 9 }, (_, i) => {
        const w = 110 - i * 11;
        return <rect key={i} x={sunX - w / 2 + ((i * 7) % 11) - 5} y={horizon + 8 + i * 15} width={w} height="2.5" rx="1.25" fill={p.sun} opacity={0.55 - i * 0.05} />;
      })}

      {/* marsh grass along the horizon */}
      <path
        d={
          `M0 ${horizon} ` +
          Array.from({ length: 80 }, (_, i) => {
            const x = i * 5.2;
            const tall = 6 + ((h >> (i % 20)) % 14);
            return `L${x.toFixed(1)} ${horizon - tall} L${(x + 2.6).toFixed(1)} ${horizon}`;
          }).join(" ") +
          ` L400 ${horizon} L400 ${horizon + 4} L0 ${horizon + 4} Z`
        }
        fill={p.ink}
      />
      <Accent category={place.category} ink={p.ink} horizon={horizon} h={h} />

      {/* palmetto */}
      <g transform={`translate(${treeX} 0) scale(${flip} 1)`}>
        <path d={`M-6 ${horizon + 4} C -2 ${horizon - 70}, 6 ${horizon - 140}, 18 196`} stroke={p.ink} strokeWidth="9" fill="none" strokeLinecap="round" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <path key={i} d={`M${-4 + i * 3} ${horizon - 10 - i * 20} l 8 -3`} stroke={p.sky[1]} strokeOpacity="0.35" strokeWidth="1.5" />
        ))}
        <g transform="translate(18 196)" stroke={p.ink} strokeWidth="5.5" strokeLinecap="round" fill="none">
          {fronds.map((d, i) => (
            <path key={i} d={d} />
          ))}
          <circle r="7" fill={p.ink} stroke="none" />
        </g>
      </g>

      <rect width="400" height="500" filter={`url(#${id}-grain)`} opacity="0.4" style={{ mixBlendMode: "overlay" }} />
    </svg>
  );
}

function Accent({ category, ink, horizon, h }: { category: Category; ink: string; horizon: number; h: number }) {
  const x = 150 + (h % 60);
  switch (category) {
    case "history": // ruined arches on the horizon
      return (
        <g fill={ink}>
          {[0, 1, 2, 3].map((i) => (
            <path key={i} d={`M${x + i * 34} ${horizon} v-44 a13 13 0 0 1 26 0 v44 h-6 v-38 a7 7 0 0 0 -14 0 v38 z`} />
          ))}
        </g>
      );
    case "eat": // shack on stilts with a lit window
      return (
        <g>
          <path d={`M${x} ${horizon - 30} l28 -18 l28 18 v22 h-56 z`} fill={ink} />
          <rect x={x + 22} y={horizon - 24} width="12" height="10" fill="#ffd79c" opacity="0.9" />
          {[4, 20, 36, 52].map((d) => (
            <rect key={d} x={x + d} y={horizon - 8} width="3" height="14" fill={ink} />
          ))}
        </g>
      );
    case "music": // string lights
      return (
        <g>
          <path d={`M${x - 60} ${horizon - 70} Q ${x + 20} ${horizon - 40} ${x + 110} ${horizon - 78}`} stroke={ink} strokeWidth="1.5" fill="none" />
          {Array.from({ length: 9 }, (_, i) => {
            const t = i / 8;
            const bx = (1 - t) ** 2 * (x - 60) + 2 * (1 - t) * t * (x + 20) + t ** 2 * (x + 110);
            const by = (1 - t) ** 2 * (horizon - 70) + 2 * (1 - t) * t * (horizon - 40) + t ** 2 * (horizon - 78);
            return <circle key={i} cx={bx} cy={by + 4} r="3.2" fill="#ffe7a8" opacity="0.95" />;
          })}
        </g>
      );
    case "family": // kite
      return (
        <g transform={`translate(${x + 40} 120) rotate(-12)`}>
          <path d="M0 -26 L18 0 L0 30 L-18 0 Z" fill="#ffd79c" opacity="0.9" />
          <path d="M0 -26 V30 M-18 0 H18" stroke={ink} strokeOpacity="0.4" strokeWidth="1.2" />
          <path d="M0 30 q 10 30 -8 60 q -14 26 6 58" stroke={ink} strokeOpacity="0.5" strokeWidth="1.2" fill="none" />
        </g>
      );
    case "explore": // pelicans
      return (
        <g stroke={ink} strokeWidth="2.4" fill="none" strokeLinecap="round">
          {[0, 1, 2].map((i) => (
            <path key={i} d={`M${x + i * 26} ${150 + i * 12} q 7 -7 13 0 q 6 -7 13 0`} />
          ))}
        </g>
      );
  }
}
