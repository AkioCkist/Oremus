// Shared by the campaign show page and the list cells. Colours are the site's iOS accents (styles.css :root).

export const STATUS = {
  draft: { label: 'Draft', color: '#A3A9B6', bg: '#0B0C10' },
  pending_review: { label: 'In review', color: '#FBBF24', bg: '#2A2010' },
  active: { label: 'Running', color: '#4ADE80', bg: '#0F2A1A' },
  paused: { label: 'Paused', color: '#C9CDD6', bg: '#1A1D26' },
  rejected: { label: 'Not approved', color: '#F87171', bg: '#2A1416' },
  exhausted: { label: 'Wallet empty', color: '#FBBF24', bg: '#2A2410' },
  ended: { label: 'Ended', color: '#A3A9B6', bg: '#0B0C10' }
};

export const vnd = (value) => `${Number(value || 0).toLocaleString('vi-VN')} ₫`;
export const count = (value) => Number(value || 0).toLocaleString('vi-VN');

export const pillStyle = (status) => {
  const tone = STATUS[status] || STATUS.draft;
  return { display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 9999, padding: '3px 10px', fontSize: 12, fontWeight: 600, lineHeight: '16px', color: tone.color, background: tone.bg, whiteSpace: 'nowrap' };
};

export const dotStyle = (status) => ({ width: 6, height: 6, borderRadius: 9999, background: (STATUS[status] || STATUS.draft).color });

/** Flattened AdminJS params ("topics.0", "topics.1") back to an array. */
export const arrayParam = (params, name) => Object.keys(params || {})
  .filter((key) => key.startsWith(`${name}.`) && /^\d+$/.test(key.slice(name.length + 1)))
  .sort((a, b) => Number(a.slice(name.length + 1)) - Number(b.slice(name.length + 1)))
  .map((key) => params[key]);
