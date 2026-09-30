import type { Category, Place } from "./types";

export type Flags = {
  kid?: boolean;
  casual?: boolean;
  cheap?: boolean;
  close?: boolean;
  indoor?: boolean;
  outdoors?: boolean;
  deeper?: boolean;
};

export type Intent = {
  label: string;
  categories: Category[];
  moods: string[];
  tags: string[];
  boost: string[];
  flags: Flags;
  heard: string[];
  // Set when Gemini chose the places: id → why it fits, in best-first order.
  picks?: Record<string, string>;
  source?: "ai" | "keywords";
};

const blank = (label: string): Intent => ({ label, categories: [], moods: [], tags: [], boost: [], flags: {}, heard: [] });

export const CATEGORY_CHIPS = [
  { id: "eat", emoji: "🍴", label: "Eat" },
  { id: "music", emoji: "🎵", label: "Music" },
  { id: "explore", emoji: "🌿", label: "Explore" },
  { id: "family", emoji: "👨‍👩‍👧", label: "Family" },
] as const;

export const MOOD_CHIPS = [
  { id: "romantic", emoji: "🍷", label: "Romantic" },
  { id: "music", emoji: "🎶", label: "Live music" },
  { id: "casual", emoji: "🌮", label: "Casual & local" },
  { id: "unusual", emoji: "🌙", label: "Something unusual" },
  { id: "special", emoji: "✨", label: "Special occasion" },
  { id: "rainy", emoji: "☔", label: "Rainy day" },
] as const;

export const EXAMPLES = [
  "We're tired but want somewhere cute for dinner. Toddler in tow, nothing fancy.",
  "Something free and outdoors for the morning",
  "Show me the least touristy thing you've got",
  "Where can the kids burn off energy if it rains?",
  "A sunset spot that's worth the drive",
];

export function chipIntent(id: string): Intent {
  const i = blank(id);
  switch (id) {
    case "all":
      i.label = "Everything";
      i.heard = ["everything"];
      break;
    case "eat":
      i.label = "Eat";
      i.categories = ["eat"];
      i.heard = ["food"];
      break;
    case "music":
      i.label = "Live music";
      i.categories = ["music"];
      i.moods = ["music"];
      i.heard = ["live music"];
      break;
    case "explore":
      i.label = "Explore";
      i.categories = ["explore", "history"];
      i.heard = ["exploring"];
      break;
    case "family":
      i.label = "Family";
      i.categories = ["family"];
      i.moods = ["family"];
      i.flags.kid = true;
      i.heard = ["kid-friendly"];
      break;
    case "romantic":
      i.label = "Romantic";
      i.moods = ["romantic"];
      i.heard = ["romantic"];
      break;
    case "casual":
      i.label = "Casual & local";
      i.moods = ["casual"];
      i.flags.casual = true;
      i.heard = ["casual", "local"];
      break;
    case "unusual":
      i.label = "Something unusual";
      i.moods = ["unusual"];
      i.flags.deeper = true;
      i.heard = ["off the beaten path"];
      break;
    case "special":
      i.label = "Special occasion";
      i.moods = ["special", "romantic"];
      i.heard = ["special occasion"];
      break;
    case "rainy":
      i.label = "Rainy day";
      i.flags.indoor = true;
      i.heard = ["indoors"];
      break;
  }
  return i;
}

type Rule = [RegExp, (i: Intent) => void, string];

const RULES: Rule[] = [
  [/\b(dinner|lunch|brunch|breakfast|eat|food|hungry|restaurant|bbq|barbecue|oysters?|seafood|grits)\b/, (i) => i.categories.push("eat"), "food"],
  [/\b(drinks?|bar|cocktails?|wine|beer|bourbon)\b/, (i) => i.tags.push("drinks"), "drinks"],
  [/\b(music|live|band|jazz|show|concert)\b/, (i) => { i.categories.push("music"); i.moods.push("music"); }, "live music"],
  [/\b(tired|exhausted|chill|easy|low[- ]key|relax\w*|lazy|close by|nearby)\b/, (i) => (i.flags.close = true), "close by & easy"],
  [/\b(cute|charming|cozy|pretty|sweet)\b/, (i) => i.boost.push("photogenic", "local", "patio"), "charming"],
  [/\b(toddlers?|kids?|baby|babies|family|stroller|little ones|children)\b/, (i) => (i.flags.kid = true), "kid-friendly"],
  [/(not fancy|nothing fancy|anything fancy|casual|laid[- ]back|no dress)/, (i) => (i.flags.casual = true), "casual"],
  [/\b(cheap|budget|free|inexpensive|affordable)\b/, (i) => (i.flags.cheap = true), "easy on the wallet"],
  [/\b(outside|outdoors?|nature|gardens?|trees?|walk|beach|park|marsh)\b/, (i) => (i.flags.outdoors = true), "outdoors"],
  [/\b(rain|raining|rainy|indoors?|inside)\b/, (i) => (i.flags.indoor = true), "indoors"],
  [/(unusual|weird|different|hidden|secret|local|off the beaten|touristy)/, (i) => (i.flags.deeper = true), "less touristy"],
  [/\b(romantic|date night|date|anniversary)\b/, (i) => i.moods.push("romantic"), "romantic"],
  [/\b(history|historic|old|ruins?)\b/, (i) => i.categories.push("history"), "history"],
  [/\b(sunset|golden hour)\b/, (i) => i.boost.push("sunset"), "sunset"],
  [/\b(special|celebrat\w*|birthday)\b/, (i) => i.moods.push("special"), "special occasion"],
];

// Asks Gemini (via our own /api/intent, which holds the key) to read the request
// and pick places. Falls back to keyword matching if the AI is unavailable.
export async function interpret(
  text: string,
  places: Place[],
  drives: Record<string, number>,
  crew: string,
): Promise<Intent> {
  try {
    const res = await fetch("/api/intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text,
        crew,
        places: places.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          tagline: p.tagline,
          tags: p.tags,
          depth: p.depth,
          price: p.price.perPerson,
          indoor: p.indoor,
          kidFit: p.kidFit.score,
          bestTime: p.bestTime,
          drive: drives[p.id],
        })),
      }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { heard: string[]; picks: { id: string; why: string }[] };
    if (!data.picks?.length) throw new Error("no picks");
    const i = blank(text.trim());
    i.heard = data.heard?.length ? data.heard : ["your request"];
    i.picks = Object.fromEntries(data.picks.map((p) => [p.id, p.why]));
    i.source = "ai";
    return i;
  } catch {
    return parseIntent(text);
  }
}

// Keyword matching: the offline backup for when Gemini isn't reachable.
export function parseIntent(text: string): Intent {
  const i = blank(text.trim());
  const lower = text.toLowerCase();
  for (const [re, apply, heard] of RULES) {
    if (re.test(lower)) {
      apply(i);
      if (!i.heard.includes(heard)) i.heard.push(heard);
    }
  }
  // Mentioning rain and the outdoors together ("park if it rains?"): indoors wins.
  if (i.flags.indoor && i.flags.outdoors) i.flags.outdoors = false;
  if (!i.heard.length) i.heard.push("anything good");
  i.source = "keywords";
  return i;
}
