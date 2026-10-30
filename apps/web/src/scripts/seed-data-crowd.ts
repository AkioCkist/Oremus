import type { SeedGroup, SeedPerson, SeedPhoto, SeedPost, SeedStory, Topic } from './seed-data.js';
import { STORY_BACKGROUNDS, STORY_FONTS } from '../shared/story-style.js';
import { PHOTO_LIBRARY } from './seed-photo-library.js';

/**
 * Large deterministic sample layer. It is generated instead of hand-written so `npm run seed` can create a
 * genuinely busy network while the original curated people/posts/groups remain untouched.
 *
 * No two posts, stories or group covers share a photo: each takes the next unused photo of its topic from the Commons
 * library, and a post with nothing left stays text-only rather than repeating one. Captions are unique too.
 */

type Theme = {
  topic: Topic;
  interest: string;
  label: string;
  emoji: string;
  groupNames: string[];
  tags: string[];
  personal: string[];
  group: string[];
  stories: string[];
};

const THEMES: Theme[] = [
  { topic: 'travel', interest: 'travel', label: 'Travel', emoji: '✈️', groupNames: ['Vietnam Backpackers', 'Hidden Places Asia', 'Weekend Getaways'], tags: ['travel', 'local tips', 'weekend'], personal: ['Caught the first light in {place}. The quiet streets were worth the early alarm.', 'A slow afternoon in {place}: local food, a long walk and no itinerary.', 'Saving this corner of {place} for the next trip. Who has been here?'], group: ['Mini guide to {place}: go early, carry water and leave room for an unplanned stop.', 'Sharing today’s route through {place}. It works well as a relaxed one-day trip.', 'Three things I wish I knew before visiting {place}: book early, pack light and ask locals.'], stories: ['Postcard from {place}', 'Next stop: {place}', 'A very good travel day'] },
  { topic: 'food', interest: 'food', label: 'Food & Cooking', emoji: '🍜', groupNames: ['Vietnam Home Cooking', 'Street Food Hunters', 'Plant-Forward Kitchens'], tags: ['food', 'recipes', 'local eats'], personal: ['Tonight’s {detail} came together with herbs, lime and a little patience.', 'Tried a new version of {detail}; the crunchy edges made the whole dish.', 'Weekend table: {detail}, fresh greens and enough for everyone.'], group: ['Recipe notes for {detail}: prep everything first and season in small steps.', 'Found a tiny place serving excellent {detail}. Balanced, fresh and not too sweet.', 'Today’s community cook: {detail}. Drop your favorite variation below.'], stories: ['Dinner is ready', 'Fresh from the market', 'Today’s comfort food'] },
  { topic: 'coffee', interest: 'coffee', label: 'Specialty Coffee', emoji: '☕', groupNames: ['Daily Coffee Ritual', 'Home Brewers Club', 'Cafe Notes Vietnam'], tags: ['coffee', 'brewing', 'cafes'], personal: ['Dialed in {detail} this morning: sweeter cup, cleaner finish, much better day.', 'A quiet table, {detail} and twenty minutes without notifications.', 'Comparing two brews of {detail}; one click finer made a surprising difference.'], group: ['Brew log for {detail}: share your ratio, grind and tasting notes.', 'Cafe review: the {detail} was thoughtful and the barista explained every step.', 'Beginner tip for {detail}: change only one variable at a time.'], stories: ['First cup of the day', 'Coffee break', 'Today’s brew notes'] },
  { topic: 'pets', interest: 'pets', label: 'Pets & Rescue', emoji: '🐾', groupNames: ['Happy Pets Vietnam', 'Rescue & Adoption Network', 'Dog Walk Friends'], tags: ['pets', 'adoption', 'care'], personal: ['{detail} has officially claimed the sunny spot by the window.', 'Morning walk with {detail}: many smells investigated, zero regrets.', 'A small update from {detail}: healthy, playful and very proud of this photo.'], group: ['Care reminder for {detail}: fresh water, shade and patient training go a long way.', 'Adoption update: {detail} is settling in beautifully and learning to trust again.', 'Sharing a pet-friendly route that worked well for {detail} this weekend.'], stories: ['Best friend energy', 'Walk time', 'Adopt, don’t shop'] },
  { topic: 'nature', interest: 'hiking', label: 'Hiking & Nature', emoji: '🥾', groupNames: ['Vietnam Trail Community', 'Leave No Trace Hikers', 'Sunrise Treks'], tags: ['hiking', 'nature', 'trails'], personal: ['The trail near {place} was misty, green and almost completely quiet.', 'A steady climb, a simple lunch and this view over {place}.', 'Today’s reminder from {place}: slow down and notice the small things.'], group: ['Trail report for {place}: dry path, moderate climb and very little shade after 9am.', 'Packing list for {place}: two liters of water, rain shell and a bag for litter.', 'Planning a respectful sunrise hike at {place}; small group, leave no trace.'], stories: ['Trail morning', 'Worth the climb', 'Outside is the answer'] },
  { topic: 'photography', interest: 'photography', label: 'Photography', emoji: '📷', groupNames: ['Street Frames Vietnam', 'Film & Digital Photographers', 'Golden Hour Collective'], tags: ['photography', 'street', 'portraits'], personal: ['Soft evening light in {place}; photographed on {detail}.', 'One frame from today’s walk: ordinary moment, beautiful geometry.', 'Testing {detail} in difficult light. The imperfect shadows are my favorite part.'], group: ['Photo walk notes from {place}: watch the layers and wait for one clear gesture.', 'Critique welcome: shot with {detail}, minimal edit and natural color.', 'This week’s prompt is reflections. Here is my frame from {place}.'], stories: ['Chasing light', 'One frame today', 'Photo walk'] },
  { topic: 'art', interest: 'art', label: 'Art & Design', emoji: '🎨', groupNames: ['Vietnam Creative Studio', 'Illustrators & Makers', 'Design Critique Circle'], tags: ['art', 'design', 'creative'], personal: ['Work in progress: {detail}, built from loose shapes and a limited palette.', 'Finished a small {detail} study today. Keeping the texture imperfect.', 'Sketchbook page from this week: color, type and a few accidental good ideas.'], group: ['Feedback welcome on this {detail}: is the visual hierarchy clear at first glance?', 'Monthly prompt: make something around “belonging.” Here is my first pass.', 'Process notes for {detail}: references first, rough shapes second, details last.'], stories: ['Studio time', 'Making something new', 'Today’s sketch'] },
  { topic: 'music', interest: 'music', label: 'Music', emoji: '🎵', groupNames: ['Vietnam Indie Music', 'Jazz & Vinyl Evenings', 'Bedroom Producers Hub'], tags: ['music', 'live', 'listening'], personal: ['Tonight’s soundtrack is {detail}; warm, spacious and perfect after a long day.', 'A tiny live set in {place} reminded me why intimate shows feel special.', 'Learning {detail} slowly, four bars at a time.'], group: ['Listening thread: share one {detail} track everyone should hear this week.', 'Gig notes from {place}: great room, kind crowd and a brilliant closing song.', 'Production question about {detail}: how do you keep the mix open without losing warmth?'], stories: ['On repeat', 'Soundcheck', 'Late-night listening'] },
  { topic: 'books', interest: 'books', label: 'Books & Reading', emoji: '📚', groupNames: ['Readers of Vietnam', 'Nonfiction Notes', 'Quiet Book Club'], tags: ['books', 'reading', 'reviews'], personal: ['Halfway through {detail}; thoughtful, humane and full of lines worth underlining.', 'A rainy afternoon, tea and {detail}. Exactly the pace I needed.', 'Finished {detail}. The ending is quiet but it stays with you.'], group: ['Discussion thread for {detail}: what changed your mind while reading?', 'Three takeaways from {detail}, with no spoilers.', 'Next month’s pick is {detail}. New readers are very welcome.'], stories: ['Current read', 'One more chapter', 'Bookshop afternoon'] },
  { topic: 'study', interest: 'study', label: 'Learning', emoji: '🧠', groupNames: ['Study Together Vietnam', 'Language Learners Hub', 'Lifelong Learning Notes'], tags: ['study', 'learning', 'languages'], personal: ['Today’s {detail} session: fifty focused minutes, ten minutes to review.', 'Finally understood a difficult part of {detail} after drawing it out by hand.', 'Small progress on {detail} still counts. Showing up again tomorrow.'], group: ['Shared notes for {detail}: concise summary, examples and practice questions.', 'Study room for {detail} opens tonight. Cameras optional, focus encouraged.', 'What resource helped you most with {detail}? Building a community list.'], stories: ['Focus mode', 'Study break', 'Learning every day'] },
  { topic: 'ai', interest: 'ai', label: 'AI & Data', emoji: '🤖', groupNames: ['Applied AI Vietnam', 'Data Science Builders', 'Responsible AI Lab'], tags: ['ai', 'data', 'machine learning'], personal: ['Built a small {detail} experiment today; simple baseline first, then better data.', 'Reading about {detail} and writing down where the model can fail.', 'A useful lesson from {detail}: evaluate the behavior, not just one headline metric.'], group: ['Project log for {detail}: dataset, baseline, evaluation and the mistakes we found.', 'Discussion: where should humans stay in the loop for {detail}?', 'Beginner resources for {detail}, from first notebook to a deployable demo.'], stories: ['Training run complete', 'Data before hype', 'Today in AI'] },
  { topic: 'gaming', interest: 'gaming', label: 'Gaming', emoji: '🎮', groupNames: ['Vietnam Gaming Friends', 'Co-op Night', 'Indie Games Club'], tags: ['gaming', 'co-op', 'esports'], personal: ['A close match in {detail}; one good team call changed everything.', 'Finally finished {detail}. The art direction deserves its own book.', 'Co-op evening with friends: chaotic, generous and extremely funny.'], group: ['Looking for two friendly players for {detail} tonight. Beginners welcome.', 'What did {detail} teach well without a tutorial?', 'Community tournament recap: close games, good sportsmanship and no drama.'], stories: ['GG', 'One more round', 'Co-op tonight'] },
  { topic: 'running', interest: 'running', label: 'Running', emoji: '🏃', groupNames: ['Vietnam Runners', 'Easy Pace Club', 'Trail Running Community'], tags: ['running', 'marathon', 'training'], personal: ['Easy {detail} this morning, conversational pace and a strong finish.', 'Training note: sleep mattered more than forcing another hard session.', 'A humid run around {place}; slowed down, drank water and enjoyed it.'], group: ['Route report for {place}: flat, well lit and best before traffic builds.', 'This week’s {detail} session focuses on consistency, not speed.', 'New runner check-in: share one win from your week, any distance counts.'], stories: ['Morning miles', 'Easy pace', 'Run done'] },
  { topic: 'sport', interest: 'fitness', label: 'Fitness & Sports', emoji: '🏋️', groupNames: ['Move Better Vietnam', 'Community Football', 'Strength & Mobility'], tags: ['fitness', 'football', 'mobility'], personal: ['Today’s {detail}: controlled reps, full range and no rush.', 'Friendly game in {place}; tired legs and a very happy team.', 'Mobility, a short walk and {detail}. Recovery is training too.'], group: ['Form notes for {detail}: start light, move well and add load gradually.', 'Weekend match in {place}; looking for a few more players.', 'A balanced {detail} plan for people with busy weeks.'], stories: ['Move today', 'Game day', 'Strong and steady'] },
  { topic: 'baking', interest: 'baking', label: 'Baking', emoji: '🥐', groupNames: ['Home Bakers Vietnam', 'Sourdough Notes', 'Weekend Pastry Club'], tags: ['baking', 'bread', 'pastry'], personal: ['Today’s {detail}: crisp crust, soft center and better fermentation than last time.', 'The kitchen smells like {detail}. Waiting for it to cool is the hardest step.', 'A small batch of {detail} for neighbors and afternoon coffee.'], group: ['Recipe notes for {detail}: watch the dough, not only the clock.', 'Troubleshooting {detail}: temperature and patience fixed my biggest problem.', 'Weekend bake-along is {detail}. Share photos and questions as you go.'], stories: ['Fresh from the oven', 'Good crumb today', 'Weekend bake'] },
  { topic: 'fashion', interest: 'fashion', label: 'Fashion', emoji: '🧵', groupNames: ['Vietnam Slow Fashion', 'Vintage & Thrift Finds', 'Sewing Studio'], tags: ['fashion', 'vintage', 'sewing'], personal: ['Today’s {detail}: repaired, restyled and ready for many more years.', 'A simple look built around {detail} and comfortable shoes.', 'Found beautiful texture and careful construction in this {detail}.'], group: ['Pattern notes for {detail}: test the fit before cutting the final fabric.', 'Thrift find of the week: {detail}, cleaned and repaired instead of replaced.', 'How do you style {detail} across seasons? Share practical ideas.'], stories: ['Made, not rushed', 'Today’s look', 'Thrifted treasure'] },
  { topic: 'ocean', interest: 'ocean', label: 'Ocean & Diving', emoji: '🌊', groupNames: ['Dive Vietnam', 'Ocean Friends', 'Freediving Community'], tags: ['ocean', 'diving', 'conservation'], personal: ['Clear water near {place}; moved slowly and gave every animal space.', 'Practicing {detail}: calm breathing, good buddy checks and no chasing depth.', 'The sea at {place} was glassy this morning.'], group: ['Conditions report for {place}: visibility good, current mild, entry straightforward.', 'Safety reminder for {detail}: trained buddy, clear plan and conservative limits.', 'Cleanup at {place} this weekend. Gloves and collection bags provided.'], stories: ['Blue morning', 'Underwater calm', 'Protect what you love'] },
  { topic: 'film', interest: 'film', label: 'Film & Cinema', emoji: '🎬', groupNames: ['Vietnam Film Society', 'Documentary Nights', 'Independent Cinema Club'], tags: ['film', 'cinema', 'documentary'], personal: ['Watched {detail} tonight; precise images and a surprisingly gentle ending.', 'A small cinema in {place}, a thoughtful film and a long conversation afterward.', 'Revisiting {detail}. It feels different when you know where the story is going.'], group: ['Spoiler-free discussion for {detail}: what did the visual language tell you?', 'Screening in {place} this Friday, followed by an open conversation.', 'Share one overlooked {detail} scene that deserves closer attention.'], stories: ['Tonight’s film', 'Cinema lights', 'On the watchlist'] },
  { topic: 'work', interest: 'business', label: 'Startups & Work', emoji: '💼', groupNames: ['Vietnam Product Builders', 'Small Business Network', 'Remote Work Community'], tags: ['startups', 'product', 'careers'], personal: ['A useful lesson from {detail}: talk to users before polishing the solution.', 'Quiet work block on {detail}; fewer meetings, clearer decisions.', 'This week’s progress on {detail} is small, measurable and real.'], group: ['Founder notes on {detail}: problem, evidence, experiment and what changed.', 'Peer review for {detail}: share the decision you are trying to make.', 'Remote work tip: write the context down before asking everyone for a meeting.'], stories: ['Building in public', 'Deep work', 'Small wins'] },
  { topic: 'city', interest: 'cycling', label: 'City & Cycling', emoji: '🚲', groupNames: ['Urban Cycling Vietnam', 'Better Cities Community', 'Weekend Bike Rides'], tags: ['cycling', 'city', 'mobility'], personal: ['Morning ride through {place}: cool air, quiet roads and an easy pace.', 'Noticed a better route across {place} today—safer, greener and only two minutes longer.', 'A bicycle makes small details in {place} much easier to notice.'], group: ['Route notes for {place}: protected lane for most of the way, busy final crossing.', 'Social ride this weekend: {detail}, no-drop pace and helmets required.', 'What one small change would make cycling safer in {place}?'], stories: ['Ride together', 'City by bike', 'Two wheels today'] }
];

