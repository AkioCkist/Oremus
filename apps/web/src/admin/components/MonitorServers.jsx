import React from 'react';
import { Card, MonitoringPage, Muted, Pill, Table, T, bytes, ms, num, pct, relative, since } from './monitoring-ui.jsx';
import { roleLabel, ServerCard, serverMemory } from './monitoring-cards.jsx';

/** Every web, jobs and media process (one per container in Docker): CPU, memory, event loop, disk, live sockets. */
function Servers({ data }) {
  const servers = data.servers;
  if (!servers.length) return <Card><Muted>No process has reported yet. Web, jobs and media each send a heartbeat every 15 seconds once they start.</Muted></Card>;
  return <>
    <Card>
      <Table rows={servers} keyOf={(row) => row.id} columns={[
        { label: 'Process', grow: true, render: (row) => <span><b>{roleLabel(row.role)}</b> <Muted>· {row.container ? 'container' : 'host'} {row.host} · pid {row.pid}</Muted></span> },
        { label: 'Status', render: (row) => (row.online ? <Pill tone="green" label="Online" /> : <Pill tone="red" label={`Silent ${relative(row.at)}`} />) },
        { label: 'CPU', align: 'right', render: (row) => <span style={{ color: row.cpu.process >= 80 ? '#F87171' : T.ink }}>{pct(row.cpu.process)}</span> },
        { label: 'Memory', align: 'right', render: (row) => { const m = serverMemory(row); return <span style={{ color: m.percent >= 85 ? '#F87171' : T.ink }}>{bytes(m.used)} <Muted>({pct(m.percent)})</Muted></span>; } },
        { label: 'Loop p99', align: 'right', render: (row) => ms(row.eventLoop.p99) },
        { label: 'Sockets', align: 'right', render: (row) => (row.sockets === undefined ? <Muted>—</Muted> : num(row.sockets)) },
        { label: 'Uptime', align: 'right', render: (row) => since(row.uptime) }
      ]} />
    </Card>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 440px), 1fr))', gap: 16, alignItems: 'start' }}>
      {servers.map((server) => <ServerCard key={server.id} server={server} large />)}
    </div>
    <p style={{ margin: 0, fontSize: 12, color: T.muted }}>Charts cover the last hour (one sample every 15 seconds). A process that stays silent for a minute is marked offline and forgotten after six hours.</p>
  </>;
}

export default function MonitorServers() {
  return <MonitoringPage page="servers" title="Servers" subtitle="Processes and containers">{(data) => <Servers data={data} />}</MonitoringPage>;
}
