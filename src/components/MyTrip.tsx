"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { fmtDay, fmtRange, fmtTime } from "@/lib/dates";
import { formatDrive } from "@/lib/geo";
import { buildPlan, type PlanDay, type PlaceStop } from "@/lib/plan";
import { LIKED_OPTIONS } from "@/lib/taste";
import type { AppState, City, Place, Rating, Stay } from "@/lib/types";
import { weatherEmoji, type Weather } from "@/lib/weather";
import { IconCar, IconEdit, IconMoon, IconRain, IconSparkle, IconTicket, IconX } from "./icons";
import { PlaceImage } from "./PlaceImage";
import { CATS } from "./ui";

const BUILD_LINES = ["Grouping by neighborhood…", "Fitting it around nap time…", "Adding rain backups…"];

type Props = {
  city: City;
  stay: Stay;
  state: AppState;
  byId: Record<string, Place>;
  drives: Record<string, number>;
  forecast: Record<string, Weather>;
  onBuild: () => void;
  onUnsave: (id: string) => void;
  onFeedback: (id: string, rating: Rating, liked: string[]) => void;
  onOpen: (id: string) => void;
  onEdit: () => void;
  onDiscover: () => void;
};

export function MyTrip({ city, stay, state, byId, drives, forecast, onBuild, onUnsave, onFeedback, onOpen, onEdit, onDiscover }: Props) {
  const setup = state.setup!;
  const kids = setup.toddler || setup.baby;
  const saved = state.saved.map((id) => byId[id]).filter(Boolean);
  const [building, setBuilding] = useState(false);
  const [line, setLine] = useState(0);

  const plan = useMemo(() => {
    if (!state.planFor) return null;
    const places = state.planFor.map((id) => byId[id]).filter(Boolean);
    return buildPlan({ places, setup, stay, city, forecast });
  }, [state.planFor, byId, setup, stay, city, forecast]);

  const planStale = !!state.planFor && (state.planFor.length !== state.saved.length || state.planFor.some((id) => !state.saved.includes(id)));

  const build = () => {
    setBuilding(true);
    setLine(0);
    BUILD_LINES.forEach((_, i) => setTimeout(() => setLine(i), i * 650));
    setTimeout(() => {
      onBuild();
      setBuilding(false);
    }, BUILD_LINES.length * 650 + 250);
  };

  const crew = [
    `${setup.adults} ${setup.adults === 1 ? "adult" : "adults"}`,
    setup.toddler && "toddler",
    setup.baby && "baby",
  ].filter(Boolean).join(" · ");

  return (
    <div className="screen trip">
      <header className="trip-head">
        <div className="trip-head-img">
          <img src={city.hero.src} alt="" />
        </div>
        <div className="trip-head-body">
          <p className="eyebrow">Your trip</p>
          <h1 className="display">
            {city.name}
            <em>, {fmtRange(setup.start, setup.end)}</em>
          </h1>
          <p className="trip-meta">
            {setup.hotelName || stay.name} · {crew}
          </p>
          <p className="trip-meta dim">
            Up to {formatDrive(setup.maxDrive)} away · up to ${setup.maxPrice} per person
          </p>
          <button className="icon-btn trip-edit" onClick={onEdit} aria-label="Edit trip">
            <IconEdit size={16} />
          </button>
        </div>
      </header>

      <section className="shelf-wrap">
        <div className="section-head">
          <h2>Saved</h2>
          <span>{saved.length}</span>
        </div>
        {saved.length ? (
          <div className="shelf">
            {saved.map((p) => (
              <div key={p.id} className="shelf-card" style={{ ["--cat" as string]: CATS[p.category].color }}>
                <button className="shelf-open" onClick={() => onOpen(p.id)}>
                  <PlaceImage place={p} />
                  <span className="shelf-name">{p.name}</span>
                  <span className="shelf-sub">{formatDrive(drives[p.id])}</span>
                </button>
                <button className="shelf-x" onClick={() => onUnsave(p.id)} aria-label={`Remove ${p.name}`}>
                  <IconX size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-note">
            <p>Nothing saved yet. Swipe right on anything that feels like you.</p>
            <button className="btn primary" onClick={onDiscover}>
              Start discovering
            </button>
          </div>
        )}
      </section>

      {saved.length > 0 && (!plan || planStale) && (
        <motion.section className="build-cta" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <IconSparkle size={22} />
          <p className="display-sm">
            {plan
              ? "Your saves changed. Want me to rebuild the plan?"
              : `You saved ${saved.length} ${saved.length === 1 ? "thing" : "things"}. Want me to build ${saved.length === 1 ? "it" : "these"} into your trip?`}
          </p>
          <button className="btn primary wide" onClick={build}>
            {plan ? "Rebuild my trip" : "Build my trip"}
          </button>
        </motion.section>
      )}

      <AnimatePresence>
        {building && (
          <motion.div className="building" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="building-cal">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            <AnimatePresence mode="wait">
              <motion.p key={line} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                {BUILD_LINES[line]}
              </motion.p>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {plan && (
        <section className="plan">
          {plan.map((day, i) => (
            <DayCard key={day.date} day={day} index={i} kids={kids} byId={byId} stayName={setup.hotelName || stay.name} state={state} onOpen={onOpen} onFeedback={onFeedback} />
          ))}
        </section>
      )}

      <section className="paper-card getting-around">
        <h3>
          <IconCar size={16} /> Getting around
        </h3>
        <ul>
          {city.gettingAround.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      <p className="fine-print">
        Prototype: drive times are estimates, the forecast is a sample, and facts marked "unverified" haven't
        been checked against official sites yet.
      </p>
    </div>
  );
}

function DayCard({
  day,
  index,
  kids,
  byId,
  stayName,
  state,
  onOpen,
  onFeedback,
}: {
  day: PlanDay;
  index: number;
  kids: boolean;
  byId: Record<string, Place>;
  stayName: string;
  state: AppState;
  onOpen: (id: string) => void;
  onFeedback: (id: string, rating: Rating, liked: string[]) => void;
}) {
  const [rainMode, setRainMode] = useState(day.weather?.kind === "rain");
  const f = fmtDay(day.date);
  const hasOutdoor = day.stops.some((s) => s.kind === "place" && !s.place.indoor);

  return (
    <motion.article
      className={`paper-card day ${rainMode ? "is-rain" : ""}`}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
    >
      <header className="day-head">
        <div>
          <p className="day-weekday">{f.long}</p>
          <p className="day-date">
            {f.short}
            {day.area && <span> · {day.area}</span>}
          </p>
        </div>
        {day.weather && (
          <span className={`weather-pill w-${day.weather.kind}`}>
            {weatherEmoji(day.weather.kind)} {day.weather.hi}° · {day.weather.label}
          </span>
        )}
      </header>

      {day.weather?.kind === "rain" && hasOutdoor && (
        <p className="rain-banner">
          <IconRain size={15} /> Rain likely, so I've swapped in your rain plan.
        </p>
      )}
      {hasOutdoor && (
        <label className="rain-toggle">
          <input type="checkbox" checked={rainMode} onChange={(e) => setRainMode(e.target.checked)} />
          <span className="switch" />
          If it rains
        </label>
      )}

      {day.stops.length === 0 ? (
        <p className="open-day">Open day. Rest, pool time, or tap Surprise me.</p>
      ) : (
        <ol className="timeline">
          {day.stops.map((s, i) =>
            s.kind === "nap" ? (
              <li key={`nap-${i}`} className="stop nap">
                <span className="stop-time">{fmtTime(s.time)}</span>
                <div className="stop-body">
                  <p className="stop-name">
                    <IconMoon size={15} /> Nap window, until {fmtTime(s.end)}
                  </p>
                  <p className="stop-meta">{s.text}</p>
                </div>
              </li>
            ) : (
              <PlaceRow
                key={s.place.id}
                stop={s}
                first={i === 0}
                rainMode={rainMode}
                backup={s.place.rainPlan.backupId ? byId[s.place.rainPlan.backupId] ?? null : null}
                stayName={stayName}
                kids={kids}
                fb={state.feedback[s.place.id]}
                onOpen={onOpen}
                onFeedback={onFeedback}
              />
            ),
          )}
        </ol>
      )}

      {day.tip && <p className="day-tip">🧭 {day.tip}</p>}
    </motion.article>
  );
}

function PlaceRow({
  stop,
  first,
  rainMode,
  backup,
  stayName,
  fb,
  onOpen,
  onFeedback,
}: {
  stop: PlaceStop;
  first: boolean;
  rainMode: boolean;
  backup: Place | null;
  stayName: string;
  kids: boolean;
  fb?: { rating: Rating; liked: string[] };
  onOpen: (id: string) => void;
  onFeedback: (id: string, rating: Rating, liked: string[]) => void;
}) {
  const p = stop.place;
  const swapped = rainMode && !p.indoor;
  const shown = swapped && backup ? backup : p;
  const [asking, setAsking] = useState<null | "rate" | Rating>(null);
  const [liked, setLiked] = useState<string[]>([]);

  return (
    <li className={`stop ${swapped ? "swapped" : ""}`} style={{ ["--cat" as string]: CATS[shown.category].color }}>
      <span className="stop-time">{fmtTime(stop.time)}</span>
      <div className="stop-body">
        <p className="stop-drive">
          <IconCar size={12} /> {formatDrive(stop.driveFromPrev)} {first ? `from ${stayName}` : "drive"}
        </p>
        {swapped && (
          <p className="stop-was">
            <s>{p.name}</s> <span>Rain plan</span>
          </p>
        )}
        <button className="stop-name as-link" onClick={() => onOpen(shown.id)}>
          <span className="stop-emoji">{CATS[shown.category].emoji}</span> {shown.name}
        </button>
        <p className="stop-meta">
          {swapped && !backup ? p.rainPlan.text : `${formatDrive(shown.durationMin)} · ${shown.price.perPerson === 0 ? "Free" : `~$${shown.price.perPerson}/person`}`}
        </p>
        {stop.notes.map((n) => (
          <p key={n} className="stop-note">{n}</p>
        ))}
        {shown.booking.best && (
          <p className="stop-book">
            <IconTicket size={13} /> {shown.booking.best}
          </p>
        )}

        {fb ? (
          <p className="fb-done">
            {fb.rating === "loved" ? "😍 Loved it" : fb.rating === "good" ? "🙂 It was good" : "😐 Not really my thing"}
            {fb.liked.length > 0 && ` · ${fb.liked.join(", ")}`}
          </p>
        ) : asking === null ? (
          <button className="fb-ask" onClick={() => setAsking("rate")}>
            Been? How was it?
          </button>
        ) : asking === "rate" ? (
          <div className="fb-row">
            {(["loved", "good", "meh"] as Rating[]).map((r) => (
              <button key={r} className="chip small" onClick={() => (r === "meh" ? onFeedback(p.id, r, []) : setAsking(r))}>
                {r === "loved" ? "😍 Loved it" : r === "good" ? "🙂 Good" : "😐 Meh"}
              </button>
            ))}
          </div>
        ) : (
          <div className="fb-row">
            <p className="fb-q">What did you like?</p>
            {LIKED_OPTIONS.map((o) => (
              <button
                key={o}
                className={`chip small ${liked.includes(o) ? "on" : ""}`}
                onClick={() => setLiked((l) => (l.includes(o) ? l.filter((x) => x !== o) : [...l, o]))}
              >
                {o}
              </button>
            ))}
            <button className="chip small solid" onClick={() => onFeedback(p.id, asking, liked)}>
              Done
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
