/** Memo settings that are choices, not law or data. */
export const memoConfig = {
  to: 'The reader',
  /** Left configurable on purpose (SB79_SPEC.md, "Memo script"). */
  from: '(configurable)',
  /**
   * Exhibit parcels by APN, chosen from data/exhibit-candidates.json.
   * Currently the top-ranked candidate in each band (Matthew, 2026-10-12); swap any APN to change exhibits.
   */
  exhibits: {
    A: '58-2150-21',
    B: '58-2151-3',
    C: '56-1997-46',
  },
};
