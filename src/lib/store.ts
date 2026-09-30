"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { emptyTaste } from "./taste";
import type { AppState } from "./types";

// Saved on this device only for now. Swapping this file for Supabase
// is how trips will sync across phones later.
const KEY = "uncover:v1";

export const initialState = (): AppState => ({
  setup: null,
  saved: [],
  passed: {},
  moreLike: [],
  taste: emptyTaste(),
  feedback: {},
  planFor: null,
  found: {},
  city: null,
});

export function useAppState() {
  const [state, setState] = useState<AppState>(initialState);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setState({ ...initialState(), ...JSON.parse(raw) });
    } catch {
      /* private mode or corrupted: start fresh */
    }
    loaded.current = true;
    setReady(true);
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked */
    }
  }, [state]);

  const update = useCallback((fn: (s: AppState) => AppState) => setState(fn), []);
  return { state, update, replace: setState, ready };
}
