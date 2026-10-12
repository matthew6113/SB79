import { useEffect, useState } from 'react';
import { FIGURES } from '../script';

/**
 * Placeholder island for the pinned figure column. Phase 3 replaces it with
 * MapFigure, EnvelopeFigure, Checklist, and Timeline, each exposing
 * setState(id, progress).
 */
export default function FigureStage() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  return (
    <div className="figure-stage" data-hydrated={hydrated}>
      <p className="figure-placeholder">
        Figures: {FIGURES.join(' · ')}
        <br />
        <small>{hydrated ? 'React island hydrated' : 'Static render'}</small>
      </p>
    </div>
  );
}
