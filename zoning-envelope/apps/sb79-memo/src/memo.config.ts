/** Memo settings that are choices, not law or data. */
export const memoConfig = {
  to: 'The reader',
  /** Left configurable on purpose (SB79_SPEC.md, "Memo script"). */
  from: '(configurable)',
  /**
   * Exhibit parcels by APN, chosen from data/exhibit-candidates.json.
   * B and C are the top-ranked candidates; A is the second-ranked, 1504 Francisco St, chosen over the
   * top-ranked triplex (Matthew, 2026-10-12). Swap any APN to change exhibits.
   */
  exhibits: {
    A: '58-2150-22',
    B: '58-2151-3',
    C: '56-1997-46',
  },
};
