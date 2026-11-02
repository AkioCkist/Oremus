import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClient } from 'adminjs';
import { Link } from 'react-router-dom';
import { Bar, Card, CardTitle, Muted, Pill, T, h, num, relative } from './ui.jsx';

/*
 * Shared pieces of the monitoring pages (src/monitoring feeds them through AdminJS page handlers):
 * the page shell with tabs, period picker and live refresh, plus charts, tables and meters.
 */

const api = new ApiClient();
const REFRESH_MS = 10_000;
const snapshots = new Map();
const PERIOD_KEY = 'oremus.monitoring.period';

export const TABS = [
  ['monitoring', 'Overview'], ['servers', 'Servers'], ['requests', 'Requests'], ['exceptions', 'Exceptions'], ['database', 'Database'],
  ['cache', 'Cache'], ['queues', 'Queues & jobs'], ['outgoing', 'Outgoing HTTP'], ['usage', 'Usage']
];
const PERIODS = [['1h', '1h'], ['6h', '6h'], ['24h', '24h'], ['7d', '7d']];
export const PERIOD_MINUTES = { '1h': 60, '6h': 360, '24h': 1440, '7d': 10080 };

/* ---------- Formatting ---------- */

export const bytes = (value) => {
  const n = Number(value || 0);
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
};
export const ms = (value) => {
  const n = Number(value || 0);
  if (n >= 60_000) return `${(n / 60_000).toFixed(1)} min`;
  if (n >= 1000) return `${(n / 1000).toFixed(2)} s`;
  return `${Math.round(n)} ms`;
};
export const since = (seconds) => {
  const s = Number(seconds || 0);
  if (s >= 86_400) return `${Math.floor(s / 86_400)}d ${Math.floor((s % 86_400) / 3600)}h`;
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  if (s >= 60) return `${Math.floor(s / 60)}m`;
  return `${s}s`;
};
export const pct = (value) => (value === null || value === undefined || Number.isNaN(value) ? '—' : `${Number(value).toFixed(1)}%`);
export const rate = (part, whole) => (whole ? (part / whole) * 100 : 0);
export const severity = (value, warn, bad) => (value >= bad ? '#F87171' : value >= warn ? '#FBBF24' : '#4ADE80');
const clock = (t, granularity) => new Date(t).toLocaleString('vi-VN', granularity === 'h' ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit' });

/* ---------- Charts ---------- */

/** Bars per time bucket; `danger` stacks a red part on top (errors, failures, misses). */
export function BarChart({ series, value, danger, height = 120, color = T.brand, granularity, label, dangerLabel = 'failed', format = num }) {
  const points = series || [];
  const peak = Math.max(1, ...points.map((point) => value(point)));
  const width = 1000; const gap = 3; const barWidth = points.length ? Math.max(1, width / points.length - gap) : 0;
  const [hover, setHover] = useState(null);
  const active = hover !== null ? points[hover] : null;
  return (
    <div>
      <div style={{ position: 'relative', display: 'flex', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: 10, color: T.muted, textAlign: 'right', minWidth: 28, height }}>
          <span>{format(peak)}</span><span>{format(Math.round(peak / 2))}</span><span>0</span>
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label} style={{ display: 'block', flex: 1, height }} onMouseLeave={() => setHover(null)}>
          {[0.5].map((line) => <line key={line} x1="0" x2={width} y1={height * line} y2={height * line} stroke={T.line} strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />)}
          {points.map((point, index) => {
            const total = value(point); const bad = danger ? Math.min(total, danger(point)) : 0;
            const barHeight = (total / peak) * (height - 4); const badHeight = (bad / peak) * (height - 4);
            const x = index * (barWidth + gap);
            return (
              <g key={point.t} onMouseEnter={() => setHover(index)}>
                <rect x={x} y={0} width={barWidth + gap} height={height} fill={hover === index ? 'rgba(167,139,250,0.08)' : 'transparent'} />
                <rect x={x} y={height - barHeight} width={barWidth} height={Math.max(total ? 2 : 0, barHeight - badHeight)} rx={2} fill={color} opacity={total ? (hover === null || hover === index ? 1 : 0.55) : 0} />
                {bad ? <rect x={x} y={height - badHeight} width={barWidth} height={badHeight} rx={2} fill="#F87171" /> : null}
              </g>
            );
          })}
          <line x1="0" x2={width} y1={height - 0.5} y2={height - 0.5} stroke={T.line} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingLeft: 36, fontSize: 11, color: T.muted }}>
        <span>{points[0] ? clock(points[0].t, granularity) : ''}</span>
        {active ? <span style={{ color: T.ink, fontWeight: 600 }}>{clock(active.t, granularity)} · {format(value(active))}{danger && danger(active) ? ` · ${num(danger(active))} ${dangerLabel}` : ''}</span> : <span>Hover a bar for details</span>}
        <span>now</span>
      </div>
    </div>
  );
}

