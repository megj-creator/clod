export type Weather = {
  kind: "sun" | "partly" | "rain";
  hi: number;
  label: string;
  rainChance?: number;
  live: boolean;
};

// SAMPLE FORECAST: stable made-up weather for dates too far out to forecast.
// Day 3 of any trip longer than two days is rainy so the rain plan is visible.
export function sampleForecast(dates: string[]): Record<string, Weather> {
  const out: Record<string, Weather> = {};
  dates.forEach((d, i) => {
    const hash = [...d].reduce((s, c) => s + c.charCodeAt(0) * (i + 3), 0);
    const kind: Weather["kind"] = dates.length > 2 && i === 2 ? "rain" : hash % 3 === 0 ? "partly" : "sun";
    out[d] = { kind, hi: 72 + (hash % 8), label: kind === "rain" ? "Rain likely" : kind === "partly" ? "Partly cloudy" : "Sunny", live: false };
  });
  return out;
}

// REAL FORECAST from Open-Meteo (free, no key). Covers roughly the next 16 days;
// dates beyond that keep the sample and are labeled "typical".
export async function fetchForecast(lat: number, lng: number, dates: string[]): Promise<Record<string, Weather>> {
  const base = sampleForecast(dates);
  const today = new Date();
  const limit = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 15);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const inRange = dates.filter((d) => d >= iso(today) && d <= iso(limit));
  if (!inRange.length) return base;

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&daily=weather_code,temperature_2m_max,precipitation_probability_max&temperature_unit=fahrenheit` +
    `&timezone=auto&start_date=${inRange[0]}&end_date=${inRange[inRange.length - 1]}`;
  const res = await fetch(url);
  if (!res.ok) return base;
  const data = await res.json();
  const days: string[] = data.daily?.time ?? [];
  days.forEach((d, i) => {
    const code: number = data.daily.weather_code[i];
    const chance: number = data.daily.precipitation_probability_max?.[i] ?? 0;
    const wet = chance >= 55 || (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
    const kind: Weather["kind"] = wet ? "rain" : code <= 1 ? "sun" : "partly";
    base[d] = {
      kind,
      hi: Math.round(data.daily.temperature_2m_max[i]),
      rainChance: chance,
      label: kind === "rain" ? (code >= 95 ? "Storms likely" : "Rain likely") : kind === "sun" ? "Sunny" : "Partly cloudy",
      live: true,
    };
  });
  return base;
}

export const weatherEmoji = (k: Weather["kind"]) => (k === "rain" ? "🌧️" : k === "partly" ? "⛅" : "☀️");
