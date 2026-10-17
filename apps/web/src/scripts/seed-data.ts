/**
 * Sample content for `npm run seed`: 38 people with full profiles, groups, posts, stories and chats
 * (the topic-focused half lives in seed-data-topics.ts).
 * Photo numbers are Lorem Picsum ids (https://picsum.photos/id/<n>/info) chosen to match each caption;
 * avatar numbers are Pravatar ids (https://i.pravatar.cc/600?img=<n>). See seed-media.ts.
 */

import { TOPIC_CHATS, TOPIC_FOLLOWS, TOPIC_FRIENDS, TOPIC_GROUPS, TOPIC_PEOPLE, TOPIC_POSTS, TOPIC_SIGNALS, TOPIC_STORIES } from './seed-data-topics.js';

export type Topic = 'travel' | 'food' | 'coffee' | 'pets' | 'city' | 'work' | 'nature' | 'music' | 'study' | 'sport' | 'art' | 'general'
  | 'ai' | 'gaming' | 'books' | 'running' | 'fitness' | 'business' | 'fashion' | 'ocean' | 'baking' | 'film' | 'photography';

export type SeedPerson = {
  key: string;
  email: string;
  displayName: string;
  avatar: number;
  cover: number;
  profile: Record<string, unknown>;
};

export type SeedPhoto = number | [id: number, width: number, height: number];

export type SeedPost = {
  key: string;
  author: string;
  text: string;
  topic: Topic;
  hoursAgo: number;
  photos?: SeedPhoto[];
  group?: string;
  visibility?: 'public' | 'followers';
  feeling?: { type: 'feeling'; key: string } | { type: 'activity'; key: string; text: string };
  place?: { name: string; address: string; lat: number; lon: number };
  /** Hand-written comments shown first; [author, text, reply from the post author?]. */
  comments?: Array<[string, string, string?]>;
};

export type SeedGroup = {
  slug: string;
  name: string;
  description: string;
  cover: number;
  privacy: 'public' | 'private';
  groupType: string;
  location: string;
  tags: string[];
  rules: Array<{ title: string; details: string }>;
  questions?: string[];
  postApproval?: boolean;
  members: Array<[string, 'admin' | 'moderator' | 'member']>;
};

export type SeedStory = {
  author: string;
  minutesAgo: number;
  photo?: number;
  text?: string;
  background?: string;
  style?: Partial<{ font: string; color: string; align: string; effect: string; animation: string; size: number; x: number; y: number }>;
};

export type SeedChat = { members: [string, string]; messages: Array<[from: 0 | 1, text: string, minutesAgo: number]> };

/** A recorded behaviour signal for the recommender: one target (query, post key, profile key or group slug). */
export type SeedSignal = { user: string; type: 'search' | 'open' | 'dwell' | 'react'; hoursAgo: number; query?: string; post?: string; profile?: string; group?: string; durationMs?: number };

export const SEED_PASSWORD = 'CircleSpace123';
export const DEMO_ACCOUNT = 'maya';

const work = (company: string, position: string, city: string, startYear: number, description = '') =>
  ({ company, position, city, description, startDate: new Date(Date.UTC(startYear, 0, 1)), current: true });
const school = (name: string, concentration: string, startYear: number, endYear: number, degree = 'Bachelor') =>
  ({ school: name, level: 'college', concentration, degree, startYear, endYear, graduated: endYear <= 2026 });

