import React from 'react';
import { BarChart, Card, CardTitle, Kpi, Kpis, MonitoringPage, ms, num, pct, rate } from './monitoring-ui.jsx';
import { TimedTable } from './monitoring-cards.jsx';

/** Calls Oremus makes to other services (FastAPI, moderation models, LiveKit, VNPay, places search...). */
function Outgoing({ data }) {
  const o = data.outgoing; const t = o.total;
  return <>
    <Kpis>
      <Kpi label="Calls" value={num(t.count)} />
      <Kpi label="Failed" value={num(t.error)} hint={t.count ? pct(rate(t.error, t.count)) : null} tone={t.error ? 'red' : undefined} />
      <Kpi label="Average" value={ms(t.avg)} hint={`worst ${ms(t.max)}`} />
      <Kpi label={`Slow (≥ ${ms(data.thresholds.outgoing)})`} value={num(t.slow)} tone={t.slow ? 'orange' : undefined} />
      <Kpi label="Services" value={num(o.rows.length)} />
    </Kpis>
    <Card>
      <CardTitle>Calls over time</CardTitle>
      <BarChart series={o.series} value={(p) => p.count} danger={(p) => p.error} color="#00C3D0" height={150} granularity={data.granularity} label="Outgoing calls over time, failures in red" />
    </Card>
    <Card>
      <CardTitle>By service</CardTitle>
      <TimedTable rows={o.rows} threshold={data.thresholds.outgoing} label="Method and host" countLabel="Calls" empty="No outgoing HTTP calls in this period." />
    </Card>
  </>;
}

export default function MonitorOutgoing() {
  return <MonitoringPage page="outgoing" title="Outgoing HTTP" subtitle="Calls to other services">{(data) => <Outgoing data={data} />}</MonitoringPage>;
}
