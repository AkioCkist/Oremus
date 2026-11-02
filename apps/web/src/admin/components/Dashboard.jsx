import React, { useEffect, useState } from 'react';
import { ApiClient } from 'adminjs';
import { Avatar, Card, CardTitle, Chips, Muted, Pill, Stat, Stats, T, Thumb, h, labelOf, listUrl, num, relative, showUrl, vnd } from './ui.jsx';

const api = new ApiClient();

/** A big number that is also a shortcut to the queue it counts. Turns orange/red while there is work waiting. */
function Attention({ label, value, href, hint, urgentAt = 1, icon }) {
  const waiting = Number(value || 0) >= urgentAt;
  const tone = waiting ? (Number(value) >= urgentAt * 10 ? { fg: '#F87171', bg: '#2A1416' } : { fg: '#FBBF24', bg: '#2A2010' }) : { fg: '#4ADE80', bg: '#0F2A1A' };
  return (
    <a href={href} className="oa-card-link" style={{ flex: '1 1 200px', minWidth: 0, textDecoration: 'none', color: T.ink, background: T.surface, borderRadius: 16, boxShadow: T.card, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 12, display: 'grid', placeItems: 'center', background: tone.bg, color: tone.fg, fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: tone.fg, background: tone.bg, borderRadius: 9999, padding: '3px 10px' }}>{waiting ? 'Needs you' : 'All clear'}</span>
      </span>
      <span style={{ fontSize: 34, lineHeight: '38px', fontWeight: 700, letterSpacing: '-0.6px', fontVariantNumeric: 'tabular-nums' }}>{num(value)}</span>
      <span style={{ fontSize: 15, fontWeight: 600 }}>{label}</span>
      {hint ? <span style={{ fontSize: 12, color: T.muted, marginTop: -6 }}>{hint}</span> : null}
    </a>
  );
}