const BASE_PEOPLE: SeedPerson[] = [
  { key: 'maya', email: 'maya@example.com', displayName: 'Maya Tran', avatar: 32, cover: 82, profile: {
    bio: 'Community gardener, weekend cyclist, and collector of good questions.', location: 'Da Nang, Vietnam', hometown: 'Hue, Vietnam',
    website: 'https://example.com/maya', storyAudience: 'followers', gender: 'female', pronouns: 'she/her', relationship: 'in_relationship',
    birthDay: 14, birthMonth: 3, birthYear: 1996, languages: ['Vietnamese', 'English'], hobbies: ['Gardening', 'Cycling', 'Podcasts', 'Pottery'],
    work: [work('Green Roots Collective', 'Community organizer', 'Da Nang', 2021, 'Rooftop gardens and composting workshops for apartment buildings.')],
    education: [school('University of Da Nang', 'Environmental Science', 2014, 2018)],
    links: [{ platform: 'instagram', url: 'https://instagram.com/maya.grows' }],
    about: 'I believe every balcony can feed someone. Ask me about worms.' } },
  { key: 'leominh', email: 'leo@example.com', displayName: 'Leo Minh', avatar: 12, cover: 1076, profile: {
    bio: 'Product designer exploring calmer digital spaces.', location: 'Ho Chi Minh City, Vietnam', hometown: 'Vung Tau, Vietnam',
    storyAudience: 'public', gender: 'male', pronouns: 'he/him', relationship: 'single', birthDay: 2, birthMonth: 9, birthYear: 1994,
    languages: ['Vietnamese', 'English'], hobbies: ['Sketching', 'Typography', 'Board games'],
    work: [work('Lumen Studio', 'Founder & product designer', 'Ho Chi Minh City', 2023)],
    education: [school('RMIT University Vietnam', 'Digital Design', 2012, 2016)],
    links: [{ platform: 'website', url: 'https://example.com/leo' }, { platform: 'linkedin', url: 'https://linkedin.com/in/leominh' }] } },
  { key: 'anikar', email: 'anika@example.com', displayName: 'Anika Rao', avatar: 35, cover: 1015, profile: {
    bio: 'Documentary photographer and slow traveler.', location: 'Singapore', hometown: 'Bengaluru, India', storyAudience: 'public',
    gender: 'female', pronouns: 'she/her', relationship: 'married', birthDay: 21, birthMonth: 11, birthYear: 1990,
    languages: ['English', 'Hindi', 'Kannada'], hobbies: ['Film photography', 'Hiking', 'Printmaking'],
    work: [work('Freelance', 'Documentary photographer', 'Singapore', 2017)],
    education: [school('National University of Singapore', 'Communications and New Media', 2008, 2012)],
    links: [{ platform: 'instagram', url: 'https://instagram.com/anika.frames' }] } },
  { key: 'jonahlee', email: 'jonah@example.com', displayName: 'Jonah Lee', avatar: 8, cover: 180, profile: {
    bio: 'Cooking, code, and city walks.', location: 'Hanoi, Vietnam', hometown: 'Vancouver, Canada', storyAudience: 'followers',
    gender: 'male', pronouns: 'he/him', relationship: 'single', birthDay: 30, birthMonth: 6, birthYear: 1995,
    languages: ['English', 'Korean', 'Vietnamese'], hobbies: ['Cooking', 'Running', 'Open source'],
    work: [work('Hanoi Labs', 'Backend engineer', 'Hanoi', 2022)],
    education: [school('University of British Columbia', 'Computer Science', 2013, 2017)],
    links: [{ platform: 'github', url: 'https://github.com/jonahlee' }] } },
  { key: 'ethanr', email: 'ethan@example.com', displayName: 'Ethan Reynolds', avatar: 60, cover: 1018, profile: {
    bio: 'Trail runner. Mountain person. Bad at sitting still.', location: 'Da Lat, Vietnam', hometown: 'Denver, USA', storyAudience: 'public',
    gender: 'male', pronouns: 'he/him', relationship: 'engaged', birthDay: 8, birthMonth: 1, birthYear: 1991,
    languages: ['English', 'Vietnamese'], hobbies: ['Trail running', 'Camping', 'Climbing'],
    work: [work('Highland Trails', 'Outdoor guide', 'Da Lat', 2019)], education: [school('Colorado State University', 'Outdoor Recreation', 2009, 2013)] } },
  { key: 'oliviah', email: 'olivia@example.com', displayName: 'Olivia Hayes', avatar: 26, cover: 1062, profile: {
    bio: 'Dog mom, latte art enthusiast, part-time illustrator.', location: 'Hoi An, Vietnam', hometown: 'Bristol, UK', storyAudience: 'public',
    gender: 'female', pronouns: 'she/her', relationship: 'single', birthDay: 19, birthMonth: 5, birthYear: 1997,
    languages: ['English'], hobbies: ['Illustration', 'Latte art', 'Dogs'],
    work: [work('Lantern House Studio', 'Illustrator', 'Hoi An', 2024)], education: [school('University of the West of England', 'Illustration', 2015, 2018)] } },
  { key: 'linhng', email: 'linh@example.com', displayName: 'Linh Nguyen', avatar: 24, cover: 1060, profile: {
    bio: 'Owner of Mây Coffee. Egg coffee evangelist ☕', location: 'Hanoi, Vietnam', hometown: 'Hanoi, Vietnam', storyAudience: 'public',
    gender: 'female', pronouns: 'she/her', relationship: 'married', birthDay: 3, birthMonth: 10, birthYear: 1993,
    languages: ['Vietnamese', 'English'], hobbies: ['Coffee roasting', 'Ceramics', 'Old Hanoi'],
    work: [work('Mây Coffee', 'Owner & head barista', 'Hanoi', 2025)], education: [school('Foreign Trade University', 'Business Administration', 2011, 2015)] } },
  { key: 'khoapham', email: 'khoa@example.com', displayName: 'Khoa Pham', avatar: 33, cover: 96, profile: {
    bio: 'Software engineer by day, co-op gamer by night.', location: 'Da Nang, Vietnam', hometown: 'Quang Nam, Vietnam', storyAudience: 'followers',
    gender: 'male', pronouns: 'he/him', relationship: 'single', birthDay: 12, birthMonth: 12, birthYear: 1998,
    languages: ['Vietnamese', 'English', 'Japanese'], hobbies: ['Gaming', 'Mechanical keyboards', 'Badminton'],
    work: [work('Sông Hàn Tech', 'Senior software engineer', 'Da Nang', 2022)], education: [school('Da Nang University of Science and Technology', 'Software Engineering', 2016, 2021, 'Engineer')],
    links: [{ platform: 'github', url: 'https://github.com/khoapham' }] } },
  { key: 'sofiam', email: 'sofia@example.com', displayName: 'Sofia Martins', avatar: 5, cover: 49, profile: {
    bio: 'Travel writer from Lisbon, currently based in Saigon. 42 countries and counting.', location: 'Ho Chi Minh City, Vietnam', hometown: 'Lisbon, Portugal',
    storyAudience: 'public', gender: 'female', pronouns: 'she/her', relationship: 'single', birthDay: 25, birthMonth: 7, birthYear: 1992,
    languages: ['Portuguese', 'English', 'Spanish'], hobbies: ['Travel', 'Swimming', 'Street food'],
    work: [work('Wander Notes', 'Travel writer', 'Ho Chi Minh City', 2020)], education: [school('University of Lisbon', 'Journalism', 2010, 2014)],
    links: [{ platform: 'website', url: 'https://example.com/wandernotes' }] } },
  { key: 'danielk', email: 'daniel@example.com', displayName: 'Daniel Kim', avatar: 55, cover: 1082, profile: {
    bio: 'Violinist and music producer. Saigon nights, Seoul roots.', location: 'Ho Chi Minh City, Vietnam', hometown: 'Seoul, South Korea', storyAudience: 'public',
    gender: 'male', pronouns: 'he/him', relationship: 'in_relationship', birthDay: 17, birthMonth: 2, birthYear: 1993,
    languages: ['Korean', 'English'], hobbies: ['Vinyl', 'Jazz', 'Film scores'],
    work: [work('Studio 88', 'Producer', 'Ho Chi Minh City', 2021)], education: [school('Seoul National University', 'Music', 2011, 2015)] } },
  { key: 'hanasato', email: 'hana@example.com', displayName: 'Hana Sato', avatar: 31, cover: 106, profile: {
    bio: 'Illustrator. Cat person. Always sketching flowers.', location: 'Da Nang, Vietnam', hometown: 'Osaka, Japan', storyAudience: 'public',
    gender: 'female', pronouns: 'she/her', relationship: 'single', birthDay: 9, birthMonth: 4, birthYear: 1996,
    languages: ['Japanese', 'English', 'Vietnamese'], hobbies: ['Watercolor', 'Cats', 'Flower markets'],
    work: [work('Freelance', 'Illustrator', 'Da Nang', 2022)], education: [school('Kyoto Seika University', 'Illustration', 2014, 2018)] } },
  { key: 'quangvo', email: 'quang@example.com', displayName: 'Quang Vo', avatar: 59, cover: 292, profile: {
    bio: 'Street food chef. Bánh mì chảo every morning from 6am.', location: 'Ho Chi Minh City, Vietnam', hometown: 'Ninh Thuan, Vietnam', storyAudience: 'followers',
    gender: 'male', pronouns: 'he/him', relationship: 'married', birthDay: 28, birthMonth: 8, birthYear: 1989,
    languages: ['Vietnamese'], hobbies: ['Cooking', 'Markets', 'Football'],
    work: [work('Bếp Nhà Quang', 'Chef & owner', 'Ho Chi Minh City', 2018)], education: [school('Saigon Tourism College', 'Culinary Arts', 2007, 2009, 'Diploma')] } },
  { key: 'priyas', email: 'priya@example.com', displayName: 'Priya Shah', avatar: 48, cover: 1073, profile: {
    bio: 'UX researcher. I ask "why" for a living. Book hoarder.', location: 'Singapore', hometown: 'Mumbai, India', storyAudience: 'followers',
    gender: 'female', pronouns: 'she/her', relationship: 'single', birthDay: 4, birthMonth: 2, birthYear: 1995,
    languages: ['English', 'Hindi', 'Gujarati'], hobbies: ['Reading', 'Yoga', 'Cafés'],
    work: [work('Fintrail', 'Senior UX researcher', 'Singapore', 2023)], education: [school('National Institute of Design', 'Interaction Design', 2013, 2017)] } },
  { key: 'lucasb', email: 'lucas@example.com', displayName: 'Lucas Bennett', avatar: 52, cover: 1058, profile: {
    bio: 'Youth football coach. Saigon Strikers U12 ⚽', location: 'Ho Chi Minh City, Vietnam', hometown: 'Manchester, UK', storyAudience: 'public',
    gender: 'male', pronouns: 'he/him', relationship: 'married', birthDay: 15, birthMonth: 10, birthYear: 1988,
    languages: ['English'], hobbies: ['Football', 'Hiking', 'BBQ'],
    work: [work('Saigon Strikers Academy', 'Head coach, U12', 'Ho Chi Minh City', 2019)], education: [school('Loughborough University', 'Sport Science', 2006, 2009)] } },
  { key: 'thaole', email: 'thao@example.com', displayName: 'Thao Le', avatar: 25, cover: 360, profile: {
    bio: 'Florist in the city of eternal spring 🌸', location: 'Da Lat, Vietnam', hometown: 'Da Lat, Vietnam', storyAudience: 'public',
    gender: 'female', pronouns: 'she/her', relationship: 'in_relationship', birthDay: 22, birthMonth: 3, birthYear: 1997,
    languages: ['Vietnamese', 'English'], hobbies: ['Flowers', 'Gardening', 'Baking'],
    work: [work("Thảo's Florist", 'Owner', 'Da Lat', 2021)], education: [school('Da Lat University', 'Biology', 2015, 2019)] } },
  { key: 'marcor', email: 'marco@example.com', displayName: 'Marco Rossi', avatar: 58, cover: 116, profile: {
    bio: 'Photographer from Florence, living in Hội An for the light.', location: 'Hoi An, Vietnam', hometown: 'Florence, Italy', storyAudience: 'public',
    gender: 'male', pronouns: 'he/him', relationship: 'single', birthDay: 6, birthMonth: 6, birthYear: 1987,
    languages: ['Italian', 'English'], hobbies: ['Street photography', 'Vintage cars', 'Espresso'],
    work: [work('Rossi Photo', 'Photographer', 'Hoi An', 2018)], education: [school('University of Florence', 'Architecture', 2006, 2011, 'Master')] } },
  { key: 'maidang', email: 'mai@example.com', displayName: 'Mai Dang', avatar: 44, cover: 1067, profile: {
    bio: 'IT student, intern, professional bubble tea taster.', location: 'Da Nang, Vietnam', hometown: 'Quang Ngai, Vietnam', storyAudience: 'followers',
    gender: 'female', pronouns: 'she/her', relationship: 'single', birthDay: 11, birthMonth: 11, birthYear: 2004,
    languages: ['Vietnamese', 'English'], hobbies: ['Coding', 'K-pop', 'Beach volleyball'],
    work: [work('Sông Hàn Tech', 'Software engineering intern', 'Da Nang', 2026)], education: [school('VN-UK Institute for Research and Executive Education', 'Computer Science', 2022, 2026)] } },
  { key: 'noahw', email: 'noah@example.com', displayName: 'Noah Williams', avatar: 13, cover: 1074, profile: {
    bio: 'Wildlife photographer. Patience is the whole job.', location: 'Cape Town, South Africa', hometown: 'Cape Town, South Africa', storyAudience: 'public',
    gender: 'male', pronouns: 'he/him', relationship: 'single', birthDay: 1, birthMonth: 8, birthYear: 1990,
    languages: ['English', 'Afrikaans'], hobbies: ['Wildlife', 'Camping', 'Astronomy'],
    work: [work('Wild Frame', 'Wildlife photographer', 'Cape Town', 2016)], education: [school('University of Cape Town', 'Zoology', 2008, 2012)] } },
  { key: 'chloed', email: 'chloe@example.com', displayName: 'Chloe Dubois', avatar: 36, cover: 420, profile: {
    bio: 'Architect. Concrete, light, and croissants.', location: 'Ho Chi Minh City, Vietnam', hometown: 'Paris, France', storyAudience: 'followers',
    gender: 'female', pronouns: 'she/her', relationship: 'in_relationship', birthDay: 27, birthMonth: 1, birthYear: 1992,
    languages: ['French', 'English', 'Vietnamese'], hobbies: ['Architecture', 'Cycling', 'Pastry'],
    work: [work('Atelier Sơn', 'Architect', 'Ho Chi Minh City', 2022)], education: [school('École nationale supérieure d\'architecture de Paris-Belleville', 'Architecture', 2010, 2016, 'Master')] } },
  { key: 'tuanbui', email: 'tuan@example.com', displayName: 'Tuan Bui', avatar: 53, cover: 204, profile: {
    bio: 'Motorbike traveler. 63 provinces, 1 old Honda.', location: 'Hanoi, Vietnam', hometown: 'Ha Giang, Vietnam', storyAudience: 'public',
    gender: 'male', pronouns: 'he/him', relationship: 'single', birthDay: 19, birthMonth: 9, birthYear: 1994,
    languages: ['Vietnamese', 'English'], hobbies: ['Motorbikes', 'Trains', 'Photography'],
    work: [work('North Loop Tours', 'Tour leader', 'Hanoi', 2020)], education: [school('Hanoi University', 'Tourism', 2012, 2016)] } }
];