const FIRST_NAMES = ['Anh', 'Binh', 'Chi', 'Dung', 'Giang', 'Ha', 'Hai', 'Hanh', 'Hieu', 'Hoa', 'Hoang', 'Huong', 'Khanh', 'Lan', 'Linh', 'Long', 'Mai', 'Minh', 'Nam', 'Nga', 'Ngoc', 'Nhi', 'Phong', 'Phuong', 'Quan', 'Quynh', 'Son', 'Thao', 'Trang', 'Tuan', 'Vy', 'Alex', 'Amelia', 'Arjun', 'Clara', 'Daniel', 'Elena', 'Ethan', 'Hana', 'Iris', 'Jonas', 'Kenji', 'Leah', 'Lucas', 'Maya', 'Nora', 'Omar', 'Priya', 'Rafael', 'Sofia'];
const LAST_NAMES = ['Nguyen', 'Tran', 'Le', 'Pham', 'Vo', 'Dang', 'Bui', 'Do', 'Hoang', 'Vu', 'Huynh', 'Phan', 'Lam', 'Ngo', 'Duong', 'Taylor', 'Martin', 'Kim', 'Patel', 'Silva', 'Chen', 'Wilson', 'Sato', 'Brown', 'Garcia'];
// Crowd portraits follow the first name, so a face fits the person it belongs to.
const WOMEN = new Set(['Chi', 'Giang', 'Ha', 'Hanh', 'Hoa', 'Huong', 'Lan', 'Linh', 'Mai', 'Nga', 'Ngoc', 'Nhi', 'Phuong', 'Quynh', 'Thao', 'Trang', 'Vy', 'Amelia', 'Clara', 'Elena', 'Hana', 'Iris', 'Leah', 'Maya', 'Nora', 'Priya', 'Sofia']);
const SHARP_PORTRAITS = 79, SMALL_PORTRAITS = 100;
const crowdPortrait = (index: number) => {
  const first = FIRST_NAMES[index % FIRST_NAMES.length]!;
  const gender = WOMEN.has(first) ? 'female' : 'male';
  const sameGender = FIRST_NAMES.filter((name) => WOMEN.has(name) === (gender === 'female'));
  const number = (Math.floor(index / FIRST_NAMES.length) * sameGender.length + sameGender.indexOf(first)) % (SHARP_PORTRAITS + SMALL_PORTRAITS);
  return number < SHARP_PORTRAITS ? `xsgames-${gender}-${number}` : `randomuser-${gender}-${number - SHARP_PORTRAITS}`;
};
const PLACES = ['Da Nang', 'Ho Chi Minh City', 'Ha Noi', 'Hoi An', 'Hue', 'Nha Trang', 'Da Lat', 'Can Tho', 'Vung Tau', 'Quy Nhon', 'Phu Quoc', 'Singapore', 'Bangkok', 'Seoul', 'Tokyo'];
const DETAILS: Record<Topic, string[]> = {
  travel: ['a coastal train journey', 'a local market', 'a mountain homestay'], food: ['mushroom pho', 'crispy tofu noodles', 'lemongrass rice'], coffee: ['a washed arabica', 'a 1:16 pour-over', 'a slow phin brew'], pets: ['our rescue pup', 'a sleepy orange cat', 'the newest foster dog'], city: ['a riverside loop', 'the old quarter route', 'a car-free morning'], work: ['a customer interview', 'a tiny product experiment', 'the weekly planning ritual'], nature: ['a forest trail', 'a sunrise ridge', 'a quiet waterfall'], music: ['a jazz trio', 'an indie playlist', 'a new piano arrangement'], study: ['IELTS writing', 'data structures', 'Japanese vocabulary'], sport: ['a strength session', 'five-a-side football', 'a mobility circuit'], art: ['a poster study', 'a watercolor portrait', 'a small ceramic piece'], general: ['a community afternoon'], ai: ['a Vietnamese NLP model', 'a recommendation baseline', 'a computer vision prototype'], gaming: ['a co-op campaign', 'an indie puzzle game', 'a ranked team match'], books: ['a thoughtful new novel', 'a book about cities', 'a collection of essays'], running: ['an easy 8K', 'a long trail run', 'marathon pacing'], fitness: ['a mobility circuit', 'a full-body session', 'a recovery workout'], business: ['a customer interview', 'a pricing test', 'a small launch'], fashion: ['a repaired linen jacket', 'a vintage shirt', 'a hand-sewn tote'], ocean: ['a reef dive', 'a calm freediving session', 'a beach cleanup'], baking: ['a sourdough loaf', 'butter croissants', 'a fruit tart'], film: ['an independent documentary', 'a quiet coming-of-age film', 'a restored classic'], photography: ['a 35mm film camera', 'a compact prime lens', 'black-and-white street frames']
};

