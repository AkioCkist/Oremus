import React from 'react';
import { ViewHelpers } from 'adminjs';
import { STATUS, arrayParam, count, dotStyle, pillStyle, vnd } from './ads-shared.js';

const h = new ViewHelpers();

// Site tokens (styles.css :root, light).
const ink = '#EDEEF2';
const muted = '#A3A9B6';
const line = '#232733';
const field = '#1A1D26';
const brand = '#A78BFA';

const card = { background: '#14161D', borderRadius: 20, boxShadow: '0 0 0 1px #232733', padding: 20 };
const sectionTitle = { margin: 0, fontSize: 17, lineHeight: '22px', fontWeight: 600, letterSpacing: '-0.43px', color: ink };
const label = { fontSize: 13, lineHeight: '18px', color: muted };
const value = { fontSize: 15, lineHeight: '20px', color: ink, wordBreak: 'break-word' };

const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
const date = (value) => (value ? new Date(value).toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

function Avatar({ person, size = 32 }) {
  const url = person?.['profile.avatarUrl'];
  const style = { width: size, height: size, borderRadius: 9999, flexShrink: 0, display: 'grid', placeItems: 'center', overflow: 'hidden', background: url ? field : '#3B2F66', color: '#C4B5FD', fontSize: size * 0.36, fontWeight: 600 };
  return <span style={style}>{url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(person?.displayName)}</span>;
}

/** The sponsored card exactly as it renders in the feed (views/partials/ad-card.ejs). */
function AdPreview({ params, advertiser }) {
  return (
    <article style={{ ...card, padding: 0, overflow: 'hidden' }} aria-label="Ad preview">
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
        <Avatar person={advertiser} />
        <div style={{ minWidth: 0, flex: 1, lineHeight: 1.2 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{advertiser?.displayName || 'Advertiser'}</div>
          <div style={{ fontSize: 12, color: muted }}>Sponsored</div>
        </div>
      </header>
      {params.body ? <p style={{ margin: 0, padding: '0 14px 10px', fontSize: 17, lineHeight: '22px', letterSpacing: '-0.43px', color: ink, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{params.body}</p> : null}
      {params.mediaUrl
        ? <a href={params.mediaUrl} target="_blank" rel="noreferrer" style={{ display: 'block' }}><img src={params.mediaUrl} alt="Ad image" style={{ display: 'block', width: '100%', maxHeight: 512, objectFit: 'cover', background: field }} /></a>
        : <div style={{ margin: '0 14px', padding: '28px 0', borderRadius: 14, background: field, color: muted, fontSize: 13, textAlign: 'center' }}>No image</div>}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderTop: params.mediaUrl ? 'none' : undefined }}>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 15, fontWeight: 600, letterSpacing: '-0.23px', color: ink }}>{params.headline}</span>
        <span style={{ flexShrink: 0, borderRadius: 9999, background: '#232733', padding: '7px 14px', fontSize: 15, fontWeight: 600, color: ink }}>{params.ctaLabel}</span>
      </div>
    </article>
  );
}

function Stat({ title, children, hint }) {
  return (
    <div style={{ flex: '1 1 140px', minWidth: 0, borderRadius: 18, background: '#0B0C10', padding: '12px 14px' }}>
      <div style={label}>{title}</div>
      <div style={{ marginTop: 2, fontSize: 22, lineHeight: '28px', fontWeight: 600, letterSpacing: '-0.26px', color: ink, fontVariantNumeric: 'tabular-nums' }}>{children}</div>
      {hint ? <div style={{ ...label, marginTop: 2 }}>{hint}</div> : null}
    </div>
  );
}

function Row({ title, children }) {
  return (
    <div style={{ display: 'flex', gap: 16, padding: '11px 0', borderTop: `1px solid ${line}` }}>
      <div style={{ ...label, width: 128, flexShrink: 0, paddingTop: 1 }}>{title}</div>
      <div style={{ ...value, minWidth: 0, flex: 1 }}>{children}</div>
    </div>
  );
}

export default function CampaignShow({ record, action }) {
  const params = record?.params || {};
  const advertiserRecord = record?.populated?.advertiserId;
  const advertiser = advertiserRecord?.params;
  const reviewer = record?.populated?.reviewedBy?.params;
  const labels = action?.custom?.topicLabels || {};
  const topics = arrayParam(params, 'topics');
  const status = params.status;

  const spent = Number(params.spent || 0);
  const total = Number(params.totalBudget || 0);
  const impressions = Number(params.impressions || 0);
  const clicks = Number(params.clicks || 0);
  const used = total ? Math.min(100, Math.round((spent / total) * 100)) : 0;
  const ctr = impressions ? `${((clicks / impressions) * 100).toFixed(2)}%` : '—';
  const viewsLeft = params.cpm ? Math.floor(((total - spent) / Number(params.cpm)) * 1000) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontFamily: 'inherit' }}>
      <div style={{ ...card, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
        <Avatar person={advertiser} size={44} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 22, lineHeight: '28px', fontWeight: 700, letterSpacing: '-0.26px', color: ink }}>{params.name}</h2>
          <div style={{ ...label, marginTop: 2 }}>
            {advertiser ? <a href={h.showUrl('User', advertiserRecord.id)} style={{ color: brand, fontWeight: 600, textDecoration: 'none' }}>{advertiser.displayName || advertiserRecord.title}</a> : 'Unknown advertiser'}
            {advertiser?.username ? <> · <a href={`/profile/${advertiser.username}`} target="_blank" rel="noreferrer" style={{ color: muted }}>@{advertiser.username}</a></> : null}
            {advertiser?.email ? <> · {advertiser.email}</> : null}
            {' · '}Submitted {date(params.createdAt)}
          </div>
        </div>
        {status ? <span style={{ ...pillStyle(status), fontSize: 13, padding: '5px 12px' }}><span style={dotStyle(status)} />{(STATUS[status] || {}).label || status}</span> : null}
      </div>

      {status === 'rejected' && params.rejectionReason ? (
        <div role="alert" style={{ ...card, background: '#2A1416', boxShadow: 'none', color: '#F87171' }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Rejection reason sent to the advertiser</div>
          <div style={{ marginTop: 4, fontSize: 15 }}>{params.rejectionReason}</div>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <section style={{ flex: '1 1 340px', maxWidth: 540, minWidth: 0 }} aria-labelledby="ad-preview-title">
          <h3 id="ad-preview-title" style={{ ...sectionTitle, margin: '0 4px 10px' }}>How it looks in the feed</h3>
          <AdPreview params={params} advertiser={advertiser} />
        </section>

        <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section style={card} aria-labelledby="ad-budget-title">
            <h3 id="ad-budget-title" style={sectionTitle}>Budget and results</h3>
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, color: muted }}>
                <span><b style={{ color: ink, fontWeight: 600 }}>{vnd(spent)}</b> spent of {vnd(total)}</span>
                <span>{used}%</span>
              </div>
              <div role="progressbar" aria-label="Budget used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={used} style={{ marginTop: 6, height: 8, borderRadius: 9999, background: field, overflow: 'hidden' }}>
                <div style={{ width: `${used}%`, height: '100%', borderRadius: 9999, background: brand }} />
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
              <Stat title="Per 1,000 views">{vnd(params.cpm)}</Stat>
              <Stat title="Daily budget">{vnd(params.dailyBudget)}</Stat>
              <Stat title="Views" hint={viewsLeft > 0 ? `≈ ${count(viewsLeft)} left in budget` : null}>{count(impressions)}</Stat>
              <Stat title="Clicks" hint={`CTR ${ctr}`}>{count(clicks)}</Stat>
            </div>
          </section>

          <section style={card} aria-labelledby="ad-details-title">
            <h3 id="ad-details-title" style={{ ...sectionTitle, marginBottom: 6 }}>Details</h3>
            <Row title="Headline">{params.headline}</Row>
            <Row title="Text">{params.body ? <span style={{ whiteSpace: 'pre-wrap' }}>{params.body}</span> : <span style={{ color: muted }}>None</span>}</Row>
            <Row title="Button">{params.ctaLabel}</Row>
            <Row title="Link">{params.ctaUrl ? <a href={params.ctaUrl} target="_blank" rel="noreferrer nofollow" style={{ color: brand, wordBreak: 'break-all' }}>{params.ctaUrl}</a> : '—'}</Row>
            <Row title="Topics">
              {topics.length ? (
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {topics.map((topic) => <span key={topic} style={{ borderRadius: 9999, background: field, padding: '4px 10px', fontSize: 13 }}>{labels[topic] || topic}</span>)}
                </span>
              ) : <span style={{ color: muted }}>None</span>}
            </Row>
            <Row title="Image">{params.mediaUrl ? <a href={params.mediaUrl} target="_blank" rel="noreferrer" style={{ color: brand, wordBreak: 'break-all' }}>Open original</a> : <span style={{ color: muted }}>None</span>}</Row>
          </section>

          <section style={card} aria-labelledby="ad-review-title">
            <h3 id="ad-review-title" style={{ ...sectionTitle, marginBottom: 6 }}>Review</h3>
            <Row title="Reviewed by">{reviewer ? (reviewer.displayName || record.populated.reviewedBy.title) : <span style={{ color: muted }}>Not reviewed yet</span>}</Row>
            <Row title="Reviewed at">{date(params.reviewedAt)}</Row>
            <Row title="Submitted">{date(params.createdAt)}</Row>
          </section>
        </div>
      </div>
    </div>
  );
}
