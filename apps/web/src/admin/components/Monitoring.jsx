import React from 'react';
import { Card, CardTitle, Columns, Kpi, Kpis, MonitoringPage, Muted, PageLink, PERIOD_MINUTES, Pill, SectionTitle, T, bytes, ms, num, pct, rate, relative, since } from './monitoring-ui.jsx';
import { ExceptionTable, RequestsChart, RouteTable, roleLabel, serverMemory, StatusBar } from './monitoring-cards.jsx';

/**
 * Monitoring overview: one summary that says plainly whether anything needs a person, then the processes, then the
 * figures grouped by where they come from. Each tile opens its detailed page.
 */

function Meter({ label, value, percent, warn, bad }) {
  const color = percent >= bad ? '#F87171' : percent >= warn ? '#FBBF24' : '#4ADE80';
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 13, color: T.muted }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, margin: '2px 0 6px', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ height: 6, borderRadius: 9999, background: T.line, overflow: 'hidden' }}><div style={{ width: `${Math.max(2, Math.min(100, percent || 0))}%`, height: '100%', background: color, borderRadius: 9999 }} /></div>
    </div>
  );
}

function ServerStrip({ servers }) {
  if (!servers.length) return <Card><Muted>No process has reported yet. Web, jobs and media each send a heartbeat every 15 seconds once they start.</Muted></Card>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
      {servers.map((server) => {
        const memory = serverMemory(server);
        return (
          <PageLink key={server.id} to="servers" className="oa-card-link" style={{ display: 'flex', flexDirection: 'column', gap: 14, textDecoration: 'none', color: T.ink, background: T.surface, borderRadius: 16, boxShadow: server.online ? T.card : '0 0 0 1px #5B1D1D', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 15 }}>{roleLabel(server.role)}</b>
                <div style={{ fontSize: 12, color: T.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'ui-monospace, monospace' }}>{server.host} · up {since(server.uptime)}</div>
              </div>
              {server.online ? <Pill tone="green" label="Online" /> : <Pill tone="red" label={`Silent ${relative(server.at)}`} />}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
              <Meter label="CPU" value={pct(server.cpu.process)} percent={server.cpu.process} warn={60} bad={80} />
              <Meter label="Memory" value={bytes(memory.used)} percent={memory.percent} warn={70} bad={85} />
              <Meter label="Loop p99" value={ms(server.eventLoop.p99)} percent={server.eventLoop.p99} warn={40} bad={100} />
            </div>
          </PageLink>
        );
      })}
    </div>
  );
}

/** Everything that needs a person, worst first. An empty list lets the summary say "all normal" plainly. */
function issuesOf(data, backlog, failedJobs) {
  const r = data.requests.total;
  const out = [];
  const offline = data.servers.filter((server) => !server.online);
  if (offline.length) out.push({ level: 'red', to: 'servers', text: `${offline.length} process(es) stopped reporting: ${offline.map((server) => `${roleLabel(server.role)} on ${server.host}`).join(', ')}.` });
  if (!data.redis.ok) out.push({ level: 'red', to: 'cache', text: `Redis is down: ${data.redis.error}` });
  if (!data.mongo.ok) out.push({ level: 'red', to: 'database', text: `MongoDB is down: ${data.mongo.error}` });
  if (r.error) out.push({ level: 'red', to: 'requests', text: `${num(r.error)} server error(s) (5xx) in the last ${data.period}.` });
  if (data.exceptions.total) out.push({ level: 'red', to: 'exceptions', text: `${num(data.exceptions.total)} exception(s) of ${num(data.exceptions.kinds)} kind(s).` });
  if (failedJobs) out.push({ level: 'orange', to: 'queues', text: `${num(failedJobs)} failed job(s) kept for retry.` });
  if (r.slow) {
    const worst = data.requests.slow[0];
    out.push({ level: 'orange', to: 'requests', text: `${num(r.slow)} request(s) slower than ${ms(data.thresholds.request)}${worst ? `; worst ${worst.key} at ${ms(worst.max)}` : ''}.` });
  }
  if (data.queries.total.slow) out.push({ level: 'orange', to: 'database', text: `${num(data.queries.total.slow)} database queries slower than ${ms(data.thresholds.query)}.` });
  if (data.outgoing.total.error) out.push({ level: 'orange', to: 'outgoing', text: `${num(data.outgoing.total.error)} outgoing call(s) failed.` });
  if (backlog > 100) out.push({ level: 'orange', to: 'queues', text: `${num(backlog)} jobs waiting in the queues.` });
  return out;
}