function QueueRow({ href, media, title, meta, right }) {
  return (
    <a href={href} className="oa-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px', margin: '0 -8px', borderRadius: 12, textDecoration: 'none', color: T.ink }}>
      {media}
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        <span style={{ display: 'block', fontSize: 12, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</span>
      </span>
      {right}
    </a>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h2 style={{ margin: '0 4px 10px', fontSize: 13, fontWeight: 600, letterSpacing: '0.2px', textTransform: 'uppercase', color: T.muted }}>{title}</h2>
      {children}
    </section>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getDashboard().then((response) => setData(response.data)).catch(() => setError('Could not load the metrics.'));
  }, []);

  const shell = (children) => <div className="oa-page" style={{ padding: '28px 24px 48px', maxWidth: 1240, width: '100%', minWidth: 0, boxSizing: 'border-box', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>{children}</div>;
  if (error) return shell(<Card><span role="alert" style={{ color: '#F87171' }}>{error}</span></Card>);
  if (!data) return shell(<Card><Muted>Loading…</Muted></Card>);

  const queues = Object.entries(data.queues || {});
  const cases = data.waiting?.cases || [];
  const ads = data.waiting?.ads || [];
  const calls = data.calls || {};
  const answeredRate = calls.total ? Math.round((calls.answered / calls.total) * 100) : null;

  return shell(<>
    <div>
      <h1 style={{ margin: 0, fontSize: 34, lineHeight: '41px', fontWeight: 700, letterSpacing: '0.4px' }}>Overview</h1>
      <p style={{ margin: '4px 0 0', fontSize: 15, color: T.muted }}>What needs a person right now, then how Oremus is doing. Servers, queries and cache are on <a className="oa-link" href={h.pageUrl('monitoring')}>Monitoring →</a></p>
    </div>

    <Section title="Needs attention">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        <Attention icon="🛡" label="Open moderation cases" value={data.moderation.openCases} hint="Worst first" href={listUrl('ModerationCase', { status: 'open' })} urgentAt={1} />
        <Attention icon="⚑" label="Open reports" value={data.moderation.openReports} href={listUrl('Report', { status: 'open' })} />
        <Attention icon="↺" label="Appeals waiting" value={data.moderation.openAppeals} href={listUrl('ModerationCase', { 'appeal.status': 'pending' })} />
        <Attention icon="📣" label="Ads to review" value={data.ads.pendingReview} href={listUrl('AdCampaign', { status: 'pending_review' })} />
      </div>
    </Section>

    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
      <Card style={{ flex: '1 1 420px' }}>
        <CardTitle right={<a className="oa-link" href={listUrl('ModerationCase', { status: 'open' })} style={{ fontSize: 14 }}>See all →</a>}>Top of the moderation queue</CardTitle>
        {cases.length ? cases.map((item) => (
          <QueueRow
            key={item._id}
            href={showUrl('ModerationCase', item._id)}
            media={item.mediaUrls?.[0] ? <Thumb url={item.mediaUrls[0]} /> : <Avatar name={item.authorId?.displayName} url={item.authorId?.profile?.avatarUrl} size={44} />}
            title={item.snippet || `${labelOf(item.targetType)} without text`}
            meta={<>{item.authorId?.displayName || 'Unknown'} · {labelOf(item.targetType)} · {relative(item.createdAt)}{item.reportCount ? ` · ${item.reportCount} reports` : ''}</>}
            right={<span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{(item.categories || []).slice(0, 1).map((category) => <Pill key={category} value={category} />)}<span title="Priority" style={{ fontSize: 12, fontWeight: 700, color: '#FBBF24', background: '#2A2010', borderRadius: 9999, padding: '3px 8px' }}>P{item.priority}</span></span>}
          />
        )) : <Muted>Nothing waiting.</Muted>}
      </Card>
      <Card style={{ flex: '1 1 380px' }}>
        <CardTitle right={<a className="oa-link" href={listUrl('AdCampaign', { status: 'pending_review' })} style={{ fontSize: 14 }}>See all →</a>}>Ads waiting for review</CardTitle>
        {ads.length ? ads.map((item) => (
          <QueueRow
            key={item._id}
            href={showUrl('AdCampaign', item._id)}
            media={<Thumb url={item.mediaUrl} label="No image" />}
            title={item.headline || item.name}
            meta={<>{item.advertiserId?.displayName || 'Unknown'} · {vnd(item.totalBudget)} · {relative(item.createdAt)}</>}
            right={<Pill value="pending_review" />}
          />
        )) : <Muted>No ads waiting.</Muted>}
      </Card>
    </div>

    <Section title="Community">
      <Card>
        <Stats>
          <Stat label="Active today" value={num(data.users.activeToday)} hint="Members with at least one signal" />
          <Stat label="New this week" value={num(data.users.newThisWeek)} />
          <Stat label="Members" value={num(data.users.total)} />
          <Stat label="Restricted" value={num(data.users.restricted)} tone={data.users.restricted ? 'orange' : undefined} hint="Suspended or banned" />
          <Stat label="Posts today" value={num(data.content.postsToday)} />
          <Stat label="Comments today" value={num(data.content.commentsToday)} />
        </Stats>
        <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: '8px 16px', fontSize: 14 }}>
          <a className="oa-link" href={listUrl('User')}>Members →</a>
          <a className="oa-link" href={listUrl('User', { status: 'suspended' })}>Suspended →</a>
          <a className="oa-link" href={listUrl('Post')}>Latest posts →</a>
        </div>
      </Card>
    </Section>

    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'stretch' }}>
      <div style={{ flex: '1 1 380px', minWidth: 0 }}>
        <Section title="Ads (30 days)">
          <Card>
            <Stats>
              <Stat label="Running campaigns" value={num(data.ads.active)} tone="green" />
              <Stat label="Top-ups" value={vnd(data.ads.topUps)} />
              <Stat label="Ad spend" value={vnd(data.ads.spend)} />
            </Stats>
          </Card>
        </Section>
      </div>
      <div style={{ flex: '1 1 380px', minWidth: 0 }}>
        <Section title="Safety (7 days)">
          <Card>
            <Stats>
              <Stat label="Auto-removed" value={num(data.moderation.removedThisWeek)} tone={data.moderation.removedThisWeek ? 'red' : undefined} />
              <Stat label="Calls" value={num(calls.total)} hint={answeredRate === null ? null : `${answeredRate}% answered`} />
              <Stat label="Failed calls" value={num(calls.failed)} tone={calls.failed ? 'orange' : undefined} />
            </Stats>
          </Card>
        </Section>
      </div>
    </div>

    <Section title="Background jobs">
      <Card>
        {queues.length ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {queues.map(([name, counts]) => {
              const backlog = (counts.waiting || 0) + (counts.active || 0);
              return (
                <div key={name} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 180, fontWeight: 600, fontSize: 14 }}>{labelOf(name)}</span>
                  <Chips items={[`${num(counts.waiting)} waiting`, `${num(counts.active)} running`, `${num(counts.delayed)} delayed`]} />
                  <span style={{ marginLeft: 'auto' }}>{counts.failed ? <Pill tone="red" label={`${num(counts.failed)} failed`} /> : <Pill tone={backlog > 100 ? 'orange' : 'green'} label={backlog > 100 ? 'Backed up' : 'Healthy'} />}</span>
                </div>
              );
            })}
          </div>
        ) : <Muted>Job queue is unavailable.</Muted>}
      </Card>
    </Section>

    <p style={{ margin: 0, fontSize: 12, color: T.muted }}>Updated {relative(data.generatedAt)}. Figures are cached for a minute. <a className="oa-link" href={h.dashboardUrl()}>Refresh</a></p>
  </>);
}
