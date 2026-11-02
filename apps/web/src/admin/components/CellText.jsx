import React from 'react';

/** Long text clamped to two lines, so a list reads like a feed instead of a wall. */
export default function CellText({ record, property }) {
  const value = record?.params?.[property?.propertyPath || property?.path];
  if (!value) return <span style={{ color: '#8A8A8E' }}>—</span>;
  return (
    <span title={String(value)} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', maxWidth: 360, fontSize: 14, lineHeight: '19px', whiteSpace: 'normal', wordBreak: 'break-word' }}>{String(value)}</span>
  );
}
