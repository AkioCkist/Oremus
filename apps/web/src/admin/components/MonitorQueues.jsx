import React from 'react';
import { BarChart, Card, CardTitle, Kpi, Kpis, MonitoringPage, ms, num, pct, rate } from './monitoring-ui.jsx';
import { QueueTable, TimedTable } from './monitoring-cards.jsx';

/** BullMQ queues (moderation, ads, calls) and the media transcode queue: backlog now, and how jobs ran. */
function Queues({ data }) {
  const j = data.jobs; const t = j.total;
  const waiting = data.queues.reduce((sum, queue) => sum + (queue.waiting || 0), 0);
  const failedKept = data.queues.reduce((sum, queue) => sum + (queue.failed || 0), 0);
  return <>
    <Kpis>
      <Kpi label="Waiting now" value={num(waiting)} tone={waiting > 100 ? 'orange' : undefined} />
      <Kpi label="Failed jobs kept" value={num(failedKept)} tone={failedKept ? 'red' : undefined} />
      <Kpi label="Jobs run" value={num(t.count)} />
      <Kpi label="Failed in period" value={num(t.error)} hint={t.count ? pct(rate(t.error, t.count)) : null} tone={t.error ? 'red' : undefined} />
      <Kpi label="Average duration" value={ms(t.avg)} hint={`worst ${ms(t.max)}`} />
      <Kpi label={`Slow (≥ ${ms(data.thresholds.job)})`} value={num(t.slow)} tone={t.slow ? 'orange' : undefined} />
    </Kpis>
    <Card>
      <CardTitle>Queues right now</CardTitle>
      <QueueTable queues={data.queues} />
    </Card>
    <Card>
      <CardTitle>Jobs over time</CardTitle>
      <BarChart series={j.series} value={(p) => p.count} danger={(p) => p.error} color="#AF52DE" height={150} granularity={data.granularity} label="Jobs over time, failures in red" />
    </Card>
    <Card>
      <CardTitle>Jobs by type ({num(j.rows.length)})</CardTitle>
      <TimedTable rows={j.rows} threshold={data.thresholds.job} label="Queue : job" empty="No jobs ran in this period." />
    </Card>
  </>;
}

export default function MonitorQueues() {
  return <MonitoringPage page="queues" title="Queues & jobs" subtitle="Background work">{(data) => <Queues data={data} />}</MonitoringPage>;
}
