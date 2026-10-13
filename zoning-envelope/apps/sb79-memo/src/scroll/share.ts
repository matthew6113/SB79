/**
 * Share links (SB79_SPEC.md, Phase 5): every paragraph's ¶ link copies a URL
 * ending in #<step id>; opening that URL scrolls the memo to the paragraph,
 * through the scroll engine: settled, or for a long paragraph as far on as
 * keeps its first line in view.
 */
import { script } from '../script';

const isStep = (id: string) => script.some((e) => e.id === id);

/** The step id in the URL's hash, if it names a paragraph. */
export function stepFromHash(hash = location.hash): string | null {
  const id = decodeURIComponent(hash.replace(/^#/, ''));
  return isStep(id) ? id : null;
}

function toast(near: HTMLElement, text: string) {
  const t = document.createElement('span');
  t.className = 'share-toast';
  t.textContent = text;
  t.setAttribute('role', 'status');
  near.after(t);
  setTimeout(() => t.remove(), 1600);
}

/** Wires the ¶ links and the hash. Returns a cleanup function. */
export function startShareLinks(scrollTo: (id: string) => void): () => void {
  const onClick = (ev: MouseEvent) => {
    const a = (ev.target as Element | null)?.closest<HTMLAnchorElement>('a[data-share]');
    if (!a || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    ev.preventDefault();
    const id = a.dataset.share!;
    const url = new URL(location.href);
    url.hash = id;
    history.replaceState(null, '', url);
    scrollTo(id);
    const done = () => toast(a, 'Link copied');
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url.toString()).then(done, () => toast(a, 'Link in the address bar'));
    else toast(a, 'Link in the address bar');
  };
  const onHash = () => {
    const id = stepFromHash();
    if (id) scrollTo(id);
  };
  document.addEventListener('click', onClick);
  window.addEventListener('hashchange', onHash);
  onHash();
  return () => {
    document.removeEventListener('click', onClick);
    window.removeEventListener('hashchange', onHash);
  };
}
