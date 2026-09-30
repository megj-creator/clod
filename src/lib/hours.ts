// Turns an hours line like "Wednesday–Monday 9–4:30, closed Tuesday" into the days a place is open.
// 0 = Sunday … 6 = Saturday. Returns undefined when the text is too vague to be sure.

const D = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY = "(sun|mon|tue|wed|thu|fri|sat)[a-z]*\\.?";
const idx = (w: string) => D.indexOf(w.slice(0, 3).toLowerCase());

export function parseOpenDays(hours: string): number[] | undefined {
  const s = hours.toLowerCase().replace(/[–—]/g, "-");
  const closed = new Set<number>();
  for (const m of s.matchAll(new RegExp(`closed(?: on)?((?:\\s*(?:,|and|&)?\\s*${DAY}s?)+)`, "g"))) {
    for (const d of m[1].matchAll(new RegExp(DAY, "g"))) closed.add(idx(d[1]));
  }
  const everyDay = /\b(daily|seven days|every day|7 days)\b/.test(s);

  const open = new Set<number>();
  let found = false;
  const withoutClosed = s.replace(new RegExp(`closed(?: on)?((?:\\s*(?:,|and|&)?\\s*${DAY}s?)+)`, "g"), " ");
  for (const m of withoutClosed.matchAll(new RegExp(`\\b${DAY}\\s*(?:-|to|through|thru)\\s*${DAY}`, "g"))) {
    let a = idx(m[1]);
    const b = idx(m[2]);
    found = true;
    for (let guard = 0; guard < 7; guard++) {
      open.add(a);
      if (a === b) break;
      a = (a + 1) % 7;
    }
  }
  for (const m of withoutClosed.matchAll(new RegExp(`\\b${DAY}s?\\b`, "g"))) {
    open.add(idx(m[1]));
    found = true;
  }

  if (everyDay) return [0, 1, 2, 3, 4, 5, 6].filter((d) => !closed.has(d));
  if (!found && closed.size) return [0, 1, 2, 3, 4, 5, 6].filter((d) => !closed.has(d));
  if (!found) return undefined;
  return [...open].filter((d) => !closed.has(d)).sort();
}

export const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// OpenStreetMap opening_hours ("Mo-Fr 09:00-17:00; Sa 10:00-14:00; Su off") → open days.
// Returns undefined for anything beyond plain weekly rules (months, holidays-only, sunrise…),
// so the trip builder never trusts a guess.
const OSM_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
export function osmOpenDays(spec: string): number[] | undefined {
  const s = spec.trim();
  if (s === "24/7") return [0, 1, 2, 3, 4, 5, 6];
  const open = new Set<number>();
  let understood = false;
  for (let rule of s.split(";").map((r) => r.trim()).filter(Boolean)) {
    // Holidays aside: "PH,Sa,Su 11:00-19:00" still means weekends; a rule for holidays alone changes nothing
    rule = rule.replace(/\b(PH|SH)\s*,\s*/g, "").replace(/\s*,\s*(PH|SH)\b/g, "");
    if (/^(PH|SH)\b/.test(rule)) continue;
    if (/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|week|easter|sunrise|sunset|dawn|dusk)\b|\[|"/.test(rule)) return undefined;
    const m = rule.match(/^((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?(?:\s*,\s*(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)?\s*(.*)$/);
    if (!m) return undefined;
    const days = new Set<number>();
    if (m[1]) {
      for (const part of m[1].split(",")) {
        const [a, b] = part.split("-").map((d) => OSM_DAYS.indexOf(d.trim()));
        for (let d = a, guard = 0; guard < 7; guard++, d = (d + 1) % 7) {
          days.add(d);
          if (b === undefined || d === b) break;
        }
      }
    } else [0, 1, 2, 3, 4, 5, 6].forEach((d) => days.add(d));
    const rest = m[2].trim();
    if (/^(off|closed)$/i.test(rest)) days.forEach((d) => open.delete(d));
    else if (/^\d{1,2}:\d{2}/.test(rest) || rest === "open" || rest === "") days.forEach((d) => open.add(d));
    else return undefined;
    understood = true;
  }
  return understood ? [...open].sort() : undefined;
}

// "Mo-Fr 09:00-17:00; Su off" → "Mon–Fri 9:00–17:00 · Sun closed"
export function osmHoursText(spec: string): string {
  const names: Record<string, string> = { Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri", Sa: "Sat", Su: "Sun", PH: "holidays" };
  if (spec.trim() === "24/7") return "Open 24/7";
  return spec
    .split(";")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) =>
      r
        .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (d) => names[d])
        .replace(/,(?=[A-Z])/g, ", ")
        .replace(/\b(2[4-9]):(\d\d)\b/g, (_, h, m) => `${Number(h) - 24}:${m}`) // "26:00" (after midnight) → "2:00"
        .replace(/\b0?0:00\b/g, "midnight")
        .replace(/\b0(\d):/g, "$1:")
        .replace(/(\w)-(\w)/g, "$1–$2")
        .replace(/\b(off|closed)\b/g, "closed"),
    )
    .join(" · ")
    .slice(0, 120);
}
