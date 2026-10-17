/**
 * Text analysis for the recommender: turns English and Vietnamese text into weighted feature vectors.
 *
 * - Tokens are folded (lowercase, no diacritics: "cà phê" → "ca phe"), so searches typed without accents
 *   still match. Adjacent words also form bigrams ("ca_phe", "street_food"), which carry most of the
 *   meaning in Vietnamese where every syllable is its own word.
 * - A small topic lexicon adds "#topic" features, so "egg coffee", "cà phê trứng" and "barista" all land
 *   near each other even when they share no exact word.
 * - Vectors use sublinear term frequency and are L2-normalised; IDF is applied later over the corpus.
 */

export type Vector = Map<string, number>;
export type Feature = { t: string; w: number; s?: string };
/** A piece of text with how much it counts (a group's tags matter more than its location). */
export type WeightedText = [text: string | null | undefined, weight: number];

const TOPIC_PREFIX = '#';
const MAX_TEXT = 6000;

const STOPWORDS = new Set([
  // English
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'about', 'from', 'up', 'down', 'out', 'over', 'into',
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'it', 'its', 'this', 'that', 'these', 'those', 'there', 'here', 'than', 'then', 'so', 'too',
  'very', 'just', 'not', 'no', 'yes', 'do', 'does', 'did', 'done', 'have', 'has', 'had', 'having', 'will', 'would', 'can', 'could', 'should', 'may', 'might',
  'must', 'shall', 'i', 'me', 'my', 'mine', 'we', 'us', 'our', 'you', 'your', 'yours', 'he', 'him', 'his', 'she', 'her', 'hers', 'they', 'them', 'their',
  'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'only',
  'own', 'same', 'again', 'once', 'also', 'still', 'even', 'ever', 'every', 'much', 'many', 'one', 'two', 'three', 'get', 'got', 'make', 'made', 'like',
  'really', 'now', 'today', 'tonight', 'tomorrow', 'week', 'day', 'days', 'time', 'new', 'first', 'last', 'next', 'back', 'after', 'before', 'while',
  'im', 've', 'll', 're', 'don', 'didn', 'doesn', 'isn', 'wasn', 'aren', 'won', 'let', 'lets', 'via', 'per', 'anyone', 'everyone', 'someone', 'thing',
  'things', 'way', 'lot', 'bit', 'little', 'big', 'good', 'great', 'best', 'better', 'love', 'want', 'need', 'know', 'think', 'see', 'look', 'going',
  'come', 'take', 'said', 'say', 'well', 'never', 'always', 'though', 'because', 'around', 'off', 'into', 'onto', 'between', 'during', 'without',
  'feeling', 'officially', 'finally', 'actually', 'literally', 'probably', 'maybe', 'definitely', 'honestly', 'already', 'almost', 'enough',
  // Vietnamese (folded)
  'va', 'la', 'cua', 'co', 'cho', 'nhung', 'mot', 'cac', 'nay', 'do', 'thi', 'se', 'dang', 'voi', 'trong', 'khi', 'nhu', 'de', 'ma', 'o', 'ra',
  'vao', 'len', 'xuong', 'duoc', 'bi', 'rat', 'qua', 'lam', 'nhieu', 'it', 'hon', 'nhat', 'cung', 'van', 'con', 'roi', 'nua', 'thoi', 'nha', 'nhe',
  'a', 'oi', 'ha', 'ne', 'day', 'kia', 'ay', 'gi', 'nao', 'sao', 'ai', 'toi', 'minh', 'ban', 'anh', 'chi', 'em', 'chung', 'ho', 'no', 'tu', 'den',
  'tai', 'vi', 'neu', 'nen', 'hay', 'hoac', 'khong', 'chua', 'het', 'moi', 'tung', 'luc', 'ngay', 'hom', 'sang', 'toi', 'nam', 'thang', 'gio', 'mai',
  'vay', 'the', 'thay', 'biet', 'muon', 'can', 'phai', 've', 'theo', 'tren', 'duoi', 'sau', 'truoc', 'giua', 'ngoai', 'cai', 'chiec', 'nguoi', 'moi'
]);

/** Lowercase without Vietnamese/Latin diacritics. */
export function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

/** Light English plural stemming; leaves Vietnamese syllables and short words alone. */
function stem(token: string): string {
  if (token.length <= 4 || !/^[a-z]+$/.test(token)) return token;
  if (token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.endsWith('sses')) return token.slice(0, -2);
  if (token.endsWith('s') && !/(ss|us|is|os)$/.test(token)) return token.slice(0, -1);
  return token;
}

type Token = { t: string; s: string };

