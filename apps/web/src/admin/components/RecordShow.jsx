import React from 'react';
import {
  Avatar, Card, CardTitle, Chips, Columns, ExternalLink, Header, MediaGrid, Mono, Muted, Notice, Page, Person, Pill, Quote,
  RecordLink, Row, Scores, Stat, Stats, T, When, arrayParam, duration, labelOf, listUrl, num, objectArrayParam, objectParam, relative, showUrl, signedVnd, vnd
} from './ui.jsx';
import { AllFields } from './fields.jsx';
import CampaignShow from './CampaignShow.jsx';

/*
 * Record page for every resource. `action.custom.kind` picks a visual summary that mirrors how the thing looks
 * on Oremus (a post as a feed card, a story as a 9:16 frame, a member as a profile header...). Every field stays
 * available underneath in "All fields".
 */

const REGISTERED = ['Post', 'Comment', 'Story', 'User', 'Group', 'AdCampaign', 'ModerationCase', 'Report', 'Call'];
const linkable = (type) => REGISTERED.includes(type);

const STORY_BG = {
  sunset: 'linear-gradient(160deg, #ff8a5c, #e8467c 55%, #7a3cc4)', ocean: 'linear-gradient(160deg, #3fd0e0, #2f7de1 55%, #3540b0)',
  forest: 'linear-gradient(160deg, #a8e063, #3fae74 55%, #1e6e5a)', night: 'linear-gradient(160deg, #434b8c, #1e2252 60%, #0c0e24)',
  candy: 'linear-gradient(160deg, #fbc2eb, #a18cd1)', sun: 'linear-gradient(160deg, #ffe259, #ffa751)', aurora: 'linear-gradient(160deg, #00c9a7, #845ec2 60%, #2c1a4d)',
  fire: 'linear-gradient(160deg, #ffb347, #ff5f6d 55%, #c9184a)', berry: 'linear-gradient(160deg, #f857a6, #9b2c8f 55%, #4a1460)', mint: 'linear-gradient(160deg, #d4fc79, #96e6a1)',
  charcoal: '#18191a', paper: '#f5f1e8'
};
const STORY_FONT = { classic: 'inherit', serif: 'Georgia, "Times New Roman", serif', script: '"Brush Script MT", "Segoe Script", cursive', typewriter: '"Courier New", ui-monospace, monospace', strong: 'Impact, "Arial Black", sans-serif', retro: '"Trebuchet MS", sans-serif' };

const Links = ({ children }) => <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', fontSize: 14 }}>{children}</div>;
const ListLink = ({ href, children }) => <a className="oa-link" href={href}>{children} →</a>;
const Deleted = ({ at }) => (at ? <Notice tone="red" title="Hidden from Oremus">Removed {relative(at)} ({new Date(at).toLocaleString('vi-VN')}). Members no longer see it.</Notice> : null);

function ModerationPill({ value }) {
  if (!value || value === 'approved') return <Pill value="approved" label="Visible" />;
  return <Pill value={value} label={`Moderation: ${labelOf(value)}`} />;
}

/* ---------- Content ---------- */

