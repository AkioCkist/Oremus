import React from 'react';
import { ViewHelpers } from 'adminjs';

/*
 * Small design kit for the admin panel, built on the site's tokens (src/views-or-client/styles.css, light theme)
 * so records look like they do on Oremus. Plain inline styles: AdminJS bundles each component on its own.
 */

export const h = new ViewHelpers();

export const T = {
  ink: '#000000', ink2: '#3C3C43', muted: '#8A8A8E', line: '#E5E5EA', field: '#EFEFF0', grouped: '#F2F2F7', hover: '#F7F7FA',
  brand: '#0088FF', brandSoft: '#E5F3FF', brandInk: '#0059AB',
  card: '0 0 0 1px rgba(0,0,0,0.07), 0 2px 12px rgba(0,0,0,0.03)'
};

/* ---------- Value tones and wording ---------- */

const TONE = {
  green: { color: '#1E7A35', bg: '#E3F7E8' },
  orange: { color: '#B25600', bg: '#FFF1E0' },
  red: { color: '#D70015', bg: '#FFE5E6' },
  blue: { color: '#0059AB', bg: '#E5F3FF' },
  purple: { color: '#8E24AA', bg: '#F6E6FB' },
  yellow: { color: '#8A6100', bg: '#FFF8D6' },
  grey: { color: '#3C3C43', bg: '#EFEFF0' }
};

const VALUE_TONE = {
  active: 'green', approved: 'green', paid: 'green', ready: 'green', accepted: 'green', granted: 'green', actioned: 'green', upheld: 'red', running: 'green', visible: 'grey', ended: 'grey', topup: 'green', refund: 'blue', allow: 'green', none: 'grey',
  pending: 'orange', pending_review: 'orange', open: 'orange', held: 'orange', processing: 'orange', ringing: 'orange', limited: 'yellow', suspended: 'orange', exhausted: 'yellow', review: 'orange', paused: 'grey',
  removed: 'red', rejected: 'red', banned: 'red', failed: 'red', declined: 'red', denied: 'red', missed: 'red', block: 'red', spend: 'grey', dismissed: 'grey',
  admin: 'purple', moderator: 'blue', user: 'grey', ai: 'purple', rule: 'blue', report: 'orange', system: 'grey', adjustment: 'purple',
  public: 'blue', followers: 'grey', private: 'grey', friends: 'grey', only_me: 'grey', hidden: 'grey', audio: 'blue', video: 'purple',
  harassment: 'red', hate: 'red', sexual: 'red', violence: 'red', self_harm: 'red', spam: 'orange', scam: 'orange', other: 'grey'
};

const VALUE_LABEL = {
  pending_review: 'In review', active: 'Active', exhausted: 'Wallet empty', rejected: 'Rejected', only_me: 'Only me', self_harm: 'Self-harm',
  ai: 'AI', topup: 'Top-up', upheld: 'Removed', dismissed: 'Kept', actioned: 'Actioned', none: 'None', buy_sell: 'Buy & sell'
};

export const toneOf = (value) => TONE[VALUE_TONE[String(value)] || 'grey'];
export const labelOf = (value) => {
  const key = String(value ?? '');
  if (VALUE_LABEL[key]) return VALUE_LABEL[key];
  const text = key.replace(/[_-]+/g, ' ').trim();
  return text ? text[0].toUpperCase() + text.slice(1) : '';
};

/* ---------- Formatting ---------- */

export const num = (value) => (value === undefined || value === null || value === '' ? '—' : Number(value).toLocaleString('vi-VN'));
export const vnd = (value) => `${Number(value || 0).toLocaleString('vi-VN')} ₫`;
export const signedVnd = (value) => `${Number(value) > 0 ? '+' : ''}${vnd(value)}`;
export const isEmpty = (value) => value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length);

export function relative(value) {
  if (!value) return '';
  const diff = new Date(value).getTime() - Date.now();
  const abs = Math.abs(diff);
  const units = [['year', 31536e6], ['month', 2592e6], ['week', 6048e5], ['day', 864e5], ['hour', 36e5], ['minute', 6e4]];
  const fmt = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, ms] of units) if (abs >= ms) return fmt.format(Math.round(diff / ms), unit);
  return diff > 0 ? 'in a moment' : 'just now';
}
export const absolute = (value) => (value ? new Date(value).toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }) : '');

