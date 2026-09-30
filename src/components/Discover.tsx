"use client";

import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtRange } from "@/lib/dates";
import { CATEGORY_CHIPS, EXAMPLES, MOOD_CHIPS, chipIntent, interpret, type Intent } from "@/lib/intent";
import { buildQueue, type Ranked } from "@/lib/rank";
import { play } from "@/lib/sfx";
import type { AppState, City, Place, Stay } from "@/lib/types";
import type { Weather } from "@/lib/weather";
import { CardFace } from "./CardFace";
import { IconArrow, IconBack, IconHeart, IconSearch, IconSend, IconSparkle, IconX } from "./icons";
import { PlaceImage } from "./PlaceImage";
import { weatherLine } from "./ui";

export type Decision = "save" | "pass" | "more";

type Props = {
  city: City;
  stay: Stay;
  state: AppState;
  drives: Record<string, number>;
  dates: string[];
  forecast: Record<string, Weather>;
  intent: Intent | null;
  setIntent: (i: Intent | null) => void;
  depthLevel: number;
  setDepthLevel: (n: number) => void;
  onDecide: (id: string, d: Decision) => void;
  onOpen: (id: string) => void;
  onSurprise: () => void;
  onOpenTaste: () => void;
  onFound: (places: Place[]) => void;
  onRetryPlaces: () => void;
};

// For a searched city: "still finding places…" while categories load, or a retry if some failed
function LoadingLine({ city, onRetry }: { city: City; onRetry: () => void }) {
  const g = city.generated;
  if (!g) return null;
  if (g.pending.length)
    return (
      <p className="places-loading">
        <span className="spinner" /> Still digging through {city.name}. {city.places.length ? `${city.places.length} places so far…` : "The first finds take about 20 seconds…"}
      </p>
    );
  if (g.failed.length)
    return (
      <p className="places-loading failed">
        Couldn't find the {g.failed.join(" & ")} spots just now.{" "}
        <button className="status-link" onClick={onRetry}>
          Try again
        </button>
      </p>
    );
  return null;
}

export function Discover(props: Props) {
  if (!props.intent) return <PromptPanel {...props} />;
  return <Deck {...props} intent={props.intent} />;
}

/* ───────────────────────── Prompt ───────────────────────── */

