import React, { useState } from 'react';
import { BarChart, Card, CardTitle, Code, Columns, Duration, ErrorCount, Kpi, Kpis, MonitoringPage, SlowCount, Table, Toggle, ms, num, pct, rate } from './monitoring-ui.jsx';
import { CollectionsCard, MongoCard, QueryTable, RunningOps } from './monitoring-cards.jsx';

/** MongoDB: every query the app ran, grouped by shape, plus the server's own health and storage. */
function Database({ data }) {
  const [view, setView] = useState('slow');
  const q = data.queries; const t = q.total; const threshold = data.thresholds.query;
  const views = { slow: ['Slow', q.slow, 'No slow queries. 🎉'], heaviest: ['Most total time', q.heaviest, 'No queries recorded.'], frequent: ['Most frequent', q.frequent, 'No queries recorded.'] };
  const [, rows, empty] = views[view];
  return <>
    <Kpis>
      <Kpi label="Queries" value={num(t.count)} hint={`${num(q.shapes)} different shapes`} />
      <Kpi label="Average" value={ms(t.avg)} hint={`worst ${ms(t.max)}`} />
      <Kpi label={`Slow (≥ ${ms(threshold)})`} value={num(t.slow)} hint={t.count ? pct(rate(t.slow, t.count)) : null} tone={t.slow ? 'orange' : undefined} />
      <Kpi label="Failed" value={num(t.error)} tone={t.error ? 'red' : undefined} />
      <Kpi label="Time in the database" value={ms(t.sum)} />
      <Kpi label="Running ≥ 1 s now" value={num(data.mongo.runningCount || 0)} tone={data.mongo.runningCount ? 'orange' : undefined} />
    </Kpis>
    <Card>
      <CardTitle>Queries over time</CardTitle>
      <BarChart series={q.series} value={(p) => p.count} danger={(p) => p.slow} dangerLabel="slow" color="#5E5CE6" height={150} granularity={data.granularity} label="Queries over time, slow ones in red" />
    </Card>
    <Card>
      <CardTitle right={<Toggle value={view} onChange={setView} label="Sort queries" options={Object.entries(views).map(([key, [label]]) => [key, label])} />}>Queries ({num(rows.length)})</CardTitle>
      <QueryTable rows={rows} threshold={threshold} empty={empty} total={view === 'heaviest'} />
    </Card>
    <Card>
      <CardTitle>Load by collection</CardTitle>
      <Table rows={q.collections} empty="No queries recorded." columns={[
        { label: 'Collection', grow: true, render: (row) => <Code>{row.key}</Code> },
        { label: 'Queries', align: 'right', render: (row) => num(row.count) },
        { label: 'Slow', align: 'right', render: (row) => <SlowCount value={row.slow} /> },
        { label: 'Failed', align: 'right', render: (row) => <ErrorCount value={row.error} /> },
        { label: 'Average', align: 'right', render: (row) => <Duration value={row.avg} warn={threshold / 2} bad={threshold} /> },
        { label: 'Worst', align: 'right', render: (row) => <Duration value={row.max} warn={threshold / 2} bad={threshold} /> },
        { label: 'Total time', align: 'right', render: (row) => <b>{ms(row.sum)}</b> }
      ]} />
    </Card>
    <RunningOps info={data.mongo} />
    <Columns>
      <MongoCard info={data.mongo} />
      <CollectionsCard info={data.mongo} />
    </Columns>
  </>;
}

export default function MonitorDatabase() {
  return <MonitoringPage page="database" title="Database" subtitle="MongoDB queries and server">{(data) => <Database data={data} />}</MonitoringPage>;
}