export function Sparkline({ values, max, color = T.brand, height = 28 }) {
  const list = (values || []).filter((v) => Number.isFinite(v));
  if (list.length < 2) return <div style={{ height, display: 'grid', placeItems: 'center', fontSize: 11, color: T.muted }}>collecting…</div>;
  const top = Math.max(max || 0, ...list, 1);
  const width = 300;
  const step = width / (list.length - 1);
  const line = list.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - (v / top) * (height - 4)).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block', width: '100%', height }} aria-hidden="true">
      <polygon points={`0,${height} ${line} ${width},${height}`} fill={color} opacity="0.12" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ---------- Building blocks ---------- */

/** Full-width table. The first column (`grow`) takes the spare room so long routes and queries wrap cleanly. */
export function Table({ columns, rows, empty = 'Nothing recorded in this period.', keyOf = (row) => row.key }) {
  if (!rows?.length) return <div style={{ padding: '22px 0', textAlign: 'center' }}><Muted>{empty}</Muted></div>;
  return (
    <div style={{ overflowX: 'auto', margin: '0 -20px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, boxShadow: 'none', borderRadius: 0, background: 'transparent' }}>
        <thead>
          <tr>{columns.map((column) => <th key={column.label} style={{ textAlign: column.align || 'left', padding: '8px 20px', fontSize: 11, fontWeight: 600, color: T.muted, background: 'transparent', borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap', width: column.grow ? '100%' : undefined }}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={keyOf(row) ?? index}>
              {columns.map((column) => <td key={column.label} style={{ textAlign: column.align || 'left', padding: '10px 20px', borderBottom: `1px solid ${T.line}`, verticalAlign: 'top', fontVariantNumeric: 'tabular-nums', whiteSpace: column.grow ? 'normal' : 'nowrap', minWidth: column.grow ? 280 : undefined }}>{column.render(row, index)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const Code = ({ children }) => <code style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: T.ink, overflowWrap: 'anywhere' }}>{children}</code>;
export const SlowCount = ({ value }) => (value ? <span style={{ color: '#FBBF24', fontWeight: 600 }}>{num(value)}</span> : <Muted>0</Muted>);
export const ErrorCount = ({ value }) => (value ? <span style={{ color: '#F87171', fontWeight: 600 }}>{num(value)}</span> : <Muted>0</Muted>);
export const Duration = ({ value, warn, bad }) => <span style={{ color: value >= bad ? '#F87171' : value >= warn ? '#FBBF24' : T.ink, fontWeight: value >= warn ? 600 : 400 }}>{ms(value)}</span>;
export const Rank = ({ index }) => <span style={{ color: T.muted, fontSize: 11 }}>{index + 1}</span>;

export function Meter({ label, value, max, text, warn = 70, bad = 90, series, seriesMax, sub, sparkHeight = 32 }) {
  const percent = max ? (value / max) * 100 : 0;
  const color = severity(percent, warn, bad);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: T.muted }}>{label}</span>
        <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{text}</span>
      </div>
      <Bar value={percent} max={100} height={6} color={color} label={label} />
      {series ? <div style={{ marginTop: 6 }}><Sparkline values={series} max={seriesMax} color={color} height={sparkHeight} /></div> : null}
      {sub ? <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>{sub}</div> : null}
    </div>
  );
}

export function Fact({ label, children }) {
  return <div style={{ minWidth: 0 }}><div style={{ fontSize: 11, color: T.muted }}>{label}</div><div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{children}</div></div>;
}
export const Facts = ({ children, min = 130 }) => <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 14 }}>{children}</div>;

/** Big KPI tile; with `to` it opens that monitoring page. */
export function Kpi({ label, value, hint, tone, to }) {
  const tones = { green: ['#0F2A1A', '#4ADE80'], orange: ['#2A2010', '#FBBF24'], red: ['#2A1416', '#F87171'] };
  const [bg, fg] = tones[tone] || ['#14161D', T.ink];
  const body = (
    <>
      <div style={{ fontSize: 13, color: tone ? fg : T.muted }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 26, lineHeight: '30px', fontWeight: 700, letterSpacing: '-0.4px', color: fg, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      {hint ? <div style={{ marginTop: 2, fontSize: 13, color: tone ? fg : T.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hint}</div> : null}
    </>
  );
  const style = { display: 'block', minWidth: 0, borderRadius: 16, padding: '16px', background: bg, boxShadow: tone ? '0 0 0 1px ' + fg + '33' : T.card, textDecoration: 'none', color: 'inherit' };
  return to ? <PageLink to={to} className="oa-card-link" style={style}>{body}</PageLink> : <div style={style}>{body}</div>;
}
export const Kpis = ({ children, min = 180 }) => <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 12 }}>{children}</div>;

/** Two columns on wide screens, one on narrow ones. */
export const Columns = ({ children, min = 520 }) => <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`, gap: 16, alignItems: 'start' }}>{children}</div>;

export function Health({ ok, label }) { return <Pill tone={ok ? 'green' : 'red'} label={label || (ok ? 'Healthy' : 'Down')} />; }

export function Toggle({ value, onChange, options, label }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'inline-flex', padding: 3, borderRadius: 12, background: T.surface, boxShadow: T.card }}>
      {options.map(([key, text]) => (
        <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)} style={{ border: 0, cursor: 'pointer', borderRadius: 9, padding: '5px 12px', fontSize: 13, fontWeight: 600, background: value === key ? '#2A2440' : 'transparent', color: value === key ? T.ink : T.muted, minHeight: 32, minWidth: 44 }}>{text}</button>
      ))}
    </div>
  );
}

/** Link to another monitoring page; keeps the chosen period. */
export function PageLink({ to, children, ...rest }) {
  return <Link to={h.pageUrl(to)} {...rest}>{children}</Link>;
}

export const SectionTitle = ({ children, right }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '4px 4px -4px' }}>
    <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, letterSpacing: '0.2px', textTransform: 'uppercase', color: T.muted }}>{children}</h2>
    {right || null}
  </div>
);

/* ---------- Page shell ---------- */

const storedPeriod = () => { try { return localStorage.getItem(PERIOD_KEY) || '1h'; } catch { return '1h'; } };

/**
 * Loads the snapshot for `page` (an AdminJS page name), refreshes it every 10 seconds while the tab is visible,
 * and renders the tab bar, period picker and `children(data)`.
 */
export function MonitoringPage({ page, title, subtitle, children }) {
  const [period, setPeriodState] = useState(storedPeriod);
  // The last snapshot of each page and period: switching tabs or periods shows it at once while a fresh one loads.
  const [data, setData] = useState(() => snapshots.get(`${page}:${storedPeriod()}`) || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [live, setLive] = useState(true);
  const [, tick] = useState(0);
  const timer = useRef();

  const setPeriod = (value) => { setPeriodState(value); setData((current) => snapshots.get(`${page}:${value}`) || current); setLoading(true); try { localStorage.setItem(PERIOD_KEY, value); } catch { /* private mode */ } };

  const load = useCallback(async () => {
    try {
      const response = await api.getPage({ pageName: page, params: { period } });
      if (response.data?.error) { setError(response.data.error); return; }
      snapshots.set(`${page}:${period}`, response.data);
      setData(response.data); setError('');
    } catch {
      setError('Could not load monitoring data.');
    } finally {
      setLoading(false);
    }
  }, [page, period]);

  useEffect(() => {
    let cancelled = false;
    const loop = async () => {
      if (typeof document === 'undefined' || !document.hidden) await load();
      if (!cancelled && live) timer.current = setTimeout(loop, REFRESH_MS);
    };
    loop();
    return () => { cancelled = true; clearTimeout(timer.current); };
  }, [load, live]);

  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id); }, []);

  return (
    <div className="oa-page" style={{ padding: '24px 24px 48px', maxWidth: 1480, width: '100%', minWidth: 0, boxSizing: 'border-box', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 28, lineHeight: '34px', fontWeight: 700, letterSpacing: '-0.2px' }}>{title}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: T.muted }}>
            {subtitle ? <>{subtitle} · </> : null}
            {data ? <>Updated {relative(data.generatedAt)}{live ? ', refreshes every 10 s' : ', paused'}</> : 'Loading…'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Toggle value={period} onChange={setPeriod} options={PERIODS} label="Period" />
          <button type="button" onClick={() => setLive((on) => !on)} aria-pressed={live} style={{ border: '1px solid ' + T.line, cursor: 'pointer', borderRadius: 10, minHeight: 40, padding: '0 14px', fontSize: 14, fontWeight: 500, background: T.surface, color: T.ink, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: live ? '#4ADE80' : T.muted }} />{live ? 'Live · Pause' : 'Paused · Resume'}
          </button>
        </div>
      </div>

      <nav aria-label="Monitoring sections" style={{ display: 'flex', gap: 20, overflowX: 'auto', borderBottom: '1px solid ' + T.line }}>
        {TABS.map(([name, label]) => (
          <Link key={name} to={h.pageUrl(name)} aria-current={name === page ? 'page' : undefined} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', minHeight: 44, fontSize: 14, fontWeight: name === page ? 600 : 500, textDecoration: 'none', borderBottom: '2px solid ' + (name === page ? T.brand : 'transparent'), color: name === page ? T.ink : T.muted }}>{label}</Link>
        ))}
      </nav>

      {error ? <Card><span role="alert" style={{ color: '#F87171' }}>{error}</span></Card> : null}
      {data ? <div aria-busy={loading} style={{ display: 'flex', flexDirection: 'column', gap: 18, opacity: loading ? 0.6 : 1, transition: 'opacity .2s ease' }}>{children(data)}</div> : (!error ? <Card><Muted>Collecting readings…</Muted></Card> : null)}
    </div>
  );
}

export { Card, CardTitle, Muted, Pill, T, num, relative, Bar };
