"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { prettyTag, tasteSummary } from "@/lib/taste";
import type { AppState } from "@/lib/types";
import { play, setSoundOn, soundOn } from "@/lib/sfx";
import { IconSound, IconSparkle, IconX } from "./icons";

export function TasteSheet({ state, onClose, onReset }: { state: AppState; onClose: () => void; onReset: () => void }) {
  const { likes, dislikes, lines } = tasteSummary(state.taste);
  const max = Math.max(1, ...likes.map(([, v]) => v));
  const passes = Object.keys(state.passed).length;
  const [confirming, setConfirming] = useState(false);
  const [sound, setSound] = useState(soundOn);

  return (
    <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="sheet taste"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="What I've learned about you"
      >
        <button className="sheet-close" onClick={onClose} aria-label="Close">
          <IconX size={18} />
        </button>
        <p className="eyebrow">
          <IconSparkle size={14} /> What I've learned about you
        </p>
        <h2 className="display-sm">Something Google doesn't know.</h2>

        <div className="taste-stats">
          <div><b>{state.saved.length}</b><span>saved</span></div>
          <div><b>{passes}</b><span>passed</span></div>
          <div><b>{Object.keys(state.feedback).length}</b><span>rated</span></div>
        </div>

        <ul className="taste-lines">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>

        {likes.length > 0 && (
          <>
            <p className="eyebrow section-label">You're drawn to</p>
            <div className="taste-bars">
              {likes.map(([tag, v]) => (
                <div key={tag} className="taste-bar">
                  <span>{prettyTag(tag)}</span>
                  <i style={{ width: `${(v / max) * 100}%` }} />
                </div>
              ))}
            </div>
          </>
        )}
        {dislikes.length > 0 && (
          <>
            <p className="eyebrow section-label">Less your thing</p>
            <div className="chip-row">
              {dislikes.map(([tag]) => (
                <span key={tag} className="chip small muted">{prettyTag(tag)}</span>
              ))}
            </div>
          </>
        )}

        <button
          className="sound-row"
          onClick={() => {
            setSoundOn(!sound);
            setSound(!sound);
            if (!sound) setTimeout(() => play("save"), 50);
          }}
        >
          <IconSound size={18} on={sound} />
          <span>Sounds &amp; haptics</span>
          <b className={sound ? "on" : ""}>{sound ? "On" : "Off"}</b>
        </button>

        <p className="micro">This lives on your phone only. Nothing is shared.</p>
        {confirming ? (
          <div className="confirm-row">
            <span>Clear your trip, saves, and everything I've learned?</span>
            <button className="btn small" onClick={() => setConfirming(false)}>Keep it</button>
            <button className="btn small danger" onClick={onReset}>Yes, clear it</button>
          </div>
        ) : (
          <button className="text-link danger" onClick={() => setConfirming(true)}>
            Forget everything and start over
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}
