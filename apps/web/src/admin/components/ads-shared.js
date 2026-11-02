// Shared by the campaign show page and the list cells. Colours are the site's iOS accents (styles.css :root).

export const STATUS = {
  draft: { label: 'Draft', color: '#8A8A8E', bg: '#F2F2F7' },
  pending_review: { label: 'In review', color: '#C25E00', bg: '#FFF1E0' },
  active: { label: 'Running', color: '#1E7A35', bg: '#E3F7E8' },
  paused: { label: 'Paused', color: '#3C3C43', bg: '#EFEFF0' },
  rejected: { label: 'Not approved', color: '#D70015', bg: '#FFE5E6' },
  exhausted: { label: 'Wallet empty', color: '#8A6100', bg: '#FFF8D6' },
  ended: { label: 'Ended', color: '#8A8A8E', bg: '#F2F2F7' }
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
