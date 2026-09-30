import type { Category, Place } from "@/lib/types";
import { weatherEmoji, type Weather } from "@/lib/weather";
import { fmtDay } from "@/lib/dates";
import { IconAlert, IconCheck } from "./icons";

export const CATS: Record<Category, { label: string; emoji: string; color: string }> = {
  eat: { label: "Eat", emoji: "🍴", color: "var(--c-eat)" },
  music: { label: "Music", emoji: "🎵", color: "var(--c-music)" },
  explore: { label: "Explore", emoji: "🌿", color: "var(--c-explore)" },
  family: { label: "Family", emoji: "👨‍👩‍👧", color: "var(--c-family)" },
  history: { label: "History", emoji: "🏛️", color: "var(--c-history)" },
};

export const DEPTH: Record<number, { label: string; hint: string }> = {
  1: { label: "Classic", hint: "Famous, and earns it" },
  2: { label: "Local favorite", hint: "Locals mention it more than guidebooks do" },
  3: { label: "Deep cut", hint: "Barely online. Worth the effort." },
};

export const priceShort = (p: Place) => (p.price.perPerson === 0 ? "Free" : p.price.label);
export const priceLong = (p: Place) => (p.price.perPerson === 0 ? "Free" : `~$${p.price.perPerson} / person`);

export function VerifyBadge({ date, compact }: { date: string | null; compact?: boolean }) {
  if (date)
    return (
      <span className="verify ok">
        <IconCheck size={12} /> {compact ? "Checked" : `Checked on official site · ${date}`}
      </span>
    );
  return (
    <span className="verify pending">
      <IconAlert size={12} /> {compact ? "Unverified" : "Not yet verified on the official site"}
    </span>
  );
}

export function KidDots({ score }: { score: number }) {
  return (
    <span className="kid-dots" aria-label={`Kid fit ${score} of 3`}>
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= score ? "on" : ""} />
      ))}
    </span>
  );
}

export function HypeMeter({ score }: { score: number }) {
  return (
    <span className="hype" aria-label={`Hype check ${score} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={i <= score ? "on" : ""} />
      ))}
    </span>
  );
}

// "See it for yourself": links out to real photos, the official site, and local chatter.
// We link instead of copying photos, so we never use pictures we don't have rights to.
export function lookLinks(place: Place, cityName: string, subreddit?: string) {
  const q = `${place.name} ${cityName}`;
  const links: { id: string; label: string; url: string }[] = [];
  if (place.realityCheck.officialUrl) links.push({ id: "site", label: "Official website", url: place.realityCheck.officialUrl });
  links.push({ id: "photos", label: "Photos", url: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}` });
  links.push({
    id: "maps",
    label: "Google Maps",
    url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name}, ${place.location.address}`)}`,
  });
  links.push({
    id: "locals",
    label: "What locals say",
    url: subreddit
      ? `https://www.reddit.com/r/${subreddit}/search/?q=${encodeURIComponent(place.name)}&restrict_sr=1`
      : `https://www.reddit.com/search/?q=${encodeURIComponent(q)}`,
  });
  return links;
}

export const photosUrl = (place: Place, cityName: string) =>
  `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${place.name} ${cityName}`)}`;

// A one-line forecast take for a card: good days, rainy days, or rain-proof.
export function weatherLine(place: Place, dates: string[], forecast: Record<string, Weather>): string {
  if (place.indoor) return "☔ Rain or shine, this one's covered";
  const good = dates.find((d) => forecast[d]?.kind !== "rain");
  const wet = dates.find((d) => forecast[d]?.kind === "rain");
  const parts: string[] = [];
  if (good) parts.push(`${weatherEmoji(forecast[good].kind)} Good ${fmtDay(good).weekday}`);
  if (wet) parts.push(`🌧️ Skip ${fmtDay(wet).weekday}, rain expected`);
  return parts.join("  ·  ");
}
