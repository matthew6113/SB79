import { useEffect, useState, type RefObject } from 'react';

/** The element's content-box size, kept current with a ResizeObserver. */
export function useSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** The memo's color tokens from memo.css, for figures that cannot use CSS (WebGL). */
export function useTokens() {
  const [tokens, setTokens] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const names = ['page', 'ink', 'ink-soft', 'ghost', 'accent', 'accent-tint', 'collapse', 'context', 'context-edge'];
    setTokens(Object.fromEntries(names.map((n) => [n, css.getPropertyValue(`--${n}`).trim()])));
  }, []);
  return tokens;
}
