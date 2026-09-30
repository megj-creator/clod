"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { addDaysIso } from "@/lib/dates";
import type { City, TripSetup } from "@/lib/types";
import { IconArrow, IconBack, IconCheck } from "./icons";

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

export function Onboarding({ city, initial, onDone }: { city: City; initial: TripSetup | null; onDone: (s: TripSetup) => void }) {
  const [step, setStep] = useState(initial ? 2 : 0);
  const [dir, setDir] = useState(1);
  const [s, setS] = useState<TripSetup>(initial ?? defaults(city));
  const [finishing, setFinishing] = useState(false);
  const set = <K extends keyof TripSetup>(k: K, v: TripSetup[K]) => setS((prev) => ({ ...prev, [k]: v }));

  const valid: Record<(typeof STEPS)[number], boolean> = {
    welcome: true,
    city: true,
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
    } else go(1);
  };

  return (
    <div className="onb">
      <div className={`onb-hero ${step === 0 ? "tall" : ""}`}>
        <img src={city.hero.src} alt="Rainbow Row, Charleston" />
        <span className="onb-credit">📷 {city.hero.credit} · {city.hero.license}</span>
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
                  <div className="city-cards">
                    <button className="city-card on" onClick={next}>
                      <img src={city.hero.src} alt="" />
                      <span>
                        <b>{city.name}</b>
                        {city.tagline}
                      </span>
                      <IconCheck size={18} />
                    </button>
                    <div className="city-card soon">
                      <span>
                        <b>Austin</b>Next up
                      </span>
                    </div>
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
                  <p className="onb-hint">Every drive time is measured from here.</p>
                  <div className="stay-list">
                    {city.stays.map((st) => (
                      <button key={st.id} className={`stay ${s.stayId === st.id ? "on" : ""}`} onClick={() => set("stayId", st.id)}>
                        <b>{st.name}</b>
                        <span>{st.area}</span>
                      </button>
                    ))}
                  </div>
                  <label className="field">
                    <span>Hotel or rental name (optional)</span>
                    <input type="text" value={s.hotelName} placeholder="e.g. The Vendue" onChange={(e) => set("hotelName", e.target.value)} />
                  </label>
                </>
              )}

              {name === "limits" && (
                <>
                  <Q>Your limits</Q>
                  <p className="onb-hint">I'll only show you things inside these, unless you ask.</p>
                  <label className="big-field">
                    <span>Longest drive from your stay</span>
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
            {step > 0 ? (
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
