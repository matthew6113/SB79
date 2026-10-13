/**
 * Builds the print version (src/pages/print.astro): each paragraph's figure
 * drawn at its final state and set beside the paragraph, footnotes moved to
 * their calls and laid out at the foot of each page by Paged.js.
 *
 * The four figures render once, off screen, at print size; each state is set
 * to progress 1 and copied as a still (DOM for SVG and HTML, an image for the
 * 3D canvas). Then Paged.js paginates #print-source into #print-pages. With
 * ?auto in the URL the print dialog opens when the pages are ready.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { FIGURES, script, type FigureId } from '../script';
import type { FigureData, FigureHandle } from '../figures/types';
import MapFigure from '../figures/MapFigure';
import EnvelopeFigure from '../figures/EnvelopeFigure';
import Checklist from '../figures/Checklist';
import Timeline from '../figures/Timeline';
import { still } from './still';
import pagedCss from './paged.css?raw';
import { num } from '../format';

/** Print size of each figure, CSS px (96 per inch). */
export const PRINT_SIZE: Record<FigureId, [number, number]> = {
  map: [300, 270],
  envelope: [300, 270],
  checklist: [300, 360],
  timeline: [300, 340],
};

const frames = (n: number) => new Promise<void>((done) => {
  const tick = (k: number) => (k <= 0 ? done() : requestAnimationFrame(() => tick(k - 1)));
  tick(n);
});

/** Wraps a step's text and sets the figure beside it. */
function layoutStep(section: Element, figure: HTMLElement, caption: string, [w, h]: [number, number]) {
  const text = document.createElement('div');
  text.className = 'print-text';
  for (const n of [...section.childNodes]) {
    if (n instanceof HTMLElement && n.classList.contains('step-link')) n.remove();
    else text.appendChild(n);
  }
  const fig = document.createElement('figure');
  fig.className = 'print-figure';
  const frame = document.createElement('div');
  frame.className = 'print-frame';
  frame.style.width = `${w}px`;
  frame.style.height = `${h}px`;
  frame.appendChild(figure);
  const cap = document.createElement('figcaption');
  cap.textContent = caption;
  fig.append(frame, cap);
  section.replaceChildren(text, fig);
}

/**
 * Moves each footnote's text to its call, where Paged.js floats it to the foot
 * of the page. Notes are numbered here, in document order (the same order
 * Paged.js counts its calls in); its own marker counter does not reset per note.
 */
function inlineFootnotes(root: Element) {
  root.querySelectorAll<HTMLAnchorElement>('a[data-footnote-ref]').forEach((a, i) => {
    const li = root.querySelector(`[id="${CSS.escape(a.getAttribute('href')!.slice(1))}"]`);
    const note = document.createElement('span');
    note.className = 'print-fn';
    if (li) {
      const body = li.cloneNode(true) as HTMLElement;
      body.querySelectorAll('[data-footnote-backref]').forEach((b) => b.remove());
      note.innerHTML = [...body.querySelectorAll(':scope > p')].map((p) => p.innerHTML.trim()).join(' ') || body.innerHTML.trim();
    }
    const n = document.createElement('span');
    n.className = 'print-fn-n';
    n.textContent = `${i + 1}. `;
    note.prepend(n);
    (a.closest('sup') ?? a).replaceWith(note);
  });
  root.querySelector('section[data-footnotes], .footnotes')?.remove();
}

/** Wraps each run of headings with the paragraph after it, so a heading never ends a page alone. */
function keepHeadingsWithText(root: Element) {
  root.querySelectorAll('section.step').forEach((step) => {
    const heads: Element[] = [];
    for (let p = step.previousElementSibling; p && /^H[1-4]$/.test(p.tagName); p = p.previousElementSibling) heads.unshift(p);
    if (!heads.length) return;
    const block = document.createElement('div');
    block.className = 'print-block';
    heads[0]!.before(block);
    block.append(...heads, step);
  });
}

