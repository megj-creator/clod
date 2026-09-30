"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { tripDates } from "@/lib/dates";
import { estimateDriveMinutes } from "@/lib/geo";
import { chipIntent, type Intent } from "@/lib/intent";
import { initialState, useAppState } from "@/lib/store";
import { REASONS, applySignal } from "@/lib/taste";
import type { AppState, City, Place, Rating } from "@/lib/types";
import { play } from "@/lib/sfx";
import { fetchForecast, sampleForecast, type Weather } from "@/lib/weather";
import { Burst } from "./Burst";
import { DetailSheet } from "./DetailSheet";
import { Discover, type Decision } from "./Discover";
import { IconCompass, IconSparkle, IconSuitcase, IconUndo } from "./icons";
import { MyTrip } from "./MyTrip";
import { Onboarding } from "./Onboarding";
import { Surprise } from "./Surprise";
import { TasteSheet } from "./TasteSheet";

type Tab = "discover" | "surprise" | "trip";
type Toast = { id: number; kind: "why" | "info"; placeId?: string; text: string; undo?: AppState };

export default function UncoverApp({ city }: { city: City }) {
  const { state, update, replace, ready } = useAppState();
  const [tab, setTab] = useState<Tab>("discover");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [tasteOpen, setTasteOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [depthLevel, setDepthLevel] = useState(1);
  const [toast, setToast] = useState<Toast | null>(null);
  const [burst, setBurst] = useState<{ id: number; kind: "save" | "sparkle"; x: string; y: string } | null>(null);

  // The curated list plus anything Gemini hunted down live
  const allPlaces = useMemo(() => [...city.places, ...Object.values(state.found ?? {})], [city.places, state.found]);
  const cityView = useMemo(() => ({ ...city, places: allPlaces }), [city, allPlaces]);
  const byId = useMemo(() => Object.fromEntries(allPlaces.map((p) => [p.id, p])) as Record<string, Place>, [allPlaces]);
  const stay = city.stays.find((s) => s.id === state.setup?.stayId) ?? city.stays[0];
  const drives = useMemo(
    () => Object.fromEntries(allPlaces.map((p) => [p.id, estimateDriveMinutes(stay, p.location)])) as Record<string, number>,
    [allPlaces, stay],
  );
  const dates = useMemo(() => (state.setup ? tripDates(state.setup.start, state.setup.end) : []), [state.setup]);
  const [forecast, setForecast] = useState<Record<string, Weather>>(() => sampleForecast(dates));
  useEffect(() => {
    setForecast(sampleForecast(dates));
    if (!dates.length) return;
    let live = true;
    fetchForecast(stay.lat, stay.lng, dates)
      .then((f) => live && setForecast(f))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [dates, stay.lat, stay.lng]);

  const fire = (kind: "save" | "sparkle", x = "50%", y = "84%") => setBurst({ id: Date.now(), kind, x, y });
  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setBurst(null), 1400);
    return () => clearTimeout(t);
  }, [burst]);

  // Deep links, e.g. /?tab=trip or /?mood=eat
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = q.get("tab");
    if (t === "discover" || t === "surprise" || t === "trip") setTab(t);
    const mood = q.get("mood");
    if (mood) setIntent(chipIntent(mood));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), toast.kind === "why" ? 7000 : 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const decide = (id: string, d: Decision) => {
    const place = byId[id];
    const before = state;
    update((s) => {
      const saved = d === "pass" ? s.saved : s.saved.includes(id) ? s.saved : [...s.saved, id];
      return {
        ...s,
        saved,
        passed: d === "pass" ? { ...s.passed, [id]: [] } : s.passed,
        moreLike: d === "more" ? [...s.moreLike, id] : s.moreLike,
        taste: applySignal(s.taste, place, d),
      };
    });
    play(d === "save" ? "save" : d === "more" ? "more" : "pass");
    if (d !== "pass") fire("save", d === "more" ? "50%" : "68%");
    const count = d === "pass" ? state.saved.length : state.saved.length + 1;
    setToast({
      id: Date.now(),
      kind: d === "pass" ? "why" : "info",
      placeId: id,
      text: d === "pass" ? "Not for you. What didn't you like?" : d === "more" ? `Saved, and I'll find more like it (${count})` : `Saved to your trip (${count})`,
      undo: before,
    });
  };

  const addReason = (id: string, reason: string) => {
    const place = byId[id];
    update((s) => ({
      ...s,
      passed: { ...s.passed, [id]: [...(s.passed[id] ?? []), reason] },
      taste: applySignal(s.taste, place, reason as (typeof REASONS)[number]["id"]),
    }));
  };

  const unsave = (id: string) => update((s) => ({ ...s, saved: s.saved.filter((x) => x !== id) }));

  // Keep live finds so a saved one survives a reload
  const addFound = (places: Place[]) =>
    update((s) => ({ ...s, found: { ...(s.found ?? {}), ...Object.fromEntries(places.map((p) => [p.id, p])) } }));

  // From "fill this day": save it and slot it straight into the existing plan
  const addToPlan = (id: string) => {
    play("save");
    fire("sparkle", "50%", "50%");
    update((s) => ({
      ...s,
      saved: s.saved.includes(id) ? s.saved : [...s.saved, id],
      planFor: s.planFor ? [...new Set([...s.planFor, id])] : s.planFor,
      taste: applySignal(s.taste, byId[id], "save"),
    }));
  };

  const feedback = (id: string, rating: Rating, liked: string[]) =>
    update((s) => ({ ...s, feedback: { ...s.feedback, [id]: { rating, liked } }, taste: applySignal(s.taste, byId[id], rating) }));

  if (!ready) {
    return (
      <Shell city={city}>
        <div className="splash">
          <p className="wordmark">Uncover</p>
        </div>
      </Shell>
    );
  }

  if (!state.setup || editing) {
    return (
      <Shell city={city}>
        <Onboarding
          city={city}
          initial={state.setup}
          onDone={(setup) => {
            update((s) => ({ ...s, setup, planFor: null }));
            setEditing(false);
            setTab(editing ? "trip" : "discover");
          }}
        />
      </Shell>
    );
  }

  const detail = detailId ? byId[detailId] : null;

  return (
    <Shell city={city}>
      <div className="app">
        <main className="app-main">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              className="tab-pane"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
            >
              {tab === "discover" && (
                <Discover
                  city={cityView}
                  onFound={addFound}
                  stay={stay}
                  state={state}
                  drives={drives}
                  dates={dates}
                  forecast={forecast}
                  intent={intent}
                  setIntent={setIntent}
                  depthLevel={depthLevel}
                  setDepthLevel={setDepthLevel}
                  onDecide={decide}
                  onOpen={setDetailId}
                  onSurprise={() => setTab("surprise")}
                  onOpenTaste={() => setTasteOpen(true)}
                />
              )}
              {tab === "surprise" && (
                <Surprise
                  city={cityView}
                  state={state}
                  drives={drives}
                  dates={dates}
                  forecast={forecast}
                  onDecide={decide}
                  onOpen={setDetailId}
                  onReveal={() => {
                    play("chime");
                    fire("sparkle", "50%", "42%");
                  }}
                />
              )}
              {tab === "trip" && (
                <MyTrip
                  city={cityView}
                  stay={stay}
                  state={state}
                  byId={byId}
                  drives={drives}
                  forecast={forecast}
                  onBuild={() => {
                    play("chime");
                    fire("sparkle", "50%", "40%");
                    update((s) => ({ ...s, planFor: [...s.saved] }));
                  }}
                  onAddToPlan={addToPlan}
                  onToast={(text) => setToast({ id: Date.now(), kind: "info", text })}
                  onUnsave={unsave}
                  onFeedback={feedback}
                  onOpen={setDetailId}
                  onEdit={() => setEditing(true)}
                  onDiscover={() => setTab("discover")}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              className={`toast ${toast.kind}`}
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            >
              <div className="toast-row">
                <span>{toast.text}</span>
                {toast.undo && (
                  <button
                    className="toast-undo"
                    onClick={() => {
                      replace(toast.undo!);
                      setToast(null);
                    }}
                  >
                    <IconUndo size={14} /> Undo
                  </button>
                )}
              </div>
              {toast.kind === "why" && toast.placeId && (
                <WhyChips
                  chosen={state.passed[toast.placeId] ?? []}
                  onPick={(r) => {
                    addReason(toast.placeId!, r);
                    setToast((t) => (t ? { ...t, id: Date.now(), text: "Got it. That helps. Anything else?" } : t));
                  }}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>{burst && <Burst key={burst.id} kind={burst.kind} x={burst.x} y={burst.y} />}</AnimatePresence>

        <nav className="tabbar">
          <button className={tab === "discover" ? "on" : ""} onClick={() => setTab("discover")}>
            <IconCompass size={22} />
            <span>Discover</span>
          </button>
          <button className={`tab-surprise ${tab === "surprise" ? "on" : ""}`} onClick={() => setTab("surprise")} aria-label="Surprise me">
            <span className="tab-orb">
              <IconSparkle size={22} />
            </span>
          </button>
          <button className={tab === "trip" ? "on" : ""} onClick={() => setTab("trip")}>
            <span className="tab-icon">
              <IconSuitcase size={22} />
              {state.saved.length > 0 && <b className="badge">{state.saved.length}</b>}
            </span>
            <span>My Trip</span>
          </button>
        </nav>

        <AnimatePresence>
          {detail && (
            <DetailSheet
              key={detail.id}
              place={detail}
              drive={drives[detail.id]}
              byId={byId}
              dates={dates}
              forecast={forecast}
              isSaved={state.saved.includes(detail.id)}
              stay={stay}
              cityName={city.name}
              subreddit={city.subreddit}
              onClose={() => setDetailId(null)}
              onDecide={decide}
              onUnsave={unsave}
              onOpen={setDetailId}
            />
          )}
          {tasteOpen && (
            <TasteSheet
              key="taste"
              state={state}
              onClose={() => setTasteOpen(false)}
              onReset={() => {
                replace(initialState());
                setTasteOpen(false);
                setTab("discover");
                setIntent(null);
                setDepthLevel(1);
                setTab("discover");
              }}
            />
          )}
        </AnimatePresence>
      </div>
    </Shell>
  );
}

function WhyChips({ chosen, onPick }: { chosen: string[]; onPick: (id: string) => void }) {
  return (
    <div className="why-chips">
      {REASONS.map((r) => (
        <button key={r.id} className={`chip small ${chosen.includes(r.id) ? "on" : ""}`} onClick={() => !chosen.includes(r.id) && onPick(r.id)}>
          {r.label}
        </button>
      ))}
    </div>
  );
}

// On a computer: scan to open the same page on your phone.
function PhoneQR() {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    import("qrcode")
      .then((QR) => QR.toString(window.location.origin, { type: "svg", margin: 0, color: { dark: "#f7f0e6", light: "#0000" } }))
      .then(setSvg)
      .catch(() => {});
  }, []);
  if (!svg) return null;
  return (
    <div className="phone-qr">
      <span className="qr" dangerouslySetInnerHTML={{ __html: svg }} />
      <span>
        <b>Best on your phone</b>
        Scan to open it there
      </span>
    </div>
  );
}

// The phone-shaped frame on desktop, full-bleed on phones.
function Shell({ city, children }: { city: City; children: ReactNode }) {
  return (
    <div className="stage">
      <div className="stage-bg" style={{ backgroundImage: `url(${city.hero.src})` }} />
      <aside className="stage-copy">
        <p className="wordmark">Uncover</p>
        <h2>
          Go somewhere <em>you wouldn't have found yourself.</em>
        </h2>
        <p>An AI trip planner that works like an obsessive traveler who interviewed a local. Now digging through {city.name}.</p>
        <PhoneQR />
      </aside>
      <div className="device">{children}</div>
    </div>
  );
}
