import { useEffect, useRef, useState } from "react";

type StreamEntry = { id: string; content: string; streaming: boolean };

/** Smooth only text already received; completion and reduced motion display immediately. */
export function useSmoothStreams(entries: readonly StreamEntry[], scope: string): Record<string, string> {
  const initial = () => Object.fromEntries(entries.map(item => [item.id, item.content]));
  const [display, setDisplay] = useState<Record<string, string>>(initial);
  const shown = useRef(display);
  const oldScope = useRef(scope);
  const signature = JSON.stringify([scope, ...entries.map(item => [item.id, item.content, item.streaming])]);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const changedScope = oldScope.current !== scope;
    oldScope.current = scope;
    const targets = new Map(entries.map(item => [item.id, item]));
    let current: Record<string, string> = {};
    for (const item of entries) {
      const previous = shown.current[item.id];
      current[item.id] = changedScope || reduced || !item.streaming || previous === undefined || !item.content.startsWith(previous) ? item.content : previous;
    }
    shown.current = current; setDisplay(current);
    let frame = 0;
    const step = () => {
      let pending = false; const next = { ...shown.current };
      for (const [id, item] of targets) {
        const old = next[id] ?? "";
        if (!item.streaming || !item.content.startsWith(old)) { next[id] = item.content; continue; }
        const remainder = Array.from(item.content.slice(old.length));
        if (remainder.length) {
          const count = Math.max(1, Math.ceil(remainder.length / 12));
          next[id] = old + remainder.slice(0, count).join("");
          pending ||= next[id] !== item.content;
        }
      }
      shown.current = next; setDisplay(next);
      if (pending) frame = requestAnimationFrame(step);
    };
    if (!reduced && entries.some(item => item.streaming && current[item.id] !== item.content)) frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [signature]);
  return display;
}
