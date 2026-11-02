import React from 'react';
import { signedVnd, vnd } from './ui.jsx';

/** VND amount with thousands separators. Ledger amounts are signed and coloured. */
export default function Money({ record, property }) {
  const path = property?.propertyPath || property?.path;
  const value = record?.params?.[path];
  if (value === undefined || value === null || value === '') return <span style={{ color: '#8A8A8E' }}>—</span>;
  const signed = path === 'amount' && record?.params?.type !== undefined && record?.params?.balanceAfter !== undefined;
  const n = Number(value);
  return <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontWeight: 600, color: signed ? (n < 0 ? '#D70015' : '#1E7A35') : undefined }}>{signed ? signedVnd(n) : vnd(n)}</span>;
}
