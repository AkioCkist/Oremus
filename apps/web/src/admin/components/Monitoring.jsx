import React from 'react';
import { Card, CardTitle, Columns, Kpi, Kpis, MonitoringPage, Muted, PageLink, Pill, SectionTitle, T, bytes, ms, num, pct, rate, relative } from './monitoring-ui.jsx';
import { ExceptionTable, RequestsChart, RouteTable, roleLabel, serverMemory, StatusBar } from './monitoring-cards.jsx';

/** Monitoring overview: is everything up, and is anything getting worse? Each tile opens its detailed page. */

function ServerStrip({ servers }) {
  if (!servers.length) return <Card><Muted>No process has reported yet. Web, jobs and media each send a heartbeat every 15 seconds once they start.</Muted></Card>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
      {servers.map((server) => {
        const memory = serverMemory(server);
        return (
          <PageLink key={server.id} to="servers" className="oa-card-link" style={{ display: 'block', textDecoration: 'none', color: T.ink, background: '#fff', borderRadius: 20, boxShadow: T.card, padding: '14px 16px', opacity: server.online ? 1 : 0.7 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <b style={{ fontSize: 14 }}>{roleLabel(server.role)}</b>
              {server.online ? <Pill tone="green" label="Online" /> : <Pill tone="red" label={`Silent ${relative(server.at)}`} />}
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{server.host}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 10, fontSize: 12 }}>
              <div><div style={{ color: T.muted }}>CPU</div><b style={{ color: server.cpu.process >= 80 ? '#D70015' : T.ink }}>{pct(server.cpu.process)}</b></div>
              <div><div style={{ color: T.muted }}>Memory</div><b style={{ color: memory.percent >= 85 ? '#D70015' : T.ink }}>{bytes(memory.used)}</b></div>
              <div><div style={{ color: T.muted }}>Loop p99</div><b style={{ color: server.eventLoop.p99 >= 40 ? '#D70015' : T.ink }}>{ms(server.eventLoop.p99)}</b></div>
            </div>
          </PageLink>
        );
      })}
    </div>
  );
}

function Overview({ data }) {
  const r = data.requests.total;
  const backlog = data.queues.reduce((sum, queue) => sum + (queue.waiting || 0), 0);
  const failedJobs = data.queues.reduce((sum, queue) => sum + (queue.failed || 0), 0);
  const offline = data.servers.filter((server) => !server.online);
  return <>
    {offline.length ? <Card style={{ background: '#FFE5E6', boxShadow: 'none', color: '#D70015' }}><b>{offline.length} process(es) stopped reporting:</b> {offline.map((server) => `${roleLabel(server.role)} on ${server.host}`).join(', ')}.</Card> : null}

    <SectionTitle right={<PageLink to="servers" className="oa-link" style={{ fontSize: 13 }}>Details →</PageLink>}>Processes and containers</SectionTitle>
    <ServerStrip servers={data.servers} />

    <SectionTitle>Last {data.period}</SectionTitle>
    <Kpis>
      <Kpi to="requests" label="Requests" value={num(r.count)} hint={`${(r.count / ({ '1h': 60, '6h': 360, '24h': 1440, '7d': 10080 }[data.period] || 60)).toFixed(1)} per minute`} />
      <Kpi to="requests" label="Average response" value={ms(r.avg)} hint={`worst ${ms(r.max)}`} tone={r.avg >= data.thresholds.request ? 'red' : r.avg >= data.thresholds.request / 2 ? 'orange' : undefined} />
      <Kpi to="requests" label="Slow requests" value={num(r.slow)} hint={r.count ? `${pct(rate(r.slow, r.count))} of all` : null} tone={r.slow ? 'orange' : undefined} />
      <Kpi to="requests" label="Server errors (5xx)" value={num(r.error)} hint={r.count ? `${pct(rate(r.error, r.count))} of all` : null} tone={r.error ? 'red' : undefined} />
      <Kpi to="exceptions" label="Exceptions" value={num(data.exceptions.total)} hint={`${num(data.exceptions.kinds)} different`} tone={data.exceptions.total ? 'red' : 'green'} />
      <Kpi to="database" label="Slow queries" value={num(data.queries.total.slow)} hint={`${num(data.queries.total.count)} queries · avg ${ms(data.queries.total.avg)}`} tone={data.queries.total.slow ? 'orange' : undefined} />
      <Kpi to="cache" label="Cache hit rate" value={data.cache.total.rate === null ? '—' : pct(data.cache.total.rate)} hint={data.cache.total.rate === null ? 'No cached page opened yet' : `${num(data.cache.total.hit + data.cache.total.miss)} reads`} tone={data.cache.total.rate === null ? undefined : data.cache.total.rate >= 80 ? 'green' : data.cache.total.rate >= 50 ? 'orange' : 'red'} />
      <Kpi to="queues" label="Jobs waiting" value={num(backlog)} hint={`${num(data.jobs.total.count)} ran · ${num(data.jobs.total.error)} failed`} tone={backlog > 100 ? 'orange' : undefined} />
      <Kpi to="queues" label="Failed jobs kept" value={num(failedJobs)} tone={failedJobs ? 'red' : undefined} />
      <Kpi to="outgoing" label="Outgoing HTTP" value={num(data.outgoing.total.count)} hint={`${num(data.outgoing.total.error)} failed · avg ${ms(data.outgoing.total.avg)}`} tone={data.outgoing.total.error ? 'orange' : undefined} />
      <Kpi to="cache" label="Redis" value={data.redis.ok ? `${ms(data.redis.latency)} ping` : 'Down'} hint={data.redis.ok ? `${bytes(data.redis.memory.used)} · ${num(data.redis.clients)} clients` : data.redis.error} tone={data.redis.ok ? 'green' : 'red'} />
      <Kpi to="database" label="MongoDB" value={data.mongo.ok ? `${ms(data.mongo.latency)} ping` : 'Down'} hint={data.mongo.ok && data.mongo.connections ? `${num(data.mongo.connections.current)} connections · v${data.mongo.version}` : data.mongo.error} tone={data.mongo.ok ? 'green' : 'red'} />
    </Kpis>

    <Card>
      <CardTitle right={<PageLink to="requests" className="oa-link" style={{ fontSize: 13 }}>All routes →</PageLink>}>Traffic</CardTitle>
      <RequestsChart data={data} height={140} />
      <div style={{ marginTop: 16 }}><StatusBar statuses={data.requests.statuses} /></div>
    </Card>

    <Columns>
      <Card>
        <CardTitle right={<PageLink to="requests" className="oa-link" style={{ fontSize: 13 }}>See all →</PageLink>}>Slowest routes</CardTitle>
        <RouteTable rows={data.requests.slow} threshold={data.thresholds.request} empty="No slow requests. 🎉" />
      </Card>
      <Card>
        <CardTitle right={<PageLink to="exceptions" className="oa-link" style={{ fontSize: 13 }}>See all →</PageLink>}>Latest exceptions</CardTitle>
        <ExceptionTable rows={data.exceptions.rows} />
      </Card>
    </Columns>
  </>;
}

export default function Monitoring() {
  return <MonitoringPage page="monitoring" title="Monitoring" subtitle="Health of every process and service">{(data) => <Overview data={data} />}</MonitoringPage>;
}
