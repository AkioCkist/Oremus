import React from 'react';
import { Bar } from './ui.jsx';

/** A 0..1 threshold or score as a percentage with a small bar. */
export default function CellPercent({ record, property }) {
  const value = Number(record?.params?.[property?.propertyPath || property?.path]);
  if (!Number.isFinite(value)) return <span style={{ color: '#A3A9B6' }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 110 }}>
      <span style={{ width: 60 }}><Bar value={value} height={6} color={value >= 0.8 ? '#F87171' : value >= 0.5 ? '#FBBF24' : '#A78BFA'} /></span>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{Math.round(value * 100)}%</span>
    </span>
  );
}
