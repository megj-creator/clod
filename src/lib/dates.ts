const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function tripDates(start: string, end: string): string[] {
  const out: string[] = [];
  const d = parse(start);
  const last = parse(end);
  while (d <= last && out.length < 14) {
    out.push(iso(d));
    d.setDate(d.getDate() + 1);
  }
  return out.length ? out : [start];
}

export function fmtDay(value: string) {
  const d = parse(value);
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
    long: d.toLocaleDateString("en-US", { weekday: "long" }),
    short: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  };
}

export function fmtRange(start: string, end: string): string {
  const a = parse(start);
  const b = parse(end);
  const month = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  if (a.getMonth() === b.getMonth()) return `${month(a)} ${a.getDate()}–${b.getDate()}`;
  return `${month(a)} ${a.getDate()} – ${month(b)} ${b.getDate()}`;
}

export function addDaysIso(value: string, days: number): string {
  const d = parse(value);
  d.setDate(d.getDate() + days);
  return iso(d);
}

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

export function fmtTime(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = Math.round(min % 60);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}
