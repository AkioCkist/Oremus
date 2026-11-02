import { describe, expect, it } from 'vitest';
import { checkRules, normalizeText } from '../moderation/rules.js';
import { DISCOVERABLE, isClosedToOthers, visibleToViewer } from '../moderation/visibility.js';
import { accountRestriction } from '../services/permissions.js';
import { decide } from '../services/moderation.service.js';

describe('rule layer', () => {
  it('blocks direct threats, with or without diacritics', () => {
    expect(checkRules('Tao sẽ giết mày').verdict).toBe('block');
    expect(checkRules('tao se giet may nha').verdict).toBe('block');
    expect(checkRules('I will kill you').verdict).toBe('block');
  });

  it('only flags profanity, never blocks it', () => {
    expect(checkRules('đm thằng này').verdict).toBe('flag');
    expect(checkRules('vcl thật').categories).toContain('harassment');
  });

  it('leaves everyday words that collide with insults alone', () => {
    for (const text of ['Uống một lon bia cho mát', 'Con chó nhà mình rất ngoan', 'Giết thời gian trên xe buýt', 'Tôi sẽ đi học vào ngày mai']) {
      expect(checkRules(text).verdict, text).toBe('ok');
    }
  });

  it('does not match inside longer words', () => {
    expect(checkRules('admin dmitri vclass').verdict).toBe('ok');
  });

  it('sees through stretched and spaced-out spelling', () => {
    expect(normalizeText('Quaaaaa')).toBe('qua');
    expect(checkRules('v c l').verdict).toBe('flag');
    expect(checkRules('f4ck').verdict).toBe('ok');
    expect(checkRules('b1tch').verdict).toBe('flag');
  });

  it('flags posts stuffed with links as spam', () => {
    const result = checkRules('https://a.co https://b.co https://c.co https://d.co https://e.co');
    expect(result.categories).toContain('spam');
  });

  it('accepts empty text', () => {
    expect(checkRules('   ').verdict).toBe('ok');
  });
});

describe('policy decisions', () => {
  const policy = [
    { category: 'hate', review: 0.5, block: 0.9, autoRemove: true },
    { category: 'harassment', review: 0.6, block: 0.95, autoRemove: false }
  ];

  it('approves scores under every review threshold', () => {
    expect(decide({ hate: 0.4, harassment: 0.59 }, policy)).toEqual({ decision: 'approved', categories: [] });
  });

  it('limits reach between the thresholds', () => {
    expect(decide({ hate: 0.7 }, policy)).toEqual({ decision: 'limited', categories: ['hate'] });
  });

  it('removes only where the category allows it', () => {
    expect(decide({ hate: 0.95 }, policy).decision).toBe('removed');
    expect(decide({ harassment: 0.99 }, policy).decision).toBe('limited');
  });

  it('keeps the harsher outcome across categories', () => {
    expect(decide({ harassment: 0.7, hate: 0.95 }, policy).decision).toBe('removed');
  });

  it('ignores scores without a policy row', () => {
    expect(decide({ unknown: 1 }, policy).decision).toBe('approved');
  });
});

describe('visibility', () => {
  it('treats content from before moderation as visible', () => {
    expect(isClosedToOthers(undefined)).toBe(false);
    expect(DISCOVERABLE.moderationStatus.$nin).not.toContain('approved');
    expect(DISCOVERABLE.moderationStatus.$nin).not.toContain('pending');
  });

  it('closes held and removed content to other people, not limited', () => {
    expect(isClosedToOthers('held')).toBe(true);
    expect(isClosedToOthers('removed')).toBe(true);
    expect(isClosedToOthers('limited')).toBe(false);
  });

  it('lets authors see their own held content but never removed', () => {
    const filter: any = visibleToViewer('me');
    expect(filter.$and[0].$or[0]).toEqual({ authorId: 'me', moderationStatus: { $ne: 'removed' } });
  });

  it('gives guests the discoverable filter', () => {
    expect(visibleToViewer(undefined)).toBe(DISCOVERABLE);
  });
});

describe('account restrictions', () => {
  it('treats accounts from before this field as active', () => {
    expect(accountRestriction({})).toBeNull();
  });

  it('blocks banned accounts for good', () => {
    expect(accountRestriction({ status: 'banned' })).toBe('banned');
  });

  it('lets a suspension lapse by itself', () => {
    expect(accountRestriction({ status: 'suspended', suspendedUntil: new Date(Date.now() + 60_000) })).toBe('suspended');
    expect(accountRestriction({ status: 'suspended', suspendedUntil: new Date(Date.now() - 60_000) })).toBeNull();
  });
});
