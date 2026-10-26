import { useMemo } from 'react';
import { evaluateStructures, recommend } from '../../engines/optimization/optimize';
import { Callout, Card, IssueList, Page, Pill } from '../../components/ui';
import { useActive } from '../../hooks/useResult';
import { DEFAULT_WEIGHTS, MISSING_DOCS } from '../../data/constants';


export function RecommendationsPage() {
  const { scn, result } = useActive();
  const evals = useMemo(() => evaluateStructures(scn, DEFAULT_WEIGHTS), [scn]);
  const rec = useMemo(() => recommend(evals, DEFAULT_WEIGHTS), [evals]);
  const s = rec.strongest;
  return (
    <Page title="What Makes the Most Sense?" subtitle="A plain-English reading of the current numbers. It changes every time the scenario changes, and it never presents an uncertain tax structure as a guaranteed saving.">
      <Card>
        <h2 className="h2" data-testid="rec-headline">
          {rec.headline}
        </h2>
        <p className="muted mt-1 text-[13px]">Based on balanced default priorities. Adjust priorities in Scenario Comparison → Optimizer.</p>
        {rec.tie ? <Callout tone="warn">Two structures are effectively tied. Resolve the open legal questions before choosing.</Callout> : null}
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="1. Which structure currently appears strongest">
          <p className="text-[15px]">
            <b>{s?.name}</b> {s ? <Pill tone={s.legalUncertainty === 'low' ? 'good' : s.legalUncertainty === 'medium' ? 'warn' : 'bad'}>legal uncertainty: {s.legalUncertainty}</Pill> : null}
          </p>
        </Card>
        <Card title="2. Why it appears strongest">
          <ul className="list-disc space-y-1 pl-5 text-[14px]">
            {rec.why.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Card>
        <Card title="3. Who benefits">
          <p className="text-[14px] leading-relaxed">{rec.whoBenefits}</p>
        </Card>
        <Card title="4. Who bears the costs">
          <p className="text-[14px] leading-relaxed">{rec.whoPays}</p>
        </Card>
        <Card title="5. What taxes may apply">
          <p className="text-[14px] leading-relaxed">{rec.taxes}</p>
        </Card>
        <Card title="6. Which assumptions are most important">
          <ul className="list-disc space-y-1 pl-5 text-[14px]">
            {rec.keyAssumptions.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Card>
        <Card title="7. What could go wrong">
          <ul className="list-disc space-y-1 pl-5 text-[14px]">
            {rec.risks.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Card>
        <Card title="8. Which other structures are competitive">
          {rec.competitive.length ? (
            <ul className="list-disc space-y-1 pl-5 text-[14px]">
              {rec.competitive.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : (
            <p className="muted text-[14px]">No other structure is close on these priorities.</p>
          )}
        </Card>
        <Card title="9. What to verify before proceeding" className="lg:col-span-2">
          <ul className="list-disc space-y-1 pl-5 text-[14px]">
            {rec.verify.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Card>
      </div>
      <Card title="Evidence classification for this recommendation">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-5">
          <Col title="Quantified results" items={rec.quantified} tone="accent" />
          <Col title="Supported legal conditions" items={rec.legalConditions} tone="good" />
          <Col title="Commercial assumptions" items={rec.commercialAssumptions} tone="warn" />
          <Col title="Unresolved questions" items={rec.unresolved} tone="bad" />
          <Col title="Professional validation required" items={rec.professional} tone="neutral" />
        </div>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="All issues — current scenario">
          <IssueList issues={result.issues} />
        </Card>
        <Card title="Missing documents and professional review checklist">
          <ul className="space-y-2 text-[14px]">
            {MISSING_DOCS.map((m) => (
              <li key={m} className="flex gap-2">
                <span className="muted">☐</span>
                {m}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Page>
  );
}

function Col({ title, items, tone }: { title: string; items: string[]; tone: 'accent' | 'good' | 'warn' | 'bad' | 'neutral' }) {
  return (
    <div>
      <Pill tone={tone}>{title}</Pill>
      <ul className="mt-2 space-y-1 text-[13px]">
        {items.length ? items.map((i) => <li key={i}>{i}</li>) : <li className="muted">None</li>}
      </ul>
    </div>
  );
}