const BASE_GROUPS: SeedGroup[] = [
  { slug: 'city-gardeners', name: 'City Gardeners', description: 'Practical growing advice for balconies, rooftops, and small urban spaces.', cover: 400,
    privacy: 'public', groupType: 'hobbies', location: 'Da Nang, Vietnam', tags: ['gardening', 'balcony', 'urban'],
    rules: [{ title: 'Be kind and courteous', details: 'Everyone starts somewhere. Share advice, not judgement.' }, { title: 'No promotions or spam', details: 'Plant sales belong in the monthly swap thread.' }],
    members: [['maya', 'admin'], ['thaole', 'moderator'], ['leominh', 'member'], ['jonahlee', 'member'], ['oliviah', 'member'], ['maidang', 'member'], ['hanasato', 'member'], ['quangvo', 'member']] },
  { slug: 'street-photography', name: 'Street Photography', description: 'Candid city moments, gear talk, and weekly photo walks across Southeast Asia.', cover: 91,
    privacy: 'private', groupType: 'learning', location: 'Singapore', tags: ['photography', 'street', 'travel'], postApproval: true,
    rules: [{ title: 'Only share your own photos', details: 'Credit collaborators and never repost without permission.' }, { title: "Respect everyone's privacy", details: 'Ask before posting recognisable faces of strangers.' }],
    questions: ['What do you usually shoot with?', 'Which city would you love to photograph next?'],
    members: [['anikar', 'admin'], ['marcor', 'moderator'], ['maya', 'member'], ['oliviah', 'member'], ['noahw', 'member'], ['tuanbui', 'member'], ['sofiam', 'member'], ['chloed', 'member']] },
  { slug: 'saigon-coffee-lovers', name: 'Coffee Lovers Vietnam', description: 'Cafés, beans, brewing gear and the eternal egg-coffee-vs-salt-coffee debate.', cover: 42,
    privacy: 'public', groupType: 'social', location: 'Vietnam', tags: ['coffee', 'cafes', 'food'],
    rules: [{ title: 'Recommendations welcome', details: 'Tell us the district and what makes the place special.' }, { title: 'Café owners: one promo post a month', details: 'Everything else should be a conversation.' }],
    members: [['linhng', 'admin'], ['quangvo', 'moderator'], ['danielk', 'member'], ['sofiam', 'member'], ['chloed', 'member'], ['leominh', 'member'], ['priyas', 'member'], ['maya', 'member'], ['oliviah', 'member'], ['marcor', 'member']] },
  { slug: 'weekend-hikers-vietnam', name: 'Weekend Hikers Vietnam', description: 'Group treks, trail reports and gear swaps. All paces welcome.', cover: 1036,
    privacy: 'public', groupType: 'hobbies', location: 'Da Lat, Vietnam', tags: ['hiking', 'outdoors', 'trekking'],
    rules: [{ title: 'Leave no trace', details: 'Pack out everything you pack in.' }, { title: 'Share honest trail reports', details: 'Difficulty, weather and water sources help everyone stay safe.' }],
    members: [['ethanr', 'admin'], ['tuanbui', 'moderator'], ['noahw', 'member'], ['sofiam', 'member'], ['maya', 'member'], ['khoapham', 'member'], ['lucasb', 'member'], ['anikar', 'member']] },
  { slug: 'danang-developers', name: 'Da Nang Developers', description: 'Meetups, job posts and help for software developers in central Vietnam.', cover: 2,
    privacy: 'public', groupType: 'work', location: 'Da Nang, Vietnam', tags: ['programming', 'jobs', 'meetup'],
    rules: [{ title: 'Ask good questions', details: 'Share what you tried and the exact error message.' }, { title: 'Job posts need a salary range', details: 'Posts without one are removed.' }],
    members: [['khoapham', 'admin'], ['maidang', 'member'], ['jonahlee', 'member'], ['leominh', 'member'], ['priyas', 'member'], ['maya', 'member']] }
];