function PostView({ record }) {
  const p = record.params; const pop = record.populated || {};
  const media = objectArrayParam(p, 'media');
  const feeling = p['feeling.text'] || p['feeling.key'];
  return (
    <Page>
      <Columns side={<>
        <Card>
          <CardTitle>Status</CardTitle>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <ModerationPill value={p.moderationStatus} />
            <Pill value={p.visibility} label={`Audience: ${labelOf(p.visibility)}`} />
            {p.groupId ? <Pill value={p.groupStatus} label={`Group: ${labelOf(p.groupStatus)}`} /> : null}
            {p.deletedAt ? <Pill value="removed" label="Deleted" /> : null}
          </div>
          <div style={{ marginTop: 12 }}>
            <Row label="Posted"><When value={p.createdAt} /></Row>
            {p.editedAt ? <Row label="Edited"><When value={p.editedAt} /></Row> : null}
            {p.groupId ? <Row label="Group"><RecordLink resourceId="Group" id={p.groupId}>{pop.groupId?.title}</RecordLink></Row> : null}
            {p.sharedPostId ? <Row label="Shares"><RecordLink resourceId="Post" id={p.sharedPostId}>{pop.sharedPostId?.title || 'Original post'}</RecordLink></Row> : null}
          </div>
        </Card>
        <Card>
          <CardTitle>Open</CardTitle>
          <Links>
            <ExternalLink href={`/posts/${record.id}`}>Post on Oremus</ExternalLink>
            <ListLink href={listUrl('Comment', { postId: record.id })}>Comments</ListLink>
            {p.authorId ? <ListLink href={listUrl('Post', { authorId: p.authorId })}>More by this author</ListLink> : null}
            <ListLink href={listUrl('ModerationCase', { targetId: record.id })}>Moderation cases</ListLink>
          </Links>
        </Card>
      </>}>
        <Deleted at={p.deletedAt} />
        <Card pad={0} style={{ overflow: 'hidden' }} aria-label="Post as members see it">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px' }}>
            <Person record={pop.authorId} id={p.authorId} size={40} />
            <div style={{ marginLeft: 'auto', fontSize: 12, color: T.muted, textAlign: 'right' }}>{relative(p.createdAt)}</div>
          </div>
          {feeling || p['place.name'] ? (
            <div style={{ padding: '0 16px 8px', fontSize: 14, color: T.muted }}>
              {feeling ? <>{p['feeling.type'] === 'activity' ? '' : 'feeling '}<b style={{ color: T.ink, fontWeight: 600 }}>{feeling}</b></> : null}
              {feeling && p['place.name'] ? ' · ' : null}
              {p['place.name'] ? <>at <b style={{ color: T.ink, fontWeight: 600 }}>{p['place.name']}</b></> : null}
            </div>
          ) : null}
          {p.content ? <p style={{ margin: 0, padding: '0 16px 12px', fontSize: 17, lineHeight: '23px', letterSpacing: '-0.3px', color: T.ink, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{p.content}</p> : null}
          {media.length ? <div style={{ padding: '0 8px' }}><MediaGrid items={media} /></div> : null}
          {!p.content && !media.length ? <div style={{ padding: '0 16px 12px' }}><Muted>No text or media{p.sharedPostId ? ' (this is a share)' : ''}.</Muted></div> : null}
          <div style={{ display: 'flex', gap: 18, padding: '12px 16px', marginTop: 8, borderTop: `1px solid ${T.line}`, fontSize: 14, color: T.muted }}>
            <span><b style={{ color: T.ink }}>{num(p.reactionCount)}</b> reactions</span>
            <span><b style={{ color: T.ink }}>{num(p.commentCount)}</b> comments</span>
            <span><b style={{ color: T.ink }}>{num(p.shareCount)}</b> shares</span>
          </div>
        </Card>
      </Columns>
    </Page>
  );
}

function CommentView({ record }) {
  const p = record.params; const pop = record.populated || {};
  const author = pop.authorId?.params;
  return (
    <Page>
      <Columns side={<>
        <Card>
          <CardTitle>Status</CardTitle>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}><ModerationPill value={p.moderationStatus} />{p.deletedAt ? <Pill value="removed" label="Deleted" /> : null}{p.parentId ? <Pill tone="blue" label="Reply" /> : null}</div>
          <div style={{ marginTop: 12 }}>
            <Row label="On post"><RecordLink resourceId="Post" id={p.postId}>{pop.postId?.title ? `“${String(pop.postId.title).slice(0, 60)}”` : 'Open post'}</RecordLink></Row>
            {p.parentId ? <Row label="Replying to"><RecordLink resourceId="Comment" id={p.parentId}>{pop.parentId?.title ? `“${String(pop.parentId.title).slice(0, 60)}”` : 'Parent comment'}</RecordLink></Row> : null}
            <Row label="Written"><When value={p.createdAt} /></Row>
            {p.editedAt ? <Row label="Edited"><When value={p.editedAt} /></Row> : null}
          </div>
        </Card>
        <Card><CardTitle>Open</CardTitle><Links><ExternalLink href={`/posts/${p.postId}`}>Post on Oremus</ExternalLink><ListLink href={listUrl('Comment', { postId: p.postId })}>Whole thread</ListLink></Links></Card>
      </>}>
        <Deleted at={p.deletedAt} />
        <Card aria-label="Comment as members see it">
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Avatar name={author?.displayName} url={author?.['profile.avatarUrl']} size={36} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'inline-block', maxWidth: '100%', borderRadius: 18, background: T.grouped, padding: '8px 14px' }}>
                <a href={pop.authorId ? showUrl('User', pop.authorId.id) : undefined} style={{ fontSize: 13, fontWeight: 600, color: T.ink, textDecoration: 'none' }}>{author?.displayName || 'Member'}</a>
                <div style={{ fontSize: 15, lineHeight: '21px', color: T.ink, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{p.content}</div>
              </div>
              <div style={{ margin: '4px 14px 0', fontSize: 12, color: T.muted }}>{relative(p.createdAt)}{p.editedAt ? ' · Edited' : ''}</div>
            </div>
          </div>
        </Card>
      </Columns>
    </Page>
  );
}

function StoryView({ record }) {
  const p = record.params; const pop = record.populated || {};
  const url = p['media.url']; const mime = p['media.mimeType'] || '';
  const expired = p.expiresAt && new Date(p.expiresAt).getTime() < Date.now();
  const color = p['style.color'] || '#ffffff';
  const size = Number(p['style.size'] || 1);
  const hasStyle = p['style.x'] !== undefined;
  return (
    <Page>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: '0 0 auto', width: 270 }}>
          <div aria-label="Story preview" style={{ position: 'relative', width: 270, aspectRatio: '9 / 16', borderRadius: 24, overflow: 'hidden', background: url ? '#000' : STORY_BG[p.background] || STORY_BG.ocean, boxShadow: T.card }}>
            {url ? (/^video\//.test(mime) ? <video src={url} controls playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />) : null}
            {p.text ? (
              <div style={{ position: 'absolute', left: hasStyle ? `${p['style.x']}%` : '50%', top: hasStyle ? `${p['style.y']}%` : (url ? '86%' : '50%'), transform: 'translate(-50%, -50%)', width: '86%', textAlign: p['style.align'] || 'center', color, fontFamily: STORY_FONT[p['style.font']] || 'inherit', fontSize: 20 * size, lineHeight: 1.2, fontWeight: 700, textShadow: '0 1px 6px rgba(0,0,0,0.35)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', pointerEvents: 'none' }}>{p.text}</div>
            ) : null}
            <div style={{ position: 'absolute', left: 10, right: 10, top: 10, display: 'flex', alignItems: 'center', gap: 8, color: '#fff', fontSize: 13, fontWeight: 600, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
              <Avatar name={pop.authorId?.params?.displayName} url={pop.authorId?.params?.['profile.avatarUrl']} size={28} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pop.authorId?.params?.displayName}</span>
              <span style={{ opacity: 0.8, fontWeight: 400 }}>{relative(p.createdAt)}</span>
            </div>
          </div>
        </div>
        <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Deleted at={p.deletedAt} />
          <Card>
            <CardTitle>Story</CardTitle>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              <ModerationPill value={p.moderationStatus} />
              <Pill value={p.audience} label={`Audience: ${labelOf(p.audience)}`} />
              {expired ? <Pill tone="grey" label="Expired" /> : <Pill tone="green" label="Live" />}
            </div>
            <Stats>
              <Stat label="Views" value={num(p.viewCount)} />
              <Stat label={expired ? 'Expired' : 'Expires'} value={relative(p.expiresAt)} hint={p.expiresAt ? new Date(p.expiresAt).toLocaleString('vi-VN') : null} />
            </Stats>
            <div style={{ marginTop: 12 }}>
              <Row label="Author"><Person record={pop.authorId} id={p.authorId} /></Row>
              <Row label="Kind">{url ? (/^video\//.test(mime) ? 'Video' : 'Photo') : `Text on ${labelOf(p.background)}`}</Row>
              <Row label="Posted"><When value={p.createdAt} /></Row>
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function GroupView({ record }) {
  const p = record.params; const pop = record.populated || {};
  const rules = objectArrayParam(p, 'rules');
  const questions = arrayParam(p, 'questions');
  return (
    <Page>
      <Card pad={0} style={{ overflow: 'hidden' }}>
        <div style={{ height: 160, background: p.coverUrl ? `center / cover no-repeat url("${p.coverUrl}")` : 'linear-gradient(135deg, #CCE7FF, #E8E6FD)' }} />
        <div style={{ padding: '16px 20px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <div style={{ minWidth: 0, flex: '1 1 260px' }}>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-0.4px' }}>{p.name}</h2>
            <div style={{ marginTop: 4, fontSize: 13, color: T.muted }}>{num(p.memberCount)} members{p.location ? ` · ${p.location}` : ''} · /groups/{p.slug}</div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}><Pill value={p.privacy} /><Pill value={p.visibility} /><Pill tone="blue" label={labelOf(p.groupType)} dot={false} /></div>
        </div>
      </Card>
      <Columns side={<>
        <Card>
          <CardTitle>Settings</CardTitle>
          <Row label="Owner"><Person record={pop.ownerId} id={p.ownerId} /></Row>
          <Row label="Who can post">{labelOf(p['settings.whoCanPost'])}</Row>
          <Row label="Post approval">{p['settings.postApproval'] === true || p['settings.postApproval'] === 'true' ? 'On' : 'Off'}</Row>
          <Row label="Created"><When value={p.createdAt} /></Row>
        </Card>
        <Card><CardTitle>Open</CardTitle><Links><ExternalLink href={`/g/${record.id}`}>Group on Oremus</ExternalLink><ListLink href={listUrl('Post', { groupId: record.id })}>Posts in this group</ListLink></Links></Card>
      </>}>
        <Card>
          <CardTitle>About</CardTitle>
          {p.description ? <p style={{ margin: 0, fontSize: 15, lineHeight: '21px', whiteSpace: 'pre-wrap' }}>{p.description}</p> : <Muted>No description.</Muted>}
          <div style={{ marginTop: 12 }}><Chips items={arrayParam(p, 'tags')} empty="No tags" /></div>
        </Card>
        {rules.length ? (
          <Card>
            <CardTitle>Rules</CardTitle>
            <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>{rules.map((rule, index) => <li key={index}><b>{rule.title}</b>{rule.details ? <div style={{ color: T.muted, fontSize: 14 }}>{rule.details}</div> : null}</li>)}</ol>
          </Card>
        ) : null}
        {questions.length ? <Card><CardTitle>Membership questions</CardTitle><ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>{questions.map((question, index) => <li key={index}>{question}</li>)}</ol></Card> : null}
      </Columns>
    </Page>
  );
}

/* ---------- People ---------- */

function UserView({ record, labels }) {
  const p = record.params;
  const restricted = p.status && p.status !== 'active';
  const strikes = Number(p.strikes || 0);
  const topics = arrayParam(p, 'interests.topics');
  return (
    <Page>
      <Card pad={0} style={{ overflow: 'hidden' }}>
        <div style={{ height: 150, background: p['profile.coverUrl'] ? `center / cover no-repeat url("${p['profile.coverUrl']}")` : 'linear-gradient(135deg, #CCE7FF, #F6E6FB)' }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 16, padding: '0 20px 18px', marginTop: -44 }}>
          <span style={{ borderRadius: 9999, border: '4px solid #fff', display: 'inline-flex' }}><Avatar name={p.displayName} url={p['profile.avatarUrl']} size={96} /></span>
          <div style={{ minWidth: 0, flex: '1 1 240px', paddingBottom: 4 }}>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-0.4px' }}>{p.displayName}</h2>
            <div style={{ fontSize: 14, color: T.muted }}>@{p.username} · {p.email}</div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingBottom: 6 }}>
            <Pill value={p.role} label={labelOf(p.role)} size="md" />
            <Pill value={p.status} size="md" />
            {p.deletedAt ? <Pill value="removed" label="Account deleted" size="md" /> : null}
          </div>
        </div>
        {p['profile.bio'] ? <p style={{ margin: 0, padding: '0 20px 18px', fontSize: 15, lineHeight: '21px', whiteSpace: 'pre-wrap' }}>{p['profile.bio']}</p> : null}
      </Card>
      {restricted ? (
        <Notice tone={p.status === 'banned' ? 'red' : 'orange'} title={p.status === 'banned' ? 'Banned' : `Suspended${p.suspendedUntil ? ` until ${new Date(p.suspendedUntil).toLocaleString('vi-VN')} (${relative(p.suspendedUntil)})` : ''}`}>{p.restrictionReason || 'No reason recorded.'}</Notice>
      ) : null}
      <Columns side={<>
        <Card>
          <CardTitle>Open</CardTitle>
          <Links>
            <ExternalLink href={`/profile/${p.username}`}>Profile on Oremus</ExternalLink>
            <ListLink href={listUrl('Post', { authorId: record.id })}>Posts</ListLink>
            <ListLink href={listUrl('Comment', { authorId: record.id })}>Comments</ListLink>
            <ListLink href={listUrl('Story', { authorId: record.id })}>Stories</ListLink>
            <ListLink href={listUrl('ModerationCase', { authorId: record.id })}>Moderation cases</ListLink>
            <ListLink href={listUrl('Report', { reporterId: record.id })}>Reports they filed</ListLink>
            <ListLink href={listUrl('AdCampaign', { advertiserId: record.id })}>Ad campaigns</ListLink>
          </Links>
        </Card>
      </>}>
        <Card>
          <CardTitle>Standing</CardTitle>
          <Stats>
            <Stat label="Strikes" value={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{strikes}<span style={{ display: 'inline-flex', gap: 3 }}>{[0, 1, 2].map((index) => <span key={index} style={{ width: 10, height: 10, borderRadius: 9999, background: index < strikes ? '#FF383C' : T.line }} />)}</span></span>} tone={strikes >= 3 ? 'red' : strikes ? 'orange' : undefined} />
            <Stat label="Joined" value={relative(p.createdAt)} hint={p.createdAt ? new Date(p.createdAt).toLocaleDateString('vi-VN') : null} />
            <Stat label="Last seen" value={p.lastSeenAt ? relative(p.lastSeenAt) : 'Never'} />
          </Stats>
          <div style={{ marginTop: 12 }}>
            {p['profile.location'] ? <Row label="Lives in">{p['profile.location']}</Row> : null}
            <Row label="Interests">{topics.length ? <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{topics.map((topic) => <span key={topic} style={{ borderRadius: 9999, background: T.field, padding: '4px 10px', fontSize: 13 }}>{labels[topic] || labelOf(topic)}</span>)}</span> : <Muted>Not chosen</Muted>}</Row>
          </div>
        </Card>
      </Columns>
    </Page>
  );
}

/* ---------- Safety ---------- */

function CaseView({ record }) {
  const p = record.params; const pop = record.populated || {};
  const media = arrayParam(p, 'mediaUrls').map((url) => ({ url }));
  const appeal = p['appeal.status'];
  const open = p.status === 'open';
  return (
    <Page>
      <Header
        title={`${labelOf(p.targetType)} flagged by ${p.source === 'ai' ? 'AI' : labelOf(p.source).toLowerCase()}`}
        subtitle={<>Opened {relative(p.createdAt)} · priority {num(p.priority)} · {num(p.reportCount)} reports</>}
        pills={<><Pill value={p.status} label={open ? 'Waiting for review' : p.status === 'upheld' ? 'Content removed' : 'Content kept'} size="md" />{p.autoAction && p.autoAction !== 'none' ? <Pill value={p.autoAction} label={`Auto: ${labelOf(p.autoAction)}`} size="md" /> : null}{appeal && appeal !== 'none' ? <Pill value={appeal} label={`Appeal ${appeal}`} size="md" /> : null}</>}
      />
      <Columns side={<>
        <Card>
          <CardTitle>Why it was flagged</CardTitle>
          <div style={{ marginBottom: 14 }}><Chips items={arrayParam(p, 'categories')} empty="No categories" /></div>
          <Scores scores={objectParam(p, 'scores')} />
          {arrayParam(p, 'models').length ? <div style={{ marginTop: 14, fontSize: 12, color: T.muted }}>Models: {arrayParam(p, 'models').join(', ')}</div> : null}
        </Card>
        <Card>
          <CardTitle>Decision</CardTitle>
          {open ? <Muted>No decision yet. Use Remove content or Keep content above.</Muted> : <>
            <Row label="By"><Person record={pop.decidedBy} id={p.decidedBy} /></Row>
            <Row label="When"><When value={p.decidedAt} /></Row>
            <Row label="Note">{p.decisionNote || <Muted>—</Muted>}</Row>
          </>}
        </Card>
      </>}>
        <Card>
          <CardTitle right={linkable(p.targetType) ? <RecordLink resourceId={p.targetType} id={p.targetId}>Open {labelOf(p.targetType).toLowerCase()}</RecordLink> : null}>Content</CardTitle>
          <div style={{ marginBottom: 12 }}><Person record={pop.authorId} id={p.authorId} size={36} /></div>
          {p.snippet ? <Quote>{p.snippet}</Quote> : <Muted>No text was captured.</Muted>}
          {media.length ? <div style={{ marginTop: 12 }}><MediaGrid items={media} /></div> : null}
          <div style={{ marginTop: 10, fontSize: 12, color: T.muted }}>A copy taken when the case opened, so it stays readable even if the original was edited or removed.</div>
        </Card>
        {appeal && appeal !== 'none' ? (
          <Card>
            <CardTitle right={<Pill value={appeal} />}>Appeal</CardTitle>
            {p['appeal.message'] ? <Quote>{p['appeal.message']}</Quote> : <Muted>No message.</Muted>}
            <div style={{ marginTop: 10 }}>
              <Row label="Sent"><When value={p['appeal.at']} /></Row>
              {p['appeal.decidedAt'] ? <Row label="Decided"><When value={p['appeal.decidedAt']} /></Row> : null}
              {p['appeal.note'] ? <Row label="Note">{p['appeal.note']}</Row> : null}
            </div>
          </Card>
        ) : null}
      </Columns>
    </Page>
  );
}

function ReportView({ record }) {
  const p = record.params; const pop = record.populated || {};
  return (
    <Page>
      <Header title={`${labelOf(p.reason)} report on a ${labelOf(p.targetType).toLowerCase()}`} subtitle={`Filed ${relative(p.createdAt)}`} pills={<><Pill value={p.reason} size="md" /><Pill value={p.status} size="md" /></>} />
      <Columns side={<Card>
        <CardTitle>Linked</CardTitle>
        <Row label="Reported">{linkable(p.targetType) ? <RecordLink resourceId={p.targetType} id={p.targetId}>Open {labelOf(p.targetType).toLowerCase()}</RecordLink> : <Mono>{p.targetId}</Mono>}</Row>
        <Row label="Case">{p.caseId ? <RecordLink resourceId="ModerationCase" id={p.caseId}>Open moderation case</RecordLink> : <Muted>Not linked</Muted>}</Row>
        <Row label="Filed"><When value={p.createdAt} /></Row>
      </Card>}>
        <Card>
          <CardTitle>Reporter</CardTitle>
          <Person record={pop.reporterId} id={p.reporterId} size={40} />
          <div style={{ marginTop: 14 }}>{p.note ? <Quote>{p.note}</Quote> : <Muted>They didn't add a note.</Muted>}</div>
        </Card>
      </Columns>
    </Page>
  );
}

function ScanView({ record }) {
  const p = record.params; const pop = record.populated || {};
  return (
    <Page>
      <Header title={`${labelOf(p.decision)} · ${labelOf(p.targetType)}`} subtitle={`Scanned ${relative(p.createdAt)}`} pills={<><Pill value={p.decision} size="md" />{p.shadow === true || p.shadow === 'true' ? <Pill tone="purple" label="Shadow mode (no effect)" size="md" /> : null}</>} />
      <Columns side={<Card>
        <CardTitle>Context</CardTitle>
        <Row label="Content">{linkable(p.targetType) ? <RecordLink resourceId={p.targetType} id={p.targetId}>Open {labelOf(p.targetType).toLowerCase()}</RecordLink> : <Mono>{p.targetId}</Mono>}</Row>
        <Row label="Author"><Person record={pop.authorId} id={p.authorId} /></Row>
        <Row label="Categories"><Chips items={arrayParam(p, 'categories')} /></Row>
        <Row label="Rule matches"><Chips items={arrayParam(p, 'ruleMatches')} /></Row>
        <Row label="Models"><Chips items={arrayParam(p, 'models')} /></Row>
      </Card>}>
        <Card><CardTitle>Scores</CardTitle><Scores scores={objectParam(p, 'scores')} /></Card>
      </Columns>
    </Page>
  );
}

function PolicyView({ record }) {
  const p = record.params;
  const review = Number(p.review || 0); const block = Number(p.block || 0);
  const auto = p.autoRemove === true || p.autoRemove === 'true';
  const pct = (value) => `${Math.round(value * 100)}%`;
  return (
    <Page>
      <Header title={labelOf(p.category)} subtitle="What happens as the model gets more certain" pills={<Pill tone={auto ? 'red' : 'grey'} label={auto ? 'Auto-remove on' : 'Auto-remove off'} size="md" />} />
      <Card>
        <CardTitle>Thresholds</CardTitle>
        <div style={{ position: 'relative', height: 18, borderRadius: 9999, overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: pct(review), background: '#D9F2E3' }} />
          <div style={{ width: pct(Math.max(0, block - review)), background: '#FFE7C7' }} />
          <div style={{ flex: 1, background: '#FFD4D6' }} />
        </div>
        <div style={{ position: 'relative', height: 34, fontSize: 12, color: T.muted }}>
          <span style={{ position: 'absolute', left: pct(review), transform: 'translateX(-50%)', textAlign: 'center' }}>▲<br />Review {pct(review)}</span>
          <span style={{ position: 'absolute', left: pct(block), transform: 'translateX(-50%)', textAlign: 'center' }}>▲<br />Block {pct(block)}</span>
        </div>
        <Stats>
          <Stat label={`Below ${pct(review)}`} value="Allowed" tone="green" />
          <Stat label={`${pct(review)} – ${pct(block)}`} value="Sent to review" tone="orange" />
          <Stat label={`${pct(block)} and up`} value={auto ? 'Removed' : 'Reach limited'} tone="red" hint={auto ? null : 'A person decides on removal'} />
        </Stats>
      </Card>
    </Page>
  );
}

function CallView({ record }) {
  const p = record.params; const pop = record.populated || {};
  const talk = p.answeredAt && p.endedAt ? new Date(p.endedAt) - new Date(p.answeredAt) : 0;
  const ring = p.answeredAt ? new Date(p.answeredAt) - new Date(p.createdAt) : 0;
  return (
    <Page>
      <Card style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
        <Person record={pop.callerId} id={p.callerId} size={44} />
        <span aria-hidden="true" style={{ fontSize: 22, color: T.muted }}>{p.kind === 'video' ? '🎥' : '📞'} →</span>
        <Person record={pop.calleeId} id={p.calleeId} size={44} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}><Pill value={p.kind} size="md" /><Pill value={p.status} size="md" /></div>
      </Card>
      <Card>
        <Stats>
          <Stat label="Talk time" value={duration(talk)} />
          <Stat label="Ringing" value={duration(ring)} />
          <Stat label="Started" value={relative(p.createdAt)} hint={p.createdAt ? new Date(p.createdAt).toLocaleString('vi-VN') : null} />
        </Stats>
        <div style={{ marginTop: 12 }}>
          <Row label="End reason">{p.endReason ? labelOf(p.endReason) : <Muted>—</Muted>}</Row>
          <Row label="Ended"><When value={p.endedAt} /></Row>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: T.muted }}>Calls are never recorded. This is only who called whom and how it went.</div>
      </Card>
    </Page>
  );
}

