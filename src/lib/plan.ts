import { tripDates, toMinutes, fmtTime } from "./dates";
import { driveBetween, driveFromStay, formatDrive, formatTravel, milesBetween, type TravelCtx } from "./geo";
import { WEEKDAY } from "./hours";
import type { BestTime, City, Place, Stay, TripSetup } from "./types";
import type { Weather } from "./weather";

type Slot = "morning" | "lateMorning" | "lunch" | "napDrive" | "afternoon" | "lateAfternoon" | "sunset" | "dinner" | "evening";

export type PlaceStop = {
  kind: "place";
  place: Place;
  time: number;
  driveFromPrev: number;
  notes: string[];
};
export type NapStop = { kind: "nap"; time: number; end: number; text: string };
export type PlanStop = PlaceStop | NapStop;
export type PlanDay = { date: string; weather: Weather; area: string; stops: PlanStop[]; tip: string };

const PREFS: Record<BestTime, Slot[]> = {
  morning: ["morning", "lateMorning", "afternoon", "lateAfternoon"],
  afternoon: ["afternoon", "lateAfternoon", "lateMorning", "morning"],
  sunset: ["sunset", "lateAfternoon", "evening"],
  dinner: ["dinner", "lunch", "evening"],
  evening: ["evening", "sunset", "dinner"],
  anytime: ["lateMorning", "morning", "afternoon", "lateAfternoon", "lunch"],
};
const RIGIDITY: Record<BestTime, number> = { sunset: 0, dinner: 1, evening: 2, morning: 3, afternoon: 4, anytime: 5 };

