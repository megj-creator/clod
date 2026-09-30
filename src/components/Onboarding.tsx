"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { addDaysIso } from "@/lib/dates";
import { CitySearchError, searchCity } from "@/lib/cities";
import type { City, TripSetup } from "@/lib/types";
import { IconArrow, IconBack, IconCheck, IconSearch, IconX } from "./icons";

const STEPS = ["welcome", "city", "when", "stay", "limits", "crew"] as const;

function defaults(city: City): TripSetup {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14);
  const iso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  return {
    cityId: city.id,
    start: iso,
    end: addDaysIso(iso, 4),
    stayId: city.stays[0].id,
    hotelName: "",
    maxDrive: NaN,
    maxPrice: NaN,
    adults: 2,
    toddler: false,
    baby: false,
    napStart: "12:30",
    napEnd: "14:30",
  };
}

const SUGGESTIONS = ["Lisbon", "Kyoto", "Asheville, NC", "Mexico City", "Edinburgh", "Santa Fe, NM"];

export function Onboarding({
  city: current,
  featured,
  initial,
  onPickCity,
  onDone,
  onCancel,
}: {
  city: City;
  featured: City;
  initial: TripSetup | null;
  onPickCity: (c: City) => void;
  onDone: (s: TripSetup) => void;
  onCancel?: () => void; // editing an existing trip: leave without changes
}) {
  // Editing an existing trip starts at "Where?" so you can change destination too
  const [step, setStep] = useState(initial ? 1 : 0);
  const [dir, setDir] = useState(1);
  const [city, setCity] = useState<City>(current);
  // (a shared link can open a different city than the saved trip: start from that city's neighborhoods)
  const [s, setS] = useState<TripSetup>(() =>
    initial ? (initial.cityId === current.id ? initial : { ...initial, cityId: current.id, stayId: current.stays[0].id, hotel: undefined }) : defaults(current),
  );
  const [finishing, setFinishing] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const set = <K extends keyof TripSetup>(k: K, v: TripSetup[K]) => setS((prev) => ({ ...prev, [k]: v }));

  const choose = (c: City) => {
    setCity(c);
    setSearchError(null);
    if (c.id !== s.cityId) setS((prev) => ({ ...prev, cityId: c.id, stayId: c.stays[0].id, hotel: undefined, hotelName: "" }));
  };

  // Their hotel or address, found on the map as they type (times are then measured from there)
  const [hotelLook, setHotelLook] = useState<"idle" | "looking" | "none">("idle");
  useEffect(() => {
    const q = s.hotelName.trim();
    if (q.length < 3) {
      setHotelLook("idle");
      if (s.hotel) set("hotel", undefined);
      return;
    }
    if (s.hotel && s.hotel.name === q) return;
    setHotelLook("looking");
    const near = city.generated ? { lat: city.generated.lat, lng: city.generated.lng } : city.stays[0];
    const t = setTimeout(() => {
      fetch("/api/locate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q, near: { lat: near.lat, lng: near.lng }, radius: city.generated?.radius ?? 40, city: city.name }),
      })
        .then((r) => (r.ok ? r.json() : { found: null }))
        .then((d: { found: { name: string; area: string; lat: number; lng: number } | null }) => {
          if (d.found) {
            setS((prev) =>
              prev.hotelName.trim() === q
                ? {
                    ...prev,
                    hotel: {
                      id: `hotel-${d.found!.lat.toFixed(5)},${d.found!.lng.toFixed(5)}`,
                      name: q,
                      // Show what the map matched, so a wrong match is easy to spot
                      area: [d.found!.name, d.found!.area].filter((x, i, a) => x && a.indexOf(x) === i && !(i && a[0].includes(x))).join(", "),
                      lat: d.found!.lat,
                      lng: d.found!.lng,
                    },
                  }
                : prev,
            );
            setHotelLook("idle");
          } else {
            setS((prev) => ({ ...prev, hotel: undefined }));
            setHotelLook("none");
          }
        })
        .catch(() => setHotelLook("none"));
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.hotelName, city.id]);
  const search = async (q: string) => {
    q = q.trim();
    if (!q || searching) return;
    setQuery(q);
    if (/^charleston\b/i.test(q) && !/wv|west virginia|il\b|illinois/i.test(q)) return choose(featured);
    setSearching(q);
    setSearchError(null);
    try {
      choose(await searchCity(q));
    } catch (e) {
      setSearchError(e instanceof CitySearchError ? e.message : "Something went wrong. Try again.");
    } finally {
      setSearching(null);
    }
  };

  const valid: Record<(typeof STEPS)[number], boolean> = {
    welcome: true,
    city: !searching && s.cityId === city.id,
    when: !!s.start && !!s.end && s.end >= s.start,
    stay: !!s.stayId,
    limits: s.maxDrive >= 5 && s.maxDrive <= 300 && s.maxPrice >= 0 && s.maxPrice <= 2000,
    crew: s.adults >= 1,
  };
  const name = STEPS[step];
  const go = (d: number) => {
    setDir(d);
    setStep((n) => n + d);
  };
  const next = () => {
    if (!valid[name]) return;
    if (step === STEPS.length - 1) {
      setFinishing(true);
      setTimeout(() => onDone(s), 1500);
    } else {
      // Picking the city starts finding its places now, while you fill in the rest
      if (name === "city") onPickCity(city);
      go(1);
    }
  };

  return (
    <div className="onb">
      <div className={`onb-hero ${step === 0 ? "tall" : ""}`}>
        {city.hero ? (
          <>
            <img key={city.hero.src} src={city.hero.src} alt={city.name} />
            <span className="onb-credit">📷 {city.hero.credit} · {city.hero.license}</span>
          </>
        ) : (
          <div className="onb-hero-fill" />
        )}
      </div>

      {step > 0 && !finishing && (
        <div className="onb-progress">
          {STEPS.slice(1).map((st, i) => (
            <span key={st} className={i < step ? "on" : ""} />
          ))}
        </div>
      )}

      <div className="onb-panel">
        <AnimatePresence mode="wait" custom={dir}>
          {finishing ? (
            <motion.div key="done" className="onb-step onb-done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
              <span className="done-check">
                <IconCheck size={30} />
              </span>
              <h1 className="display">
                Okay, <em>I have your trip.</em>
              </h1>
              <p className="onb-lede">Let me show you what I found.</p>
            </motion.div>
          ) : (
            <motion.div
              key={name}
              className="onb-step"
              custom={dir}
              initial={{ opacity: 0, x: dir * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -40 }}
              transition={{ duration: 0.28 }}
            >
              {name === "welcome" && (
                <>
                  <p className="wordmark">Uncover</p>
                  <h1 className="display">
                    Go somewhere
                    <br />
                    <em>you wouldn't have found yourself.</em>
                  </h1>
                  <p className="onb-lede">Travel planning without the homework. I do the digging, and you just say yes or no.</p>
                </>
              )}

              {name === "city" && (
                <>
                  <Q>Where are we going?</Q>
                  <form
                    className={`ask city-search ${searching ? "is-thinking" : ""}`}
                    onSubmit={(e) => {
                      e.preventDefault();
                      search(query);
                    }}
                  >
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Any city, town, or island…"
                      aria-label="Search for a destination"
                      enterKeyHint="search"
                      disabled={!!searching}
                    />
                    <button type="submit" aria-label="Search" disabled={!query.trim() || !!searching}>
                      {searching ? <span className="spinner" /> : <IconSearch size={18} />}
                    </button>
                    {searching && <p className="ask-status">Finding {searching}: where people stay, how to get around…</p>}
                  </form>
                  {searchError && <p className="city-error">{searchError}</p>}
                  <div className="city-cards">
                    <button className={`city-card on ${city.hero ? "" : "no-photo"}`} onClick={next} disabled={!!searching}>
                      {city.hero && <img src={city.hero.src} alt="" />}
                      <span>
                        <b>
                          {city.name}
                          {city.state ? <small>, {city.state}</small> : null}
                        </b>
                        {city.tagline}
                        <i className="city-source">{city.generated ? "✦ Found by Gemini just now" : "✓ Hand-checked by locals"}</i>
                      </span>
                      <IconCheck size={18} />
                    </button>
                  </div>
                  <p className="onb-hint">Or try</p>
                  <div className="chip-row">
                    {city.id !== featured.id && (
                      <button className="chip small" onClick={() => { setQuery(""); choose(featured); }} disabled={!!searching}>
                        {featured.name}
                      </button>
                    )}
                    {SUGGESTIONS.filter((q) => !q.toLowerCase().startsWith(city.name.toLowerCase())).slice(0, 5).map((q) => (
                      <button key={q} className="chip small" onClick={() => search(q)} disabled={!!searching}>
                        {q}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {name === "when" && (
                <>
                  <Q>When?</Q>
                  <div className="date-row">
                    <label className="field">
                      <span>Arrive</span>
                      <input type="date" value={s.start} onChange={(e) => { set("start", e.target.value); if (e.target.value > s.end) set("end", e.target.value); }} />
                    </label>
                    <label className="field">
                      <span>Leave</span>
                      <input type="date" value={s.end} min={s.start} onChange={(e) => set("end", e.target.value)} />
                    </label>
                  </div>
                </>
              )}

              {name === "stay" && (
                <>
                  <Q>Where are you staying?</Q>
                  <p className="onb-hint">Every travel time is measured from here.</p>
                  <div className="stay-list">
                    {city.stays.map((st) => (
                      <button key={st.id} className={`stay ${s.stayId === st.id ? "on" : ""}`} onClick={() => set("stayId", st.id)}>
                        <b>{st.name}</b>
                        <span>{st.area}</span>
                      </button>
                    ))}
                  </div>
                  <label className="field">
                    <span>Hotel, rental, or address (optional)</span>
                    <input
                      type="text"
                      value={s.hotelName}
                      placeholder={city.generated ? "e.g. the hotel name or street address" : "e.g. The Vendue"}
                      onChange={(e) => set("hotelName", e.target.value)}
                    />
                  </label>
                  {s.hotelName.trim().length >= 3 && (
                    <p className={`hotel-found ${s.hotel ? "ok" : ""}`}>
                      {hotelLook === "looking"
                        ? "Looking it up on the map…"
                        : s.hotel
                          ? `📍 Found it: ${s.hotel.area}. I'll measure from here.`
                          : `Couldn't find that on the map, so I'll measure from ${city.stays.find((st) => st.id === s.stayId)?.name ?? "the neighborhood"}.`}
                    </p>
                  )}
                </>
              )}

              {name === "limits" && (
                <>
                  <Q>Your limits</Q>
                  <p className="onb-hint">I'll only show you things inside these, unless you ask.</p>
                  <div className="travel-choice">
                    <span>Getting around</span>
                    <div className="toggle-row">
                      <button className={`toggle ${s.travel !== "walk" ? "on" : ""}`} onClick={() => set("travel", "drive")}>
                        🚗 By car
                      </button>
                      <button className={`toggle ${s.travel === "walk" ? "on" : ""}`} onClick={() => set("travel", "walk")}>
                        🚶 On foot & transit
                      </button>
                    </div>
                  </div>
                  <label className="big-field">
                    <span>{s.travel === "walk" ? "Longest trip from your stay (walking or transit)" : "Longest drive from your stay"}</span>
                    <div>
                      <input
                        inputMode="numeric"
                        type="number"
                        placeholder="30"
                        value={Number.isNaN(s.maxDrive) ? "" : s.maxDrive}
                        onChange={(e) => set("maxDrive", e.target.value === "" ? NaN : Number(e.target.value))}
                      />
                      <em>minutes</em>
                    </div>
                  </label>
                  <label className="big-field">
                    <span>Most you'd pay per person, per activity</span>
                    <div>
                      <b>$</b>
                      <input
                        inputMode="numeric"
                        type="number"
                        placeholder="40"
                        value={Number.isNaN(s.maxPrice) ? "" : s.maxPrice}
                        onChange={(e) => set("maxPrice", e.target.value === "" ? NaN : Number(e.target.value))}
                      />
                      <em>per person</em>
                    </div>
                  </label>
                </>
              )}

              {name === "crew" && (
                <>
                  <Q>Who's coming?</Q>
                  <div className="crew-row">
                    <span>Adults</span>
                    <div className="stepper">
                      <button onClick={() => set("adults", Math.max(1, s.adults - 1))} aria-label="Fewer adults">−</button>
                      <b>{s.adults}</b>
                      <button onClick={() => set("adults", Math.min(12, s.adults + 1))} aria-label="More adults">+</button>
                    </div>
                  </div>
                  <div className="toggle-row">
                    <button className={`toggle ${s.toddler ? "on" : ""}`} onClick={() => set("toddler", !s.toddler)}>
                      🧸 Toddler
                    </button>
                    <button className={`toggle ${s.baby ? "on" : ""}`} onClick={() => set("baby", !s.baby)}>
                      🍼 Baby
                    </button>
                  </div>
                  {(s.toddler || s.baby) && (
                    <motion.div className="nap" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
                      <p className="onb-hint">Nap window. I'll plan around it, and long drives can double as nap time.</p>
                      <div className="date-row">
                        <label className="field">
                          <span>From</span>
                          <input type="time" value={s.napStart} onChange={(e) => set("napStart", e.target.value)} />
                        </label>
                        <label className="field">
                          <span>To</span>
                          <input type="time" value={s.napEnd} onChange={(e) => set("napEnd", e.target.value)} />
                        </label>
                      </div>
                    </motion.div>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {!finishing && (
          <div className="onb-nav">
            {onCancel && step === 1 ? (
              <button className="icon-btn" onClick={onCancel} aria-label="Cancel, keep my trip as it was">
                <IconX size={18} />
              </button>
            ) : step > 0 ? (
              <button className="icon-btn" onClick={() => go(-1)} aria-label="Back">
                <IconBack size={18} />
              </button>
            ) : (
              <span />
            )}
            <button className="btn primary grow" onClick={next} disabled={!valid[name]}>
              {step === 0 ? "Start a trip" : step === STEPS.length - 1 ? "Find my discoveries" : "Next"} <IconArrow size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Q({ children }: { children: ReactNode }) {
  return <h1 className="display onb-q">{children}</h1>;
}
