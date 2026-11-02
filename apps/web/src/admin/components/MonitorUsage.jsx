import React from 'react';
import { Card, CardTitle, Columns, Kpi, Kpis, MonitoringPage, num } from './monitoring-ui.jsx';
import { PeopleList } from './monitoring-cards.jsx';

/** Which signed-in members generate the most traffic, and who meets the most slow pages. */
function Usage({ data }) {
  const u = data.usage;
  return <>
    <Kpis>
      <Kpi label="Active signed-in members" value={num(u.active)} />
      <Kpi label="Requests by the top member" value={num(u.top[0]?.count || 0)} hint={u.top[0]?.name || null} />
    </Kpis>
    <Columns>
      <Card>
        <CardTitle>Most requests</CardTitle>
        <PeopleList rows={u.top} empty="No signed-in traffic in this period." />
      </Card>
      <Card>
        <CardTitle>Most slow requests</CardTitle>
        <PeopleList rows={u.slow} metric="slow" empty="Nobody hit a slow page." />
      </Card>
    </Columns>
  </>;
}

export default function MonitorUsage() {
  return <MonitoringPage page="usage" title="Usage" subtitle="Traffic by member">{(data) => <Usage data={data} />}</MonitoringPage>;
}
