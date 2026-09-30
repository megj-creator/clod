"use client";

import { useEffect, useState } from "react";

// Sunset for a place and date, from the standard sunrise equation (good to about a minute).
// Returns epoch ms, or null during polar day/night.
export function sunsetMs(dateIso: string, lat: number, lng: number): number | null {
  const rad = Math.PI / 180;
  const noonUtc = Date.parse(`${dateIso}T12:00:00Z`);
  const n = Math.round((noonUtc - Date.UTC(2000, 0, 1, 12)) / 864e5); // days since J2000
  const jStar = n - lng / 360;
  const M = (((357.5291 + 0.98560028 * jStar) % 360) + 360) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const jTransit = 2451545 + jStar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lambda * rad);
  const delta = Math.asin(Math.sin(lambda * rad) * Math.sin(23.44 * rad));
  const cosW = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(delta)) / (Math.cos(lat * rad) * Math.cos(delta));
  if (cosW < -1 || cosW > 1) return null;
  const jSet = jTransit + Math.acos(cosW) / rad / 360;
  return (jSet - 2440587.5) * 864e5;
}

// "19:42" in the destination's own time zone (IANA name, so daylight saving is handled)
export function sunsetLocal(dateIso: string, lat: number, lng: number, timeZone: string): string | null {
  const ms = sunsetMs(dateIso, lat, lng);
  if (ms == null) return null;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

// Sunset for every trip day at the destination. The time zone comes from Open-Meteo (free, no key).
export function useSunsets(lat: number, lng: number, dates: string[]): Record<string, string> | undefined {
  const [tz, setTz] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setTz(null);
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&timezone=auto&forecast_days=1&daily=sunset`)
      .then((r) => r.json())
      .then((d) => live && typeof d.timezone === "string" && setTz(d.timezone))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [lat, lng]);
  if (!tz || !dates.length) return undefined;
  const out: Record<string, string> = {};
  for (const d of dates) {
    const s = sunsetLocal(d, lat, lng, tz);
    if (s) out[d] = s;
  }
  return out;
}
