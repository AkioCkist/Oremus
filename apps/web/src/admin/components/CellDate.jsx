import React from 'react';
import { absolute, relative } from './ui.jsx';

/** "3 hours ago" with the exact time underneath. */
export default function CellDate({ record, property }) {
  const value = record?.params?.[property?.propertyPath || property?.path];
  if (!value) return <span style={{ color: '#A3A9B6' }}>—</span>;
  return (
    <span title={absolute(value)} style={{ display: 'inline-block', lineHeight: 1.25, whiteSpace: 'nowrap' }}>
      <span style={{ display: 'block', fontSize: 14 }}>{relative(value)}</span>
      <span style={{ display: 'block', fontSize: 11, color: '#A3A9B6' }}>{new Date(value).toLocaleDateString('vi-VN')}</span>
    </span>
  );
}
