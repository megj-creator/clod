"use client";

import { useState, type ReactNode, type RefObject } from "react";
import { formatDrive } from "@/lib/geo";
import type { Place } from "@/lib/types";
import { IconCar, IconChevron } from "./icons";
import { PlaceImage } from "./PlaceImage";
import { CATS, DEPTH, KidDots, priceShort } from "./ui";

export function CardFace({
  place,
  drive,
  weather,
  kids,
  onOpen,
  blockTap,
  overlay,
  why,
}: {
  why?: string;
  place: Place;
  drive: number;
  weather: string;
  kids: boolean;
  onOpen: () => void;
  blockTap?: RefObject<boolean>;
  overlay?: ReactNode;
}) {
  const [idx, setIdx] = useState(0);
  const n = place.photos.length;
  const photo = place.photos[idx];
  const cat = CATS[place.category];
  const guard = (fn: () => void) => () => {
    if (blockTap?.current) return;
    fn();
  };

  return (
    <article className="card-face" style={{ ["--cat" as string]: cat.color }}>
      <div className="cf-photo">
        <PlaceImage place={place} index={idx} />
        {n > 1 && (
          <div className="cf-bars">
            {place.photos.map((_, i) => (
              <span key={i} className={i === idx ? "on" : ""} />
            ))}
          </div>
        )}
        {n > 1 && (
          <div className="cf-tapzones">
            <button aria-label="Previous photo" onClick={guard(() => setIdx((i) => (i - 1 + n) % n))} />
            <button aria-label="Next photo" onClick={guard(() => setIdx((i) => (i + 1) % n))} />
          </div>
        )}
        <div className="cf-badges">
          <span className={`depth depth-${place.depth}`}>{DEPTH[place.depth].label}</span>
          <span className="cat-chip">
            {cat.emoji} {cat.label}
          </span>
        </div>
        <div className="cf-title">
          <p className="cf-hood">{place.neighborhood}</p>
          <h2>{place.name}</h2>
          <p className="cf-tagline">{place.tagline}</p>
        </div>
        {photo ? (
          <span className="cf-credit">
            {photo.caption ? `${photo.caption} · ` : ""}📷 {photo.credit} · {photo.license}
          </span>
        ) : (
          <span className="cf-credit">Painted placeholder · licensed photos pending</span>
        )}
        {overlay}
      </div>

      <div className="cf-body">
        <div className="cf-meta">
          <span className="pill">
            <IconCar size={14} /> {formatDrive(drive)}
          </span>
          <span className="pill">{priceShort(place)}</span>
          {kids && (
            <span className="pill">
              Kid fit <KidDots score={place.kidFit.score} />
            </span>
          )}
        </div>

        <div className="cf-why">
          <span className="eyebrow">{why ? "✨ Why it fits what you asked" : "Why I found it for you"}</span>
          <p>{why ?? place.whyFound}</p>
        </div>

        <div className="cf-tip">
          <span className="eyebrow">Insider tip</span>
          <p>{place.insiderTip}</p>
        </div>

        <div className="cf-foot">
          <span className="cf-weather">{weather}</span>
          <button className="cf-more" onClick={guard(onOpen)}>
            Full story <IconChevron size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}