/**
 * Hand-audited photo ids. Broad source topics (especially `nature` and `art`) are intentionally not reused as
 * pools because they mix flowers, wildlife and trails. Each generated theme gets a narrower visual vocabulary.
 */
const PHOTO_POOLS: Record<Topic, SeedPhoto[]> = {
  travel: [1015, 1018, 1050, 1016, 1043, 49, 108, 116, 372, 69, 1026, 28, 212],
  food: [292, 75, 1080], coffee: [63, 312, 1060, 42, 192], pets: [237, 40, 1012, 1084],
  city: [57, 308, 420, 111, 1047], work: [1, 0, 2], nature: [1016, 1043, 1035, 1044, 17, 324],
  music: [1082, 39, 117], study: [1073, 24], sport: [1058, 324, 17], art: [74, 91, 104, 152, 106, 1076, 1081],
  general: [57, 82], ai: [0, 2, 1], gaming: [96], books: [1073, 24], running: [324, 17],
  fitness: [1058, 324, 17], business: [1, 0, 2], fashion: [1076], ocean: [1069], baking: [1080],
  film: [91, 1047], photography: [1047, 57, 74, 91]
};

const PERSONAL_ENDINGS = ['Best part of my week so far.', 'Anyone else feel the same?', 'More soon.', 'Small joys count.', 'Keeping this one for the memories.', 'Would happily do it again tomorrow.', 'Tell me if you have tried this too.', 'Not perfect, and that is fine.', 'Still smiling about it.', 'A good reminder to slow down.', 'This made my day.', 'Grateful for days like this.', 'Next time I am bringing friends.', 'Worth every minute.', 'Happy with how this turned out.', 'Learning a little each time.', 'I needed this today.', 'Simple things, done well.', 'Sharing because it made me happy.', 'What would you have done differently?', 'Going back as soon as I can.', 'Trying something new was the right call.', 'Quiet wins are still wins.', 'Thanks to everyone who suggested this.', 'A nice way to end the week.', 'The photo does not do it justice.', 'It took a few tries to get here.', 'Saving this for a rainy day.', 'Tomorrow I try it again.', 'That is all for today.'];
const GROUP_ENDINGS = ['Questions welcome.', 'Add your own notes below.', 'Happy to share more details.', 'Would love a second opinion.', 'Newcomers very welcome.', 'Let me know what I missed.', 'Corrections are appreciated.', 'Hope this helps someone here.', 'Tag a friend who should see this.', 'I will update this thread next week.', 'Thanks for all the tips last time.', 'Who wants to try this together?', 'Curious how this compares for you.', 'Pinning my notes in the comments.', 'Shared with thanks to this community.', 'Any better ideas? I am listening.', 'Reply if you want to join next time.', 'Feedback from beginners is especially useful.', 'Keeping it simple on purpose.', 'More details on request.'];