/** Sentences of a text (split at punctuation), each as folded+stemmed words with their readable form. */
function sentences(text: string): Array<Array<{ t: string; s: string; ai: boolean }>> {
  const clean = text.slice(0, MAX_TEXT).normalize('NFC').replace(/https?:\/\/\S+/g, ' ').replace(/[@#](?=\p{L})/gu, ' ');
  return clean.split(/[.!?;:,\n\r()[\]{}"“”…|/]+/).map((segment) => segment.split(/[^\p{L}\p{N}]+/u).filter(Boolean).map((original) => {
    const surface = original.toLowerCase();
    // Upper-case "AI" is the technology; lower-case "ai" is the Vietnamese "who" (a stopword).
    return { t: stem(fold(surface)), s: original === 'AI' ? 'AI' : surface, ai: original === 'AI' };
  })).filter((words) => words.length);
}

/**
 * Content words of a text. Stopwords and punctuation leave a gap (null) so bigrams never join words across them.
 */
function words(text: string): Array<Token | null> {
  const out: Array<Token | null> = [];
  for (const sentence of sentences(text)) {
    for (const word of sentence) {
      if (word.ai) { out.push({ t: 'ai', s: 'AI' }); continue; }
      out.push(word.t.length < 2 || word.t.length > 30 || /^\d+$/.test(word.t) || STOPWORDS.has(word.t) ? null : { t: word.t, s: word.s });
    }
    out.push(null);
  }
  return out;
}

/** Unigrams plus bigrams of neighbouring content words. */
export function tokenize(text: string): Token[] {
  const list = words(text);
  const tokens: Token[] = [];
  list.forEach((token, index) => {
    if (!token) return;
    tokens.push(token);
    const next = list[index + 1];
    if (next) tokens.push({ t: `${token.t}_${next.t}`, s: `${token.s} ${next.s}` });
  });
  return tokens;
}

/* ---------- Topics ---------- */

export const TOPICS: Record<string, { label: string; terms: string[] }> = {
  coffee: { label: 'Coffee', terms: ['coffee', 'cafe', 'café', 'espresso', 'latte', 'cappuccino', 'barista', 'brew', 'brewing', 'roast', 'roaster', 'arabica', 'robusta', 'cupping', 'flat white', 'pour over', 'cold brew', 'cà phê', 'cà phê trứng', 'cà phê muối', 'egg coffee', 'salt coffee', 'quán cà phê', 'beans'] },
  food: { label: 'Food & cooking', terms: ['food', 'cook', 'cooking', 'recipe', 'chef', 'dish', 'meal', 'restaurant', 'kitchen', 'street food', 'bánh mì', 'phở', 'noodle', 'noodles', 'món ăn', 'nấu ăn', 'ẩm thực', 'dinner', 'lunch', 'breakfast', 'soup', 'menu', 'tasty', 'delicious', 'vegan', 'vegetarian', 'tofu', 'bún', 'market'] },
  baking: { label: 'Baking', terms: ['bake', 'baking', 'baker', 'bakery', 'bread', 'sourdough', 'pastry', 'croissant', 'cake', 'cookie', 'cookies', 'oven', 'dough', 'flour', 'bánh ngọt', 'làm bánh'] },
  travel: { label: 'Travel', terms: ['travel', 'trip', 'journey', 'backpack', 'backpacking', 'island', 'flight', 'passport', 'tour', 'hostel', 'itinerary', 'du lịch', 'phượt', 'road trip', 'countries', 'abroad', 'train', 'loop', 'beach', 'resort'] },
  hiking: { label: 'Hiking & outdoors', terms: ['hike', 'hiking', 'hiker', 'trek', 'trekking', 'trail', 'mountain', 'summit', 'peak', 'camping', 'camp', 'tent', 'waterfall', 'forest', 'outdoor', 'outdoors', 'leo núi', 'cắm trại', 'backcountry', 'campfire'] },
  running: { label: 'Running', terms: ['run', 'running', 'runner', 'marathon', 'half marathon', 'ultra', 'race', 'pace', 'trail run', 'trail running', 'chạy bộ', '5k', '10k', '21k', '42k', 'strava', 'intervals'] },
  cycling: { label: 'Cycling', terms: ['cycling', 'cyclist', 'bicycle', 'bike ride', 'road bike', 'gravel', 'peloton', 'xe đạp', 'đạp xe', 'ride'] },
  football: { label: 'Football', terms: ['football', 'soccer', 'match', 'goal', 'goals', 'striker', 'defender', 'penalty', 'league', 'coach', 'bóng đá', 'futsal', 'five a side', 'world cup', 'premier league'] },
  fitness: { label: 'Fitness & wellness', terms: ['gym', 'workout', 'fitness', 'yoga', 'pilates', 'meditation', 'mindfulness', 'stretching', 'strength', 'squat', 'deadlift', 'wellness', 'breathwork', 'tập gym', 'thiền', 'sức khỏe', 'healthy'] },
  pets: { label: 'Pets', terms: ['dog', 'dogs', 'puppy', 'cat', 'cats', 'kitten', 'pet', 'pets', 'pug', 'corgi', 'shiba', 'vet', 'adopt', 'adoption', 'rescue', 'thú cưng', 'con mèo', 'con chó', 'chó', 'mèo'] },
  gardening: { label: 'Gardening & plants', terms: ['garden', 'gardening', 'gardener', 'plant', 'plants', 'balcony', 'compost', 'composting', 'seedling', 'seedlings', 'basil', 'herb', 'herbs', 'flower', 'flowers', 'florist', 'cactus', 'succulent', 'soil', 'harvest', 'làm vườn', 'cây cảnh', 'trồng cây'] },
  wildlife: { label: 'Wildlife & nature', terms: ['wildlife', 'safari', 'lion', 'lioness', 'elephant', 'bird', 'birds', 'birding', 'reserve', 'animal', 'animals', 'whale', 'turtle', 'nature', 'aurora', 'thiên nhiên'] },
  ocean: { label: 'Diving & ocean', terms: ['dive', 'diving', 'diver', 'scuba', 'snorkel', 'snorkeling', 'freediving', 'reef', 'coral', 'ocean', 'sea', 'surf', 'surfing', 'lặn biển', 'biển', 'island hopping'] },
  photography: { label: 'Photography', terms: ['photo', 'photos', 'photography', 'photographer', 'camera', 'lens', 'shutter', 'aperture', 'film camera', 'street photography', 'portrait', 'darkroom', 'chụp ảnh', 'nhiếp ảnh', 'fujifilm', 'leica', 'frames', 'exposure'] },
  music: { label: 'Music', terms: ['music', 'song', 'songs', 'album', 'vinyl', 'jazz', 'piano', 'guitar', 'violin', 'concert', 'gig', 'band', 'producer', 'recording', 'playlist', 'singer', 'acoustic', 'âm nhạc', 'bài hát', 'kpop', 'k pop', 'dj'] },
  art: { label: 'Art & illustration', terms: ['art', 'artist', 'illustration', 'illustrator', 'watercolor', 'watercolour', 'sketch', 'sketching', 'painting', 'drawing', 'ceramics', 'pottery', 'printmaking', 'gallery', 'exhibition', 'vẽ', 'hội họa', 'mural'] },
  design: { label: 'Design & architecture', terms: ['design', 'designer', 'typography', 'figma', 'ux', 'ui', 'usability', 'product design', 'architecture', 'architect', 'facade', 'façade', 'concrete', 'interior', 'kiến trúc', 'thiết kế'] },
  tech: { label: 'Programming', terms: ['code', 'coding', 'programming', 'programmer', 'developer', 'software', 'javascript', 'typescript', 'node', 'python', 'rust', 'golang', 'api', 'backend', 'frontend', 'deploy', 'bug', 'github', 'open source', 'pull request', 'database', 'cache', 'caching', 'lập trình', 'kubernetes', 'docker', 'devops'] },
  ai: { label: 'AI & data', terms: ['AI', 'artificial intelligence', 'machine learning', 'deep learning', 'neural', 'neural network', 'llm', 'chatgpt', 'transformer', 'dataset', 'data science', 'model training', 'computer vision', 'nlp', 'trí tuệ nhân tạo', 'học máy', 'pytorch', 'kaggle'] },
  gaming: { label: 'Gaming', terms: ['game', 'games', 'gaming', 'gamer', 'esports', 'console', 'steam', 'co op', 'rpg', 'playstation', 'nintendo', 'xbox', 'twitch', 'streamer', 'speedrun', 'boss fight', 'chơi game', 'liên quân', 'valorant', 'board games'] },
  books: { label: 'Books & reading', terms: ['book', 'books', 'reading', 'reader', 'novel', 'novels', 'library', 'chapter', 'author', 'poetry', 'book club', 'reading list', 'đọc sách', 'sách', 'tiểu thuyết', 'bookstore', 'memoir'] },
  film: { label: 'Film & TV', terms: ['film', 'films', 'movie', 'movies', 'cinema', 'director', 'screening', 'documentary', 'netflix', 'series', 'screenplay', 'phim', 'điện ảnh', 'oscar', 'festival', 'animation'] },
  study: { label: 'Study & languages', terms: ['study', 'studying', 'student', 'exam', 'exams', 'university', 'homework', 'ielts', 'toefl', 'english', 'japanese', 'korean', 'lesson', 'teacher', 'tutor', 'scholarship', 'ôn thi', 'học bổng', 'tiếng anh', 'thi cuối kỳ'] },
  fashion: { label: 'Fashion', terms: ['fashion', 'outfit', 'outfits', 'style', 'dress', 'sneaker', 'sneakers', 'vintage', 'thrift', 'thrifting', 'streetwear', 'tailor', 'áo dài', 'thời trang', 'lookbook', 'wardrobe'] },
  business: { label: 'Startups & business', terms: ['startup', 'startups', 'founder', 'business', 'launch', 'marketing', 'investor', 'funding', 'revenue', 'product market fit', 'khởi nghiệp', 'kinh doanh', 'saas', 'pitch'] }
};

/**
 * Topic phrases, folded but with every word kept: Vietnamese phrases are full of words that are stopwords on
 * their own ("âm nhạc", "thời trang", "món ăn"), so topics are matched on the plain word sequence, not on tokens.
 * Single words that are stopwords ("chó" folds to "cho", "for") are too ambiguous to keep.
 */
const MAX_PHRASE = 3;
const plainWords = (sentence: Array<{ t: string; ai: boolean }>) => sentence.map((word) => (word.ai ? 'ai!' : word.t));
const TOPIC_INDEX: Map<string, string[]> = (() => {
  const index = new Map<string, string[]>();
  for (const [key, topic] of Object.entries(TOPICS)) {
    for (const term of topic.terms) {
      const phrase = sentences(term).flatMap(plainWords);
      if (!phrase.length || phrase.length > MAX_PHRASE) continue;
      if (phrase.length === 1 && (phrase[0]!.length < 2 || STOPWORDS.has(phrase[0]!))) continue;
      const joined = phrase.join(' ');
      index.set(joined, [...new Set([...(index.get(joined) || []), key])]);
    }
  }
  return index;
})();
export const isTopic = (token: string) => token.startsWith(TOPIC_PREFIX);
export const topicKey = (token: string) => token.slice(TOPIC_PREFIX.length);
export const topicLabel = (token: string) => TOPICS[topicKey(token)]?.label || topicKey(token);

/** Topics a text touches, with how many distinct lexicon phrases matched. */
export function detectTopics(texts: string[]): Map<string, number> {
  const found = new Map<string, Set<string>>();
  for (const text of texts) {
    for (const sentence of sentences(text)) {
      const plain = plainWords(sentence);
      for (let start = 0; start < plain.length; start += 1) {
        for (let length = 1; length <= MAX_PHRASE && start + length <= plain.length; length += 1) {
          const phrase = plain.slice(start, start + length).join(' ');
          for (const topic of TOPIC_INDEX.get(phrase) || []) {
            if (!found.has(topic)) found.set(topic, new Set());
            found.get(topic)!.add(phrase);
          }
        }
      }
    }
  }
  return new Map([...found].map(([topic, phrases]) => [topic, phrases.size]));
}

/* ---------- Vectors ---------- */

export type Analysis = { vector: Vector; surface: Map<string, string> };

/**
 * Feature vector of weighted text parts: sublinear tf per token (scaled by the part's weight),
 * plus "#topic" features, L2-normalised.
 */
export function analyze(parts: WeightedText[]): Analysis {
  const raw = new Map<string, number>();
  const surface = new Map<string, string>();
  for (const [text, weight] of parts) {
    if (!text || weight <= 0) continue;
    const counts = new Map<string, number>();
    for (const token of tokenize(text)) {
      counts.set(token.t, (counts.get(token.t) || 0) + 1);
      if (!surface.has(token.t)) surface.set(token.t, token.s);
    }
    for (const [token, count] of counts) raw.set(token, (raw.get(token) || 0) + weight * (1 + Math.log(count)));
  }
  for (const [topic, matches] of detectTopics(parts.filter(([text, weight]) => !!text && weight > 0).map(([text]) => text as string))) {
    // A topic counts a bit more than a single word: it's the bridge between different wordings.
    raw.set(`${TOPIC_PREFIX}${topic}`, 1.5 * (1 + Math.log(Math.min(matches, 4))));
  }
  return { vector: normalize(raw), surface };
}

export function normalize(vector: Vector): Vector {
  let sum = 0;
  for (const value of vector.values()) sum += value * value;
  const length = Math.sqrt(sum);
  if (!length) return new Map();
  return new Map([...vector].map(([token, value]) => [token, value / length]));
}

/** The strongest features of an analysis, compact enough to store with a signal. */
export function topFeatures({ vector, surface }: Analysis, limit = 24): Feature[] {
  return [...vector].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([t, w]) => {
    const s = surface.get(t);
    return { t, w: Math.round(w * 10_000) / 10_000, ...(s && s !== t && !isTopic(t) ? { s: s.slice(0, 60) } : {}) };
  });
}

export const featuresToVector = (features: Feature[]): Vector => normalize(new Map(features.map((feature) => [feature.t, feature.w])));

/** Readable name of a feature: topic label, original spelling, or the token with spaces. */
export function featureLabel(token: string, surface?: string): string {
  if (isTopic(token)) return topicLabel(token);
  return surface || token.replace(/_/g, ' ');
}
