import { useMemo, useState } from 'react';
import { Button, Card, Page } from '../../components/ui';
import { useActive } from '../../hooks/useResult';
import { useStore } from '../../state/store';
import { REPORT_TYPES, buildReport, type ReportId } from './build';
import { downloadBlob, reportToCsv, reportToXlsx } from './exporters';

export function ReportsPage() {
  const { scn, result } = useActive();
  const cur = useStore((s) => s.currency);
  const [id, setId] = useState<ReportId>('recommended');
  const rep = useMemo(() => buildReport(id, scn, result, cur), [id, scn, result, cur]);
  const file = `${rep.title.replace(/[^A-Za-z0-9]+/g, '-')}-${scn.name.replace(/[^A-Za-z0-9]+/g, '-')}`.slice(0, 100);
  return (
    <Page
      title="Reports"
      subtitle="Presentation-ready reports with an executive summary, key assumptions, effective dates and evidence status. Download as PDF (via Print → Save as PDF), CSV or XLSX."
      actions={
        <>
          <Button icon="print" variant="primary" onClick={() => window.print()} data-testid="report-pdf">
            PDF
          </Button>
          <Button icon="download" onClick={() => downloadBlob(new Blob([reportToCsv(rep)], { type: 'text/csv' }), `${file}.csv`)} data-testid="report-csv">
            CSV
          </Button>
          <Button icon="download" onClick={async () => downloadBlob(await reportToXlsx(rep), `${file}.xlsx`)} data-testid="report-xlsx">
            XLSX
          </Button>
        </>
      }
    >
      <div className="no-print flex flex-wrap gap-2">
        {REPORT_TYPES.map((t) => (
          <button key={t.id} type="button" className="badge px-3 py-1.5 text-[13px]" style={{ background: id === t.id ? 'var(--accent)' : 'var(--card)', color: id === t.id ? '#fff' : 'var(--ink-2)', border: '1px solid var(--line)' }} onClick={() => setId(t.id)} data-testid={`report-${t.id}`}>
            {t.title}
          </button>
        ))}
      </div>
      <article className="space-y-5" data-testid="report-body">
        <Card>
          <div className="label">THREE X | Venture Intelligence</div>
          <h2 className="h1 mt-1">{rep.title}</h2>
          <p className="muted mt-1 text-[13px]">
            Scenario: {rep.scenarioName} · Currency: {rep.currency} · Generated {new Date(rep.generatedAt).toLocaleString()} · Not tax, legal or investment advice.
          </p>
          <h3 className="h3 mt-4">Executive summary</h3>
          {rep.summary.map((s) => (
            <p key={s} className="mt-1 text-[15px] leading-relaxed">
              {s}
            </p>
          ))}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="h3">Key assumptions and effective dates</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px]">
                {rep.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="h3">Status of source evidence</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px]">
                {rep.evidence.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
        {rep.sections.map((s) => (
          <Card key={s.title} title={s.title} pad={false}>
            <div className="overflow-x-auto px-2 pb-2">
              <table className="table">
                <thead>
                  <tr>
                    {s.header.map((h) => (
                      <th key={h} className={typeof s.rows[0]?.[s.header.indexOf(h)] === 'number' ? 'num' : undefined}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((c, j) => (
                        <td key={j} className={typeof c === 'number' ? 'num' : undefined}>
                          {typeof c === 'number' ? c.toLocaleString('en-CA') : c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {s.note ? <p className="muted px-3 text-[12px]">{s.note}</p> : null}
            </div>
          </Card>
        ))}
      </article>
    </Page>
  );
}