function AuditView({ record }) {
  const p = record.params; const pop = record.populated || {};
  const meta = Object.entries(objectParam(p, 'metadata')).filter(([, value]) => value !== '' && value !== null && value !== undefined);
  return (
    <Page>
      <Header title={<Mono>{p.action}</Mono>} subtitle={<When value={p.createdAt} />} />
      <Columns side={<Card>
        <CardTitle>Target</CardTitle>
        <Row label="Type">{p.targetType || <Muted>—</Muted>}</Row>
        <Row label="Record">{p.targetId ? (linkable(p.targetType) ? <RecordLink resourceId={p.targetType} id={p.targetId}>Open {labelOf(p.targetType).toLowerCase()}</RecordLink> : <Mono>{p.targetId}</Mono>) : <Muted>—</Muted>}</Row>
        <Row label="IP">{p.ip ? <Mono>{p.ip}</Mono> : <Muted>—</Muted>}</Row>
      </Card>}>
        <Card>
          <CardTitle>Who</CardTitle>
          {p.actorId ? <Person record={pop.actorId} id={p.actorId} size={40} /> : <Pill tone="grey" label="System" />}
        </Card>
        <Card>
          <CardTitle>Details</CardTitle>
          {meta.length ? meta.map(([key, value]) => <Row key={key} label={labelOf(key.replace(/\./g, ' › '))}>{String(value)}</Row>) : <Muted>No extra details.</Muted>}
        </Card>
      </Columns>
    </Page>
  );
}