const LEVEL = {
  red: { border: '#5B1D1D', bg: '#1A1012', fg: '#F87171', icon: '!', word: 'Problem' },
  orange: { border: '#4A3A12', bg: '#17150F', fg: '#FBBF24', icon: '!', word: 'Warning' },
  green: { border: '#14402A', bg: '#0F1A14', fg: '#4ADE80', icon: '✓' }
};

function HealthSummary({ issues, period }) {
  const level = issues.some((issue) => issue.level === 'red') ? 'red' : issues.length ? 'orange' : 'green';
  const tone = LEVEL[level];
  return (
    <section aria-labelledby="health-title" style={{ display: 'flex', gap: 16, alignItems: 'flex-start', padding: '16px 20px', borderRadius: 16, background: tone.bg, boxShadow: `0 0 0 1px ${tone.border}` }}>
      <span aria-hidden="true" style={{ flex: 'none', width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 18, color: tone.fg, background: tone.border }}>{tone.icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <h2 id="health-title" style={{ margin: 0, fontSize: 16, fontWeight: 600, color: T.ink }}>{issues.length ? `${issues.length} thing(s) need a look` : 'All systems normal'}</h2>
        {issues.length ? (
          <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {issues.map((issue, index) => (
              <li key={index} style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'baseline', fontSize: 14 }}>
                <span style={{ color: LEVEL[issue.level].fg, fontWeight: 600 }}>{LEVEL[issue.level].word}</span>
                <span style={{ color: T.ink2, minWidth: 0, overflowWrap: 'anywhere' }}>{issue.text}</span>
                <PageLink to={issue.to} className="oa-link" style={{ fontSize: 14 }}>Open</PageLink>
              </li>
            ))}
          </ul>
        ) : <p style={{ margin: '4px 0 0', fontSize: 14, color: T.ink2 }}>Every process is online, with no errors and nothing slow in the last {period}.</p>}
      </div>
    </section>
  );
}

