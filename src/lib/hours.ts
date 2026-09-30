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
