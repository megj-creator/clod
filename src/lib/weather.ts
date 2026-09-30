export type Weather = {
  kind: "sun" | "partly" | "rain";
  hi: number;
  label: string;
};

// SAMPLE FORECAST: made up but stable, so the rain plan can be seen in action.
// Day 3 of any trip longer than two days is always rainy.
// A real forecast (e.g. Open-Meteo, which is free) can replace this later.
export function sampleForecast(dates: string[]): Record<string, Weather> {
  const out: Record<string, Weather> = {};
  dates.forEach((d, i) => {
    const hash = [...d].reduce((s, c) => s + c.charCodeAt(0) * (i + 3), 0);
    const kind: Weather["kind"] = dates.length > 2 && i === 2 ? "rain" : hash % 3 === 0 ? "partly" : "sun";
    out[d] = {
      kind,
      hi: 72 + (hash % 8),
      label: kind === "rain" ? "Rain likely" : kind === "partly" ? "Partly cloudy" : "Sunny",
    };
  });
  return out;
}

export const weatherEmoji = (k: Weather["kind"]) => (k === "rain" ? "🌧️" : k === "partly" ? "⛅" : "☀️");
