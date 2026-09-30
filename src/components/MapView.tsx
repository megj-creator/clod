"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";

export type MapPoint = { lat: number; lng: number; label: string; n?: number; color?: string; onClick?: () => void };

// Free vector maps from OpenFreeMap (no key). The library loads only when a map is on screen.
const STYLES = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

export function MapView({
  points,
  home,
  line = false,
  theme = "dark",
  className = "",
}: {
  points: MapPoint[];
  home?: { lat: number; lng: number; label: string };
  line?: boolean;
  theme?: "light" | "dark";
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const key = JSON.stringify([points.map((p) => [p.lat, p.lng, p.n, p.label]), home, line, theme]);

  useEffect(() => {
    let map: import("maplibre-gl").Map | null = null;
    let cancelled = false;
    (async () => {
      try {
        const maplibre = (await import("maplibre-gl")).default;
        if (cancelled || !el.current) return;
        const all = [...points, ...(home ? [home] : [])];
        if (!all.length) return;
        const bounds = new maplibre.LngLatBounds();
        all.forEach((p) => bounds.extend([p.lng, p.lat]));

        map = new maplibre.Map({
          container: el.current,
          style: STYLES[theme],
          bounds,
          fitBoundsOptions: { padding: 48, maxZoom: 14.5 },
          attributionControl: { compact: true },
          cooperativeGestures: true,
          dragRotate: false,
          pitchWithRotate: false,
        });

        const pin = (html: string, cls: string, color?: string) => {
          const d = document.createElement("div");
          d.className = cls;
          d.innerHTML = html;
          if (color) d.style.setProperty("--pin", color);
          return d;
        };
        if (home) {
          new maplibre.Marker({ element: pin("⌂", "map-home") }).setLngLat([home.lng, home.lat]).addTo(map);
        }
        points.forEach((p) => {
          const m = pin(p.n ? String(p.n) : "", "map-pin", p.color);
          m.title = p.label;
          if (p.onClick) {
            m.style.cursor = "pointer";
            m.addEventListener("click", p.onClick);
          }
          new maplibre.Marker({ element: m }).setLngLat([p.lng, p.lat]).addTo(map!);
        });

        if (line && points.length > 0) {
          map.on("load", () => {
            const coords = [...(home ? [[home.lng, home.lat]] : []), ...points.map((p) => [p.lng, p.lat])];
            map!.addSource("route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } } });
            map!.addLayer({
              id: "route",
              type: "line",
              source: "route",
              paint: { "line-color": theme === "dark" ? "#f4a948" : "#b8672a", "line-width": 2.5, "line-dasharray": [1.5, 1.5], "line-opacity": 0.85 },
            });
          });
        }
      } catch {
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (failed) return <div className={`map-view map-failed ${className}`}>Map couldn't load</div>;
  return <div ref={el} className={`map-view map-${theme} ${className}`} />;
}
