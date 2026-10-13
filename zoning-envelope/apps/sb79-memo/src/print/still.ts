/**
 * A still copy of a rendered figure, for the print version and the
 * reduced-motion crossfade: the DOM is cloned, each WebGL canvas becomes an
 * image of its last frame, and ids are made unique so a clone's SVG patterns
 * (hatching, dots) do not resolve to another clone's.
 */
export function still(el: HTMLElement, tag: string, { canvasAsImage = true } = {}): HTMLElement {
  const clone = el.cloneNode(true) as HTMLElement;
  const from = el.querySelectorAll('canvas');
  clone.querySelectorAll('canvas').forEach((c, i) => {
    const src = from[i];
    if (!src) return;
    if (canvasAsImage) {
      const img = document.createElement('img');
      img.src = src.toDataURL('image/png');
      img.alt = '';
      img.style.cssText = `display:block;width:${src.clientWidth}px;height:${src.clientHeight}px`;
      c.replaceWith(img);
    } else {
      c.width = src.width;
      c.height = src.height;
      c.getContext('2d')?.drawImage(src, 0, 0);
    }
  });
  // Unique ids, and every url(#id) / href="#id" inside the clone rewired to them.
  const ids = new Map<string, string>();
  clone.querySelectorAll('[id]').forEach((n) => {
    const fresh = `${n.id}--${tag}`;
    ids.set(n.id, fresh);
    n.id = fresh;
  });
  if (ids.size) {
    const rewire = (v: string) => v.replace(/url\(#([^)]+)\)/g, (m, id: string) => (ids.has(id) ? `url(#${ids.get(id)})` : m));
    clone.querySelectorAll('*').forEach((n) => {
      for (const attr of ['fill', 'stroke', 'style', 'clip-path', 'mask', 'filter']) {
        const v = n.getAttribute(attr);
        if (v?.includes('url(#')) n.setAttribute(attr, rewire(v));
      }
      const href = n.getAttribute('href');
      if (href?.startsWith('#') && ids.has(href.slice(1))) n.setAttribute('href', `#${ids.get(href.slice(1))}`);
    });
  }
  clone.setAttribute('aria-hidden', 'true');
  return clone;
}
