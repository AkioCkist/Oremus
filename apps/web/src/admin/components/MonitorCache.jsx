import React from 'react';
import { BarChart, Card, CardTitle, Kpi, Kpis, MonitoringPage, bytes, num, pct } from './monitoring-ui.jsx';
import { CacheTable, RedisCard } from './monitoring-cards.jsx';

/** Application cache reads by key family, and the Redis server behind them. */
function Cache({ data }) {
  const c = data.cache; const r = data.redis;
  const tone = (value) => (value === null || value === undefined ? undefined : value >= 80 ? 'green' : value >= 50 ? 'orange' : 'red');
  return <>
    <Kpis>
      <Kpi label="App cache hit rate" value={c.total.rate === null ? '—' : pct(c.total.rate)} hint={c.total.rate === null ? `No feed, profile, group or place page was opened in the last ${data.period}` : `${num(c.total.hit)} of ${num(c.total.hit + c.total.miss)} reads served from cache`} tone={tone(c.total.rate)} />
      <Kpi label="Cache reads" value={num(c.total.hit + c.total.miss)} />
      <Kpi label="Hits" value={num(c.total.hit)} />
      <Kpi label="Misses" value={num(c.total.miss)} />
      <Kpi label="Redis key lookups found (since start)" value={pct(r.hitRate)} hint="All Redis reads, including queues, sessions and rate limits, so a low value is normal" />
      <Kpi label="Redis memory" value={r.ok ? bytes(r.memory.used) : 'Down'} hint={r.ok ? `${num(r.keys)} keys` : r.error} tone={r.ok ? undefined : 'red'} />
    </Kpis>
    <Card>
      <CardTitle>Cache reads over time</CardTitle>
      <BarChart series={c.series} value={(p) => p.hit + p.miss} danger={(p) => p.miss} dangerLabel="misses" color="#34C759" height={150} granularity={data.granularity} label="Cache reads over time, misses in red" />
    </Card>
    <Card>
      <CardTitle>By key family ({num(c.families.length)})</CardTitle>
      <CacheTable families={c.families} />
    </Card>
    <RedisCard info={r} />
  </>;
}

export default function MonitorCache() {
  return <MonitoringPage page="cache" title="Cache" subtitle="Cache hit rates and Redis">{(data) => <Cache data={data} />}</MonitoringPage>;
}
