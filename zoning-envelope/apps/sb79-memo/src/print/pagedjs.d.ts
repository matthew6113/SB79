/** Paged.js ships no types; this is the one call the print version makes. */
declare module 'pagedjs' {
  export class Previewer {
    preview(content?: Node | string, stylesheets?: unknown[], renderTo?: Element): Promise<unknown>;
    /** Removes the document's stylesheets and returns them (hrefs, or { url: text }) for preview(). */
    removeStyles(doc?: Document): unknown[];
  }
}