/* ---------- Money ---------- */

function Amount({ value, signed }) {
  const n = Number(value || 0);
  return <span style={{ fontSize: 34, lineHeight: '40px', fontWeight: 700, letterSpacing: '-0.6px', fontVariantNumeric: 'tabular-nums', color: signed ? (n < 0 ? '#D70015' : '#1E7A35') : T.ink }}>{signed ? signedVnd(n) : vnd(n)}</span>;
}

function AccountView({ record }) {
  const p = record.params; const pop = record.populated || {};
  return (
    <Page>
      <Card>
        <div style={{ fontSize: 13, color: T.muted }}>Wallet balance</div>
        <Amount value={p.balance} />
        <div style={{ marginTop: 14 }}><Person record={pop.userId} id={p.userId} size={40} /></div>
        <div style={{ marginTop: 8, fontSize: 12, color: T.muted }}>Updated {relative(p.updatedAt)}</div>
      </Card>
      <Card>
        <CardTitle>History</CardTitle>
        <Links>
          <ListLink href={listUrl('LedgerEntry', { userId: p.userId })}>Ledger</ListLink>
          <ListLink href={listUrl('PaymentOrder', { userId: p.userId })}>Payments</ListLink>
          <ListLink href={listUrl('AdCampaign', { advertiserId: p.userId })}>Campaigns</ListLink>
        </Links>
      </Card>
    </Page>
  );
}

