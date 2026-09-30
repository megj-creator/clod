"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { pickSurprise } from "@/lib/rank";
import { play } from "@/lib/sfx";
import { prettyTag } from "@/lib/taste";
import type { How } from "@/lib/geo";
import type { AppState, City, Place } from "@/lib/types";
import type { Weather } from "@/lib/weather";
import { CardFace } from "./CardFace";
import type { Decision } from "./Discover";
import { IconHeart, IconSparkle, IconX } from "./icons";
import { weatherLine } from "./ui";

const LINES = ["Looking at what you've saved…", "Skipping the obvious…", "Checking it fits your limits…"];

export function Surprise({
  city,
  state,
  drives,
  travel,
  dates,
  forecast,
  onDecide,
  onOpen,
  onReveal,
}: {
  onReveal: () => void;
  city: City;
  state: AppState;
  drives: Record<string, number>;
  travel: Record<string, How>;
  dates: string[];
  forecast: Record<string, Weather>;
  onDecide: (id: string, d: Decision) => void;
  onOpen: (id: string) => void;
}) {
  const setup = state.setup!;
  const [phase, setPhase] = useState<"idle" | "digging" | "reveal" | "empty">("idle");
  const [line, setLine] = useState(0);
  const [pick, setPick] = useState<Place | null>(null);
  const [shown, setShown] = useState<string[]>([]);
  const exclude = useMemo(() => new Set([...state.saved, ...Object.keys(state.passed)]), [state.saved, state.passed]);

  const go = () => {
    play("whoosh");
    setPhase("digging");
    setLine(0);
    LINES.forEach((_, i) => setTimeout(() => setLine(i), i * 650));
    setTimeout(() => {
      const p = pickSurprise({ places: city.places, drives, setup, taste: state.taste, exclude, avoid: shown });
      setPick(p);
      if (p) setShown((s) => [...s, p.id]);
      setPhase(p ? "reveal" : "empty");
      if (p) setTimeout(onReveal, 350);
    }, LINES.length * 650 + 250);
  };

  const because = (p: Place) => {
    const liked = p.tags.filter((t) => (state.taste.tags[t] ?? 0) > 0).sort((a, b) => (state.taste.tags[b] ?? 0) - (state.taste.tags[a] ?? 0));
    if (liked.length) return `Because you keep saving ${prettyTag(liked[0])} places.`;
    if (p.depth === 3) return "It's a deep cut. Almost nobody finds this one on their own.";
    if (p.depth === 2) return "Locals mention it far more than the guidebooks do.";
    return "Famous for a reason, and it fits your trip better than you'd think.";
  };

  const act = (d: Decision) => {
    if (!pick) return;
    onDecide(pick.id, d);
    setPhase("idle");
    setPick(null);
    if (d !== "save") setTimeout(go, 150);
  };

  return (
    <div className="screen surprise">
      <AnimatePresence mode="wait">
        {phase === "idle" && (
          <motion.div key="idle" className="surprise-idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
            <p className="eyebrow">Surprise me</p>
            <h1 className="display">
              Let me find something
              <br />
              <em>you wouldn't have searched for.</em>
            </h1>
            <button className="orb" onClick={go}>
              <span className="orb-glow" />
              <span className="orb-core">
                <IconSparkle size={30} />
                <span>Surprise me</span>
              </span>
            </button>
            <p className="surprise-hint">
              {state.taste.signals < 3
                ? "Tip: swipe a few in Discover first, and my surprises get sharper."
                : `I'm drawing on ${state.taste.signals} things you've told me.`}
            </p>
          </motion.div>
        )}

        {phase === "digging" && (
          <motion.div key="dig" className="surprise-dig" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="shuffle">
              {[0, 1, 2].map((i) => (
                <span key={i} className={`shuffle-card s${i}`} />
              ))}
            </div>
            <AnimatePresence mode="wait">
              <motion.p key={line} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                {LINES[line]}
              </motion.p>
            </AnimatePresence>
          </motion.div>
        )}

        {phase === "reveal" && pick && (
          <motion.div key={`r-${pick.id}`} className="surprise-reveal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.p className="reveal-head" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
              I found something I think you'll like.
            </motion.p>
            <motion.div
              className="reveal-card"
              initial={{ rotateY: 100, scale: 0.8, opacity: 0 }}
              animate={{ rotateY: 0, scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 120, damping: 16 }}
            >
              <span className="reveal-shine" />
              <CardFace
                place={pick}
                drive={drives[pick.id]}
                how={travel[pick.id]}
                weather={weatherLine(pick, dates, forecast)}
                kids={setup.toddler || setup.baby}
                cityName={city.name}
                onOpen={() => onOpen(pick.id)}
              />
            </motion.div>
            <motion.p className="reveal-because" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
              {because(pick)}
            </motion.p>
            <div className="reveal-actions">
              <button className="btn" onClick={() => act("pass")}>
                <IconX size={16} /> Not for me
              </button>
              <button className="btn primary" onClick={() => act("save")}>
                <IconHeart size={16} filled /> Save it
              </button>
            </div>
            <button className="text-link center" onClick={() => { setPick(null); go(); }}>
              Another surprise
            </button>
          </motion.div>
        )}

        {phase === "empty" && (
          <motion.div key="empty" className="surprise-idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h1 className="display-sm">I've shown you everything that fits your limits.</h1>
            <p className="surprise-hint">Loosen your drive time or budget in My Trip, or come back when I've researched more.</p>
            <button className="btn" onClick={() => { setShown([]); setPhase("idle"); }}>
              Start over
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
