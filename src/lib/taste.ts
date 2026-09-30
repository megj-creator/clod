import type { Place, Taste } from "./types";

// A tiny, transparent "learns what you like" model.
// Every save, pass, and reason nudges a few numbers. No AI needed for this part.

export const emptyTaste = (): Taste => ({ tags: {}, cats: {}, depth: 0, price: 0, distance: 0, kid: 0, signals: 0 });

export const REASONS = [
  { id: "expensive", label: "Too expensive" },
  { id: "touristy", label: "Too touristy" },
  { id: "notme", label: "Doesn't look like me" },
  { id: "far", label: "Too far" },
  { id: "notkid", label: "Not kid-friendly" },
  { id: "fancy", label: "Too fancy" },
  { id: "vibe", label: "Wrong vibe" },
  { id: "been", label: "Already been" },
  { id: "other", label: "Other" },
] as const;

export const LIKED_OPTIONS = ["The atmosphere", "The food", "The music", "It felt local", "Great with the kids", "The view"];

export type Signal = "save" | "more" | "pass" | (typeof REASONS)[number]["id"] | "loved" | "good" | "meh";

const bump = (rec: Record<string, number>, keys: string[], w: number) => {
  const next = { ...rec };
  for (const k of keys) next[k] = Math.round(((next[k] ?? 0) + w) * 100) / 100;
  return next;
};

export function applySignal(t: Taste, place: Place, signal: Signal): Taste {
  const next: Taste = { ...t, signals: t.signals + 1 };
  const tagged = (w: number) => {
    next.tags = bump(next.tags, place.tags, w);
    next.cats = bump(next.cats, [place.category], w);
  };

  switch (signal) {
    case "save":
      tagged(1);
      break;
    case "more":
      tagged(2);
      next.depth += (place.depth - 2) * 0.4;
      break;
    case "loved":
      tagged(2);
      break;
    case "good":
      tagged(0.5);
      break;
    case "pass":
    case "meh":
      tagged(-0.25);
      break;
    case "expensive":
      next.price += 1;
      break;
    case "touristy":
      // It's about fame, not the place's style, so only nudge toward deeper cuts
      next.depth += 1;
      break;
    case "notme":
    case "vibe":
      tagged(-1);
      break;
    case "far":
      next.distance += 1;
      break;
    case "notkid":
      next.kid += 1;
      break;
    case "fancy":
      next.tags = bump(next.tags, ["fancy", "special"], -2);
      next.price += 0.5;
      break;
    default:
      break; // "been" and "other" teach nothing about taste
  }
  return next;
}

export function affinity(t: Taste, place: Place, drive: number): number {
  const tagScore = place.tags.reduce((s, tag) => s + (t.tags[tag] ?? 0), 0) * 0.5;
  const catScore = (t.cats[place.category] ?? 0) * 0.7;
  const depthScore = t.depth * (place.depth - 1.5) * 0.6;
  const priceScore = -t.price * (place.price.perPerson / 30) * 0.5;
  const distScore = -t.distance * (drive / 30) * 0.6;
  const kidScore = t.kid * (place.kidFit.score - 2) * 0.8;
  return tagScore + catScore + depthScore + priceScore + distScore + kidScore;
}

export const prettyTag = (tag: string) => tag.replace(/-/g, " ");

export function tasteSummary(t: Taste) {
  const entries = Object.entries(t.tags);
  const likes = entries.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 6);
  // Only call something "less your thing" once there's a real signal, not one stray pass
  const dislikes = entries.filter(([, v]) => v <= -0.9).sort((a, b) => a[1] - b[1]).slice(0, 4);
  const lines: string[] = [];
  if (t.depth > 0.8) lines.push("You lean toward local spots over famous ones.");
  if (t.depth < -0.8) lines.push("You don't mind the classics, as long as they're good.");
  if (t.price >= 1) lines.push("You're watching the budget, so I'll lead with good value.");
  if (t.distance >= 1) lines.push("You'd rather stay close, so I'll keep the drives short.");
  if (t.kid >= 1) lines.push("Kid-friendly is non-negotiable.");
  if (!t.signals) lines.push("Swipe a few discoveries and I'll start noticing patterns.");
  else if (!lines.length) lines.push("Still learning. Every save and pass sharpens the picture.");
  return { likes, dislikes, lines };
}
