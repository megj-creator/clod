"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { fmtDay } from "@/lib/dates";
import { formatDrive } from "@/lib/geo";
import type { Place } from "@/lib/types";
import { weatherEmoji, type Weather } from "@/lib/weather";
import type { Decision } from "./Discover";
import {
  IconAlert, IconArrow, IconBaby, IconCar, IconChat, IconClock, IconExternal, IconFlame, IconHeart, IconPin, IconRain, IconSparkle, IconTicket, IconX,
} from "./icons";
import { PlaceImage } from "./PlaceImage";
import { CATS, DEPTH, HypeMeter, KidDots, VerifyBadge, priceLong } from "./ui";

export function DetailSheet({
  place,
  drive,
  byId,
  dates,
  forecast,
  isSaved,
  onClose,
  onDecide,
  onUnsave,
  onOpen,
}: {
  place: Place;
  drive: number;
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
                  "Painted placeholder. Licensed photos are next on the list."
                )}
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="detail-body">
          <div className="detail-badges">
            <span className={`depth depth-${place.depth}`}>{DEPTH[place.depth].label}</span>
            <span className="cat-chip">
              {cat.emoji} {cat.label}
            </span>
            <span className="detail-hood">{place.neighborhood}</span>
          </div>
          <h1 className="detail-title">{place.name}</h1>
          <p className="detail-tagline">{place.tagline}</p>

          <div className="facts">
            <Fact icon={<IconCar size={16} />} label="From your stay" value={formatDrive(drive)} sub="estimate" />
            <Fact icon={<IconTicket size={16} />} label="Price" value={priceLong(place)} sub={place.price.note} />
            <Fact icon={<IconClock size={16} />} label="Plan for" value={formatDrive(place.durationMin)} sub={`best: ${place.bestTime}`} />
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
            {place.realityCheck.officialUrl && (
              <a className="source-link" href={place.realityCheck.officialUrl} target="_blank" rel="noreferrer">
                Official site <IconExternal size={13} />
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
            <p className="micro">Sample forecast, for now</p>
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
            {!place.localsSay.sourced && <p className="micro">Summary for now. Real local sources (Reddit, local writers) are coming next.</p>}
          </Section>

          <Section icon={<IconFlame size={16} />} title="Hype check" badge={<HypeMeter score={place.hypeCheck.score} />}>
            <p>{place.hypeCheck.text}</p>
          </Section>

          <Section icon={<IconBaby size={16} />} title="With little ones" badge={<KidDots score={place.kidFit.score} />}>
            <p>{place.kidFit.notes}</p>
            <p className="micro">{place.kidFit.stroller ? "Stroller-friendly" : "Leave the stroller, bring the carrier"}</p>
          </Section>

          <a className="address" href={maps} target="_blank" rel="noreferrer">
            <IconPin size={16} />
            <span>{place.location.address}</span>
            <IconExternal size={13} />
          </a>
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