const place = (name: string, address: string, lat: number, lon: number) => ({ name, address, lat, lon });

const BASE_POSTS: SeedPost[] = [
  // Maya (demo account)
  { key: 'seed-welcome', author: 'maya', topic: 'general', hoursAgo: 240, text: 'I started using Oremus to make online conversation feel a little more like sharing a table. What is one small thing your community taught you this week?',
    comments: [['leominh', 'This week I learned that asking for help early makes a project stronger, not weaker.'], ['thaole', 'That a neighbour will always lend you a ladder if you bring flowers 🌸', 'Ha! Flowers as currency, I love it.']] },
  { key: 'maya-harvest', author: 'maya', topic: 'food', hoursAgo: 30, photos: [102], feeling: { type: 'feeling', key: 'proud' },
    text: 'First harvest from the balcony! Only five raspberries, but I have never been prouder of anything.',
    comments: [['jonahlee', 'Five perfect raspberries > a whole supermarket box.'], ['thaole', 'Next year: fifty. I believe in you!', 'Hold me to that 😄']] },
  { key: 'maya-ride', author: 'maya', topic: 'sport', hoursAgo: 52, photos: [1057, 1050], place: place('Son Tra Peninsula', 'Son Tra, Da Nang', 16.1214, 108.2766),
    text: 'Sunday ride around Sơn Trà: 42 km, one flat tyre and a lot of monkeys judging me from the trees.' },
  { key: 'maya-workshop', author: 'maya', topic: 'nature', hoursAgo: 20, group: 'city-gardeners',
    text: 'Workshop this Saturday at 9am: composting for small balconies. Bring a container with a lid, we will bring the worms 🪱 Comment if you are coming so we can prepare enough.' },
  { key: 'maya-books', author: 'maya', topic: 'study', hoursAgo: 100, text: 'What should I read next? My last three favourites were "Braiding Sweetgrass", "The Overstory" and "Norwegian Wood". Surprise me.' },
  { key: 'maya-pier', author: 'maya', topic: 'travel', hoursAgo: 400, photos: [77], place: place('An Bang Beach', 'Hoi An, Quang Nam', 15.9139, 108.3404),
    text: 'Quiet morning at the pier before the tour buses arrive.' },

  // Leo
  { key: 'seed-design', author: 'leominh', topic: 'work', hoursAgo: 90, text: 'A useful design test: can someone understand the next action without reading every word? Clarity is a form of kindness.' },
  { key: 'leo-studio', author: 'leominh', topic: 'work', hoursAgo: 26, photos: [0], feeling: { type: 'feeling', key: 'excited' }, place: place('Lumen Studio', 'District 3, Ho Chi Minh City', 10.7798, 106.6869),
    text: 'New desk, same coffee ritual. Lumen Studio is officially out of my bedroom and into a real office!' },
  { key: 'leo-pug', author: 'leominh', topic: 'pets', hoursAgo: 8, photos: [1025, 1062],
    text: 'My neighbour\'s pug Bánh Bao has decided he lives with me now. I was not consulted.' },
  { key: 'leo-sketch', author: 'leominh', topic: 'art', hoursAgo: 160, photos: [4], group: 'danang-developers',
    text: 'Reminder for anyone designing their side project: sketch on paper first. Ten minutes with a pen saves a week in Figma.' },

  // Anika
  { key: 'seed-photo', author: 'anikar', topic: 'city', hoursAgo: 60, photos: [[57, 1200, 1500]],
    text: 'Early light on an empty street, before the city fully wakes. The quiet hour always tells a different story.' },
  { key: 'anika-norway', author: 'anikar', topic: 'travel', hoursAgo: 300, photos: [1015, 1018, 1050], place: place('Preikestolen', 'Rogaland, Norway', 58.9864, 6.1904),
    text: 'Three weeks in Norway, and the light never stopped surprising me. The fjord in the first photo made me cry a little.' },
  { key: 'anika-reflections', author: 'anikar', topic: 'art', hoursAgo: 34, photos: [74], group: 'street-photography',
    text: 'Weekly challenge: shoot only reflections. Here is mine from the harbour. Post yours below!' },
  { key: 'anika-film', author: 'anikar', topic: 'art', hoursAgo: 500, photos: [[91, 1200, 1500]],
    text: 'Rolling film again. Twelve frames a roll makes you actually look before you press the shutter.' },

  // Jonah
  { key: 'seed-garden', author: 'jonahlee', topic: 'nature', hoursAgo: 46, photos: [400], group: 'city-gardeners',
    text: 'My basil finally recovered after I moved it out of the afternoon sun. Water in the morning, never at night, and pinch the flowers off early.' },
  { key: 'jonah-mealprep', author: 'jonahlee', topic: 'food', hoursAgo: 14, photos: [292], feeling: { type: 'feeling', key: 'hungry' },
    text: 'Sunday meal prep: three dishes, five days, and one onion that made me cry for real.' },
  { key: 'jonah-node', author: 'jonahlee', topic: 'work', hoursAgo: 70, group: 'danang-developers',
    text: 'Anyone else running Node 22 in production yet? We upgraded our API last week and memory use dropped about 18%. Happy to share notes.' },
  { key: 'jonah-strawberries', author: 'jonahlee', topic: 'food', hoursAgo: 120, photos: [1080], place: place('Long Bien Market', 'Ba Dinh, Hanoi', 21.0405, 105.8505),
    text: 'Strawberry season at the market. I bought way too many, so jam is happening tonight.' },

  // Ethan
  { key: 'seed-trip', author: 'ethanr', topic: 'travel', hoursAgo: 80, photos: [1016, 1043],
    text: 'Finally made it to the canyon I have been dreaming about for years. Worth every one of the 1,200 steps.' },
  { key: 'ethan-run', author: 'ethanr', topic: 'sport', hoursAgo: 6, photos: [324, 17], feeling: { type: 'feeling', key: 'motivated' }, place: place('Langbiang Mountain', 'Lac Duong, Lam Dong', 12.0473, 108.4403),
    text: 'Morning trail run through the pine forest: 16 km, 600 m of climbing, zero regrets.' },
  { key: 'ethan-trek', author: 'ethanr', topic: 'travel', hoursAgo: 40, group: 'weekend-hikers-vietnam',
    text: 'Planning a 2-day trek to Lảo Thẩn in November. 4 spots left. Beginners welcome if you can walk 8 hours with a small pack. Comment to join!' },
  { key: 'ethan-camp', author: 'ethanr', topic: 'nature', hoursAgo: 600, photos: [1036],
    text: 'Woke up to snow at the tent door. Coffee has never tasted better.' },

  // Olivia
  { key: 'seed-latte', author: 'oliviah', topic: 'coffee', hoursAgo: 16, photos: [63], text: 'Two flat whites, one very patient barista, and zero plans for the afternoon.' },
  { key: 'olivia-river', author: 'oliviah', topic: 'pets', hoursAgo: 54, photos: [1012], visibility: 'followers',
    text: 'Took Mochi to the river and he refused to come home. Fair enough, honestly.' },
  { key: 'olivia-dreamcatcher', author: 'oliviah', topic: 'art', hoursAgo: 200, photos: [[104, 1200, 1500]],
    text: 'Made a dreamcatcher at the night market workshop. Slightly crooked, completely mine.' },
  { key: 'olivia-lanterns', author: 'oliviah', topic: 'general', hoursAgo: 3, feeling: { type: 'feeling', key: 'festive' },
    text: 'Hội An lantern night tonight 🏮 Who is around? I will be at the bridge from 7.' },

  // Linh
  { key: 'linh-birthday', author: 'linhng', topic: 'coffee', hoursAgo: 10, photos: [1060, 42], feeling: { type: 'feeling', key: 'grateful' }, place: place('Mây Coffee', 'Hoan Kiem, Hanoi', 21.0313, 105.8516),
    text: 'Mây Coffee turns one today! Thank you for every cup, every chat, every rainy afternoon. Free egg coffee until 11am ☕',
    comments: [['maya', 'Happy birthday Mây! Saving my egg coffee for next week ☕'], ['danielk', 'Best café in Hà Nội, no debate.', 'You are too kind 🥹']] },
  { key: 'linh-beans', author: 'linhng', topic: 'coffee', hoursAgo: 30, photos: [312], group: 'saigon-coffee-lovers',
    text: 'New beans in: Đà Lạt Arabica, washed process. Notes of honey and orange peel. Who wants to do a cupping with me on Friday?' },
  { key: 'linh-autumn', author: 'linhng', topic: 'city', hoursAgo: 76,
    text: 'Hà Nội vào thu rồi. Sáng nay se lạnh, cà phê trứng bán hết sạch trước 9 giờ 🍂' },

  // Khoa
  { key: 'khoa-games', author: 'khoapham', topic: 'general', hoursAgo: 22, photos: [96], feeling: { type: 'activity', key: 'playing', text: 'It Takes Two' },
    text: 'Release shipped, so I have earned one evening of games. Recommendations for co-op games are welcome.' },
  { key: 'khoa-meetup', author: 'khoapham', topic: 'work', hoursAgo: 44, photos: [1], group: 'danang-developers',
    text: 'Meetup #12 recap: 60 people, three talks on caching, and far too much pizza. Next one is about testing. Speakers wanted!' },
  { key: 'khoa-deploy', author: 'khoapham', topic: 'work', hoursAgo: 130, feeling: { type: 'feeling', key: 'tired' },
    text: 'Mới deploy xong lúc 2 giờ sáng, test pass hết. Đi ngủ thôi anh em 😴' },

  // Sofia
  { key: 'sofia-islands', author: 'sofiam', topic: 'travel', hoursAgo: 18, photos: [49, 108],
    text: 'Throwback to Santorini. Planning my next island trip: Côn Đảo or Phú Quốc? Convince me.' },
  { key: 'sofia-waterfall', author: 'sofiam', topic: 'nature', hoursAgo: 250, photos: [[1035, 1200, 1500]], group: 'weekend-hikers-vietnam',
    text: 'That moment when the waterfall throws a rainbow at you.' },
  { key: 'sofia-lisbon', author: 'sofiam', topic: 'city', hoursAgo: 400, photos: [308], place: place('Alfama', 'Lisbon, Portugal', 38.7118, -9.1305),
    text: 'Home for a week. Laundry lines and pastel walls, still my favourite kind of street.' },

  // Daniel
  { key: 'daniel-recording', author: 'danielk', topic: 'music', hoursAgo: 12, photos: [1082],
    text: 'Recording day. Third take of the same eight bars, but the third one had something.' },
  { key: 'daniel-vinyl', author: 'danielk', topic: 'music', hoursAgo: 98, photos: [39], feeling: { type: 'activity', key: 'listening', text: 'Trịnh Công Sơn' },
    text: 'Found an old Trịnh Công Sơn record at a little shop in District 1. On repeat all evening.' },
  { key: 'daniel-show', author: 'danielk', topic: 'music', hoursAgo: 150, photos: [117],
    text: 'Last night\'s show. Thank you Saigon, you were loud.' },

  // Hana
  { key: 'hana-cat', author: 'hanasato', topic: 'pets', hoursAgo: 4, photos: [40],
    text: 'Mochi the cat says good morning. (Not to be confused with Olivia\'s Mochi the dog.)',
    comments: [['oliviah', 'The Mochis must meet one day.', 'A historic summit 🐱🐶']] },
  { key: 'hana-flowers', author: 'hanasato', topic: 'art', hoursAgo: 110, photos: [152, 106],
    text: 'Collecting references at the flower market for a new watercolor series.' },

  // Quang
  { key: 'quang-grapes', author: 'quangvo', topic: 'food', hoursAgo: 28, photos: [75],
    text: 'Ninh Thuận grapes are in season. Grape granita on the menu this weekend!' },
  { key: 'quang-banhmi', author: 'quangvo', topic: 'food', hoursAgo: 58,
    text: 'Bánh mì chảo hôm nay hết lúc 8 giờ. Mai em làm gấp đôi nha mọi người 🙏' },
  { key: 'quang-debate', author: 'quangvo', topic: 'coffee', hoursAgo: 65, group: 'saigon-coffee-lovers',
    text: 'Hot take: salt coffee is better than egg coffee. Fight me in the comments.' },

  // Priya
  { key: 'priya-reading', author: 'priyas', topic: 'study', hoursAgo: 36, photos: [1073, 24], feeling: { type: 'activity', key: 'reading', text: 'The Design of Everyday Things' },
    text: 'Reading list for the rainy season. Currently on my fourth reread of a classic.' },
  { key: 'priya-study', author: 'priyas', topic: 'work', hoursAgo: 84, group: 'danang-developers',
    text: 'Running usability tests for a banking app in Đà Nẵng next week. Looking for 2 more participants: 45 minutes, coffee on me.' },
  { key: 'priya-cafe', author: 'priyas', topic: 'coffee', hoursAgo: 220, photos: [192],
    text: 'Best café for working in Singapore? This one has beautiful light and exactly zero sockets.' },

  // Lucas
  { key: 'lucas-win', author: 'lucasb', topic: 'sport', hoursAgo: 9, photos: [1058], feeling: { type: 'feeling', key: 'proud' },
    text: 'U12s won 3–1 today. Proudest coach in District 7.' },
  { key: 'lucas-trek', author: 'lucasb', topic: 'nature', hoursAgo: 140, photos: [1044], group: 'weekend-hikers-vietnam',
    text: 'Weekend trek done. Legs destroyed, soul restored.' },
  { key: 'lucas-fivea', author: 'lucasb', topic: 'sport', hoursAgo: 260,
    text: 'Looking for a Sunday 5-a-side team in HCMC. Decent defender, terrible at penalties.' },

  // Thao
  { key: 'thao-shop', author: 'thaole', topic: 'nature', hoursAgo: 15, photos: [360, 82], place: place("Thảo's Florist", 'Ward 1, Da Lat', 11.9404, 108.4583),
    text: 'New arrivals at the shop: orange clivia and the last cherry blossom branches of the season 🌸' },
  { key: 'thao-cactus', author: 'thaole', topic: 'nature', hoursAgo: 88, photos: [248], group: 'city-gardeners',
    text: 'Cactus care 101: water less than you think. Then water even less.' },
  { key: 'thao-fog', author: 'thaole', topic: 'nature', hoursAgo: 50, photos: [70],
    text: 'Đà Lạt sáng nay 14 độ, sương mù dày đặc. Ai lên chơi nhớ mang áo ấm nha!' },

  // Marco
  { key: 'marco-tuscany', author: 'marcor', topic: 'travel', hoursAgo: 190, photos: [116], place: place('Val d\'Orcia', 'Tuscany, Italy', 43.0705, 11.6767),
    text: 'Home for the harvest. Tuscany in October never gets old.' },
  { key: 'marco-alley', author: 'marcor', topic: 'art', hoursAgo: 24, photos: [[1047, 1200, 1500]], group: 'street-photography',
    text: 'Back alley after the rain. The light lasts about four minutes, so you have to already be standing there.' },
  { key: 'marco-car', author: 'marcor', topic: 'city', hoursAgo: 350, photos: [111],
    text: 'Spotted at a wedding. Built in 1939 and still more stylish than all of us.' },

  // Mai
  { key: 'mai-exams', author: 'maidang', topic: 'study', hoursAgo: 7, feeling: { type: 'feeling', key: 'drained' },
    text: 'Tuần thi cuối kỳ 😭 Ai có tài liệu Cấu trúc dữ liệu và giải thuật cho mình xin với ạ' },
  { key: 'mai-firstpr', author: 'maidang', topic: 'work', hoursAgo: 48, group: 'danang-developers', feeling: { type: 'feeling', key: 'excited' },
    text: 'My first PR got merged at my internship!! It was a typo fix, but it COUNTS.' },
  { key: 'mai-beach', author: 'maidang', topic: 'travel', hoursAgo: 170, photos: [372], place: place('My Khe Beach', 'Son Tra, Da Nang', 16.0544, 108.2478),
    text: 'Study break at Mỹ Khê. Twenty minutes of sea air, then back to the books.' },

  // Noah
  { key: 'noah-lioness', author: 'noahw', topic: 'nature', hoursAgo: 20, photos: [1074],
    text: 'Eye contact with a lioness at fifteen metres. My hands were not steady.' },
  { key: 'noah-fawn', author: 'noahw', topic: 'nature', hoursAgo: 130, photos: [1003],
    text: 'This little one followed us along the trail for ten minutes.' },
  { key: 'noah-walrus', author: 'noahw', topic: 'pets', hoursAgo: 330, photos: [1084], feeling: { type: 'feeling', key: 'relaxed' },
    text: 'Walrus naps are the most relatable thing in nature.' },
  { key: 'noah-aurora', author: 'noahw', topic: 'nature', hoursAgo: 700, photos: [1022],
    text: 'Northern lights from the cabin last winter. Still my phone wallpaper.' },

  // Chloe
  { key: 'chloe-paris', author: 'chloed', topic: 'city', hoursAgo: 66, photos: [420], place: place('Paris', 'Île-de-France, France', 48.8566, 2.3522),
    text: 'Back in Paris for a conference. I missed the bakeries, not the prices.' },
  { key: 'chloe-facades', author: 'chloed', topic: 'art', hoursAgo: 140, photos: [1076, 1081],
    text: 'Façades I keep thinking about. Concrete can be soft if the light is right.' },
  { key: 'chloe-cafes', author: 'chloed', topic: 'coffee', hoursAgo: 12, group: 'saigon-coffee-lovers',
    text: 'Recommendation thread: best cafés in Thảo Điền with good wifi and actual chairs (not tiny stools)?' },

  // Tuan
  { key: 'tuan-train', author: 'tuanbui', topic: 'travel', hoursAgo: 32, photos: [69, 1026], feeling: { type: 'activity', key: 'traveling', text: 'Huế' },
    text: 'Took the Reunification Express from Hà Nội to Huế. 13 hours, two bowls of phở, one new friend.' },
  { key: 'tuan-hagiang', author: 'tuanbui', topic: 'travel', hoursAgo: 75, photos: [28], group: 'weekend-hikers-vietnam', place: place('Ma Pi Leng Pass', 'Meo Vac, Ha Giang', 23.2383, 105.4247),
    text: 'Hà Giang loop, day 3. Every corner is a postcard.' },
  { key: 'tuan-bike', author: 'tuanbui', topic: 'travel', hoursAgo: 230, photos: [212],
    text: 'My bike after 1,200 km. It needs a wash. So do I.' }
];

