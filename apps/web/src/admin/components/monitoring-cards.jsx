import React from 'react';
import { Avatar, showUrl } from './ui.jsx';
import {
  BarChart, Card, CardTitle, Code, Duration, ErrorCount, Fact, Facts, Health, Meter, Muted, Pill, Rank, SlowCount, Table, T,
  bytes, ms, num, pct, rate, relative, severity, since, Bar
} from './monitoring-ui.jsx';

/* Cards and tables shared by several monitoring pages. */

const ROLE = { web: { label: 'Web server', icon: '🌐' }, jobs: { label: 'Jobs worker', icon: '⚙️' }, media: { label: 'Media worker', icon: '🎞' } };
export const roleLabel = (role) => (ROLE[role] || { label: role }).label;

/* ---------- Servers ---------- */

export function serverMemory(server) {
  const limit = server.memory.limit || server.memory.systemTotal;
  const used = server.memory.limit ? (server.memory.usage || server.memory.rss) : server.memory.rss;
  return { limit, used, percent: limit ? (used / limit) * 100 : 0 };
}

export function ServerCard({ server, large = false }) {
  const role = ROLE[server.role] || { label: server.role, icon: '▣' };
  const memory = serverMemory(server);
  const series = server.series || [];
  const disk = server.disk;
  const spark = large ? 48 : 30;
  return (
    <Card style={{ opacity: server.online ? 1 : 0.7 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: T.grouped, fontSize: 20 }}>{role.icon}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 650 }}>{role.label}</div>
          <div style={{ fontSize: 12, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={server.host}>{server.container ? 'Docker container ' : 'Host '}{server.host} · pid {server.pid}</div>
        </div>
        {server.online ? <Pill tone="green" label="Online" /> : <Pill tone="red" label={`Silent ${relative(server.at)}`} />}
      </div>
      <div style={{ display: 'grid', gap: 16 }}>
        <Meter label={`CPU, this process (${server.cpu.limit ? `limit ${server.cpu.limit} cores` : `${server.cpu.cores} cores`})`} value={server.cpu.process} max={100} text={pct(server.cpu.process)} series={series.map((p) => p.cpu)} seriesMax={100} sparkHeight={spark} sub={`Whole machine ${pct(server.cpu.host)} · load ${server.cpu.load.join(' / ')}`} />
        <Meter label={server.memory.limit ? 'Memory (container limit)' : 'Memory (share of machine RAM)'} value={memory.used} max={memory.limit} text={`${bytes(memory.used)} / ${bytes(memory.limit)}`} series={series.map((p) => p.mem)} seriesMax={memory.limit} sparkHeight={spark} sub={`JS heap ${bytes(server.memory.heapUsed)} of ${bytes(server.memory.heapTotal)} · machine free ${bytes(server.memory.systemFree)}`} />
        {large ? <Meter label="Event loop delay (p99)" value={server.eventLoop.p99} max={500} text={ms(server.eventLoop.p99)} warn={10} bad={40} series={series.map((p) => p.lag)} seriesMax={Math.max(50, ...series.map((p) => p.lag || 0))} sparkHeight={spark} sub={`Average ${ms(server.eventLoop.mean)} · worst ${ms(server.eventLoop.max)}. Above ~50 ms the process feels sluggish.`} /> : null}
        {disk ? <Meter label={`Disk (${disk.path})`} value={disk.total - disk.free} max={disk.total} text={`${bytes(disk.total - disk.free)} / ${bytes(disk.total)}`} warn={80} bad={92} sub={`${bytes(disk.free)} free`} /> : null}
      </div>
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${T.line}` }}>
        <Facts min={large ? 140 : 110}>
          {large ? null : <Fact label="Event loop p99"><span style={{ color: server.eventLoop.p99 >= 40 ? '#F87171' : server.eventLoop.p99 >= 10 ? '#FBBF24' : T.ink }}>{ms(server.eventLoop.p99)}</span></Fact>}
          <Fact label="Uptime">{since(server.uptime)}</Fact>
          <Fact label="Node.js">{server.node}</Fact>
          {server.sockets !== undefined ? <Fact label="Live sockets">{num(server.sockets)}</Fact> : null}
          {server.videoQueue !== undefined ? <Fact label="Videos queued">{num(server.videoQueue)}</Fact> : null}
          {server.pids ? <Fact label="Processes">{server.pids}{server.pidsLimit ? ` / ${server.pidsLimit}` : ''}</Fact> : null}
          {large ? <Fact label="Last heartbeat">{relative(server.at)}</Fact> : null}
          {large ? <Fact label="Started">{new Date(server.startedAt).toLocaleString('vi-VN')}</Fact> : null}
          {large ? <Fact label="System">{server.platform}</Fact> : null}
        </Facts>
      </div>
    </Card>
  );
}

/* ---------- Requests ---------- */

const STATUS_COLOR = { '2xx': '#4ADE80', '3xx': '#A78BFA', '4xx': '#FBBF24', '5xx': '#F87171' };

export function StatusBar({ statuses }) {
  const total = Object.values(statuses).reduce((sum, value) => sum + value, 0);
  if (!total) return null;
  return (
    <div>
      <div style={{ display: 'flex', height: 10, borderRadius: 9999, overflow: 'hidden' }}>
        {Object.entries(statuses).map(([group, value]) => (value ? <div key={group} title={`${group}: ${value}`} style={{ width: `${rate(value, total)}%`, background: STATUS_COLOR[group] }} /> : null))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 8, fontSize: 12, color: T.muted }}>
        {Object.entries(statuses).map(([group, value]) => <span key={group}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 9999, background: STATUS_COLOR[group], marginRight: 6 }} />{group} <b style={{ color: T.ink }}>{num(value)}</b> ({pct(rate(value, total))})</span>)}
      </div>
    </div>
  );
}

export function RouteTable({ rows, threshold, empty, showLast = false }) {
  return (
    <Table rows={rows} empty={empty} columns={[
      { label: '#', render: (_row, index) => <Rank index={index} /> },
      { label: 'Route', grow: true, render: (row) => <Code>{row.key}</Code> },
      { label: 'Requests', align: 'right', render: (row) => num(row.count) },
      { label: 'Slow', align: 'right', render: (row) => <SlowCount value={row.slow} /> },
      { label: '5xx', align: 'right', render: (row) => <ErrorCount value={row.error} /> },
      { label: 'Average', align: 'right', render: (row) => <Duration value={row.avg} warn={threshold / 2} bad={threshold} /> },
      { label: 'Worst', align: 'right', render: (row) => <Duration value={row.max} warn={threshold / 2} bad={threshold} /> },
      ...(showLast ? [{ label: 'Last slow', align: 'right', render: (row) => (row.meta?.lastSlowAt ? `${relative(row.meta.lastSlowAt)} (${ms(row.meta.lastSlowMs)})` : '—') }] : [])
    ]} />
  );
}

export function RequestsChart({ data, height }) {
  return <BarChart series={data.requests.series} value={(p) => p.count} danger={(p) => p.error} dangerLabel="server errors" granularity={data.granularity} height={height} label="Requests over time, server errors in red" />;
}

/* ---------- Exceptions ---------- */

export function ExceptionTable({ rows, empty = 'No exceptions.', open = false }) {
  return (
    <Table rows={rows} empty={empty} columns={[
      { label: 'Exception', grow: true, render: (row) => (
        <details open={open}>
          <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
            <span style={{ fontWeight: 650, color: '#F87171' }}>{row.meta?.name || 'Error'}</span>
            <span style={{ color: T.ink }}> {row.meta?.message || ''}</span>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>
              <Code>{row.meta?.location || 'unknown location'}</Code>
              {row.meta?.route ? <> · {row.meta.route}</> : null}
              {row.meta?.source && row.meta.source !== 'request' ? <> · {row.meta.source}</> : null}
              {row.meta?.stack ? <span style={{ color: T.brand }}> · show stack</span> : null}
            </div>
          </summary>
          {row.meta?.stack ? <pre style={{ margin: '10px 0 0', padding: 12, borderRadius: 12, background: T.grouped, fontSize: 11, lineHeight: '16px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{row.meta.stack}</pre> : null}
        </details>
      ) },
      { label: 'Times', align: 'right', render: (row) => <b>{num(row.count)}</b> },
      { label: 'Last seen', align: 'right', render: (row) => (row.meta?.lastAt ? relative(row.meta.lastAt) : '—') }
    ]} />
  );
}

/* ---------- Queries ---------- */

export function QueryTable({ rows, threshold, empty, total = false }) {
  return (
    <Table rows={rows} empty={empty} columns={[
      { label: '#', render: (_row, index) => <Rank index={index} /> },
      { label: 'Query (collection.operation, filter fields, never values)', grow: true, render: (row) => <Code>{row.key}</Code> },
      { label: 'Runs', align: 'right', render: (row) => num(row.count) },
      { label: 'Slow', align: 'right', render: (row) => <SlowCount value={row.slow} /> },
      { label: 'Failed', align: 'right', render: (row) => <ErrorCount value={row.error} /> },
      { label: 'Average', align: 'right', render: (row) => <Duration value={row.avg} warn={threshold / 2} bad={threshold} /> },
      { label: 'Worst', align: 'right', render: (row) => <Duration value={row.max} warn={threshold / 2} bad={threshold} /> },
      ...(total ? [{ label: 'Total time', align: 'right', render: (row) => <b>{ms(row.sum)}</b> }] : []),
      ...(rows?.[0]?.meta !== undefined ? [{ label: 'Last slow', align: 'right', render: (row) => (row.meta?.lastSlowAt ? relative(row.meta.lastSlowAt) : '—') }] : [])
    ]} />
  );
}

/* ---------- Jobs and outgoing ---------- */

export function TimedTable({ rows, threshold, empty, label, countLabel = 'Runs' }) {
  return (
    <Table rows={rows} empty={empty} columns={[
      { label, grow: true, render: (row) => <Code>{row.key}</Code> },
      { label: countLabel, align: 'right', render: (row) => num(row.count) },
      { label: 'Slow', align: 'right', render: (row) => <SlowCount value={row.slow} /> },
      { label: 'Failed', align: 'right', render: (row) => <ErrorCount value={row.error} /> },
      { label: 'Failure rate', align: 'right', render: (row) => (row.error ? <span style={{ color: '#F87171' }}>{pct(rate(row.error, row.count))}</span> : <Muted>0%</Muted>) },
      { label: 'Average', align: 'right', render: (row) => <Duration value={row.avg} warn={threshold / 2} bad={threshold} /> },
      { label: 'Worst', align: 'right', render: (row) => <Duration value={row.max} warn={threshold / 2} bad={threshold} /> }
    ]} />
  );
}

export function QueueTable({ queues }) {
  return (
    <Table rows={queues} keyOf={(row) => row.name} empty="No queues found." columns={[
      { label: 'Queue', grow: true, render: (row) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><b>{row.name}</b>{row.unavailable ? <Pill tone="red" label="Unavailable" /> : (row.waiting || 0) > 100 ? <Pill tone="orange" label="Backed up" /> : row.failed ? <Pill tone="red" label="Has failures" /> : <Pill tone="green" label="Healthy" />}</span> },
      { label: 'Waiting', align: 'right', render: (row) => (row.unavailable ? <Muted>—</Muted> : <span style={{ color: row.waiting > 100 ? '#FBBF24' : T.ink, fontWeight: row.waiting > 100 ? 600 : 400 }}>{num(row.waiting)}</span>) },
      { label: 'Running', align: 'right', render: (row) => num(row.active) },
      { label: 'Delayed / scheduled', align: 'right', render: (row) => num(row.delayed) },
      { label: 'Completed (kept 1h)', align: 'right', render: (row) => num(row.completed) },
      { label: 'Failed (kept 7d)', align: 'right', render: (row) => <ErrorCount value={row.failed} /> }
    ]} />
  );
}

/* ---------- Cache ---------- */

export function CacheTable({ families }) {
  return (
    <Table rows={families} empty="No cache reads recorded." columns={[
      { label: 'Key family', grow: true, render: (row) => <Code>{row.key}:*</Code> },
      { label: 'Reads', align: 'right', render: (row) => num(row.hit + row.miss) },
      { label: 'Hits', align: 'right', render: (row) => num(row.hit) },
      { label: 'Misses', align: 'right', render: (row) => num(row.miss) },
      { label: 'Hit rate', align: 'right', render: (row) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ width: 90 }}><Bar value={row.rate || 0} max={100} height={6} color={severity(100 - (row.rate || 0), 30, 60)} /></span><span style={{ minWidth: 48 }}>{pct(row.rate)}</span></span> }
    ]} />
  );
}

/* ---------- Infrastructure ---------- */

export function RedisCard({ info }) {
  return (
    <Card>
      <CardTitle right={<Health ok={info.ok} />}>Redis</CardTitle>
      {info.ok ? <>
        <Meter label="Memory" value={info.memory.used} max={info.memory.max || info.memory.peak || info.memory.used} text={`${bytes(info.memory.used)}${info.memory.max ? ` / ${bytes(info.memory.max)}` : ` (peak ${bytes(info.memory.peak)})`}`} sub={`RSS ${bytes(info.memory.rss)} · fragmentation ${info.memory.fragmentation} · eviction policy ${info.memory.policy || '—'}${info.memory.max ? '' : ' · no memory limit set'}`} />
        <div style={{ marginTop: 16 }}>
          <Facts>
            <Fact label="Version">{info.version}</Fact>
            <Fact label="Ping">{ms(info.latency)}</Fact>
            <Fact label="Commands / sec">{num(info.opsPerSec)}</Fact>
            <Fact label="Commands (total)">{num(info.commands)}</Fact>
            <Fact label="Clients">{num(info.clients)}{info.blockedClients ? ` (${info.blockedClients} blocked)` : ''}</Fact>
            <Fact label="Keys">{num(info.keys)}</Fact>
            <Fact label="Hit rate (since start)">{pct(info.hitRate)}</Fact>
            <Fact label="Expired / evicted">{num(info.expired)} / {num(info.evicted)}</Fact>
            <Fact label="Uptime">{since(info.uptime)}</Fact>
            <Fact label="Persistence">{info.persistence.aof ? 'AOF' : 'RDB'}{info.persistence.lastSaveOk ? '' : ' (last save failed)'}</Fact>
          </Facts>
        </div>
      </> : <Muted>{info.error}</Muted>}
    </Card>
  );
}

export function MongoCard({ info }) {
  return (
    <Card>
      <CardTitle right={<Health ok={info.ok} />}>MongoDB server</CardTitle>
      {info.ok ? <>
        {info.connections ? <Meter label="Connections" value={info.connections.current} max={info.connections.current + info.connections.available} text={`${num(info.connections.current)} open · ${num(info.connections.active ?? 0)} active`} warn={60} bad={85} /> : null}
        {info.cache ? <div style={{ marginTop: 14 }}><Meter label="WiredTiger cache" value={info.cache.used} max={info.cache.max} text={`${bytes(info.cache.used)} / ${bytes(info.cache.max)}`} warn={80} bad={95} /></div> : null}
        <div style={{ marginTop: 16 }}>
          <Facts>
            <Fact label="Version">{info.version || '—'}</Fact>
            <Fact label="Ping">{ms(info.latency)}</Fact>
            <Fact label="Uptime">{since(info.uptime)}</Fact>
            {info.memory ? <Fact label="Resident memory">{bytes(info.memory.resident)}</Fact> : null}
            {info.database ? <Fact label="Data size">{bytes(info.database.data)}</Fact> : null}
            {info.database ? <Fact label="On disk">{bytes(info.database.storage)}</Fact> : null}
            {info.database ? <Fact label="Indexes">{bytes(info.database.indexes)} ({info.database.indexCount})</Fact> : null}
            {info.database ? <Fact label="Documents">{num(info.database.objects)}</Fact> : null}
            {info.database ? <Fact label="Collections">{num(info.database.collections)}</Fact> : null}
            {info.network ? <Fact label="Network in / out">{bytes(info.network.in)} / {bytes(info.network.out)}</Fact> : null}
          </Facts>
        </div>
        {info.opcounters ? (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 8 }}>Operations since start</div>
            <Facts min={100}>{['query', 'insert', 'update', 'delete', 'getmore', 'command'].map((op) => <Fact key={op} label={op}>{num(info.opcounters[op])}</Fact>)}</Facts>
          </div>
        ) : null}
      </> : <Muted>{info.error}</Muted>}
    </Card>
  );
}

export function CollectionsCard({ info }) {
  const list = info.collections || [];
  const peak = Math.max(1, ...list.map((c) => c.size + c.indexes));
  return (
    <Card>
      <CardTitle right={<span style={{ display: 'inline-flex', gap: 12, fontSize: 12, color: T.muted }}><span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#A78BFA', marginRight: 5 }} />data</span><span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#3B2F66', marginRight: 5 }} />indexes</span></span>}>Storage by collection</CardTitle>
      {list.length ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {list.map((c) => (
            <div key={c.name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}><Code>{c.name}</Code><span style={{ color: T.muted, whiteSpace: 'nowrap' }}>{num(c.count)} docs · {bytes(c.size)} data · {bytes(c.indexes)} in {c.indexCount} indexes</span></div>
              <div style={{ display: 'flex', height: 6, borderRadius: 9999, overflow: 'hidden', background: T.field, marginTop: 4 }}>
                <div style={{ width: `${(c.size / peak) * 100}%`, background: '#A78BFA' }} />
                <div style={{ width: `${(c.indexes / peak) * 100}%`, background: '#3B2F66' }} />
              </div>
            </div>
          ))}
        </div>
      ) : <Muted>Storage statistics are unavailable (the database user may lack the collStats privilege).</Muted>}
    </Card>
  );
}

export function RunningOps({ info }) {
  return (
    <Card>
      <CardTitle right={info.runningCount ? <Pill tone="orange" label={`${info.runningCount} running`} /> : <Pill tone="green" label="None" />}>Operations running ≥ 1 second</CardTitle>
      <Table rows={info.running || []} keyOf={(row) => `${row.ns}-${row.secs}-${row.op}`} empty="Nothing is running long right now." columns={[
        { label: 'Namespace', grow: true, render: (row) => <Code>{row.ns}</Code> },
        { label: 'Operation', render: (row) => row.op },
        { label: 'Running for', align: 'right', render: (row) => <span style={{ color: row.secs >= 10 ? '#F87171' : '#FBBF24', fontWeight: 600 }}>{row.secs}s</span> },
        { label: 'Plan', render: (row) => <Code>{row.plan || '—'}</Code> }
      ]} />
    </Card>
  );
}

/* ---------- Usage ---------- */

export function PeopleList({ rows, metric = 'count', empty }) {
  if (!rows.length) return <Muted>{empty}</Muted>;
  const peak = Math.max(1, ...rows.map((row) => row[metric]));
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {rows.map((row, index) => (
        <a key={row.id} href={showUrl('User', row.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: T.ink }}>
          <Rank index={index} />
          <Avatar name={row.name || row.id} url={row.avatar} size={34} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
              <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name || 'Deleted member'} {row.username ? <Muted style={{ fontWeight: 400 }}>@{row.username}</Muted> : null}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{num(row.count)} requests{row.slow ? <span style={{ color: '#FBBF24' }}> · {num(row.slow)} slow</span> : null} · avg {ms(row.avg)}</span>
            </div>
            <div style={{ marginTop: 5 }}><Bar value={row[metric]} max={peak} height={5} color={metric === 'slow' ? '#FBBF24' : T.brand} /></div>
          </div>
        </a>
      ))}
    </div>
  );
}
