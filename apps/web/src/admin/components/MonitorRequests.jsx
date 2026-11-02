import React, { useState } from 'react';
import { Card, CardTitle, Kpi, Kpis, MonitoringPage, PERIOD_MINUTES, Toggle, ms, num, pct, rate } from './monitoring-ui.jsx';
import { RequestsChart, RouteTable, StatusBar } from './monitoring-cards.jsx';

/** Incoming HTTP traffic by route pattern: volume, slowness and server errors. */
function Requests({ data }) {
  const [view, setView] = useState('slow');
  const r = data.requests; const t = r.total;
  const views = { slow: ['Slow or failing', r.slow, 'No slow or failing routes. 🎉'], busiest: ['Most requests', r.busiest, 'No requests recorded.'], slowest: ['Slowest on average', r.slowest, 'No requests recorded.'] };
  const [, rows, empty] = views[view];
  return <>
    <Kpis>
      <Kpi label="Requests" value={num(t.count)} hint={`${(t.count / PERIOD_MINUTES[data.period]).toFixed(1)} per minute`} />
      <Kpi label="Average response" value={ms(t.avg)} hint={`worst ${ms(t.max)}`} />
      <Kpi label={`Slow (≥ ${ms(data.thresholds.request)})`} value={num(t.slow)} hint={t.count ? pct(rate(t.slow, t.count)) : null} tone={t.slow ? 'orange' : undefined} />
      <Kpi label="Server errors (5xx)" value={num(t.error)} hint={t.count ? pct(rate(t.error, t.count)) : null} tone={t.error ? 'red' : undefined} />
      <Kpi label="Client errors (4xx)" value={num(r.statuses['4xx'])} hint={t.count ? pct(rate(r.statuses['4xx'], t.count)) : null} />
      <Kpi label="Routes seen" value={num(r.routes)} />
    </Kpis>
    <Card>
      <CardTitle>Requests over time</CardTitle>
      <RequestsChart data={data} height={180} />
      <div style={{ marginTop: 18 }}><StatusBar statuses={r.statuses} /></div>
    </Card>
    <Card>
      <CardTitle right={<Toggle value={view} onChange={setView} label="Sort routes" options={Object.entries(views).map(([key, [label]]) => [key, label])} />}>Routes ({num(rows.length)})</CardTitle>
      <RouteTable rows={rows} threshold={data.thresholds.request} empty={empty} showLast={view === 'slow'} />
    </Card>
  </>;
}

export default function MonitorRequests() {
  return <MonitoringPage page="requests" title="Requests" subtitle="Incoming traffic by route">{(data) => <Requests data={data} />}</MonitoringPage>;
}
