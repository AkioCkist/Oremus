/**
 * The synchronous first layer of content moderation: fast, explainable and deliberately narrow.
 *
 * - `block` refuses the write outright, so it only holds phrases with no innocent reading (direct threats).
 * - `flag` never blocks. It sends the content to a person even if the AI model is unsure.
 *
 * Vietnamese needs care: stripping diacritics turns many insults into everyday words ("lồn" and "lon", a can),
 * so terms are matched as written, and only terms listed in ASCII also catch the unaccented spelling.
 */
export type RuleCategory = 'hate' | 'harassment' | 'sexual' | 'violence' | 'self_harm' | 'spam';
export type RuleResult = { verdict: 'ok' | 'flag' | 'block'; categories: RuleCategory[]; matches: string[] };

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };

/** Lowercase, undo look-alike digits inside words, and collapse "quaaaa" and "n g u" style stretching. */
export function normalizeText(text: string): string {
  return text.normalize('NFC').toLowerCase()
    .replace(/(?<=\p{L})[013457@$](?=\p{L})/gu, (char) => LEET[char] ?? char)
    .replace(/(\p{L})\1{2,}/gu, '$1')
    // \b only understands ASCII, which would split words at every Vietnamese letter.
    .replace(/(?<![\p{L}\p{N}])\p{L}(?:[ .\-_*]\p{L}(?![\p{L}\p{N}])){2,}/gu, (match) => match.replace(/[ .\-_*]/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

const stripMarks = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');

type Rule = { term: string; category: RuleCategory };

// Direct threats and incitement to self-harm, in Vietnamese with and without diacritics, and in English.
const BLOCK: Rule[] = [
  ...['tao sẽ giết mày', 'tao giết mày', 'tao giet may', 'tao se giet may', 'giết cả nhà mày', 'giet ca nha may', 'tao đâm chết mày', 'tao dam chet may', 'i will kill you', "i'll kill you"]
    .map((term): Rule => ({ term, category: 'violence' })),
  ...['mày đi chết đi', 'may di chet di', 'tự tử đi', 'tu tu di', 'kill yourself', 'go kill yourself']
    .map((term): Rule => ({ term, category: 'self_harm' }))
];

const FLAG: Rule[] = [
  // Profanity, most often aimed at someone. Accented forms only where the bare spelling is an ordinary word.
  ...['đm', 'dm', 'đmm', 'dmm', 'dcm', 'đcm', 'cmm', 'clm', 'vcl', 'vkl', 'vãi lồn', 'vai lon', 'địt', 'đụ', 'đéo', 'lồn', 'cặc', 'óc chó', 'oc cho', 'thằng chó', 'con chó này', 'đồ chó', 'súc vật', 'suc vat', 'fuck you', 'bitch', 'asshole', 'motherfucker']
    .map((term): Rule => ({ term, category: 'harassment' })),
  ...['mọi rợ', 'bắc kỳ', 'bac ky cho', 'nam kỳ', 'tàu khựa', 'tau khua', 'đồ pê đê', 'bọn đồng tính', 'nigger', 'faggot']
    .map((term): Rule => ({ term, category: 'hate' })),
  ...['ấu dâm', 'au dam', 'ảnh nóng trẻ em', 'clip sex', 'bán dâm', 'mua dâm', 'gái gọi']
    .map((term): Rule => ({ term, category: 'sexual' })),
  ...['nhận thưởng ngay', 'nhan thuong ngay', 'kiếm tiền online', 'vay tiền online', 'lãi suất 0%', 'click vào link', 'free crypto', 'double your bitcoin']
    .map((term): Rule => ({ term, category: 'spam' }))
];

const LINK = /https?:\/\/|www\./gi;
const MAX_LINKS = 4;

/** Whole-word search that understands Vietnamese letters, which \b does not. */
function contains(haystack: string, term: string): boolean {
  let from = 0;
  while (true) {
    const index = haystack.indexOf(term, from);
    if (index === -1) return false;
    const before = haystack[index - 1], after = haystack[index + term.length];
    if (!(before && /[\p{L}\p{N}]/u.test(before)) && !(after && /[\p{L}\p{N}]/u.test(after))) return true;
    from = index + 1;
  }
}

/** ASCII terms should also catch text written with diacritics. Accented terms stay exact on purpose. */
function matches(rule: Rule, normalized: string, stripped: string): boolean {
  return contains(normalized, rule.term) || (stripMarks(rule.term) === rule.term && contains(stripped, rule.term));
}

export function checkRules(text: string): RuleResult {
  const normalized = normalizeText(text);
  if (!normalized) return { verdict: 'ok', categories: [], matches: [] };
  const stripped = stripMarks(normalized);
  const blocked = BLOCK.filter((rule) => matches(rule, normalized, stripped));
  if (blocked.length) return { verdict: 'block', categories: [...new Set(blocked.map((rule) => rule.category))], matches: blocked.map((rule) => rule.term) };
  const flagged = FLAG.filter((rule) => matches(rule, normalized, stripped));
  const categories = new Set(flagged.map((rule) => rule.category));
  const terms = flagged.map((rule) => rule.term);
  if ((text.match(LINK) || []).length > MAX_LINKS) { categories.add('spam'); terms.push('many links'); }
  return { verdict: categories.size ? 'flag' : 'ok', categories: [...categories], matches: terms };
}