function PromptPanel({ city, state, stay, drives, setIntent, onSurprise, onOpenTaste, onRetryPlaces }: Props) {
  const setup = state.setup!;
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const ask = async () => {
    const q = text.trim();
    if (!q || thinking) return;
    setThinking(true);
    const crew = [`${setup.adults} adults`, setup.toddler && "a toddler", setup.baby && "a baby"].filter(Boolean).join(", ");
    const seen = new Set([...state.saved, ...Object.keys(state.passed)]);
    const intent = await interpret(q, city.places, drives, `${crew}; max drive ${setup.maxDrive} min; max $${setup.maxPrice}/person`, seen);
    setThinking(false);
    setIntent(intent);
  };
  const [ex, setEx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setEx((i) => (i + 1) % EXAMPLES.length), 4200);
    return () => clearInterval(t);
  }, []);
  // Real photos lead the strip; posters fill in after
  const strip = useMemo(() => {
    const ordered = [...city.places].sort((a, b) => Number(b.photos.length > 0) - Number(a.photos.length > 0));
    return [...ordered, ...ordered];
  }, [city.places]);

  return (
    <div className="screen prompt">
      <header className="topbar">
        <div>
          <p className="eyebrow">
            {city.name} · {fmtRange(setup.start, setup.end)}
          </p>
          <p className="topbar-sub">Staying in {setup.hotelName || stay.name}</p>
        </div>
        <button className="taste-btn" onClick={onOpenTaste} aria-label="What I've learned about you">
          <IconSparkle size={18} />
          {state.taste.signals > 0 && <span>{state.taste.signals}</span>}
        </button>
      </header>

      <LoadingLine city={city} onRetry={onRetryPlaces} />

      <div className="marquee" aria-hidden>
        <div className="marquee-track">
          {strip.map((p, i) => (
            <div className="marquee-tile" key={`${p.id}-${i}`}>
              <PlaceImage place={p} />
            </div>
          ))}
        </div>
      </div>

      <motion.h1 className="display" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
        Okay, I have your trip.
        <br />
        <em>What sounds fun?</em>
      </motion.h1>

      <div className="chip-grid">
        {CATEGORY_CHIPS.map((c, i) => (
          <motion.button
            key={c.id}
            className={`big-chip chip-${c.id}`}
            onClick={() => setIntent(chipIntent(c.id))}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05 }}
          >
            <span className="big-chip-emoji">{c.emoji}</span>
            {c.label}
          </motion.button>
        ))}
        <motion.button
          className="big-chip chip-surprise"
          onClick={onSurprise}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32 }}
        >
          <span className="big-chip-emoji">✨</span>
          Surprise me
        </motion.button>
      </div>

      <p className="eyebrow section-label">Or I'm in the mood for…</p>
      <div className="chip-row">
        {MOOD_CHIPS.map((m) => (
          <button key={m.id} className="chip" onClick={() => setIntent(chipIntent(m.id))}>
            {m.emoji} {m.label}
          </button>
        ))}
      </div>

      <form
        className={`ask ${thinking ? "is-thinking" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={EXAMPLES[ex]}
          rows={2}
          disabled={thinking}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask();
            }
          }}
        />
        <button type="submit" aria-label="Find it" disabled={!text.trim() || thinking}>
          {thinking ? <span className="spinner" /> : <IconSend size={18} />}
        </button>
        {thinking && <p className="ask-status">Reading that and checking my list…</p>}
      </form>

      <button className="text-link" onClick={() => setIntent(chipIntent("all"))}>
        Just show me everything <IconArrow size={14} />
      </button>
    </div>
  );
}

/* ───────────────────────── Deck ───────────────────────── */

const DIG_LINES: Record<number, string[]> = {
  2: ["Going past the famous spots…", "Pulling places locals mention more than guidebooks…", "Checking they fit your limits…"],
  3: ["Going further…", "Opening the deep-cut list…", "Keeping only what's worth the effort…"],
  4: ["Going beyond my list…", "Looking for what locals actually love…", "Skipping the tourist traps…", "Checking it fits your limits…", "Writing up what I found…"],
};

function Deck(props: Props & { intent: Intent }) {
  const { city, stay, state, drives, dates, forecast, intent, setIntent, depthLevel, setDepthLevel, onDecide, onOpen, onOpenTaste, onFound, onRetryPlaces } = props;
  const stillLoading = !!city.generated?.pending.length;
  const setup = state.setup!;
  const kids = setup.toddler || setup.baby;
  const [showHidden, setShowHidden] = useState(false);
  const [exitDir, setExitDir] = useState<Decision>("pass");
  const [digging, setDigging] = useState<number | null>(null);
  const [digLine, setDigLine] = useState(0);
  const [dugMsg, setDugMsg] = useState<string | null>(null);

  const exclude = useMemo(() => new Set([...state.saved, ...Object.keys(state.passed)]), [state.saved, state.passed]);
  const { queue, hidden, relaxed } = useMemo(
    () => buildQueue({ places: city.places, drives, intent, setup, taste: state.taste, depthLevel, exclude, showHidden }),
    [city.places, drives, intent, setup, state.taste, depthLevel, exclude, showHidden],
  );

  const decide = (d: Decision) => {
    const top = queue[0];
    if (!top) return;
    setExitDir(d);
    // let the exit direction render before the card leaves
    requestAnimationFrame(() => onDecide(top.place.id, d));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA" || document.querySelector(".sheet")) return;
      if (e.key === "ArrowRight") decide("save");
      if (e.key === "ArrowLeft") decide("pass");
      if (e.key === "ArrowUp") decide("more");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Past the curated deep cuts, Gemini goes hunting for new places
  const hunt = async () => {
    setDigging(4);
    setDigLine(0);
    play("whoosh");
    const spin = setInterval(() => setDigLine((i) => Math.min(i + 1, DIG_LINES[4].length - 1)), 2600);
    try {
      const likedTags = Object.entries(state.taste.tags).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([t]) => t);
      const res = await fetch("/api/hunt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          city: `${city.name}, ${city.state}`,
          stay: { id: stay.id, name: setup.hotelName || stay.name, lat: stay.lat, lng: stay.lng },
          request: intent.heard[0] === "everything" ? "the best things most visitors miss" : `${intent.label} (${intent.heard.join(", ")})`,
          crew: [`${setup.adults} adults`, setup.toddler && "a toddler", setup.baby && "a baby"].filter(Boolean).join(", "),
          maxDrive: setup.maxDrive,
          maxPrice: setup.maxPrice,
          exclude: city.places.map((p) => p.name),
          liked: likedTags,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { places: Place[]; mode: "search" | "knowledge" };
      if (!data.places?.length) throw new Error("none");
      onFound(data.places);
      setIntent({
        ...intent,
        picks: Object.fromEntries(data.places.map((p) => [p.id, p.whyFound])),
        heard: [...intent.heard.filter((h) => h !== "hunted beyond my list"), "hunted beyond my list"],
        source: "ai",
      });
      play("chime");
      setDugMsg(data.mode === "search" ? `Found ${data.places.length} live. Fresh from the web.` : `Found ${data.places.length} beyond my list.`);
    } catch (e) {
      setDugMsg(String(e).includes("429") ? "I'm hunting too fast. Give me a minute." : "Couldn't reach the AI just now. Try again shortly.");
    } finally {
      clearInterval(spin);
      setDigging(null);
    }
  };

  const digDeeper = () => {
    if (depthLevel >= 3) {
      hunt();
      return;
    }
    play("whoosh");
    const next = depthLevel + 1;
    setDigging(next);
    setDigLine(0);
    const lines = DIG_LINES[next];
    lines.forEach((_, i) => setTimeout(() => setDigLine(i), i * 750));
    setTimeout(() => {
      setDepthLevel(next);
      setDigging(null);
      setDugMsg(next === 2 ? "Okay, I went further." : "I went even deeper.");
    }, lines.length * 750 + 300);
  };

  useEffect(() => {
    if (!dugMsg) return;
    const t = setTimeout(() => setDugMsg(null), 3200);
    return () => clearTimeout(t);
  }, [dugMsg]);

  const visible = queue.slice(0, 3);

  return (
    <div className="screen deck-screen">
      <header className="deck-head">
        <button className="icon-btn" onClick={() => { setIntent(null); setDepthLevel(1); }} aria-label="Change mood">
          <IconBack size={18} />
        </button>
        <div className="heard">
          <span className="heard-label">
            {intent.heard[0] === "everything" ? "Showing" : "I heard"}
            {intent.source === "ai" && <span className="ai-tag">✨ Gemini</span>}
            {intent.source === "keywords" && <span className="ai-tag off">keyword match</span>}
          </span>
          <div className="heard-chips">
            {intent.heard.map((h) => (
              <span key={h} className="heard-chip">{h}</span>
            ))}
            {depthLevel > 1 && <span className="heard-chip deep">{depthLevel === 2 ? "local favorites +" : "deep cuts"}</span>}
          </div>
        </div>
        <button className="icon-btn small taste-mini" onClick={onOpenTaste} aria-label="What I've learned about you">
          <IconSparkle size={15} />
        </button>
        <button className={`dig-btn ${depthLevel >= 3 ? "hunt" : ""}`} onClick={digDeeper} disabled={digging !== null}>
          <IconSearch size={15} /> {depthLevel >= 3 ? "Go hunting" : "Dig deeper"}
        </button>
      </header>

      <div className="deck-status">
        <span>
          {queue.length} {queue.length === 1 ? "discovery" : "discoveries"} · {intent.picks ? "best match first" : "nearest first"}
        </span>
        {hidden.length > 0 && (
          <button className="status-link" onClick={() => setShowHidden((v) => !v)}>
            {showHidden ? "Respect my limits" : `${hidden.length} outside your limits`}
          </button>
        )}
      </div>
      {relaxed && <p className="relaxed">Nothing matched exactly, so here's the closest I have.</p>}
      <LoadingLine city={city} onRetry={onRetryPlaces} />

      <div className="deck">
        <AnimatePresence custom={exitDir}>
          {visible
            .map((r, i) => (
              <DeckCard
                key={r.place.id}
                r={r}
                index={i}
                kids={kids}
                weather={weatherLine(r.place, dates, forecast)}
                why={intent.picks?.[r.place.id]}
                cityName={city.name}
                onDecide={decide}
                onOpen={() => onOpen(r.place.id)}
                outside={showHidden && (r.drive > setup.maxDrive || r.place.price.perPerson > setup.maxPrice)}
              />
            ))
            .reverse()}
        </AnimatePresence>

        {!queue.length && (
          <motion.div className="deck-empty" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
            <p className="display-sm">{stillLoading ? "Still digging. More places are on the way." : "That's everything I've found for this vibe."}</p>
            <div className="deck-empty-actions">
              <button className="btn primary" onClick={digDeeper}>
                <IconSearch size={16} /> {depthLevel >= 3 ? "Go hunting beyond my list" : "Dig deeper"}
              </button>
              <button className="btn" onClick={() => { setIntent(null); setDepthLevel(1); }}>
                Try another mood
              </button>
              <button className="btn ghost" onClick={onOpenTaste}>
                See what I've learned
              </button>
            </div>
          </motion.div>
        )}

        <AnimatePresence>
          {digging && (
            <motion.div className="digging" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="dig-scope">
                <span className="dig-ring" />
                <span className="dig-ring r2" />
                <IconSearch size={30} />
              </div>
              <AnimatePresence mode="wait">
                <motion.p key={digLine} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  {DIG_LINES[digging][digLine]}
                </motion.p>
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {dugMsg && (
            <motion.div className="dug-msg" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              {dugMsg}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="actions" aria-hidden={!queue.length}>
        <button className="act act-pass" onClick={() => decide("pass")} disabled={!queue.length}>
          <span className="act-ring"><IconX size={26} /></span>
          <span className="act-label">Not for me</span>
        </button>
        <button className="act act-more" onClick={() => decide("more")} disabled={!queue.length}>
          <span className="act-ring"><IconArrow size={22} /></span>
          <span className="act-label">More like this</span>
        </button>
        <button className="act act-save" onClick={() => decide("save")} disabled={!queue.length}>
          <span className="act-ring"><IconHeart size={28} filled /></span>
          <span className="act-label">Save</span>
        </button>
      </div>
    </div>
  );
}

const exitVariants = {
  exit: (d: Decision) => ({
    x: d === "save" ? 520 : d === "pass" ? -520 : 0,
    y: d === "more" ? -760 : 0,
    rotate: d === "save" ? 16 : d === "pass" ? -16 : 0,
    opacity: 0,
    transition: { duration: 0.42, ease: [0.2, 0.7, 0.3, 1] as const },
  }),
};

function DeckCard({
  r,
  index,
  kids,
  weather,
  onDecide,
  onOpen,
  outside,
  why,
  cityName,
}: {
  why?: string;
  cityName: string;
  r: Ranked;
  index: number;
  kids: boolean;
  weather: string;
  onDecide: (d: Decision) => void;
  onOpen: () => void;
  outside: boolean;
}) {
  const isTop = index === 0;
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-14, 14]);
  const saveO = useTransform(x, [30, 120], [0, 1]);
  const passO = useTransform(x, [-120, -30], [1, 0]);
  const moreO = useTransform(y, [-140, -50], [1, 0]);
  const dragged = useRef(false);

  return (
    <motion.div
      className="deck-slot"
      style={{ zIndex: 10 - index }}
      variants={exitVariants}
      initial={{ scale: 0.9, y: 40, opacity: 0 }}
      animate={{ scale: 1 - index * 0.045, y: index * 14, opacity: 1 }}
      exit="exit"
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
    >
      <motion.div
        className={`deck-card ${isTop ? "is-top" : ""}`}
        style={{ x, y, rotate }}
        drag={isTop}
        dragMomentum={false}
        onDragStart={() => (dragged.current = true)}
        onDragEnd={(_, info) => {
          setTimeout(() => (dragged.current = false), 50);
          const { offset, velocity } = info;
          if (offset.x > 110 || velocity.x > 700) return onDecide("save");
          if (offset.x < -110 || velocity.x < -700) return onDecide("pass");
          if (offset.y < -120 || velocity.y < -800) return onDecide("more");
          animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
          animate(y, 0, { type: "spring", stiffness: 400, damping: 30 });
        }}
      >
        <CardFace
          place={r.place}
          drive={r.drive}
          weather={weather}
          why={why}
          cityName={cityName}
          kids={kids}
          onOpen={onOpen}
          blockTap={dragged}
          overlay={
            <>
              {outside && <span className="outside-flag">Outside your limits</span>}
              <motion.span className="stamp stamp-save" style={{ opacity: saveO }}>Saved ♡</motion.span>
              <motion.span className="stamp stamp-pass" style={{ opacity: passO }}>Not for me</motion.span>
              <motion.span className="stamp stamp-more" style={{ opacity: moreO }}>More like this</motion.span>
            </>
          }
        />
      </motion.div>
    </motion.div>
  );
}
