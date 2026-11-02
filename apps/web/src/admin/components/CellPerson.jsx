import React from 'react';
import { Person } from './ui.jsx';

/** A User reference as avatar + name instead of an email link. */
export default function CellPerson({ record, property }) {
  const path = property?.propertyPath || property?.path;
  const value = record?.params?.[path];
  if (!value) return <span style={{ color: '#8A8A8E' }}>—</span>;
  return <Person record={record?.populated?.[path]} id={value} size={28} />;
}
