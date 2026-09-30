import type { Category, Place } from "@/lib/types";

const PALETTES: Record<Category, [string, string, string]> = {
  eat: ["#2b130e", "#b9472f", "#f5b096"],
  music: ["#150f2c", "#5a3fb0", "#c4b3f5"],
  explore: ["#0b241c", "#2c7a58", "#9fdcbb"],
  family: ["#2d1f07", "#c4861b", "#f7d88e"],
  history: ["#24160c", "#8e5a34", "#ecc39a"],
};

export function PlaceImage({ place, index = 0, className = "" }: { place: Place; index?: number; className?: string }) {
  const photo = place.photos[index % Math.max(1, place.photos.length)];
  if (photo) {
    return <img className={`place-img ${className}`} src={photo.src} alt={photo.caption ?? place.name} draggable={false} loading="lazy" decoding="async" />;
  }
  return <VibeArt place={place} className={className} />;
}

// A painted "vibe postcard" for places whose licensed photos aren't in yet.
export function VibeArt({ place, className = "" }: { place: Place; className?: string }) {
  const [dark, mid, light] = PALETTES[place.category];
  const id = `va-${place.id}`;
  const initial = place.name.replace(/^The\s+/i, "").charAt(0);
  return (
    <svg className={`place-img vibe-art ${className}`} viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" role="img" aria-label={place.name}>
      <defs>
        <radialGradient id={`${id}-sun`} cx="70%" cy="30%" r="75%">
          <stop offset="0%" stopColor={light} stopOpacity="0.95" />
          <stop offset="38%" stopColor={mid} stopOpacity="0.9" />
          <stop offset="100%" stopColor={dark} />
        </radialGradient>
        <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={dark} stopOpacity="0" />
          <stop offset="100%" stopColor={dark} stopOpacity="0.85" />
        </linearGradient>
        <filter id={`${id}-grain`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0" />
          <feComposite operator="in" in2="SourceGraphic" />
        </filter>
      </defs>
      <rect width="400" height="500" fill={`url(#${id}-sun)`} />
      <g stroke={light} strokeOpacity="0.35" fill="none" strokeWidth="1.4">
        <Motif category={place.category} light={light} />
      </g>
      <text x="36" y="400" style={{ fontFamily: "var(--serif)" }} fontStyle="italic" fontSize="300" fill={light} fillOpacity="0.14">
        {initial}
      </text>
      <rect width="400" height="500" fill={`url(#${id}-fade)`} />
      <rect width="400" height="500" filter={`url(#${id}-grain)`} opacity="0.35" style={{ mixBlendMode: "overlay" }} />
    </svg>
  );
}

function Motif({ category, light }: { category: Category; light: string }) {
  switch (category) {
    case "music":
      return (
        <>
          {[40, 75, 110, 145, 180, 215, 250].map((r) => (
            <circle key={r} cx="60" cy="440" r={r} />
          ))}
        </>
      );
    case "eat":
      return (
        <>
          <circle cx="280" cy="150" r="58" fill={light} fillOpacity="0.28" stroke="none" />
          {[250, 272, 294, 316, 338].map((y, i) => (
            <path key={y} d={`M0 ${y} Q 100 ${y - 10 - i * 2} 200 ${y} T 400 ${y}`} />
          ))}
        </>
      );
    case "explore":
      return (
        <>
          <circle cx="290" cy="140" r="46" fill={light} fillOpacity="0.3" stroke="none" />
          {Array.from({ length: 34 }, (_, i) => {
            const x = 8 + i * 12;
            const h = 60 + ((i * 37) % 70);
            return <path key={i} d={`M${x} 330 q ${(i % 2 ? 6 : -6)} ${-h / 2} ${(i % 2 ? 2 : -2)} ${-h}`} />;
          })}
          <path d="M0 330 H400" />
        </>
      );
    case "history":
      return (
        <>
          {[40, 130, 220, 310].map((x) => (
            <path key={x} d={`M${x} 360 V230 a 35 35 0 0 1 70 0 V360`} />
          ))}
          <path d="M20 360 H390" />
        </>
      );
    case "family":
      return (
        <>
          {[
            [90, 150, 34],
            [170, 110, 26],
            [250, 170, 40],
            [320, 120, 22],
          ].map(([x, y, r]) => (
            <g key={x}>
              <circle cx={x} cy={y} r={r} fill={light} fillOpacity="0.18" />
              <path d={`M${x} ${y + r} q 8 40 -4 90`} />
            </g>
          ))}
        </>
      );
  }
}
