import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ApiClient, OriginalList, useQueryParams } from 'adminjs';
import { labelOf } from './ui.jsx';

/*
 * Every resource list (overrides AdminJS's DefaultListAction), shaped like a Filament table:
 * saved-view tabs with counts from the resource's status-like field, a search box on the title field,
 * and the active filters as chips that can be removed one by one. The table, bulk actions and pagination
 * underneath are AdminJS's own.
 */

const api = new ApiClient();
// The first of these that the resource can filter by, with a fixed list of values, becomes the tabs.
const VIEW_FIELDS = ['status', 'moderationStatus', 'role', 'decision', 'type', 'kind'];
const SEARCH_DELAY_MS = 300;

const filterValue = (value, property) => {
  if (value && typeof value === 'object') {
    const { from, to } = value;
    if (from || to) return `${from ? new Date(from).toLocaleDateString('vi-VN') : '…'} – ${to ? new Date(to).toLocaleDateString('vi-VN') : '…'}`;
    return Object.values(value).join(', ');
  }
  // Enum values read as their label ("pending_review" → "In review"); typed text is shown as typed.
  return property?.availableValues?.length ? labelOf(value) : `“${value}”`;
};

export default function ResourceList(props) {
  const { resource } = props;
  const { filters = {}, storeParams } = useQueryParams();
  const filterable = resource.filterProperties || [];
  const viewField = useMemo(() => VIEW_FIELDS.map((path) => filterable.find((property) => property.propertyPath === path && property.availableValues?.length)).find(Boolean), [resource.id]);
  const searchField = resource.titleProperty && filterable.some((property) => property.propertyPath === resource.titleProperty.propertyPath) ? resource.titleProperty : null;

  const activeView = viewField ? filters[viewField.propertyPath] ?? '' : '';
  const searchKey = searchField?.propertyPath;
  const [query, setQuery] = useState(searchKey ? filters[searchKey] ?? '' : '');
  const [counts, setCounts] = useState({});
  const typing = useRef();

  useEffect(() => { setQuery(searchKey ? filters[searchKey] ?? '' : ''); }, [resource.id, searchKey && filters[searchKey]]);

  const setFilters = (next) => {
    const clean = Object.fromEntries(Object.entries(next).filter(([, value]) => value !== '' && value !== undefined && value !== null));
    storeParams({ filters: Object.keys(clean).length ? clean : undefined, page: '1' });
  };

  const onSearch = (event) => {
    const value = event.target.value;
    setQuery(value);
    clearTimeout(typing.current);
    typing.current = setTimeout(() => setFilters({ ...filters, [searchKey]: value.trim() }), SEARCH_DELAY_MS);
  };
  useEffect(() => () => clearTimeout(typing.current), []);

  // Counts per tab follow every other filter, so each tab says what it would show.
  const otherFilters = JSON.stringify(Object.fromEntries(Object.entries(filters).filter(([key]) => key !== viewField?.propertyPath)));
  useEffect(() => {
    if (!viewField) return undefined;
    let cancelled = false;
    const base = Object.fromEntries(Object.entries(JSON.parse(otherFilters)).map(([key, value]) => [`filters.${key}`, value]));
    const views = ['', ...viewField.availableValues.map((option) => option.value)];
    Promise.all(views.map((value) => api.resourceAction({ resourceId: resource.id, actionName: 'list', params: { ...base, ...(value ? { [`filters.${viewField.propertyPath}`]: value } : {}), perPage: 1 } })
      .then((response) => [value, response.data?.meta?.total ?? null])
      .catch(() => [value, null])))
      .then((entries) => { if (!cancelled) setCounts(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
  }, [resource.id, viewField, otherFilters]);

  const chips = Object.entries(filters)
    .filter(([key, value]) => key !== viewField?.propertyPath && value !== '' && value !== undefined)
    .map(([key, value]) => {
      const property = filterable.find((item) => item.propertyPath === key);
      return { key, label: labelOf(property?.label || key), value: filterValue(value, property) };
    });
  const removeFilter = (key) => {
    if (key === searchKey) setQuery('');
    const next = { ...filters }; delete next[key]; setFilters(next);
  };

  const views = viewField ? [{ value: '', label: 'All' }, ...viewField.availableValues] : [];
  const showToolbar = views.length || searchField || chips.length;

  return (
    <>
      {showToolbar ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          {views.length ? (
            <div role="tablist" aria-label={`${viewField.label} views`} style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {views.map((view) => (
                <button key={view.value || 'all'} type="button" role="tab" className="oa-tab" aria-selected={String(activeView) === String(view.value)} onClick={() => setFilters({ ...filters, [viewField.propertyPath]: view.value })}>
                  {view.value ? labelOf(view.value) : view.label}
                  {counts[view.value] !== undefined && counts[view.value] !== null ? <span className="oa-count">{Number(counts[view.value]).toLocaleString('vi-VN')}</span> : null}
                </button>
              ))}
            </div>
          ) : null}
          {searchField || chips.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              {searchField ? (
                <label style={{ position: 'relative', flex: '1 1 280px', maxWidth: 420, display: 'flex' }}>
                  <span className="oa-sr">Search by {searchField.label}</span>
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A90A0" strokeWidth="2" strokeLinecap="round" style={{ position: 'absolute', left: 12, top: 14 }}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                  <input type="search" value={query} onChange={onSearch} placeholder={`Search by ${searchField.label.toLowerCase()}`} style={{ width: '100%', paddingLeft: 36 }} />
                </label>
              ) : null}
              {chips.length ? <span style={{ fontSize: 13, color: '#A3A9B6' }}>Filters:</span> : null}
              {chips.map((chip) => (
                <span key={chip.key} className="oa-chip">{chip.label}: {chip.value}<button type="button" aria-label={`Remove filter ${chip.label}`} onClick={() => removeFilter(chip.key)}>✕</button></span>
              ))}
              {chips.length > 1 ? <button type="button" className="oa-btn" style={{ border: 0, background: 'transparent', color: '#C4B5FD' }} onClick={() => { setQuery(''); setFilters(viewField && activeView ? { [viewField.propertyPath]: activeView } : {}); }}>Clear all</button> : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <OriginalList {...props} />
    </>
  );
}