function LedgerView({ record }) {
  const p = record.params; const pop = record.populated || {};
  return (
    <Page>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><Pill value={p.type} size="md" /><Muted>{relative(p.createdAt)}</Muted></div>
        <div style={{ marginTop: 8 }}><Amount value={p.amount} signed /></div>
        <div style={{ fontSize: 14, color: T.muted }}>Balance after: {p.balanceAfter === null || p.balanceAfter === undefined || p.balanceAfter === '' ? 'not applied yet' : vnd(p.balanceAfter)}</div>
      </Card>
      <Card>
        <Row label="Wallet of"><Person record={pop.userId} id={p.userId} /></Row>
        <Row label="Done by">{p.actorId ? <Person record={pop.actorId} id={p.actorId} /> : <Muted>System</Muted>}</Row>
        <Row label="Note">{p.note || <Muted>—</Muted>}</Row>
        <Row label="For">{p.refId ? (linkable(p.refType) ? <RecordLink resourceId={p.refType} id={p.refId}>{labelOf(p.refType)}</RecordLink> : <>{p.refType} <Mono>{p.refId}</Mono></>) : <Muted>—</Muted>}</Row>
        <Row label="When"><When value={p.createdAt} /></Row>
      </Card>
    </Page>
  );
}

function PaymentView({ record }) {
  const p = record.params; const pop = record.populated || {};
  return (
    <Page>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><Pill value={p.status} size="md" /><Pill tone="blue" label={String(p.provider || '').toUpperCase()} dot={false} /></div>
        <div style={{ marginTop: 8 }}><Amount value={p.amount} /></div>
        <div style={{ marginTop: 12 }}><Person record={pop.userId} id={p.userId} size={36} /></div>
      </Card>
      <Card>
        <Row label="Order ref"><Mono>{p.txnRef}</Mono></Row>
        <Row label="Provider txn">{p.providerTxn ? <Mono>{p.providerTxn}</Mono> : <Muted>—</Muted>}</Row>
        <Row label="Provider code">{p.providerCode ? <Mono>{p.providerCode}</Mono> : <Muted>—</Muted>}</Row>
        <Row label="Created"><When value={p.createdAt} /></Row>
        <Row label="Paid"><When value={p.paidAt} empty="Not paid" /></Row>
      </Card>
    </Page>
  );
}

const VIEWS = { post: PostView, comment: CommentView, story: StoryView, group: GroupView, user: UserView, case: CaseView, report: ReportView, scan: ScanView, policy: PolicyView, call: CallView, audit: AuditView, account: AccountView, ledger: LedgerView, payment: PaymentView };

export default function RecordShow(props) {
  const { record, resource, action } = props;
  const custom = action?.custom || {};
  if (!record) return null;
  const View = VIEWS[custom.kind];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {custom.kind === 'campaign' ? <CampaignShow {...props} /> : View ? <View record={record} labels={custom.topicLabels || {}} /> : null}
      <AllFields resource={resource} record={record} money={custom.money || []} hide={custom.hide || []} open={!View && custom.kind !== 'campaign'} />
    </div>
  );
}