// Groups saved places into days by proximity, then fits each day around meals,
// sunset, and the nap window. Deterministic: same inputs → same plan.
export function buildPlan(opts: {
  places: Place[];
  setup: TripSetup;
  stay: Stay;
  city: City;
  forecast: Record<string, Weather>;
  ctx?: TravelCtx;
  sunsets?: Record<string, string>; // date → "HH:MM", computed for the destination
}): PlanDay[] {
  const { places, setup, stay, city, forecast, ctx, sunsets } = opts;
  const driving = ctx?.mode !== "walk";
  const dates = tripDates(setup.start, setup.end);
  const kids = setup.toddler || setup.baby;
  const tipFor = (i: number) => city.gettingAround[i % Math.max(1, city.gettingAround.length)] ?? "";
  const days: PlanDay[] = dates.map((date, i) => ({ date, weather: forecast[date], area: "", stops: [], tip: tipFor(i) }));
  if (!places.length) return days;

  // 1. How many days to use. Lighter days with little ones.
  const perDay = kids ? 2.5 : 3.5;
  const isMeal = (p: Place) => p.category === "eat";
  const meals = places.filter(isMeal).length;
  // Enough days that nobody eats two dinners in one evening (max lunch + dinner per day).
  const k = Math.min(dates.length, places.length, Math.max(1, Math.ceil(places.length / perDay), Math.ceil(meals / 2)));

  // 2. Seed clusters with the places farthest apart, then assign by distance with a cap.
  const loc = (p: Place) => p.location;
  const seeds: Place[] = [];
  const farthestFrom = (pts: { lat: number; lng: number }[]) =>
    places
      .filter((p) => !seeds.includes(p))
      .map((p) => ({ p, d: Math.min(...pts.map((q) => milesBetween(loc(p), q))) }))
      .sort((a, b) => b.d - a.d)[0].p;
  seeds.push(farthestFrom([stay]));
  while (seeds.length < k) seeds.push(farthestFrom(seeds.map(loc)));

  const cap = Math.ceil(places.length / k) + (kids ? 0 : 1);
  const clusters: Place[][] = seeds.map(() => []);
  const order = places
    .map((p) => {
      const ds = seeds.map((s) => milesBetween(loc(p), loc(s)));
      const sorted = [...ds].sort((a, b) => a - b);
      return { p, ds, gap: (sorted[1] ?? 0) - sorted[0] };
    })
    .sort((a, b) => b.gap - a.gap);
  for (const { p, ds } of order) {
    const byDistance = ds.map((d, i) => ({ d, i })).sort((a, b) => a.d - b.d);
    const roomy = ({ i }: { i: number }) =>
      clusters[i].length < cap && (!isMeal(p) || clusters[i].filter(isMeal).length < 2);
    const choice = byDistance.find(roomy) ?? byDistance.find(({ i }) => clusters[i].length < cap) ?? byDistance[0];
    clusters[choice.i].push(p);
  }

  // 3. Decide which group goes on which day. Search the options and pick the one with
  //    no place on a day it's closed (verified hours), outdoor plans off rainy days,
  //    and busy days spread out with little ones.
  const ideal = k === 1 ? [0] : Array.from({ length: k }, (_, i) => Math.round((i * (dates.length - 1)) / (k - 1)));
  const groups = [...clusters].sort((a, b) => avgMiles(a, stay) - avgMiles(b, stay));
  const weekday = (d: string) => new Date(`${d}T12:00:00`).getDay();
  const cost = (g: Place[], dayIdx: number, order: number) => {
    const d = dates[dayIdx];
    const closed = g.filter((p) => p.openDays && !p.openDays.includes(weekday(d))).length;
    const wet = forecast[d]?.kind === "rain" ? g.filter((p) => !p.indoor).length : 0;
    return closed * 100 + wet * 3 + (ideal.includes(dayIdx) ? 0 : 1) + order * 0.01 * dayIdx;
  };
  const candidates = dates.length <= 8 ? dates.map((_, i) => i) : ideal;
  let best: number[] = ideal;
  let bestCost = Infinity;
  const pick = (gi: number, used: number[], total: number) => {
    if (total >= bestCost) return;
    if (gi === groups.length) {
      bestCost = total;
      best = [...used];
      return;
    }
    for (const di of candidates) if (!used.includes(di)) pick(gi + 1, [...used, di], total + cost(groups[gi], di, gi));
  };
  pick(0, [], 0);
  groups.forEach((g, n) => {
    days[best[n]].stops = scheduleDay(g, dates[best[n]]);
    days[best[n]].area = areaName(g);
  });

  return days;

  // ── helpers ──
  function scheduleDay(group: Place[], date: string): PlanStop[] {
    const dow = new Date(`${date}T12:00:00`).getDay();
    const napS = toMinutes(setup.napStart);
    const napE = toMinutes(setup.napEnd);
    const sunset = toMinutes(sunsets?.[date] ?? city.sunset);
    const T: Record<Slot, number> = {
      morning: kids ? 540 : 570,
      lateMorning: kids ? 645 : 660,
      lunch: kids ? 705 : 750,
      napDrive: napS,
      afternoon: kids ? napE + 30 : 840,
      lateAfternoon: kids ? napE + 105 : 960,
      sunset: sunset - 40,
      dinner: kids ? 1050 : 1155,
      evening: kids ? 1140 : 1260,
    };
    const used = new Set<Slot>();
    const mealsUsed = new Set<"lunch" | "dinner">();
    const stops: PlaceStop[] = [];
    let napInCar = false;

    const sorted = [...group].sort((a, b) => RIGIDITY[a.bestTime] - RIGIDITY[b.bestTime]);
    for (const p of sorted) {
      const fromStay = driveFromStay(city, stay, p, ctx).min;
      const notes: string[] = [];
      let time: number;

      const flexible = !isMeal(p) && ["morning", "afternoon", "anytime"].includes(p.bestTime);
      // A long drive can double as a car nap (only when there's a car)
      if (driving && kids && fromStay > 35 && flexible && !used.has("napDrive")) {
        used.add("napDrive");
        napInCar = true;
        time = napS + fromStay;
        notes.push(`Leave at ${fmtTime(napS)}. The ${formatDrive(fromStay)} drive doubles as nap time.`);
      } else if (isMeal(p)) {
        // Restaurants take a meal: dinner (or a sunset dinner) first, lunch if dinner's taken.
        const wantsEvening = ["dinner", "sunset", "evening"].includes(p.bestTime);
        const dinnerSlot: Slot = p.bestTime === "sunset" && !used.has("sunset") ? "sunset" : "dinner";
        const slot: Slot = wantsEvening && !mealsUsed.has("dinner") ? dinnerSlot : !mealsUsed.has("lunch") ? "lunch" : dinnerSlot;
        mealsUsed.add(slot === "lunch" ? "lunch" : "dinner");
        used.add(slot);
        time = T[slot];
      } else {
        const slot =
          PREFS[p.bestTime].find((s) => !used.has(s)) ??
          (["lateAfternoon", "afternoon", "lateMorning", "morning", "lunch", "evening"] as Slot[]).find((s) => !used.has(s)) ??
          "evening";
        used.add(slot);
        time = T[slot];
      }
      if (p.openDays && !p.openDays.includes(dow))
        notes.push(`⚠️ Closed ${WEEKDAY[dow]}s, per ${p.realityCheck.lastChecked ? "the official site" : "OpenStreetMap"}. Move this to another day.`);
      if (kids && p.kidFit.score === 1) notes.push("Best for grown-ups. Go early, or take turns.");
      if (kids && time >= 1170) notes.push("Late for little ones.");
      stops.push({ kind: "place", place: p, time, driveFromPrev: 0, notes });
    }

    stops.sort((a, b) => a.time - b.time);
    stops.forEach((s, i) => {
      const prev = i === 0 ? stay : stops[i - 1].place.location;
      s.driveFromPrev =
        i === 0 ? driveFromStay(city, stay, s.place, ctx).min : driveBetween(city, { id: stops[i - 1].place.id, ...prev }, s.place, ctx);
      // Never start before the last stop is over and you've had time to get here (to the next quarter hour)
      if (i > 0) {
        const p = stops[i - 1];
        const ready = Math.ceil((p.time + p.place.durationMin + s.driveFromPrev) / 15) * 15;
        if (s.time < ready) s.time = ready;
      }
    });

    const all: PlanStop[] = [...stops];
    if (kids && !napInCar) {
      const before = stops.filter((s) => s.time < napS).pop();
      const back = before ? driveFromStay(city, stay, before.place, ctx) : null;
      all.push({
        kind: "nap",
        time: napS,
        end: napE,
        text: back
          ? `Head back to ${setup.hotelName || stay.name} (${formatTravel(back.min, back.how)}), or try a ${driving ? "stroller or car" : "stroller"} nap.`
          : "Protected quiet time back at your stay.",
      });
      all.sort((a, b) => a.time - b.time);
    }
    return all;
  }
}

function avgMiles(group: Place[], stay: Stay) {
  return group.reduce((s, p) => s + milesBetween(p.location, stay), 0) / Math.max(1, group.length);
}
function areaName(group: Place[]) {
  const counts: Record<string, number> = {};
  for (const p of group) {
    const n = p.neighborhood.split(" · ")[0];
    counts[n] = (counts[n] ?? 0) + 1;
  }
  const names = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([n]) => n);
  return names.slice(0, 2).join(" & ");
}