export function duration(ms) {
  if (!(ms > 0)) return '—';
  const s = Math.round(ms / 1000);
  const hh = Math.floor(s / 3600); const mm = Math.floor((s % 3600) / 60); const ss = s % 60;
  return hh ? `${hh}h ${mm}m` : mm ? `${mm}m ${ss}s` : `${ss}s`;
}

/* ---------- Flattened AdminJS params ---------- */

/** "topics.0", "topics.1" → ['a', 'b'] */
export const arrayParam = (params, name) => Object.keys(params || {})
  .filter((key) => key.startsWith(`${name}.`) && /^\d+$/.test(key.slice(name.length + 1)))
  .sort((a, b) => Number(a.slice(name.length + 1)) - Number(b.slice(name.length + 1)))
  .map((key) => params[key]);

/** "media.0.url", "media.1.url" → [{ url }, { url }] */
export function objectArrayParam(params, name) {
  const items = [];
  const pattern = new RegExp(`^${name.replace(/\./g, '\\.')}\\.(\\d+)\\.(.+)$`);
  for (const [key, value] of Object.entries(params || {})) {
    const match = pattern.exec(key);
    if (!match) continue;
    const index = Number(match[1]);
    items[index] = items[index] || {};
    items[index][match[2]] = value;
  }
  return items.filter(Boolean);
}

/** "scores.hate", "scores.spam" → { hate, spam } (one level). */
export function objectParam(params, name) {
  const out = {};
  for (const [key, value] of Object.entries(params || {})) if (key.startsWith(`${name}.`)) out[key.slice(name.length + 1)] = value;
  return out;
}

export const showUrl = (resourceId, id) => (resourceId && id ? h.showUrl(resourceId, String(id)) : null);
export const listUrl = (resourceId, filters = {}) => {
  const query = Object.entries(filters).map(([key, value]) => `filters.${key}=${encodeURIComponent(value)}`).join('&');
  return `${h.resourceUrl({ resourceId })}${query ? `?${query}` : ''}`;
};

export const isVideo = (url = '', mime = '') => /^video\//.test(mime) || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
export const isImage = (url = '', mime = '') => /^image\//.test(mime) || /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url);

/* ---------- Building blocks ---------- */

export function Card({ children, style, pad = 20, ...rest }) {
  return <section style={{ background: '#FFFFFF', borderRadius: 24, boxShadow: T.card, padding: pad, minWidth: 0, ...style }} {...rest}>{children}</section>;
}

export function CardTitle({ children, right, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, ...style }}>
      <h3 style={{ margin: 0, fontSize: 17, lineHeight: '22px', fontWeight: 600, letterSpacing: '-0.43px', color: T.ink }}>{children}</h3>
      {right || null}
    </div>
  );
}

export function Pill({ value, label, tone, size = 'sm', dot = true }) {
  if (isEmpty(value) && !label) return null;
  const colors = tone ? TONE[tone] || TONE.grey : toneOf(value);
  const big = size === 'md';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 9999, padding: big ? '5px 12px' : '3px 10px', fontSize: big ? 13 : 12, fontWeight: 600, lineHeight: '16px', color: colors.color, background: colors.bg, whiteSpace: 'nowrap' }}>
      {dot ? <span style={{ width: 6, height: 6, borderRadius: 9999, background: colors.color }} /> : null}
      {label || labelOf(value)}
    </span>
  );
}

export function Chip({ children }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 9999, background: T.field, padding: '4px 10px', fontSize: 13, lineHeight: '16px', color: T.ink, whiteSpace: 'nowrap' }}>{children}</span>;
}

export function Chips({ items, empty = 'None' }) {
  if (!items?.length) return <Muted>{empty}</Muted>;
  return <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{items.map((item, index) => <Chip key={`${item}-${index}`}>{labelOf(item)}</Chip>)}</span>;
}

export const Muted = ({ children, style }) => <span style={{ color: T.muted, ...style }}>{children}</span>;

const AVATAR_TONES = [['#FFE0CC', '#B24A00'], ['#D9F2E3', '#1E7A35'], ['#E5F3FF', '#0059AB'], ['#F6E6FB', '#8E24AA'], ['#FFE5EC', '#C2185B'], ['#FFF5CC', '#8A6100'], ['#DDF6F8', '#00727A'], ['#E8E6FD', '#4A3FD1']];
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
const hash = (text) => [...String(text || '')].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);

