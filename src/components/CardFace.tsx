"use client";

import { useState, type ReactNode, type RefObject } from "react";
import { formatDrive } from "@/lib/geo";
import type { Place } from "@/lib/types";
import { IconCar, IconChevron } from "./icons";
import { PlaceImage } from "./PlaceImage";
import { CATS, DEPTH, KidDots, isFreshFind, photosUrl, priceShort } from "./ui";

export function CardFace({
  place,
  drive,
  weather,
  kids,
  onOpen,
  blockTap,
  overlay,
  why,
  cityName = "",
}: {
  why?: string;
  cityName?: string;
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
          <span className={`depth depth-${isFreshFind(place) ? "live" : place.depth}`}>{isFreshFind(place) ? "✦ Fresh find" : DEPTH[place.depth].label}</span>
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
          // No licensed photo yet: link out to real ones instead of copying them
          <a
            className="cf-realphotos"
            href={photosUrl(place, cityName)}
            target="_blank"
            rel="noreferrer"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (blockTap?.current) e.preventDefault();
            }}
          >
            📷 See real photos ↗
          </a>
        )}
        {overlay}
      </div>

      <div className="cf-body" onClick={guard(onOpen)} role="button" tabIndex={-1}>
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
          <button
            className="cf-more"
            onClick={(e) => {
              e.stopPropagation();
              guard(onOpen)();
            }}
          >
            Full story <IconChevron size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}
