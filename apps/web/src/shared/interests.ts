/**
 * The interest survey shown before someone starts using Oremus (onboarding). Every option is a topic of the
 * recommender's lexicon (src/recommender/text.ts), with suggested sub-interests for the second step.
 * Shared by the server (validation, page) and the client (step 2 chips).
 */

export type InterestOption = { key: string; label: string; emoji: string; tone: string; keywords: string[] };

/** Fewest topics needed to continue; anyone can skip the survey instead. */
export const MIN_INTERESTS = 3;
export const MAX_KEYWORDS = 30;
export const KEYWORD_MAX_LENGTH = 40;

export const INTEREST_OPTIONS: InterestOption[] = [
  { key: 'coffee', label: 'Coffee', emoji: '☕', tone: 'from-amber-300 to-amber-700', keywords: ['Pour-over', 'Egg coffee', 'Latte art', 'Specialty beans', 'Café hopping', 'Cà phê phin'] },
  { key: 'food', label: 'Food & cooking', emoji: '🍜', tone: 'from-orange-300 to-red-500', keywords: ['Street food', 'Phở', 'Vegan', 'Home cooking', 'Bánh mì', 'Night markets'] },
  { key: 'baking', label: 'Baking', emoji: '🥐', tone: 'from-yellow-200 to-orange-400', keywords: ['Sourdough', 'Croissants', 'Cakes', 'Cookies', 'Pastry'] },
  { key: 'travel', label: 'Travel', emoji: '✈️', tone: 'from-sky-300 to-blue-600', keywords: ['Backpacking', 'Road trips', 'Islands', 'Train journeys', 'Hà Giang loop', 'Budget travel'] },
  { key: 'hiking', label: 'Hiking & outdoors', emoji: '🏔️', tone: 'from-emerald-300 to-teal-700', keywords: ['Trekking', 'Camping', 'Waterfalls', 'Mountain summits', 'Trail reports'] },
  { key: 'running', label: 'Running', emoji: '🏃', tone: 'from-lime-300 to-green-600', keywords: ['Marathon', 'Trail running', '5K', 'Run club', 'Race training'] },
  { key: 'cycling', label: 'Cycling', emoji: '🚴', tone: 'from-cyan-300 to-sky-700', keywords: ['Road bike', 'Gravel', 'Bike touring', 'Đạp xe'] },
  { key: 'football', label: 'Football', emoji: '⚽', tone: 'from-green-300 to-emerald-700', keywords: ['Premier League', 'Futsal', 'Five-a-side', 'Coaching', 'V-League'] },
  { key: 'fitness', label: 'Fitness & wellness', emoji: '🧘', tone: 'from-rose-200 to-pink-500', keywords: ['Yoga', 'Gym', 'Meditation', 'Pilates', 'Healthy eating', 'Breathwork'] },
  { key: 'pets', label: 'Pets', emoji: '🐶', tone: 'from-amber-200 to-yellow-600', keywords: ['Dogs', 'Cats', 'Adoption', 'Pet care', 'Puppies'] },
  { key: 'gardening', label: 'Gardening & plants', emoji: '🌱', tone: 'from-green-200 to-lime-600', keywords: ['Balcony garden', 'Composting', 'Houseplants', 'Flowers', 'Herbs'] },
  { key: 'wildlife', label: 'Wildlife & nature', emoji: '🦁', tone: 'from-yellow-300 to-amber-600', keywords: ['Safari', 'Birdwatching', 'Wildlife photography', 'Conservation'] },
  { key: 'ocean', label: 'Diving & ocean', emoji: '🐠', tone: 'from-cyan-200 to-blue-700', keywords: ['Scuba diving', 'Freediving', 'Snorkeling', 'Surfing', 'Coral reefs'] },
  { key: 'photography', label: 'Photography', emoji: '📷', tone: 'from-slate-300 to-slate-700', keywords: ['Street photography', 'Film cameras', 'Portraits', 'Night photography', 'Lenses'] },
  { key: 'music', label: 'Music', emoji: '🎹', tone: 'from-violet-300 to-purple-700', keywords: ['Jazz', 'Vinyl', 'K-pop', 'Piano', 'Live gigs', 'Indie music'] },
  { key: 'art', label: 'Art & illustration', emoji: '🎨', tone: 'from-fuchsia-300 to-pink-600', keywords: ['Watercolor', 'Illustration', 'Sketching', 'Pottery', 'Galleries'] },
  { key: 'design', label: 'Design & architecture', emoji: '📐', tone: 'from-stone-300 to-stone-600', keywords: ['UX design', 'Typography', 'Architecture', 'Interiors', 'Figma'] },
  { key: 'tech', label: 'Programming', emoji: '💻', tone: 'from-indigo-300 to-indigo-700', keywords: ['Web development', 'Open source', 'TypeScript', 'Python', 'DevOps'] },
  { key: 'ai', label: 'AI & data', emoji: '🤖', tone: 'from-blue-300 to-violet-700', keywords: ['Machine learning', 'LLMs', 'Data science', 'Computer vision', 'AI tools'] },
  { key: 'gaming', label: 'Gaming', emoji: '🎮', tone: 'from-purple-300 to-indigo-700', keywords: ['Esports', 'Valorant', 'Co-op games', 'Indie games', 'Board games'] },
  { key: 'books', label: 'Books & reading', emoji: '📚', tone: 'from-orange-200 to-rose-500', keywords: ['Novels', 'Poetry', 'Book club', 'Vietnamese literature', 'Reading lists'] },
  { key: 'film', label: 'Film & TV', emoji: '🎬', tone: 'from-neutral-400 to-neutral-800', keywords: ['Documentaries', 'Indie film', 'Cinema', 'Screenwriting', 'Film festivals'] },
  { key: 'study', label: 'Study & languages', emoji: '✍️', tone: 'from-teal-200 to-cyan-600', keywords: ['IELTS', 'English', 'Study tips', 'Scholarships', 'Japanese'] },
  { key: 'fashion', label: 'Fashion', emoji: '👗', tone: 'from-pink-200 to-rose-600', keywords: ['Vintage', 'Thrifting', 'Áo dài', 'Streetwear', 'Sustainable fashion'] },
  { key: 'business', label: 'Startups & business', emoji: '🚀', tone: 'from-sky-200 to-indigo-600', keywords: ['Startups', 'Fundraising', 'Marketing', 'SaaS', 'Product management'] }
];

export const INTEREST_KEYS = INTEREST_OPTIONS.map((option) => option.key) as [string, ...string[]];
export const interestOption = (key: string) => INTEREST_OPTIONS.find((option) => option.key === key);