export default function PrintBuilder() {
  const [data, setData] = useState<FigureData | null>(null);
  const [status, setStatus] = useState<{ phase: 'figures' | 'pages' | 'ready' | 'error'; done: number; message?: string }>({ phase: 'figures', done: 0 });
  const handles = useRef<Partial<Record<FigureId, FigureHandle>>>({});
  const slots = useRef<Partial<Record<FigureId, HTMLDivElement | null>>>({});
  const [attached, setAttached] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}figure-data.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`figure-data.json: HTTP ${r.status}`))))
      .then((d: FigureData) => setData(d))
      .catch((e: unknown) => setStatus({ phase: 'error', done: 0, message: String(e) }));
  }, []);

  const attach = useCallback((f: FigureId) => (h: FigureHandle | null) => {
    if (h && !handles.current[f]) {
      handles.current[f] = h;
      setAttached((n) => n + 1);
    }
  }, []);
  const [refs] = useState(() => Object.fromEntries(FIGURES.map((f) => [f, attach(f)])) as Record<FigureId, (h: FigureHandle | null) => void>);

  useEffect(() => {
    if (!data || attached < FIGURES.length || started.current) return;
    started.current = true;
    (async () => {
      const source = document.getElementById('print-source');
      const pages = document.getElementById('print-pages');
      if (!source || !pages) throw new Error('The print page is missing #print-source or #print-pages');
      await frames(10); // the 3D figure compiles its shaders on first frames
      for (const [k, e] of script.entries()) {
        handles.current[e.figure]!.setState(e.state, 1);
        await frames(e.figure === 'envelope' ? 8 : 3);
        const section = source.querySelector(`section[data-step="${e.id}"]`);
        if (!section) throw new Error(`Step ${e.id} is not on the print page`);
        layoutStep(section, still(slots.current[e.figure]!, `p${k}`), data[e.figure].captions[e.state] ?? '', PRINT_SIZE[e.figure]);
        setStatus({ phase: 'figures', done: k + 1 });
      }
      inlineFootnotes(source);
      keepHeadingsWithText(source);
      // The calculator is for the screen.
      source.querySelectorAll('.calculator, #apply-the-rule').forEach((n) => n.remove());
      setStatus({ phase: 'pages', done: script.length });
      const { Previewer } = await import('pagedjs');
      const content = document.createDocumentFragment();
      content.append(...source.childNodes);
      source.remove();
      const previewer = new Previewer();
      // The page's own stylesheets, then the page box and footnote rules.
      await previewer.preview(content, [...previewer.removeStyles(), { [location.href]: pagedCss }], pages);
      setStatus({ phase: 'ready', done: script.length });
      document.documentElement.dataset.printReady = 'true';
      if (new URLSearchParams(location.search).has('auto')) window.print();
    })().catch((e: unknown) => {
      console.error(e);
      setStatus({ phase: 'error', done: 0, message: String(e) });
    });
  }, [data, attached]);

  const slot = (f: FigureId, child: ReactNode) => (
    <div ref={(el) => { slots.current[f] = el; }} className={`print-slot print-slot-${f}`} style={{ width: PRINT_SIZE[f][0], height: PRINT_SIZE[f][1] }}>
      {child}
    </div>
  );

  return (
    <>
      <div className="print-toolbar" data-phase={status.phase}>
        {status.phase === 'figures' && <span>Drawing the figures… {num(status.done)} of {num(script.length)}</span>}
        {status.phase === 'pages' && <span>Laying out the pages…</span>}
        {status.phase === 'ready' && (
          <>
            <span>The print version is ready.</span>
            <button type="button" onClick={() => window.print()}>Print or save as PDF</button>
          </>
        )}
        {status.phase === 'error' && <span>The print version could not be built: {status.message}</span>}
        <a href={import.meta.env.BASE_URL}>Back to the memo</a>
      </div>
      {data && status.phase === 'figures' && (
        <div className="print-stage" aria-hidden>
          {slot('map', <MapFigure data={data.map} ref={refs.map} />)}
          {slot('envelope', <EnvelopeFigure data={data.envelope} ref={refs.envelope} preserve />)}
          {slot('checklist', <Checklist data={data.checklist} ref={refs.checklist} />)}
          {slot('timeline', <Timeline data={data.timeline} ref={refs.timeline} />)}
        </div>
      )}
    </>
  );
}