/** Generic comments by topic, used to fill out threads after the hand-written ones. */
export const COMMENTS: Record<Topic, string[]> = {
  travel: ['Adding this to my list right now.', 'How many days would you recommend?', 'This looks unreal 😍', 'Take me with you next time!', 'Was it crowded?', 'The colours in this are amazing.'],
  food: ['Recipe please!', 'Now I am hungry, thanks a lot 😅', 'Save me a plate.', 'This looks so fresh.', 'Where can I buy these?'],
  coffee: ['Count me in ☕', 'Which roast do you use?', 'I need this right now.', 'Is it open on Sundays?', 'Team egg coffee forever.'],
  pets: ['Too cute 😭', 'Give them a pat from me!', 'That face 🥹', 'I would also refuse to go home.', 'Celebrity of the neighbourhood.'],
  city: ['I walked past here last month!', 'Love the mood of this.', 'Such a beautiful street.', 'The light is perfect.'],
  work: ['Congrats, well deserved!', 'Would love to hear more about this.', 'Great tip, thanks for sharing.', 'Saving this for later.', 'Totally agree.'],
  nature: ['So peaceful.', 'Nature is healing 🌿', 'I can almost smell the fresh air.', 'Goals.', 'Wow, what a view.'],
  music: ['Can’t wait to hear it!', 'Goosebumps.', 'When is the next show?', 'Great taste 🎶'],
  study: ['You got this! 💪', 'Good luck!', 'Adding these to my reading list.', 'Coffee and focus, you can do it.'],
  sport: ['Legend!', 'Well played 👏', 'Respect, that is a lot of kilometres.', 'Next time I am joining.'],
  art: ['Beautiful work.', 'The composition is so good.', 'This deserves to be printed.', 'Love the light here.'],
  general: ['Haha love this 😄', 'Same here!', 'This made my day.', 'So true.', '❤️'],
  ai: ['Is the code open source?', 'Which model did you use?', 'Fascinating results 🤖', 'How big was the dataset?', 'Would love a write-up on this.'],
  gaming: ['GG!', 'Adding this to my wishlist 🎮', 'Co-op night soon?', 'That play was clean.', 'What rank are you?'],
  books: ['Adding this to my reading list 📚', 'One of my all-time favourites.', 'Have you read the sequel?', 'Beautiful quote.'],
  running: ['What pace were you running?', 'Incredible effort 🏃', 'See you at the next race!', 'Which shoes do you use?'],
  fitness: ['Needed this today 🙏', 'Great tips!', 'Consistency is everything.', 'Trying this tomorrow morning.'],
  business: ['Great lesson, thanks for sharing.', 'Saving this for my team.', 'How did your customers react?', 'Totally agree.'],
  fashion: ['Obsessed with this look 😍', 'Where can I buy it?', 'The fabric looks amazing.', 'Vintage forever.'],
  ocean: ['The water looks so clear 🌊', 'Bucket list!', 'Was it a good season for visibility?', 'Ocean goals.'],
  baking: ['That crumb 😍', 'Recipe please!', 'Smells amazing through the screen.', 'Save me a slice.'],
  film: ['Adding this to my watchlist 🎬', 'Where can I watch it?', 'Congrats on the festival!', 'Great list.'],
  photography: ['The light in this is perfect 📷', 'Which lens?', 'This deserves a print.', 'Love the mood.']
};