const LIGHT_BACKGROUNDS = new Set<string>(['candy', 'sun', 'mint', 'paper']);

const hash = (value: string) => [...value].reduce((n, c) => Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const pick = <T>(items: T[], seed: string) => items[hash(seed) % items.length]!;
const fill = (template: string, theme: Theme, seed: string) => template
  .replaceAll('{place}', pick(PLACES, `${seed}:place`))
  .replaceAll('{detail}', pick(DETAILS[theme.topic], `${seed}:detail`));

export type CrowdSeed = {
  people: SeedPerson[];
  groups: SeedGroup[];
  posts: SeedPost[];
  stories: SeedStory[];
  curatedPosts: SeedPost[];
  curatedStories: SeedStory[];
  friends: Array<[string, string]>;
  follows: Array<[string, string]>;
};

export function buildCrowdSeed(existing: { people: SeedPerson[]; posts: SeedPost[]; stories: SeedStory[] }, targetPeople = 2000): CrowdSeed {
  const count = Math.max(0, targetPeople - existing.people.length);
  // Each photo goes out once. Returns undefined when a topic has run out, and callers then go without.
  const cursor = new Map<string, number>();
  const nextPhoto = (topic: Topic) => {
    const pool = PHOTO_LIBRARY[topic] || [];
    const at = cursor.get(topic) || 0;
    if (at >= pool.length) return undefined;
    cursor.set(topic, at + 1);
    return `commons-${pool[at]!.id}`;
  };
  const photoList = (topic: Topic) => { const next = nextPhoto(topic); return next ? [next] : []; };
  const usedTexts = new Set(existing.posts.map((post) => post.text));
  /** A fresh sentence for this post: the seed moves on to another combination until the text is new. */
  const uniqueCaption = (templates: string[], endings: string[], theme: Theme, seed: string) => {
    for (let salt = 0; ; salt += 1) {
      const attempt = `${seed}:${salt}`;
      const text = `${fill(pick(templates, attempt), theme, attempt)} ${pick(endings, `${attempt}:ending`)}`;
      if (!usedTexts.has(text)) { usedTexts.add(text); return text; }
    }
  };
  const topicPhoto = (topic: Topic, seed: string) => pick(PHOTO_POOLS[topic], seed);
  const photoId = (topic: Topic, seed: string) => {
    const value = topicPhoto(topic, seed);
    return Array.isArray(value) ? value[0] : value;
  };
  const people: SeedPerson[] = Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const theme = THEMES[index % THEMES.length]!;
    const name = `${FIRST_NAMES[index % FIRST_NAMES.length]} ${LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length]}`;
    const place = PLACES[(index * 7) % PLACES.length]!;
    const key = `crowd${String(number).padStart(4, '0')}`;
    return {
      key, email: `${key}@example.test`, displayName: name, avatar: crowdPortrait(index), cover: photoId(theme.topic, `${key}:cover`),
      interests: { topics: [theme.interest, THEMES[(index + 3) % THEMES.length]!.interest, THEMES[(index + 7) % THEMES.length]!.interest], keywords: theme.tags },
      profile: {
        bio: `${theme.emoji} ${theme.label} enthusiast sharing useful notes and everyday moments.`, location: `${place}, Vietnam`, hometown: `${PLACES[(index * 11 + 2) % PLACES.length]}, Vietnam`,
        storyAudience: 'public', privacy: 'public', languages: index % 4 ? ['Vietnamese', 'English'] : ['English', 'Vietnamese'], hobbies: [theme.label, ...theme.tags],
        work: [{ company: `${theme.label} Community`, position: index % 3 ? 'Member' : 'Coordinator', city: place, current: true }],
        education: [], links: [], about: `Here for ${theme.tags.join(', ')}, thoughtful conversations and local community.`
      }
    };
  });

  // Six groups per theme. Divisibility by THEMES.length lets every person's primary group share their topic.
  const groupCount = THEMES.length * 6;
  const membership = Array.from({ length: groupCount }, () => new Map<string, 'admin' | 'moderator' | 'member'>());
  people.forEach((person, index) => {
    const themeIndex = index % THEMES.length;
    const primary = (Math.floor(index / THEMES.length) % 6) * THEMES.length + themeIndex;
    const second = (index * 7 + 13) % groupCount;
    const third = (index * 17 + 29) % groupCount;
    for (const groupIndex of new Set([primary, second, third])) membership[groupIndex]!.set(person.key, 'member');
  });
  const themeByTopic = (topic: Topic) => THEMES.find((theme) => theme.topic === topic)
    || THEMES.find((theme) => theme.topic === ({ fitness: 'sport', business: 'work', general: 'travel' } as Partial<Record<Topic, Topic>>)[topic])
    || THEMES[0]!;
  const curatedTheme = new Map<string, Theme>();
  existing.people.forEach((person, index) => {
    const counts = new Map<Topic, number>();
    for (const post of existing.posts.filter((item) => item.author === person.key)) counts.set(post.topic, (counts.get(post.topic) || 0) + 1);
    const topic = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || THEMES[index % THEMES.length]!.topic;
    const theme = themeByTopic(topic);
    curatedTheme.set(person.key, theme);
    const themeIndex = THEMES.indexOf(theme);
    membership[themeIndex]!.set(person.key, 'member');
  });

  const groups: SeedGroup[] = Array.from({ length: groupCount }, (_, index) => {
    const theme = THEMES[index % THEMES.length]!;
    const slug = `community-${theme.topic}-${String(index + 1).padStart(3, '0')}`;
    const members = membership[index]!;
    const keys = [...members.keys()];
    if (keys[0]) members.set(keys[0], 'admin');
    if (keys[1]) members.set(keys[1], 'moderator');
    return {
      slug, name: `${theme.groupNames[Math.floor(index / THEMES.length) % theme.groupNames.length]} ${Math.floor(index / THEMES.length) + 1}`,
      description: `A welcoming community for ${theme.label.toLowerCase()}: practical advice, local meetups and member stories.`,
      cover: nextPhoto(theme.topic) ?? photoId(theme.topic, `${slug}:cover`), privacy: index % 9 === 0 ? 'private' : 'public', groupType: theme.topic === 'work' ? 'work' : theme.topic === 'gaming' ? 'gaming' : theme.topic === 'study' ? 'learning' : 'hobbies',
      location: index % 4 ? 'Vietnam' : PLACES[index % PLACES.length]!, tags: theme.tags,
      rules: [{ title: 'Be kind and useful', details: 'Share respectfully, give context and welcome newcomers.' }, { title: 'Stay on topic', details: `Posts should relate to ${theme.label.toLowerCase()}.` }],
      members: [...members].map(([key, role]) => [key, role])
    };
  });

  const posts: SeedPost[] = [];
  people.forEach((person, index) => {
    const theme = THEMES[index % THEMES.length]!;
    const themeIndex = index % THEMES.length;
    const groupIndex = (Math.floor(index / THEMES.length) % 6) * THEMES.length + themeIndex;
    const group = groups[groupIndex]!;
    const personalSeed = `${person.key}:personal`;
    const groupSeed = `${person.key}:group`;
    posts.push({
      key: `crowd-personal-${String(index + 1).padStart(4, '0')}`, author: person.key, topic: theme.topic,
      text: uniqueCaption(theme.personal, PERSONAL_ENDINGS, theme, personalSeed), hoursAgo: 2 + ((index * 19) % (24 * 90)), photos: photoList(theme.topic), engagement: 'light'
    });
    posts.push({
      key: `crowd-group-${String(index + 1).padStart(4, '0')}`, author: person.key, topic: theme.topic, group: group.slug,
      text: uniqueCaption(theme.group, GROUP_ENDINGS, theme, groupSeed), hoursAgo: 1 + ((index * 23) % (24 * 75)), photos: photoList(theme.topic), engagement: 'light'
    });
  });

  // Preserve every curated fixture, but append a missing personal/group post so all 2,000 accounts meet the
  // same content invariant as generated accounts.
  existing.people.forEach((person, index) => {
    const theme = curatedTheme.get(person.key)!;
    const themeIndex = THEMES.indexOf(theme);
    const group = groups[themeIndex]!;
    if (!existing.posts.some((post) => post.author === person.key && !post.group)) {
      const seed = `${person.key}:supplemental:personal`;
      posts.push({ key: `supplemental-personal-${person.key}`, author: person.key, topic: theme.topic, text: uniqueCaption(theme.personal, PERSONAL_ENDINGS, theme, seed), hoursAgo: 12 + index * 3, photos: photoList(theme.topic), engagement: 'light' });
    }
    if (!existing.posts.some((post) => post.author === person.key && post.group)) {
      const seed = `${person.key}:supplemental:group`;
      posts.push({ key: `supplemental-group-${person.key}`, author: person.key, topic: theme.topic, group: group.slug, text: uniqueCaption(theme.group, GROUP_ENDINGS, theme, seed), hoursAgo: 8 + index * 5, photos: photoList(theme.topic), engagement: 'light' });
    }
  });

  const stories: SeedStory[] = people.filter((_, index) => index % 3 === 0).map((person, storyIndex) => {
    const personIndex = storyIndex * 3;
    const theme = THEMES[personIndex % THEMES.length]!;
    const seed = `${person.key}:story`;
    const place = PLACES[storyIndex % PLACES.length]!;
    const text = `${fill(pick(theme.stories, seed), theme, seed)} · ${place}`;
    const minutesAgo = 5 + ((storyIndex * 37) % 1380);
    // A third of the stories are just words on a color, written the way people use the story composer.
    const background = pick([...STORY_BACKGROUNDS], `${seed}:background`);
    const textOnly = storyIndex % 3 === 0 ? { background, style: { font: pick([...STORY_FONTS], `${seed}:font`), color: LIGHT_BACKGROUNDS.has(background) ? '#000000' : '#ffffff', effect: LIGHT_BACKGROUNDS.has(background) ? 'none' : 'shadow', size: 1.3 } } : null;
    return textOnly ? { author: person.key, minutesAgo, text, ...textOnly } : { author: person.key, minutesAgo, photo: nextPhoto(theme.topic), text, background };
  });

  // Hand-written fixtures keep their chosen photo the first time it appears. A repeat gets a fresh one of the same topic.
  const seenCurated = new Set<string>();
  const firstUse = (value: SeedPhoto) => {
    const id = String(Array.isArray(value) ? value[0] : value);
    if (seenCurated.has(id)) return false;
    seenCurated.add(id);
    return true;
  };
  const curatedPosts = existing.posts.map((post) => ({
    ...post,
    photos: post.photos?.flatMap((value) => (firstUse(value) ? [value] : photoList(themeByTopic(post.topic).topic)))
  }));
  const curatedStories = existing.stories.map((story) => (story.photo === undefined || firstUse(story.photo)
    ? story
    : { ...story, photo: nextPhoto((curatedTheme.get(story.author) || THEMES[0]!).topic) }));

  const friendSet = new Set<string>();
  const friends: Array<[string, string]> = [];
  const addFriend = (a: string, b: string) => {
    if (a === b) return;
    const pair = [a, b].sort().join('|');
    if (!friendSet.has(pair)) { friendSet.add(pair); friends.push([a, b]); }
  };
  people.forEach((person, index) => {
    addFriend(person.key, people[(index + 1) % people.length]!.key);
    addFriend(person.key, people[(index + THEMES.length) % people.length]!.key);
    addFriend(person.key, people[(index + 97) % people.length]!.key);
  });
  const follows: Array<[string, string]> = [];
  people.forEach((person, index) => {
    follows.push([person.key, people[(index + 5) % people.length]!.key], [person.key, people[(index + THEMES.length * 2) % people.length]!.key]);
  });

  return { people, groups, posts, stories, curatedPosts, curatedStories, friends, follows };
}