export function Avatar({ name, url, size = 32, square = false }) {
  const [bg, fg] = AVATAR_TONES[hash(name) % AVATAR_TONES.length];
  const style = { width: size, height: size, borderRadius: square ? size * 0.28 : 9999, flexShrink: 0, display: 'grid', placeItems: 'center', overflow: 'hidden', background: url ? T.field : bg, color: fg, fontSize: Math.max(10, size * 0.38), fontWeight: 600 };
  return <span style={style} aria-hidden="true">{url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(name)}</span>;
}

/** A populated User reference (AdminJS RecordJSON) as avatar + name, linking to the member in the panel. */
export function Person({ record, id, size = 32, sub = true, link = true }) {
  const p = record?.params;
  if (!p) return id ? <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: T.muted }}>{String(id)}</span> : <Muted>—</Muted>;
  const name = p.displayName || record.title || p.email;
  const body = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0, maxWidth: '100%' }}>
      <Avatar name={name} url={p['profile.avatarUrl']} size={size} />
      <span style={{ minWidth: 0, lineHeight: 1.25 }}>
        <span style={{ display: 'block', fontSize: size > 36 ? 15 : 14, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        {sub && (p.username || p.email) ? <span style={{ display: 'block', fontSize: 12, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.username ? `@${p.username}` : p.email}</span> : null}
      </span>
    </span>
  );
  return link ? <a href={showUrl('User', record.id)} style={{ textDecoration: 'none', minWidth: 0, maxWidth: '100%' }}>{body}</a> : body;
}

export function When({ value, empty = '—' }) {
  if (!value) return <Muted>{empty}</Muted>;
  return <span title={absolute(value)}>{absolute(value)} <Muted>· {relative(value)}</Muted></span>;
}

export function Stat({ label, value, hint, tone, style }) {
  const colors = tone ? TONE[tone] : null;
  return (
    <div style={{ flex: '1 1 140px', minWidth: 0, borderRadius: 18, background: colors ? colors.bg : T.grouped, padding: '12px 14px', ...style }}>
      <div style={{ fontSize: 13, lineHeight: '18px', color: colors ? colors.color : T.muted }}>{label}</div>
      <div style={{ marginTop: 2, fontSize: 22, lineHeight: '28px', fontWeight: 650, letterSpacing: '-0.26px', color: colors ? colors.color : T.ink, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      {hint ? <div style={{ fontSize: 12, lineHeight: '16px', marginTop: 2, color: T.muted }}>{hint}</div> : null}
    </div>
  );
}

export const Stats = ({ children }) => <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>{children}</div>;

export function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', padding: '11px 0', borderTop: `1px solid ${T.line}` }}>
      <div style={{ fontSize: 13, lineHeight: '20px', color: T.muted, width: 150, flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: 15, lineHeight: '20px', color: T.ink, minWidth: 0, flex: '1 1 240px', wordBreak: 'break-word' }}>{children}</div>
    </div>
  );
}

export function Notice({ tone = 'red', title, children }) {
  const colors = TONE[tone];
  return (
    <div role={tone === 'red' ? 'alert' : 'status'} style={{ borderRadius: 18, background: colors.bg, color: colors.color, padding: '12px 16px' }}>
      {title ? <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div> : null}
      <div style={{ marginTop: title ? 4 : 0, fontSize: 15, lineHeight: '20px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{children}</div>
    </div>
  );
}

export function Quote({ children }) {
  return <blockquote style={{ margin: 0, borderRadius: 16, background: T.grouped, padding: '12px 16px', fontSize: 15, lineHeight: '21px', color: T.ink, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{children}</blockquote>;
}

export function Bar({ value, max = 1, color = T.brand, height = 8, label }) {
  const pct = Math.max(0, Math.min(100, max ? (Number(value || 0) / max) * 100 : 0));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} style={{ height, borderRadius: 9999, background: T.field, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 9999, background: color }} />
    </div>
  );
}

/** Model scores in 0..1, worst first, coloured by severity. */
export function Scores({ scores, empty = 'No scores' }) {
  const entries = Object.entries(scores || {}).map(([key, value]) => [key, Number(value)]).filter(([, value]) => Number.isFinite(value)).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return <Muted>{empty}</Muted>;
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {entries.map(([key, value]) => {
        const color = value >= 0.8 ? '#FF383C' : value >= 0.5 ? '#FF8D28' : value >= 0.2 ? '#FFCC00' : '#34C759';
        return (
          <div key={key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}><span style={{ color: T.ink }}>{labelOf(key)}</span><span style={{ color: T.muted, fontVariantNumeric: 'tabular-nums' }}>{Math.round(value * 100)}%</span></div>
            <Bar value={value} color={color} label={labelOf(key)} />
          </div>
        );
      })}
    </div>
  );
}

/** Images and videos in a tidy grid. Each item: { url, mimeType?, poster?, alt?, status? }. */
export function MediaGrid({ items, height = 220 }) {
  const list = (items || []).filter((item) => item?.url);
  if (!list.length) return null;
  const columns = list.length === 1 ? 1 : 2;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 4, borderRadius: 16, overflow: 'hidden' }}>
      {list.map((item, index) => (
        <div key={`${item.url}-${index}`} style={{ position: 'relative', background: T.field, minHeight: 80 }}>
          {isVideo(item.url, item.mimeType)
            ? <video src={item.url} poster={item.poster || undefined} controls preload="metadata" style={{ display: 'block', width: '100%', maxHeight: list.length === 1 ? 520 : height, objectFit: 'cover', background: '#000' }} />
            : isImage(item.url, item.mimeType) || !item.mimeType
              ? <a href={item.url} target="_blank" rel="noreferrer"><img src={item.url} alt={item.alt || ''} loading="lazy" style={{ display: 'block', width: '100%', height: list.length === 1 ? 'auto' : height, maxHeight: 520, objectFit: 'cover' }} /></a>
              : <a className="oa-link" href={item.url} target="_blank" rel="noreferrer" style={{ display: 'block', padding: 16 }}>Open file</a>}
          {item.status && item.status !== 'ready' ? <span style={{ position: 'absolute', left: 8, top: 8 }}><Pill value={item.status} /></span> : null}
        </div>
      ))}
    </div>
  );
}

