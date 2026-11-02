import React from 'react';
import { Chips, Pill, arrayParam } from './ui.jsx';

/** Enum values as coloured pills (status, role, reason...). Arrays render as chips. */
export default function CellPill({ record, property }) {
  const path = property?.propertyPath || property?.path;
  const params = record?.params || {};
  if (property?.isArray) return <Chips items={arrayParam(params, path).slice(0, 3)} empty="—" />;
  const value = params[path];
  if (value === undefined || value === null || value === '') return <span style={{ color: '#8A8A8E' }}>—</span>;
  if (typeof value === 'boolean' || value === 'true' || value === 'false') {
    const yes = value === true || value === 'true';
    return <Pill label={yes ? 'Yes' : 'No'} tone={yes ? 'green' : 'grey'} />;
  }
  return <Pill value={value} />;
}
