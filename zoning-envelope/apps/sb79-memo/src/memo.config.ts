/** Explainer settings that are choices, not law or data. */
export const memoConfig = {
  /** The byline, left configurable on purpose (SB79_SPEC.md, "Memo script"). */
  byline: '(configurable)',
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
  /**
   * Drawing choices for the figures. None of these is a legal value, and none
   * is shown as a number: they set how the figures look, not what they say.
   */
  figures: {
    /** Story height used to stack floor plates and to give neighbors a height from their story count. */
    floorToFloorFt: 10,
    /** Neighbor buildings drawn around Exhibit B in the 3D figure (radius from its center). */
    contextRadiusFt: 320,
    /** Depth of the illustrative rear setback in III.B.4, as a share of the lot's depth. */
    setbackShareOfDepth: 0.2,
    /** Space between the exhibits when III.G sets them side by side. */
    exhibitGapFt: 40,
  },
};
