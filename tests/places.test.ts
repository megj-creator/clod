import { describe, expect, it } from "vitest";
import { sameSpot } from "@/lib/cities";
import { aboutThePlace, nameMatch } from "@/lib/finder";
import { parseJsonLoose } from "@/lib/gemini";
import { chipIntent } from "@/lib/intent";
import { buildQueue } from "@/lib/rank";
import { emptyTaste } from "@/lib/taste";
import { place, setup } from "./fixtures";

const P = (name: string, lat: number, lng: number) => place({ id: name, name, lat, lng });

describe("same place, different names (cross-category duplicates)", () => {
  it.each([
    [P("Fushimi Inari Shrine", 34.96725, 135.77377), P("Fushimi Inari Taisha", 34.96752, 135.77971), true], // ~550 m apart on a big complex
    [P("Kiyomizu-dera", 34.9949, 135.785), P("Kiyomizu-dera Temple", 34.995, 135.7852), true],
    [P("Gion Corner", 35.0005, 135.775), P("Gion Tanto", 35.0015, 135.7745), false], // one shared word, same street
    [P("Kyoto City Zoo", 35.0137, 135.7826), P("Kyoto Aquarium", 34.9874, 135.7475), false],
    [P("Museum of Crafts and Design", 35.0126, 135.7822), P("National Museum of Modern Art", 35.0122, 135.7818), false],
  ])("%s / %s", (a, b, want) => expect(sameSpot(a, b)).toBe(want));
});

describe("matching names on maps and photo files", () => {
  it("scores how much of a place's name another name covers", () => {
    expect(nameMatch("Western North Carolina Nature Center", "Western N.C. Nature Center")).toBeGreaterThanOrEqual(0.5);
    expect(nameMatch("Basilica of Saint Lawrence", "Basilica of St. Lawrence")).toBe(1);
    expect(nameMatch("Tupelo Honey", "Asheville, North Carolina")).toBe(0);
  });
  it("rejects photo files about something else at the place", () => {
    expect(aboutThePlace("File:Robert's geranium red leaf (Geranium robertianum), Jardim Botânico de Lisboa.jpg", "Jardim Botânico de Lisboa", "Lisbon, Portugal")).toBe(false);
    expect(aboutThePlace("File:Sign to announce closure of Takaragaike children's park 20200422.jpg", "Takaragaike Park Children's Park", "Kyoto, Japan")).toBe(false);
    expect(aboutThePlace("File:View from Miradouro de Santa Luzia, Lisbon, 20250603.jpg", "Miradouro de Santa Luzia", "Lisbon, Portugal")).toBe(true);
  });
});

describe("reading Gemini's replies", () => {
  it("handles fences, chatter, unquoted keys, and trailing commas", () => {
    expect(parseJsonLoose('```json\n[{"name":"A"}]\n```')).toEqual([{ name: "A" }]);
    expect(parseJsonLoose('Here you go: [{"name":"A"}] Enjoy!')).toEqual([{ name: "A" }]);
    // The lite model really does write JavaScript-style objects sometimes
    expect(parseJsonLoose('[\n  {\n    name: "Teatro, Nacional: x",\n    lat: 38.7,\n    tags: ["a","b",],\n  },\n]')).toEqual([
      { name: "Teatro, Nacional: x", lat: 38.7, tags: ["a", "b"] },
    ]);
  });
});

describe("ranking", () => {
  it("puts places Gemini suggested but no map confirmed after confirmed ones nearby", () => {
    const live = { foundAt: "2026-09-30", mode: "knowledge" as const, origin: "city" as const, sources: [] };
    const confirmed = place({ id: "confirmed", live, location: { address: "", lat: 38.712, lng: -9.14, pin: "osm" } });
    const unconfirmed = place({ id: "unconfirmed", live, lat: 38.7105, lng: -9.14 }); // even a bit closer
    const { queue } = buildQueue({
      places: [unconfirmed, confirmed],
      drives: { confirmed: 6, unconfirmed: 4 },
      intent: chipIntent("all"),
      setup: setup(),
      taste: emptyTaste(),
      depthLevel: 1,
      exclude: new Set(),
      showHidden: false,
    });
    expect(queue.map((r) => r.place.id)).toEqual(["confirmed", "unconfirmed"]);
  });
});