const Group = ({ title, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <h3 style={{ margin: 0, fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.muted }}>{title}</h3>
    <Kpis min={200}>{children}</Kpis>
  </div>
);

function Overview({ data }) {
  const r = data.requests.total;
  const backlog = data.queues.reduce((sum, queue) => sum + (queue.waiting || 0), 0);
  const failedJobs = data.queues.reduce((sum, queue) => sum + (queue.failed || 0), 0);
  const online = data.servers.filter((server) => server.online).length;
  return <>
    <HealthSummary issues={issuesOf(data, backlog, failedJobs)} period={data.period} />

    <SectionTitle right={<PageLink to="servers" className="oa-link" style={{ fontSize: 14 }}>Server details</PageLink>}>Processes · {online} of {data.servers.length} online</SectionTitle>
    <ServerStrip servers={data.servers} />

    <SectionTitle>Last {data.period}</SectionTitle>
    <Group title="Web traffic">
      <Kpi to="requests" label="Requests" value={num(r.count)} hint={`${(r.count / (PERIOD_MINUTES[data.period] || 60)).toFixed(1)} per minute`} />
      <Kpi to="requests" label="Average response" value={ms(r.avg)} hint={`worst ${ms(r.max)}`} tone={r.avg >= data.thresholds.request ? 'red' : r.avg >= data.thresholds.request / 2 ? 'orange' : undefined} />
      <Kpi to="requests" label="Slow requests" value={num(r.slow)} hint={r.count ? `${pct(rate(r.slow, r.count))} of all · limit ${ms(data.thresholds.request)}` : null} tone={r.slow ? 'orange' : undefined} />
      <Kpi to="requests" label="Server errors (5xx)" value={num(r.error)} hint={r.count ? `${pct(rate(r.error, r.count))} of all` : null} tone={r.error ? 'red' : undefined} />
    </Group>
    <Group title="Data">
      <Kpi to="database" label="Slow queries" value={num(data.queries.total.slow)} hint={`${num(data.queries.total.count)} queries · avg ${ms(data.queries.total.avg)}`} tone={data.queries.total.slow ? 'orange' : undefined} />
      <Kpi to="cache" label="Cache hit rate" value={data.cache.total.rate === null ? '—' : pct(data.cache.total.rate)} hint={data.cache.total.rate === null ? 'No cached page opened yet' : `${num(data.cache.total.hit + data.cache.total.miss)} reads`} tone={data.cache.total.rate === null || data.cache.total.rate >= 80 ? undefined : data.cache.total.rate >= 50 ? 'orange' : 'red'} />
      <Kpi to="cache" label="Redis ping" value={data.redis.ok ? ms(data.redis.latency) : 'Down'} hint={data.redis.ok ? `${bytes(data.redis.memory.used)} · ${num(data.redis.clients)} clients` : data.redis.error} tone={data.redis.ok ? undefined : 'red'} />
      <Kpi to="database" label="MongoDB ping" value={data.mongo.ok ? ms(data.mongo.latency) : 'Down'} hint={data.mongo.ok && data.mongo.connections ? `${num(data.mongo.connections.current)} connections · v${data.mongo.version}` : data.mongo.error} tone={data.mongo.ok ? undefined : 'red'} />
    </Group>
    <Group title="Background work">
      <Kpi to="queues" label="Jobs waiting" value={num(backlog)} hint={`${num(data.jobs.total.count)} ran · ${num(data.jobs.total.error)} failed`} tone={backlog > 100 ? 'orange' : undefined} />
      <Kpi to="queues" label="Failed jobs kept" value={num(failedJobs)} hint={failedJobs ? 'Retry them from Queues & jobs' : null} tone={failedJobs ? 'red' : undefined} />
      <Kpi to="outgoing" label="Outgoing HTTP" value={num(data.outgoing.total.count)} hint={`${num(data.outgoing.total.error)} failed · avg ${ms(data.outgoing.total.avg)}`} tone={data.outgoing.total.error ? 'orange' : undefined} />
      <Kpi to="exceptions" label="Exceptions" value={num(data.exceptions.total)} hint={`${num(data.exceptions.kinds)} different kinds`} tone={data.exceptions.total ? 'red' : undefined} />
    </Group>

    <Card>
      <CardTitle right={<PageLink to="requests" className="oa-link" style={{ fontSize: 14 }}>All routes</PageLink>}>Traffic</CardTitle>
      <RequestsChart data={data} height={140} />
      <div style={{ marginTop: 16 }}><StatusBar statuses={data.requests.statuses} /></div>
    </Card>

    <Columns>
      <Card>
        <CardTitle right={<PageLink to="requests" className="oa-link" style={{ fontSize: 14 }}>View all</PageLink>}>Slowest routes</CardTitle>
        <RouteTable rows={data.requests.slow} threshold={data.thresholds.request} empty={`No slow requests in the last ${data.period}.`} />
      </Card>
      <Card>
        <CardTitle right={<PageLink to="exceptions" className="oa-link" style={{ fontSize: 14 }}>History</PageLink>}>Latest exceptions</CardTitle>
        <ExceptionTable rows={data.exceptions.rows} empty={`No exceptions in the last ${data.period}.`} />
      </Card>
    </Columns>
  </>;
}

export default function Monitoring() {
  return <MonitoringPage page="monitoring" title="Monitoring" subtitle="Health of every process and service">{(data) => <Overview data={data} />}</MonitoringPage>;
}
