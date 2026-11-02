import React from 'react';
import { BarChart, Card, CardTitle, Kpi, Kpis, MonitoringPage, num, relative } from './monitoring-ui.jsx';
import { ExceptionTable } from './monitoring-cards.jsx';

/** Unhandled errors from requests, jobs and crashes, grouped by type, message and code location. */
function Exceptions({ data }) {
  const e = data.exceptions;
  const latest = e.rows.reduce((last, row) => Math.max(last, row.meta?.lastAt || 0), 0);
  return <>
    <Kpis>
      <Kpi label="Exceptions" value={num(e.total)} tone={e.total ? 'red' : 'green'} />
      <Kpi label="Different kinds" value={num(e.kinds)} />
      <Kpi label="Most recent" value={latest ? relative(latest) : '—'} />
    </Kpis>
    <Card>
      <CardTitle>Exceptions over time</CardTitle>
      <BarChart series={e.series} value={(p) => p.count} color="#F87171" height={140} granularity={data.granularity} label="Exceptions over time" />
    </Card>
    <Card>
      <CardTitle>All exceptions ({num(e.rows.length)})</CardTitle>
      <ExceptionTable rows={e.rows} />
    </Card>
  </>;
}

export default function MonitorExceptions() {
  return <MonitoringPage page="exceptions" title="Exceptions" subtitle="Errors from requests, jobs and crashes">{(data) => <Exceptions data={data} />}</MonitoringPage>;
}