export const REPLIES = ['Thank you! 😊', 'Haha, thanks!', 'Right? 😄', 'Appreciate it!', 'Let’s go together next time!', '🙏', 'Will do!'];

const BASE_STORIES: SeedStory[] = [
  { author: 'ethanr', minutesAgo: 5, photo: 324, text: 'Morning run before the clouds roll in', style: { font: 'strong', effect: 'shadow', y: 78 } },
  { author: 'oliviah', minutesAgo: 20, photo: 63 },
  { author: 'oliviah', minutesAgo: 12, text: 'Lantern night in Hội An tonight. Who is coming? 🏮', background: 'sunset', style: { font: 'script', size: 1.3, animation: 'fade' } },
  { author: 'leominh', minutesAgo: 120, photo: 1025, text: 'Meet my new office manager', style: { font: 'classic', effect: 'highlight', color: '#000000', y: 82 } },
  { author: 'anikar', minutesAgo: 150, photo: 57 },
  { author: 'maya', minutesAgo: 300, text: 'Seedlings are up! 🌱', background: 'forest', style: { font: 'retro', size: 1.6, animation: 'bounce' } },
  { author: 'linhng', minutesAgo: 45, photo: 1060, text: 'Mây Coffee is 1 today ☕', style: { font: 'serif', effect: 'shadow', y: 20 } },
  { author: 'danielk', minutesAgo: 90, photo: 1082, text: 'take 3', style: { font: 'typewriter', effect: 'none', align: 'left', x: 30, y: 85 } },
  { author: 'hanasato', minutesAgo: 35, photo: 40, text: 'good morning from Mochi', style: { font: 'script', color: '#ffcc00', effect: 'glow', y: 75 } },
  { author: 'lucasb', minutesAgo: 400, photo: 1058, text: '3–1!!', style: { font: 'strong', size: 2.2, color: '#34c759', effect: 'outline', animation: 'zoom' } },
  { author: 'thaole', minutesAgo: 200, photo: 82 },
  { author: 'noahw', minutesAgo: 600, photo: 1074, text: 'Day 4 in the reserve', style: { font: 'classic', effect: 'shadow', y: 88 } },
  { author: 'sofiam', minutesAgo: 500, photo: 108, text: 'missing this', style: { font: 'serif', effect: 'shadow', animation: 'slide' } },
  { author: 'tuanbui', minutesAgo: 240, photo: 69, text: 'Next stop: Huế', style: { font: 'typewriter', effect: 'highlight', color: '#000000', y: 15 } },
  { author: 'maidang', minutesAgo: 60, text: 'exam week survival mode 📚☕', background: 'candy', style: { font: 'retro', animation: 'pulse' } },
  { author: 'khoapham', minutesAgo: 700, text: 'deploy on Friday? never again', background: 'night', style: { font: 'typewriter', color: '#00c7be', effect: 'neon' } }
];