export function Thumb({ url, mime, size = 44, label = 'No media' }) {
  const box = { width: size, height: size, borderRadius: 10, background: T.field, display: 'block', objectFit: 'cover', flexShrink: 0 };
  if (!url) return <span style={{ ...box, display: 'grid', placeItems: 'center', color: T.muted, fontSize: 9, textAlign: 'center', lineHeight: '11px' }}>{label}</span>;
  if (isVideo(url, mime)) return <span style={{ ...box, display: 'grid', placeItems: 'center', background: '#1C1C1E', color: '#fff', fontSize: 16 }} aria-label="Video">▶</span>;
  return <img src={url} alt="" loading="lazy" style={box} />;
}

export function ExternalLink({ href, children }) {
  if (!href) return null;
  return <a className="oa-link" href={href} target="_blank" rel="noreferrer">{children} ↗</a>;
}

export function RecordLink({ resourceId, id, children }) {
  const url = showUrl(resourceId, id);
  if (!url) return <Muted>—</Muted>;
  return <a className="oa-link" href={url}>{children || `${labelOf(resourceId)} ${String(id).slice(-6)}`}</a>;
}

export function Mono({ children }) {
  return <code style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, background: T.field, borderRadius: 8, padding: '2px 6px', wordBreak: 'break-all' }}>{children}</code>;
}

/** Header strip used at the top of every record page. */
export function Header({ leading, title, subtitle, pills, actions }) {
  return (
    <Card style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
      {leading || null}
      <div style={{ minWidth: 0, flex: '1 1 260px' }}>
        <h2 style={{ margin: 0, fontSize: 22, lineHeight: '28px', fontWeight: 700, letterSpacing: '-0.26px', color: T.ink, wordBreak: 'break-word' }}>{title}</h2>
        {subtitle ? <div style={{ marginTop: 3, fontSize: 13, lineHeight: '18px', color: T.muted }}>{subtitle}</div> : null}
      </div>
      {pills ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>{pills}</div> : null}
      {actions ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', width: '100%' }}>{actions}</div> : null}
    </Card>
  );
}

export const Columns = ({ children, side }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
    <div style={{ flex: '1 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 680 }}>{children}</div>
    {side ? <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>{side}</div> : null}
  </div>
);

export const Page = ({ children }) => <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>;
