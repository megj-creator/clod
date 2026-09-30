"use client";

import { motion } from "motion/react";
import { useMemo } from "react";

// A one-shot particle burst: hearts when saving, sparkles for surprises and plans.
export function Burst({ kind, x, y }: { kind: "save" | "sparkle"; x: string; y: string }) {
  const parts = useMemo(
    () =>
      Array.from({ length: kind === "save" ? 14 : 22 }, (_, i) => {
        const angle = (i / (kind === "save" ? 14 : 22)) * Math.PI * 2 + Math.random() * 0.5;
        const dist = (kind === "save" ? 70 : 110) + Math.random() * 60;
        return {
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist - (kind === "save" ? 40 : 10),
          rot: (Math.random() - 0.5) * 120,
          scale: 0.6 + Math.random() * 0.8,
          delay: Math.random() * 0.08,
          hue: ["#ffd79c", "#f4a948", "#ee7a5f", "#bcaaf2", "#73c9b5"][i % 5],
        };
      }),
    [kind],
  );

  return (
    <div className="burst" style={{ left: x, top: y }} aria-hidden>
      {kind === "save" && (
        <motion.span
          className="burst-ring"
          initial={{ scale: 0.2, opacity: 0.9 }}
          animate={{ scale: 2.6, opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      )}
      {parts.map((p, i) => (
        <motion.span
          key={i}
          className={kind === "save" ? "burst-heart" : "burst-spark"}
          style={{ color: p.hue, background: kind === "sparkle" ? p.hue : undefined }}
          initial={{ x: 0, y: 0, scale: 0, rotate: 0, opacity: 1 }}
          animate={{ x: p.dx, y: p.dy, scale: p.scale, rotate: p.rot, opacity: 0 }}
          transition={{ duration: 0.9 + Math.random() * 0.3, delay: p.delay, ease: [0.15, 0.7, 0.3, 1] }}
        >
          {kind === "save" ? "♥" : null}
        </motion.span>
      ))}
    </div>
  );
}
