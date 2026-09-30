export type Category = "eat" | "music" | "explore" | "family" | "history";
export type BestTime = "morning" | "afternoon" | "sunset" | "dinner" | "evening" | "anytime";

export type Photo = {
  src: string;
  credit: string;
  license: string;
  source: string;
  caption?: string;
};

export type Place = {
  id: string;
  name: string;
  category: Category;
  tagline: string;
  neighborhood: string;
  depth: 1 | 2 | 3;
  tags: string[];
  moods: string[];
  location: { address: string; lat: number; lng: number };
  price: { perPerson: number; label: string; note?: string };
  bestTime: BestTime;
  durationMin: number;
  indoor: boolean;
  photos: Photo[];
  whyFound: string;
  insiderTip: string;
  localsSay: { text: string; sourced: boolean };
  realityCheck: {
    hours: string;
    seasonal?: string;
    warnings?: string[];
    officialUrl: string;
    lastChecked: string | null;
  };
  rainPlan: { text: string; backupId?: string | null };
  booking: { best: string; tips?: string[]; lastChecked: string | null };
  hypeCheck: { score: number; text: string };
  kidFit: { score: 1 | 2 | 3; stroller: boolean; notes: string };
  // Present on places Gemini found by hunting beyond the curated list
  live?: { foundAt: string; mode: "search" | "knowledge"; sources: { title: string; url: string }[] };
};

export type Stay = { id: string; name: string; area: string; lat: number; lng: number };

export type City = {
  id: string;
  name: string;
  state: string;
  tagline: string;
  sunset: string;
  hero: Photo;
  stays: Stay[];
  gettingAround: string[];
  places: Place[];
};

export type TripSetup = {
  cityId: string;
  start: string; // YYYY-MM-DD
  end: string;
  stayId: string;
  hotelName: string;
  maxDrive: number; // minutes
  maxPrice: number; // dollars per person
  adults: number;
  toddler: boolean;
  baby: boolean;
  napStart: string; // HH:MM
  napEnd: string;
};

export type Rating = "loved" | "good" | "meh";

export type Taste = {
  tags: Record<string, number>;
  cats: Record<string, number>;
  depth: number;
  price: number;
  distance: number;
  kid: number;
  signals: number;
};

export type AppState = {
  setup: TripSetup | null;
  saved: string[];
  passed: Record<string, string[]>;
  moreLike: string[];
  taste: Taste;
  feedback: Record<string, { rating: Rating; liked: string[] }>;
  planFor: string[] | null; // the saved ids the current plan was built from
  found: Record<string, Place>; // places Gemini hunted down, kept so saves survive reloads
};