/** Accepted friendships. The demo account gets plenty so its feed, contacts and chats look lived-in. */
const BASE_FRIENDS: Array<[string, string]> = [
  ['maya', 'leominh'], ['maya', 'anikar'], ['maya', 'ethanr'], ['maya', 'oliviah'], ['maya', 'linhng'], ['maya', 'thaole'], ['maya', 'sofiam'],
  ['maya', 'hanasato'], ['maya', 'jonahlee'], ['maya', 'priyas'], ['maya', 'khoapham'],
  ['leominh', 'jonahlee'], ['leominh', 'chloed'], ['leominh', 'priyas'], ['leominh', 'danielk'], ['anikar', 'marcor'], ['anikar', 'noahw'], ['anikar', 'sofiam'],
  ['jonahlee', 'khoapham'], ['jonahlee', 'linhng'], ['ethanr', 'tuanbui'], ['ethanr', 'lucasb'], ['ethanr', 'noahw'], ['ethanr', 'sofiam'],
  ['oliviah', 'hanasato'], ['oliviah', 'marcor'], ['oliviah', 'thaole'], ['linhng', 'danielk'], ['linhng', 'quangvo'], ['linhng', 'sofiam'],
  ['khoapham', 'maidang'], ['khoapham', 'priyas'], ['sofiam', 'chloed'], ['sofiam', 'tuanbui'], ['danielk', 'quangvo'], ['danielk', 'chloed'],
  ['hanasato', 'thaole'], ['quangvo', 'lucasb'], ['priyas', 'maidang'], ['lucasb', 'tuanbui'], ['thaole', 'maidang'], ['marcor', 'chloed'],
  ['noahw', 'tuanbui'], ['chloed', 'lucasb']
];

