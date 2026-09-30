"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { fmtDay } from "@/lib/dates";
import { formatDrive } from "@/lib/geo";
import type { Place, Stay } from "@/lib/types";
import { MapView } from "./MapView";
import { weatherEmoji, type Weather } from "@/lib/weather";
import type { Decision } from "./Discover";
import {
  IconAlert, IconArrow, IconBaby, IconCar, IconChat, IconClock, IconExternal, IconFlame, IconHeart, IconPin, IconRain, IconSearch, IconSparkle, IconTicket, IconX,
} from "./icons";
import { PlaceImage } from "./PlaceImage";
import { CATS, DEPTH, HypeMeter, KidDots, VerifyBadge, isFreshFind, lookLinks, photosUrl, priceLong } from "./ui";

const LOOK_ICONS: Record<string, string> = { site: "🌐", photos: "📷", maps: "📍", locals: "💬" };

export function DetailSheet({
  place,
  drive,
  driveReal,
  byId,
  dates,
  forecast,
  isSaved,
  stay,
  cityName,
  subreddit,
  onClose,
  onDecide,
  onUnsave,
  onOpen,
}: {
  stay: Stay;
  cityName: string;
  subreddit?: string;
  place: Place;
  drive: number;
  driveReal: boolean;
  byId: Record<string, Place>;
  dates: string[];
  forecast: Record<string, Weather>;
  isSaved: boolean;
  onClose: () => void;
  onDecide: (id: string, d: Decision) => void;
  onUnsave: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const cat = CATS[place.category];
  const backup = place.rainPlan.backupId ? byId[place.rainPlan.backupId] : null;
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name}, ${place.location.address}`)}`;
  const directions = `https://www.google.com/maps/dir/?api=1&origin=${stay.lat},${stay.lng}&destination=${encodeURIComponent(`${place.name}, ${place.location.address}`)}`;
  const act = (d: Decision) => {
    onDecide(place.id, d);
    onClose();
  };

  return (
    <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="sheet detail"
        style={{ ["--cat" as string]: cat.color }}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={place.name}
      >
        <button className="sheet-close" onClick={onClose} aria-label="Close">
          <IconX size={18} />
        </button>

        <div className="gallery">
          {(place.photos.length ? place.photos : [null]).map((ph, i) => (
            <figure key={i} className="gallery-item">
              <PlaceImage place={place} index={i} />
              <figcaption>
                {ph ? (
                  <>
                    {ph.caption && <strong>{ph.caption} · </strong>}
                    <a href={ph.source} target="_blank" rel="noreferrer">
                      {ph.credit} · {ph.license}
                    </a>
                  </>
                ) : (
                  <>
                    Illustration.{" "}
                    <a href={photosUrl(place, cityName)} target="_blank" rel="noreferrer">
                      See real photos ↗
                    </a>
                  </>
                )}
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="detail-body">
          <div className="detail-badges">
            <span className={`depth depth-${isFreshFind(place) ? "live" : place.depth}`}>{isFreshFind(place) ? "✦ Fresh find" : DEPTH[place.depth].label}</span>
            <span className="cat-chip">
              {cat.emoji} {cat.label}
            </span>
            <span className="detail-hood">{place.neighborhood}</span>
          </div>
          <h1 className="detail-title">{place.name}</h1>
          <p className="detail-tagline">{place.tagline}</p>

          <div className="facts">
            <Fact icon={<IconCar size={16} />} label="From your stay" value={formatDrive(drive)} sub={driveReal ? "real route · no traffic" : "estimate"} />
            <Fact icon={<IconTicket size={16} />} label="Price" value={priceLong(place)} sub={place.price.note} />
            <Fact icon={<IconClock size={16} />} label="Plan for" value={formatDrive(place.durationMin)} sub={`best: ${place.bestTime}`} />
          </div>

          <div className="look">
            <p className="look-label">See it for yourself</p>
            <div className="look-links">
              {lookLinks(place, cityName, subreddit).map((l) => (
                <a key={l.id} className={`look-link look-${l.id}`} href={l.url} target="_blank" rel="noreferrer">
                  <span className="look-icon">{LOOK_ICONS[l.id]}</span>
                  {l.label}
                  <IconExternal size={11} />
                </a>
              ))}
            </div>
          </div>

          <Section icon={<IconSparkle size={16} />} title="Why I found it for you">
            <p>{place.whyFound}</p>
          </Section>

          <Section icon={<IconArrow size={16} />} title="Insider tip" tone="tip">
            <p>{place.insiderTip}</p>
          </Section>

          <Section icon={<IconAlert size={16} />} title="Reality check" badge={<VerifyBadge date={place.realityCheck.lastChecked} />}>
            <dl className="reality">
              <dt>Hours</dt>
              <dd>{place.realityCheck.hours}</dd>
              {place.realityCheck.seasonal && (
                <>
                  <dt>Seasonal</dt>
                  <dd>{place.realityCheck.seasonal}</dd>
                </>
              )}
            </dl>
            {!!place.realityCheck.warnings?.length && (
              <ul className="warnings">
                {place.realityCheck.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            {place.realityCheck.evidence && (
              <blockquote className="evidence">
                “{place.realityCheck.evidence}”
                <cite>From the official site</cite>
              </blockquote>
            )}
            {place.realityCheck.checkNote && <p className="check-note">{place.realityCheck.checkNote}</p>}
            {(place.realityCheck.checkedUrl || place.realityCheck.officialUrl) && (
              <a className="source-link" href={place.realityCheck.checkedUrl || place.realityCheck.officialUrl} target="_blank" rel="noreferrer">
                {place.realityCheck.lastChecked ? "See it on the official site" : "Official site"} <IconExternal size={13} />
              </a>
            )}
          </Section>

          <Section icon={<IconRain size={16} />} title="If it rains">
            <p>{place.rainPlan.text}</p>
            {backup && (
              <button className="backup-link" onClick={() => onOpen(backup.id)}>
                <PlaceImage place={backup} />
                <span>
                  <small>Rain plan</small>
                  {backup.name}
                </span>
              </button>
            )}
            <div className="forecast-row">
              {dates.map((d) => (
                <span key={d} className={`fc w-${forecast[d]?.kind}`}>
                  <b>{fmtDay(d).weekday}</b>
                  {weatherEmoji(forecast[d]?.kind ?? "sun")}
                </span>
              ))}
            </div>
            <p className="micro">
              {dates.some((d) => forecast[d]?.live) ? "Live forecast from Open-Meteo. Days beyond ~2 weeks show typical weather." : "Typical weather. The live forecast appears about 2 weeks out."}
            </p>
          </Section>

          <Section icon={<IconTicket size={16} />} title="Best way to book" badge={<VerifyBadge date={place.booking.lastChecked} compact />}>
            <p>{place.booking.best}</p>
            {!!place.booking.tips?.length && (
              <ul className="bullets">
                {place.booking.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
          </Section>

          <Section icon={<IconChat size={16} />} title="What locals are saying" tone="locals">
            <blockquote>{place.localsSay.text}</blockquote>
            {place.localsSay.sourced && place.localsSay.sources?.length ? (
              <>
                <p className="micro">
                  Paraphrased from {place.localsSay.sources.length} local {place.localsSay.sources.length === 1 ? "thread" : "threads"}
                  {place.localsSay.checked ? ` · read ${place.localsSay.checked}` : ""}
                </p>
                <ul className="sources">
                  {place.localsSay.sources.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noreferrer">
                        💬 {s.title} <IconExternal size={11} />
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              !place.localsSay.sourced && <p className="micro">Summary for now. Tap "What locals say" above to read the real local threads.</p>
            )}
          </Section>

          <Section icon={<IconFlame size={16} />} title="Hype check" badge={<HypeMeter score={place.hypeCheck.score} />}>
            <p>{place.hypeCheck.text}</p>
          </Section>

          <Section icon={<IconBaby size={16} />} title="With little ones" badge={<KidDots score={place.kidFit.score} />}>
            <p>{place.kidFit.notes}</p>
            <p className="micro">{place.kidFit.stroller ? "Stroller-friendly" : "Leave the stroller, bring the carrier"}</p>
          </Section>

          {place.live && (
            <Section icon={<IconSearch size={16} />} title={place.live.mode === "search" ? "Found live on the web" : place.live.origin === "city" ? "Suggested by Gemini" : "Found beyond my list"}>
              <p>
                {place.live.mode === "search"
                  ? `Gemini found this on ${place.live.foundAt} by searching local sources. Nothing here has been checked against the official site yet.`
                  : `Gemini suggested this on ${place.live.foundAt} from what it knows, not from a live search. Confirm it's open before you go.`}
              </p>
              {place.live.sources.length > 0 && (
                <ul className="sources">
                  {place.live.sources.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noreferrer">
                        {s.title || new URL(s.url).hostname} <IconExternal size={11} />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          <div className="detail-map">
            <MapView points={[{ lat: place.location.lat, lng: place.location.lng, label: place.name, color: cat.color }]} home={{ ...stay, label: stay.name }} line theme="dark" />
          </div>
          <div className="map-actions">
            <a className="address" href={maps} target="_blank" rel="noreferrer">
              <IconPin size={16} />
              <span>{place.location.address}</span>
              <IconExternal size={13} />
            </a>
            <a className="btn directions" href={directions} target="_blank" rel="noreferrer">
              <IconCar size={16} /> Directions
            </a>
          </div>
        </div>

        <div className="sheet-actions">
          {isSaved ? (
            <button className="btn wide" onClick={() => { onUnsave(place.id); onClose(); }}>
              <IconHeart size={16} filled /> Saved · tap to remove
            </button>
          ) : (
            <>
              <button className="btn" onClick={() => act("pass")}>
                <IconX size={16} /> Pass
              </button>
              <button className="btn" onClick={() => act("more")}>
                <IconArrow size={16} /> More like this
              </button>
              <button className="btn primary" onClick={() => act("save")}>
                <IconHeart size={16} filled /> Save
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function Fact({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="fact">
      <span className="fact-label">
        {icon} {label}
      </span>
      <span className="fact-value">{value}</span>
      {sub && <span className="fact-sub">{sub}</span>}
    </div>
  );
}

function Section({ icon, title, badge, tone, children }: { icon: ReactNode; title: string; badge?: ReactNode; tone?: string; children: ReactNode }) {
  return (
    <section className={`dsec ${tone ? `dsec-${tone}` : ""}`}>
      <header>
        <h3>
          {icon} {title}
        </h3>
        {badge}
      </header>
      {children}
    </section>
  );
}
