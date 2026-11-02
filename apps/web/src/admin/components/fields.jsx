import React from 'react';
import { Chips, ExternalLink, MediaGrid, Mono, Muted, Person, Pill, RecordLink, Row, Scores, T, Thumb, When, arrayParam, isEmpty, isImage, isVideo, labelOf, num, objectArrayParam, objectParam, vnd } from './ui.jsx';

/*
 * Renders any AdminJS property as something readable: references as people or links, enums as coloured pills,
 * dates with "3 days ago", media as thumbnails, nested objects and arrays as small groups instead of raw dumps.
 */

const MEDIA_PATH = /(url|avatar|cover|poster|image|media)$/i;

function Nested({ entries }) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {entries.map(([key, value]) => (
        <div key={key} style={{ display: 'flex', gap: 10, fontSize: 14 }}>
          <span style={{ color: T.muted, minWidth: 110 }}>{labelOf(key.split('.').pop())}</span>
          <span style={{ minWidth: 0, wordBreak: 'break-word' }}><Plain value={value} path={key} /></span>
        </div>
      ))}
    </div>
  );
}

function Plain({ value, path = '', prop, money }) {
  if (isEmpty(value)) return <Muted>—</Muted>;
  if (typeof value === 'boolean' || value === 'true' || value === 'false') {
    const yes = value === true || value === 'true';
    return <Pill value={yes ? 'yes' : 'no'} label={yes ? 'Yes' : 'No'} tone={yes ? 'green' : 'grey'} />;
  }
  if (prop?.availableValues?.length) return <Pill value={value} />;
  if (prop && (prop.type === 'datetime' || prop.type === 'date')) return <When value={value} />;
  if (typeof value === 'number' || prop?.type === 'number' || prop?.type === 'float') return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money ? vnd(value) : num(value)}</span>;
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return <When value={text} />;
  if ((text.startsWith('/') || /^https?:\/\//.test(text)) && (isImage(text) || isVideo(text) || MEDIA_PATH.test(path))) {
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><Thumb url={text} size={56} /><ExternalLink href={text}>Open</ExternalLink></span>;
  }
  if (/^https?:\/\//.test(text)) return <ExternalLink href={text}>{text}</ExternalLink>;
  if (/^[a-f0-9]{24}$/i.test(text)) return <Mono>{text}</Mono>;
  return <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>;
}

/** Value for one property, or null when there is nothing to show. */
export function FieldValue({ prop, record, money = [] }) {
  const params = record?.params || {};
  const populated = record?.populated || {};
  const path = prop.propertyPath || prop.path;
  const isMoney = money.includes(path);

  if (prop.subProperties?.length) {
    if (prop.isArray) {
      const items = objectArrayParam(params, path);
      if (!items.length) return null;
      if (items.some((item) => item.url)) return <div style={{ maxWidth: 520 }}><MediaGrid items={items} height={160} /></div>;
      return (
        <div style={{ display: 'grid', gap: 8 }}>
          {items.map((item, index) => <div key={index} style={{ borderRadius: 14, background: T.grouped, padding: '10px 12px' }}><Nested entries={Object.entries(item).filter(([, value]) => !isEmpty(value))} /></div>)}
        </div>
      );
    }
    const entries = Object.entries(objectParam(params, path)).filter(([, value]) => !isEmpty(value));
    return entries.length ? <Nested entries={entries} /> : null;
  }

  if (prop.isArray) {
    const values = arrayParam(params, path);
    if (!values.length) return null;
    if (prop.type === 'reference') {
      return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>{values.map((id, index) => (prop.reference === 'User' && populated[`${path}.${index}`] ? <Person key={id} record={populated[`${path}.${index}`]} size={28} /> : <RecordLink key={id} resourceId={prop.reference} id={id} />))}</div>;
    }
    if (values.every((value) => typeof value === 'string' && (isImage(value) || isVideo(value)))) return <div style={{ maxWidth: 520 }}><MediaGrid items={values.map((url) => ({ url }))} height={140} /></div>;
    return <Chips items={values} />;
  }

  if (prop.type === 'mixed') {
    const entries = Object.entries(objectParam(params, path)).filter(([, value]) => !isEmpty(value));
    if (!entries.length) return null;
    const numeric = entries.every(([, value]) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1);
    return numeric ? <Scores scores={Object.fromEntries(entries)} /> : <Nested entries={entries} />;
  }

  const value = params[path];
  if (isEmpty(value)) return null;
  if (prop.type === 'reference') {
    const ref = populated[path];
    if (prop.reference === 'User') return <Person record={ref} id={value} />;
    return <RecordLink resourceId={prop.reference} id={value}>{ref?.title}</RecordLink>;
  }
  if (prop.isId) return <Mono>{value}</Mono>;
  return <Plain value={value} path={path} prop={prop} money={isMoney} />;
}

/** Every property of the record, collapsed under the visual summary so nothing is hidden from staff. */
export function AllFields({ resource, record, money, hide = [], open = false, title = 'All fields' }) {
  const props = (resource?.showProperties || []).filter((prop) => !hide.includes(prop.propertyPath || prop.path));
  const rows = [];
  const empty = [];
  for (const prop of props) {
    const node = <FieldValue prop={prop} record={record} money={money} />;
    const rendered = FieldValue({ prop, record, money });
    if (rendered === null) empty.push(prop.label || labelOf(prop.path));
    else rows.push(<Row key={prop.path} label={prop.label || labelOf(prop.path)}>{node}</Row>);
  }
  return (
    <details className="oa-details" open={open} style={{ background: '#FFFFFF', borderRadius: 24, boxShadow: T.card, padding: '16px 20px' }}>
      <summary style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: T.ink }}>
        <span className="oa-chevron" aria-hidden="true" style={{ display: 'inline-block', transition: 'transform .15s ease', color: T.muted }}>›</span>
        {title} <Muted style={{ fontWeight: 400 }}>({rows.length})</Muted>
      </summary>
      <div style={{ marginTop: 10 }}>{rows}</div>
      {empty.length ? <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.line}`, fontSize: 12, color: T.muted }}>Empty: {empty.join(', ')}</div> : null}
    </details>
  );
}
