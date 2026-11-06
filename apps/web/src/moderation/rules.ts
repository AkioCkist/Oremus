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
    // Look-alike digits count as letters inside a spaced-out run too ("g i 3 t").
    .replace(/(?<![\p{L}\p{N}])\p{L}(?:[ .\-_*]+[\p{L}013457@$](?![\p{L}\p{N}])){2,}/gu,
      (match) => match.replace(/[ .\-_*]/g, '').replace(/[013457@$]/g, (char) => LEET[char] ?? char))
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

type Compact = { letters: string; bounds: Set<number> };
const MIN_JOINED = 5;

/**
 * The text as one run of letters, remembering where each word started and ended. Matching against it ignores how
 * a phrase is spaced ("t a o g i e t m a y", "taogiet may") but still only matches whole words, because a match must
 * begin and end on a word edge: "admin dmitri" never contains "dm".
 */
function compact(text: string): Compact {
  const bounds = new Set<number>([0]);
  let letters = '';
  for (const word of text.split(/[^\p{L}\p{N}]+/u)) {
    if (!word) continue;
    letters += word;
    bounds.add(letters.length);
  }
  return { letters, bounds };
}

function contains(haystack: Compact, term: string): boolean {
  const needle = term.replace(/[^\p{L}\p{N}]+/gu, '');
  if (!needle) return false;
  for (let index = haystack.letters.indexOf(needle); index !== -1; index = haystack.letters.indexOf(needle, index + 1)) {
    if (!haystack.bounds.has(index) || !haystack.bounds.has(index + needle.length)) continue;
    // Short terms like "dm" only match a whole word: joining "D, M" or "đ m" would catch too much ordinary text.
    if (needle.length >= MIN_JOINED || !Array.from({ length: needle.length - 1 }, (_, offset) => index + offset + 1).some((edge) => haystack.bounds.has(edge))) return true;
  }
  return false;
}

/** ASCII terms should also catch text written with diacritics. Accented terms stay exact on purpose. */
function matches(rule: Rule, normalized: Compact, stripped: Compact): boolean {
  return contains(normalized, rule.term) || (stripMarks(rule.term) === rule.term && contains(stripped, rule.term));
}

export function checkRules(text: string): RuleResult {
  const normalized = normalizeText(text);
  if (!normalized) return { verdict: 'ok', categories: [], matches: [] };
  const words = compact(normalized), stripped = compact(stripMarks(normalized));
  const blocked = BLOCK.filter((rule) => matches(rule, words, stripped));
  if (blocked.length) return { verdict: 'block', categories: [...new Set(blocked.map((rule) => rule.category))], matches: blocked.map((rule) => rule.term) };
  const flagged = FLAG.filter((rule) => matches(rule, words, stripped));
  const categories = new Set(flagged.map((rule) => rule.category));
  const terms = flagged.map((rule) => rule.term);
  if ((text.match(LINK) || []).length > MAX_LINKS) { categories.add('spam'); terms.push('many links'); }
  return { verdict: categories.size ? 'flag' : 'ok', categories: [...categories], matches: terms };
}
