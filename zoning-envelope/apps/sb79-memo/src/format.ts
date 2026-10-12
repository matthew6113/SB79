/** Formatting for numbers that come from sb79.json and data/. No legal values live here. */

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const num = (n: number, digits = 0) => n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
/** Whole numbers up to ten as words (statute style), larger ones as numerals. */
export const word = (n: number) => (Number.isInteger(n) && n >= 0 && n <= 10 ? WORDS[n]! : num(n));
export const ft = (n: number) => `${num(n)} feet`;
/** Adjectival form: "85-foot". */
export const ftAdj = (n: number) => `${num(n)}-foot`;
export const duac = (n: number) => `${num(n)} units per acre`;
export const far = (n: number) => num(n, 1);
export const sqft = (n: number) => `${num(n)} square feet`;
export const pct = (n: number) => `${num(n)} percent`;
export const money = (n: number) => `$${num(n)}`;
export const miles = (m: number) => (m === 0.25 ? 'one-quarter mile' : m === 0.5 ? 'one-half mile' : m === 1 ? 'one mile' : `${num(m, 2)} miles`);
export function date(iso: string) {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

const SUFFIX: Record<string, string> = { ST: 'Street', AVE: 'Avenue', CRES: 'Crescent', WAY: 'Way', PL: 'Place', CT: 'Court', DR: 'Drive', BLVD: 'Boulevard', RD: 'Road' };
/** "1510 VIRGINIA ST BERKELEY 94703" -> "1510 Virginia Street". */
export function address(assessor: string) {
  const words = assessor.replace(/\s+(BERKELEY|OAKLAND)\s+\d{5}$/, '').split(/\s+/);
  return words
    .map((w, i) => (i === words.length - 1 && SUFFIX[w] ? SUFFIX[w] : /^\d/.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(' ');
}

/** Short forms for figure labels. */
export const ftShort = (n: number) => `${num(n)} ft`;
export const sqftShort = (n: number) => `${num(n)} sq ft`;
export const milesShort = (m: number) => (m === 0.25 ? '¼ mile' : m === 0.5 ? '½ mile' : `${num(m, 2)} mi`);
/** "Gov. Code § 65912.157(a)(3)(A)" -> "§ 65912.157(a)(3)(A)" for tight figure labels. */
export const shortCite = (cite: string) => cite.replace(/Gov\. Code /g, '');
const MON = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
/** "2026-07-01" -> "July 1, 2026" in the short month style figures use. */
export function shortDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${MON[m - 1]} ${d}, ${y}`;
}
