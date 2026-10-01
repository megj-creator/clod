import type { City, Place, Stay, TripSetup } from "@/lib/types";

// A complete place with sensible defaults; tests override only what they care about
export function place(over: Partial<Place> & { id: string; lat?: number; lng?: number }): Place {
  const { lat = 38.71, lng = -9.14, ...rest } = over;
  return {
    name: over.id,
    category: "explore",
    tagline: "",
    neighborhood: "Center",
    depth: 2,
    tags: [],
    moods: [],
    location: { address: "", lat, lng },
    price: { perPerson: 10, label: "$" },
    bestTime: "anytime",
    durationMin: 60,
    indoor: false,
    photos: [],
    whyFound: "",
    insiderTip: "",
    localsSay: { text: "", sourced: false },
    realityCheck: { hours: "", officialUrl: "", lastChecked: null },
    rainPlan: { text: "" },
    booking: { best: "", lastChecked: null },
    hypeCheck: { score: 3, text: "" },
    kidFit: { score: 2, stroller: true, notes: "" },
    ...rest,
  };
}

export const stay: Stay = { id: "center", name: "Center", area: "Downtown", lat: 38.71, lng: -9.14 };

export function city(places: Place[] = []): City {
  return { id: "testville", name: "Testville", state: "TS", tagline: "", sunset: "19:00", hero: null, stays: [stay], gettingAround: [], places };
}

export function setup(over: Partial<TripSetup> = {}): TripSetup {
  return {
    cityId: "testville",
    start: "2026-10-12", // a Monday
    end: "2026-10-14",
    stayId: "center",
    hotelName: "",
    maxDrive: 30,
    maxPrice: 50,
    adults: 2,
    toddler: false,
    baby: false,
    napStart: "12:30",
    napEnd: "14:30",
    ...over,
  };
}
