/**
 * What each moderation status means for readers. A missing status means "approved": everything written before
 * moderation existed has none, which is why these filters exclude bad states instead of listing good ones.
 *
 * pending   text waiting for its scan; visible, because most scans finish within seconds
 * held      media waiting for its scan; only the author sees it
 * approved  scanned or reviewed, nothing wrong
 * limited   a person should look; opens by direct link, but stays out of feeds, suggestions and search
 * removed   only the author and staff can see it
 */
export const DISCOVERABLE = { moderationStatus: { $nin: ['held', 'limited', 'removed'] } };

/** Hidden even from someone holding a direct link. */
export const isClosedToOthers = (status?: string | null) => status === 'held' || status === 'removed';

/** Filter for lists mixing the viewer's own content with other people's. Wrapped in $and so it can sit next to a cursor's $or. */
export function visibleToViewer(viewerId: unknown, authorField = 'authorId') {
  if (!viewerId) return DISCOVERABLE;
  return { $and: [{ $or: [{ [authorField]: viewerId, moderationStatus: { $ne: 'removed' } }, DISCOVERABLE] }] };
}