/** Friend requests still waiting for the demo account to answer: [requester, recipient]. */
export const PENDING_REQUESTS: Array<[string, string]> = [['marcor', 'maya'], ['lucasb', 'maya'], ['maidang', 'maya'], ['maya', 'danielk']];

/** One-way follows on top of friendships (friends always follow each other). */
const BASE_FOLLOWS: Array<[string, string]> = [
  ['marcor', 'maya'], ['lucasb', 'maya'], ['maidang', 'maya'], ['noahw', 'maya'], ['quangvo', 'maya'], ['chloed', 'maya'], ['tuanbui', 'maya'],
  ['maya', 'noahw'], ['maya', 'danielk'], ['maya', 'marcor'], ['maidang', 'khoapham'], ['maidang', 'jonahlee'], ['hanasato', 'anikar'], ['priyas', 'anikar'],
  ['khoapham', 'danielk'], ['oliviah', 'anikar'], ['sofiam', 'noahw'], ['chloed', 'anikar'], ['jonahlee', 'quangvo'], ['tuanbui', 'anikar']
];

const BASE_CHATS: SeedChat[] = [
  { members: ['maya', 'leominh'], messages: [
    [1, 'The new community page feels thoughtful. Want to review it together tomorrow?', 1500], [0, 'Yes! My notes are here: https://example.com/maya/community-notes', 1490],
    [1, 'Perfect. 10am at your place or mine?', 1480], [0, 'Mine, I have fresh basil for the tea 🌿', 1475], [1, 'Sold.', 1470],
    [1, 'Also, Bánh Bao says hi 🐶', 25] ] },
  { members: ['maya', 'oliviah'], messages: [
    [0, 'On my way, but there is a crying baby on the bus and I forgot my headphones.', 300], [1, 'Oh boy! You will manage. Just do not be late :D', 295],
    [0, 'Made it. Where are you?', 250], [1, 'By the yellow bridge, look for the dog 😂', 248], [1, 'Lantern night tonight, you in?', 40] ] },
  { members: ['maya', 'linhng'], messages: [
    [1, 'Chị ơi, cuối tuần này em mở workshop pha cà phê, chị qua chơi nha!', 2000], [0, 'Có chứ! Mấy giờ vậy em?', 1990], [1, '9 giờ sáng thứ bảy ạ ☕', 1985],
    [0, 'Ok em, chị rủ thêm 2 bạn nữa được không?', 1980], [1, 'Được luôn chị 🥰', 1975], [1, 'Happy birthday Mây hôm nay nè, chị ghé lấy cà phê miễn phí nha!', 90] ] },
  { members: ['maya', 'ethanr'], messages: [
    [1, 'Saw you signed up for the Lảo Thẩn trek 🙌', 2400], [0, 'Yes! Slightly terrified though.', 2390], [1, 'You will be fine. Bring good socks, that is 80% of it.', 2385],
    [0, 'Noted: socks > everything', 2380] ] },
  { members: ['maya', 'anikar'], messages: [
    [0, 'Your Norway photos are incredible. Prints for sale?', 4000], [1, 'Thank you!! Yes, doing a small run next month.', 3900], [0, 'Put me down for the fjord one 🙏', 3890] ] },
  { members: ['maya', 'thaole'], messages: [
    [1, 'I set aside some cherry blossom branches for your workshop table 🌸', 700], [0, 'You are the best. I will pay you in compost 😄', 690], [1, 'Deal!', 685],
    [1, 'Đà Lạt lạnh quá, chị nhớ mang áo khoác khi lên nha', 120] ] },
  { members: ['khoapham', 'maidang'], messages: [
    [1, 'Anh ơi, PR của em được merge rồi 🎉', 2900], [0, 'Giỏi quá! Tuần sau làm task lớn hơn nha', 2890], [1, 'Dạ em sẵn sàng 💪', 2880] ] },
  { members: ['sofiam', 'chloed'], messages: [
    [0, 'Croissant hunt this Saturday?', 1200], [1, 'Always. I found a new place in District 1.', 1190], [0, 'See you at 9!', 1185] ] },
  { members: ['danielk', 'linhng'], messages: [
    [0, 'Can we play a small acoustic set at Mây next month?', 3000], [1, 'Yes please! Friday evenings are best.', 2990] ] },
  { members: ['lucasb', 'ethanr'], messages: [
    [0, 'Any spots left on the November trek?', 600], [1, 'Saving one for you, mate.', 590], [0, 'Legend.', 585] ] }
];

/* ---------- Full sample: the original lived-in network plus topic-focused content for recommendations ---------- */

export const PEOPLE: SeedPerson[] = [...BASE_PEOPLE, ...TOPIC_PEOPLE];
export const GROUPS: SeedGroup[] = [...BASE_GROUPS, ...TOPIC_GROUPS];
export const POSTS: SeedPost[] = [...BASE_POSTS, ...TOPIC_POSTS];
export const STORIES: SeedStory[] = [...BASE_STORIES, ...TOPIC_STORIES];
export const FRIENDS: Array<[string, string]> = [...BASE_FRIENDS, ...TOPIC_FRIENDS];
export const EXTRA_FOLLOWS: Array<[string, string]> = [...BASE_FOLLOWS, ...TOPIC_FOLLOWS];
export const CHATS: SeedChat[] = [...BASE_CHATS, ...TOPIC_CHATS];
export const SIGNALS = TOPIC_SIGNALS;
