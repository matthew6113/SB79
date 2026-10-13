/**
 * The what-if calculator (SB79_SPEC.md): change the facts and watch the
 * answer and a small envelope update. It runs evaluateSite on the same law
 * data as the memo, through model.ts. Changes apply at once; nothing animates.
 */
import { Component, lazy, Suspense, useId, useMemo, useState, type ReactNode } from 'react';
import { lawAsOf } from '@zoning-envelope/law';
import { calculate, bandEdgesFt, type CalcForm, type IncomeLevel } from './model';
import { ftShort, milesShort, num, pct, shortCite, word } from '../format';

const CalcEnvelope = lazy(() => import('./CalcEnvelope'));

interface Props {
  asOf: string;
  /** Exhibit B's facts, from memo-data. */
  defaults: CalcForm;
  /** Exhibit B's address, for the reset button. */
  site: string;
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <p className="calc-fallback">The envelope could not be drawn in this browser (it needs WebGL).</p> : this.props.children;
  }
}

const STATUS = { pass: '✓', fail: '✕', 'not-evaluated': '·', 'not-applicable': '–', passed: '✓', failed: '✕', skipped: '–', pending: '·' } as const;

export default function Calculator({ asOf, defaults, site }: Props) {
  const [form, setForm] = useState<CalcForm>(defaults);
  const set = <K extends keyof CalcForm>(k: K) => (v: CalcForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const result = useMemo(() => calculate(form, asOf), [form, asOf]);
  const law = useMemo(() => lawAsOf(asOf), [asOf]);
  const edges = bandEdgesFt(asOf, form.tier);
  const key = form.tier === 1 ? 'tier1' : 'tier2';
  const id = useId();
  const a = law.affordability.options;
  const anti = law.antiDisplacement.rentControlledSite;

  const text = (name: keyof CalcForm, label: string, hint?: string, placeholder?: string) => (
    <label className="calc-field">
      <span>{label}</span>
      <input inputMode="decimal" value={form[name] as string} placeholder={placeholder} onChange={(e) => set(name)(e.target.value as never)} name={name} />
      {hint && <small>{hint}</small>}
    </label>
  );

  return (
    <div className="calc">
      <form className="calc-form" onSubmit={(e) => e.preventDefault()} aria-labelledby={id}>
        <p id={id} className="calc-assume">Assumes a site in an urban transit county, zoned residential, mixed-use, or commercial, with no local exemption, exclusion, or alternative plan.</p>
        <fieldset>
          <legend>The site</legend>
          <div className="calc-field">
            <span>Stop tier</span>
            <div className="calc-seg" role="radiogroup" aria-label="Stop tier">
              {([1, 2] as const).map((t) => (
                <label key={t}><input type="radio" name="tier" checked={form.tier === t} onChange={() => set('tier')(t)} /> Tier {t}</label>
              ))}
            </div>
            <small>{form.tier === 1 ? `Tier 1: ${law.definitions.tier1.value}` : `Tier 2: ${law.definitions.tier2.value}`} ({shortCite((form.tier === 1 ? law.definitions.tier1 : law.definitions.tier2).cite)})</small>
          </div>
          <div className="calc-field">
            <span>Distance to the nearest access point</span>
            <div className="calc-seg" role="radiogroup" aria-label="Distance as">
              <label><input type="radio" name="where" checked={form.where === 'distance'} onChange={() => set('where')('distance')} /> Feet</label>
              <label><input type="radio" name="where" checked={form.where === 'band'} onChange={() => set('where')('band')} /> Band</label>
            </div>
            {form.where === 'distance'
              ? <input inputMode="decimal" aria-label="Distance in feet" name="distanceFt" value={form.distanceFt} onChange={(e) => set('distanceFt')(e.target.value)} />
              : (
                <select aria-label="Band" name="band" value={form.band} onChange={(e) => set('band')(e.target.value as CalcForm['band'])}>
                  <option value="adjacent">Within {ftShort(edges.adjacent)}</option>
                  <option value="quarterMile">Within {milesShort(law.bands.quarterMile[key].value)}</option>
                  <option value="halfMile">{milesShort(law.bands.quarterMile[key].value)} to {milesShort(law.bands.halfMile[key].value)}</option>
                </select>
              )}
            <small>Bands end at {ftShort(edges.adjacent)}, {num(edges.quarterMile)} ft, and {num(edges.halfMile)} ft ({shortCite(law.eligibility.distanceMeasurement.cite)})</small>
          </div>
          {text('cityPopulation', 'City population', `The outer band counts in cities of at least ${num(law.eligibility.outerBandMinCityPopulation[key].value)}`)}
          {text('lotAreaSqFt', 'Lot area (sq ft)')}
          {text('localHeightFt', 'Local height limit (ft)', 'Optional: draws the pale ghost', 'optional')}
        </fieldset>

        <fieldset>
          <legend>What is there now</legend>
          {text('existingUnits', 'Existing units on the site', undefined, 'optional')}
          <label className="calc-check">
            <input type="checkbox" name="rentControlledTenants" checked={form.rentControlledTenants} onChange={(e) => set('rentControlledTenants')(e.target.checked)} />
            <span>The project would demolish rent-controlled units occupied by tenants in the past {word(anti.tenantLookbackYears.value)} years</span>
          </label>
        </fieldset>

        <fieldset>
          <legend>The project (optional)</legend>
          {text('units', 'Proposed units', undefined, 'optional')}
          {text('averageUnitSizeNetSqFt', 'Average unit size (net habitable sq ft)', undefined, 'optional')}
          <div className="calc-field">
            <span>Affordable units</span>
            <div className="calc-pair">
              <input inputMode="decimal" aria-label="Affordable units" name="affordableUnits" value={form.affordableUnits} placeholder="optional" onChange={(e) => set('affordableUnits')(e.target.value)} />
              <select aria-label="Income level" name="affordableLevel" value={form.affordableLevel} onChange={(e) => set('affordableLevel')(e.target.value as IncomeLevel)}>
                <option value="extremelyLow">extremely low income</option>
                <option value="veryLow">very low income</option>
                <option value="lower">lower income</option>
              </select>
            </div>
            <small>Over {word(law.affordability.appliesAboveUnits.value)} units: {pct(a.extremelyLow.value)} extremely low, {pct(a.veryLow.value)} very low, or {pct(a.lower.value)} lower income</small>
          </div>
          {text('heightFt', 'Proposed height (ft)', 'Optional: tests the labor rule against the project', 'optional')}
        </fieldset>
        <div className="calc-actions">
          <button type="button" onClick={() => setForm(defaults)}>Reset to {site}</button>
          <button type="button" onClick={() => setForm({ ...form, units: '', averageUnitSizeNetSqFt: '', affordableUnits: '', heightFt: '' })}>Clear the project</button>
        </div>
      </form>

      <div className="calc-out" aria-live="polite">
        {result.errors.length > 0 ? (
          <ul className="calc-errors">{result.errors.map((e) => <li key={e}>{e}</li>)}</ul>
        ) : (
          <>
            <p className={`calc-headline ${result.evaluation?.outcome === 'local-rules' ? 'is-local' : ''}`}>{result.headline}</p>
            <Boundary>
              <Suspense fallback={<p className="calc-fallback">Loading the envelope…</p>}>
                {result.envelope && <CalcEnvelope envelope={result.envelope} />}
              </Suspense>
            </Boundary>
            {result.rows.length > 0 && (
              <dl className="calc-rows">
                {result.rows.map((r) => (
                  <div key={r.label}>
                    <dt>{r.label}</dt>
                    <dd>{r.value}{r.note && <small>{r.note}</small>}</dd>
                    <dd className="calc-cite">{r.cite}</dd>
                  </div>
                ))}
              </dl>
            )}
            <h3 className="calc-sub">Conditions</h3>
            <ul className="calc-list">
              {result.conditions.map((c) => (
                <li key={c.id} className={`is-${c.status}`}>
                  <span className="calc-mark" aria-label={c.status}>{STATUS[c.status]}</span>
                  <span><strong>{c.label}</strong> {c.detail}</span>
                  <span className="calc-cite">{shortCite(c.cite)}</span>
                </li>
              ))}
            </ul>
            <details className="calc-steps">
              <summary>How the law decides, step by step</summary>
              <ol>
                {result.evaluation?.steps.map((s) => (
                  <li key={s.n} className={`is-${s.status}`}>
                    <span className="calc-mark" aria-label={s.status}>{STATUS[s.status]}</span>
                    <span><strong>{s.test}</strong> {s.reason}</span>
                    <span className="calc-cite">{shortCite(s.cite)}</span>
                  </li>
                ))}
              </ol>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
