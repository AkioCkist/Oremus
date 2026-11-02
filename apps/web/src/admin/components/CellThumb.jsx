import React from 'react';
import { Thumb, arrayParam } from './ui.jsx';

/**
 * First image or video of a record as a small square. Works for a plain URL ("mediaUrl"), an object ("media.url"),
 * an array of objects ("media.0.url") or an array of URLs ("mediaUrls.0").
 */
export default function CellThumb({ record, property }) {
  const path = property?.propertyPath || property?.path;
  const p = record?.params || {};
  const url = p[path] || p[`${path}.url`] || p[`${path}.0.url`] || arrayParam(p, path)[0] || '';
  const mime = p[`${path}.mimeType`] || p[`${path}.0.mimeType`] || '';
  const count = Object.keys(p).filter((key) => new RegExp(`^${path}\\.\\d+(\\.url)?$`).test(key)).length;
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <Thumb url={typeof url === 'string' ? url : ''} mime={mime} label="—" />
      {count > 1 ? <span style={{ position: 'absolute', right: -6, bottom: -6, borderRadius: 9999, background: '#000', color: '#fff', fontSize: 10, fontWeight: 600, padding: '1px 6px' }}>+{count - 1}</span> : null}
    </span>
  );
}
