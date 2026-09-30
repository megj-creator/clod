"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { fmtDay, fmtRange, fmtTime } from "@/lib/dates";
import { formatDrive } from "@/lib/geo";
import { buildPlan, type PlanDay, type PlaceStop } from "@/lib/plan";
import { LIKED_OPTIONS } from "@/lib/taste";
import type { AppState, City, Place, Rating, Stay } from "@/lib/types";
import { weatherEmoji, type Weather } from "@/lib/weather";
import { IconCalendar, IconCar, IconEdit, IconMoon, IconPin, IconRain, IconShare, IconSparkle, IconTicket, IconX } from "./icons";
import { MapView } from "./MapView";
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
  onAddToPlan: (id: string) => void;
  onToast: (text: string) => void;
};

export function MyTrip({ city, stay, state, byId, drives, forecast, onBuild, onUnsave, onFeedback, onOpen, onEdit, onDiscover, onAddToPlan, onToast }: Props) {
  const setup = state.setup!;
  const kids = setup.toddler || setup.baby;
  const saved = state.saved.map((id) => byId[id]).filter(Boolean);
  const stayName = setup.hotelName || stay.name;
  const [building, setBuilding] = useState(false);
  const [line, setLine] = useState(0);

  const plan = useMemo(() => {
    if (!state.planFor) return null;
    const places = state.planFor.map((id) => byId[id]).filter(Boolean);
    return buildPlan({ places, setup, stay, city, forecast });
  }, [state.planFor, byId, setup, stay, city, forecast]);

  const planStale = !!state.planFor && (state.planFor.length !== state.saved.length || state.planFor.some((id) => !state.saved.includes(id)));

  // Ideas for light days: unsaved places inside your limits, nearest first, rain-aware, no repeats
  const ideas = useMemo(() => {
    if (!plan) return {} as Record<string, Place[]>;
    const taken = new Set([...state.saved, ...Object.keys(state.passed)]);
    const pool = city.places
      .filter((p) => !taken.has(p.id) && drives[p.id] <= setup.maxDrive && p.price.perPerson <= setup.maxPrice)
      .filter((p) => !kids || p.kidFit.score >= 2)
      .sort((a, b) => drives[a.id] - drives[b.id]);
    const used = new Set<string>();
    const out: Record<string, Place[]> = {};
    for (const day of plan) {
      const count = day.stops.filter((s) => s.kind === "place").length;
      if (count >= 2) continue;
      const hasMeal = day.stops.some((s) => s.kind === "place" && s.place.category === "eat");
      const rainy = day.weather?.kind === "rain";
      const picks = pool
        .filter((p) => !used.has(p.id) && (!rainy || p.indoor) && (!hasMeal || p.category !== "eat"))
        .filter((p) => !p.openDays || p.openDays.includes(new Date(`${day.date}T12:00:00`).getDay()))
        .slice(0, 2);
      picks.forEach((p) => used.add(p.id));
      if (picks.length) out[day.date] = picks;
    }
    return out;
  }, [plan, city.places, state.saved, state.passed, drives, setup.maxDrive, setup.maxPrice, kids]);

  const planText = () => {
    if (!plan) return "";
    const lines = [`${city.name} · ${fmtRange(setup.start, setup.end)} (planned with Uncover)`, ""];
    for (const d of plan) {
      const f = fmtDay(d.date);
      lines.push(`${f.long}, ${f.short}${d.weather ? ` · ${weatherEmoji(d.weather.kind)} ${d.weather.hi}°` : ""}`);
      const places = d.stops.filter((s): s is PlaceStop => s.kind === "place");
      if (!places.length) lines.push("  Open day");
      for (const s of places) lines.push(`  ${fmtTime(s.time)}  ${s.place.name}${s.place.booking.best ? ` (${s.place.booking.best})` : ""}`);
      lines.push("");
    }
    return lines.join("\n");
  };

  const share = async () => {
    const text = planText();
    try {
      if (navigator.share) {
        await navigator.share({ title: `${city.name} trip`, text, url: window.location.origin });
        return;
      }
      await navigator.clipboard.writeText(text);
      onToast("Trip copied. Paste it anywhere.");
    } catch {
      /* user cancelled share */
    }
  };

  const toCalendar = () => {
    if (!plan) return;
    const stamp = (date: string, min: number) => `${date.replace(/-/g, "")}T${String(Math.floor(min / 60)).padStart(2, "0")}${String(min % 60).padStart(2, "0")}00`;
    const esc = (s: string) => s.replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
    const events = plan.flatMap((d) =>
      d.stops
        .filter((s): s is PlaceStop => s.kind === "place")
        .map((s) =>
          [
            "BEGIN:VEVENT",
            `UID:${d.date}-${s.place.id}@uncover`,
            `DTSTAMP:${stamp(d.date, 0)}Z`,
            `DTSTART:${stamp(d.date, s.time)}`,
            `DTEND:${stamp(d.date, s.time + s.place.durationMin)}`,
            `SUMMARY:${esc(s.place.name)}`,
            `LOCATION:${esc(s.place.location.address)}`,
            `DESCRIPTION:${esc([s.place.insiderTip, s.place.booking.best && `Booking: ${s.place.booking.best}`].filter(Boolean).join("\n"))}`,
            "END:VEVENT",
          ].join("\r\n"),
        ),
    );
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Uncover//Trip//EN", ...events, "END:VCALENDAR"].join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${city.id}-trip.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    onToast("Calendar file saved. Open it to add the trip.");
  };

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
          {city.hero && <img src={city.hero.src} alt="" />}
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
          {plan && (
            <div className="trip-actions">
              <button className="btn small" onClick={share}>
                <IconShare size={14} /> Share
              </button>
              <button className="btn small" onClick={toCalendar}>
                <IconCalendar size={14} /> Add to calendar
              </button>
            </div>
          )}
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

      {saved.length > 0 && !plan && (
        <div className="trip-map">
          <MapView
            points={saved.map((p) => ({ lat: p.location.lat, lng: p.location.lng, label: p.name, color: CATS[p.category].color, onClick: () => onOpen(p.id) }))}
            home={{ ...stay, label: stayName }}
            theme="dark"
          />
        </div>
      )}

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
            <DayCard
              key={day.date}
              day={day}
              index={i}
              kids={kids}
              byId={byId}
              stay={stay}
              stayName={stayName}
              state={state}
              ideas={ideas[day.date] ?? []}
              drives={drives}
              onOpen={onOpen}
              onFeedback={onFeedback}
              onAdd={onAddToPlan}
            />
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
  stay,
  stayName,
  state,
  ideas,
  drives,
  onOpen,
  onFeedback,
  onAdd,
}: {
  day: PlanDay;
  index: number;
  kids: boolean;
  byId: Record<string, Place>;
  stay: Stay;
  stayName: string;
  state: AppState;
  ideas: Place[];
  drives: Record<string, number>;
  onOpen: (id: string) => void;
  onFeedback: (id: string, rating: Rating, liked: string[]) => void;
  onAdd: (id: string) => void;
}) {
  const [rainMode, setRainMode] = useState(day.weather?.kind === "rain");
  const [showMap, setShowMap] = useState(false);
  const f = fmtDay(day.date);
  const hasOutdoor = day.stops.some((s) => s.kind === "place" && !s.place.indoor);
  const placeStops = day.stops.filter((s): s is PlaceStop => s.kind === "place");
  const shownFor = (s: PlaceStop) => {
    const b = s.place.rainPlan.backupId ? byId[s.place.rainPlan.backupId] : null;
    return rainMode && !s.place.indoor && b ? b : s.place;
  };

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
      <div className="day-controls">
        {hasOutdoor && (
          <label className="rain-toggle">
            <input type="checkbox" checked={rainMode} onChange={(e) => setRainMode(e.target.checked)} />
            <span className="switch" />
            If it rains
          </label>
        )}
        {placeStops.length > 0 && (
          <button className={`map-toggle ${showMap ? "on" : ""}`} onClick={() => setShowMap((v) => !v)}>
            <IconPin size={13} /> {showMap ? "Hide map" : "Map"}
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {showMap && (
          <motion.div className="day-map" initial={{ height: 0, opacity: 0 }} animate={{ height: 220, opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <MapView
              theme="light"
              line
              home={{ ...stay, label: stayName }}
              points={placeStops.map((s, i) => {
                const p = shownFor(s);
                return { lat: p.location.lat, lng: p.location.lng, label: p.name, n: i + 1, color: CATS[p.category].color, onClick: () => onOpen(p.id) };
              })}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {day.stops.length === 0 ? (
        <p className="open-day">Open day. Rest, pool time, or add one of these.</p>
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

      {ideas.length > 0 && (
        <div className="ideas">
          <p className="ideas-label">{day.stops.length === 0 ? "Ideas nearby" : "Room for one more?"}</p>
          {ideas.map((p) => (
            <div key={p.id} className="idea" style={{ ["--cat" as string]: CATS[p.category].color }}>
              <button className="idea-open" onClick={() => onOpen(p.id)}>
                <PlaceImage place={p} />
                <span>
                  <b>{p.name}</b>
                  <small>
                    {formatDrive(drives[p.id])} · {p.price.perPerson === 0 ? "Free" : p.price.label}
                    {p.indoor ? " · indoor" : ""}
                  </small>
                </span>
              </button>
              <button className="idea-add" onClick={() => onAdd(p.id)} aria-label={`Add ${p.name} to this trip`}>
                +
              </button>
            </div>
          ))}
        </div>
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
        <a
          className="stop-dir"
          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${shown.name}, ${shown.location.address}`)}`}
          target="_blank"
          rel="noreferrer"
        >
          Directions ↗
        </a>
        {shown.realityCheck.officialUrl && (
          <a className="stop-dir" href={shown.realityCheck.officialUrl} target="_blank" rel="noreferrer">
            Website ↗
          </a>
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
