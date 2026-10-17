/**
 * Topic-focused sample content for testing recommendations: people, groups, posts and stories with a clear
 * subject each (AI, specialty coffee, gaming, books, running, yoga, startups, fashion, diving, baking, film,
 * pets, photography, vegan food, fitness, jazz, languages). None of them is connected to the demo account, so
 * everything here is "new" to Maya and shows up only through what she searches, reads and opens.
 *
 * Merged into the main sample in seed-data.ts. Photo numbers are Lorem Picsum ids, avatars Pravatar ids.
 */

import type { SeedChat, SeedGroup, SeedPerson, SeedPost, SeedSignal, SeedStory } from './seed-data.js';

const work = (company: string, position: string, city: string, startYear: number, description = '') =>
  ({ company, position, city, description, startDate: new Date(Date.UTC(startYear, 0, 1)), current: true });
const school = (name: string, concentration: string, startYear: number, endYear: number, degree = 'Bachelor') =>
  ({ school: name, level: 'college', concentration, degree, startYear, endYear, graduated: endYear <= 2026 });
const place = (name: string, address: string, lat: number, lon: number) => ({ name, address, lat, lon });

export const TOPIC_PEOPLE: SeedPerson[] = [
  { key: 'baonguyen', email: 'bao@example.com', displayName: 'Bao Nguyen', avatar: 3, cover: 1, profile: {
    bio: 'Machine learning engineer. Teaching computers to read Vietnamese 🤖', location: 'Hanoi, Vietnam', hometown: 'Nam Dinh, Vietnam', storyAudience: 'public',
    gender: 'male', pronouns: 'he/him', relationship: 'single', birthDay: 5, birthMonth: 5, birthYear: 1995, languages: ['Vietnamese', 'English'],
    hobbies: ['Machine learning', 'Chess', 'Podcasts'], work: [work('VinAI Lab', 'Machine learning engineer', 'Hanoi', 2022, 'Vietnamese NLP and speech models.')],
    education: [school('Hanoi University of Science and Technology', 'Computer Science (AI)', 2013, 2018, 'Engineer')],
    links: [{ platform: 'github', url: 'https://github.com/baonguyen' }], about: 'I write about deep learning, LLMs and datasets for low-resource languages.' } },
  { key: 'linhchi', email: 'linhchi@example.com', displayName: 'Linh Chi Tran', avatar: 9, cover: 1060, profile: {
    bio: 'Specialty coffee roaster in Đà Lạt. Pour-over nerd, cupping every Friday ☕', location: 'Da Lat, Vietnam', hometown: 'Da Lat, Vietnam', storyAudience: 'public',
    gender: 'female', pronouns: 'she/her', relationship: 'single', birthDay: 18, birthMonth: 7, birthYear: 1996, languages: ['Vietnamese', 'English'],
    hobbies: ['Coffee roasting', 'Latte art', 'Hiking'], work: [work('Đồi Mây Roastery', 'Head roaster', 'Da Lat', 2021, 'Single-origin Arabica from Cầu Đất farms.')],
    education: [school('Da Lat University', 'Agronomy', 2014, 2018)], about: 'Ask me about washed vs natural process. I will talk for an hour.' } },
  { key: 'kevinpark', email: 'kevin@example.com', displayName: 'Kevin Park', avatar: 4, cover: 96, profile: {
    bio: 'Esports caster & Valorant streamer. Live on Twitch most nights 🎮', location: 'Ho Chi Minh City, Vietnam', hometown: 'Busan, South Korea', storyAudience: 'public',
    gender: 'male', pronouns: 'he/him', relationship: 'single', birthDay: 23, birthMonth: 3, birthYear: 1999, languages: ['Korean', 'English', 'Vietnamese'],
    hobbies: ['Gaming', 'Esports', 'Streaming', 'Mechanical keyboards'], work: [work('Saigon Esports Arena', 'Caster & streamer', 'Ho Chi Minh City', 2023)],
    education: [school('RMIT University Vietnam', 'Games Design', 2017, 2021)], links: [{ platform: 'youtube', url: 'https://youtube.com/@kevinplays' }] } },
  { key: 'ngocanh', email: 'ngocanh@example.com', displayName: 'Ngoc Anh Vu', avatar: 10, cover: 1073, profile: {
    bio: 'Literature teacher, book club host, poetry on Sundays 📚', location: 'Hue, Vietnam', hometown: 'Hue, Vietnam', storyAudience: 'public',
    gender: 'female', pronouns: 'she/her', relationship: 'married', birthDay: 2, birthMonth: 12, birthYear: 1991, languages: ['Vietnamese', 'English', 'French'],
    hobbies: ['Reading', 'Poetry', 'Bookstores', 'Tea'], work: [work('Quoc Hoc Hue High School', 'Literature teacher', 'Hue', 2016)],
    education: [school('Hue University of Education', 'Vietnamese Literature', 2009, 2013)], about: 'Currently reading three novels at once. Not sorry.' } },
  { key: 'minhquan', email: 'quan@example.com', displayName: 'Minh Quan Le', avatar: 6, cover: 17, profile: {
    bio: 'Marathon runner. Sub-3 chaser. 5am run club in Đà Nẵng 🏃', location: 'Da Nang, Vietnam', hometown: 'Da Nang, Vietnam', storyAudience: 'public',
    gender: 'male', pronouns: 'he/him', relationship: 'in_relationship', birthDay: 9, birthMonth: 10, birthYear: 1993, languages: ['Vietnamese', 'English'],
    hobbies: ['Running', 'Marathon', 'Triathlon', 'Trail running'], work: [work('Stride Coaching', 'Running coach', 'Da Nang', 2020)],
    education: [school('Da Nang University of Sport', 'Sport Science', 2011, 2015)] } },
  { key: 'yukit', email: 'yuki@example.com', displayName: 'Yuki Tanaka', avatar: 16, cover: 1043, profile: {
    bio: 'Yoga teacher & meditation guide. Breathe in, slow down 🧘', location: 'Hoi An, Vietnam', hometown: 'Kyoto, Japan', storyAudience: 'public',
    gender: 'female', pronouns: 'she/her', relationship: 'single', birthDay: 14, birthMonth: 2, birthYear: 1990, languages: ['Japanese', 'English'],
    hobbies: ['Yoga', 'Meditation', 'Vegan cooking', 'Journaling'], work: [work('Lotus Breath Studio', 'Yoga & mindfulness teacher', 'Hoi An', 2019)],
    education: [school('Doshisha University', 'Psychology', 2008, 2012)], about: 'Morning vinyasa, evening yin. Mindfulness for busy people.' } },
  { key: 'davidc', email: 'david@example.com', displayName: 'David Chen', avatar: 7, cover: 1081, profile: {
    bio: 'Founder of a small SaaS startup. Writing about product, pricing and fundraising.', location: 'Singapore', hometown: 'Taipei, Taiwan', storyAudience: 'public',
    gender: 'male', pronouns: 'he/him', relationship: 'married', birthDay: 30, birthMonth: 4, birthYear: 1988, languages: ['Mandarin', 'English'],
    hobbies: ['Startups', 'Investing', 'Cycling'], work: [work('Ledgerly', 'Co-founder & CEO', 'Singapore', 2022, 'Invoicing software for small businesses.')],
    education: [school('National Taiwan University', 'Business Administration', 2006, 2010)], links: [{ platform: 'linkedin', url: 'https://linkedin.com/in/davidchen' }] } },
  { key: 'phuongle', email: 'phuong@example.com', displayName: 'Phuong Le', avatar: 19, cover: 1076, profile: {
    bio: 'Fashion designer. Modern áo dài, vintage finds and thrift hauls 👗', location: 'Ho Chi Minh City, Vietnam', hometown: 'Can Tho, Vietnam', storyAudience: 'public',
    gender: 'female', pronouns: 'she/her', relationship: 'in_relationship', birthDay: 27, birthMonth: 8, birthYear: 1997, languages: ['Vietnamese', 'English'],
    hobbies: ['Fashion', 'Thrifting', 'Sewing', 'Vintage'], work: [work('Lụa Studio', 'Fashion designer', 'Ho Chi Minh City', 2022)],
    education: [school('University of Architecture HCMC', 'Fashion Design', 2015, 2019)] } },
  { key: 'rafaels', email: 'rafael@example.com', displayName: 'Rafael Silva', avatar: 11, cover: 1069, profile: {
    bio: 'Scuba instructor in Nha Trang. Reefs, wrecks and sea turtles 🐢', location: 'Nha Trang, Vietnam', hometown: 'Florianópolis, Brazil', storyAudience: 'public',
    gender: 'male', pronouns: 'he/him', relationship: 'single', birthDay: 12, birthMonth: 1, birthYear: 1989, languages: ['Portuguese', 'English', 'Spanish'],
    hobbies: ['Scuba diving', 'Freediving', 'Surfing', 'Ocean conservation'], work: [work('Blue Reef Divers', 'PADI dive instructor', 'Nha Trang', 2018)],
    education: [school('Federal University of Santa Catarina', 'Marine Biology', 2007, 2011)] } },
  { key: 'huongpham', email: 'huong@example.com', displayName: 'Huong Pham', avatar: 20, cover: 1080, profile: {
    bio: 'Home baker turned bakery owner. Sourdough, croissants and too much butter 🥐', location: 'Hanoi, Vietnam', hometown: 'Hai Phong, Vietnam', storyAudience: 'public',
    gender: 'female', pronouns: 'she/her', relationship: 'married', birthDay: 6, birthMonth: 9, birthYear: 1992, languages: ['Vietnamese', 'English'],
    hobbies: ['Baking', 'Sourdough', 'Pastry', 'Coffee'], work: [work('Men Bakery', 'Owner & baker', 'Hanoi', 2023)],
    education: [school('Hanoi Open University', 'Hospitality', 2010, 2014)] } },
  { key: 'samwilson', email: 'sam@example.com', displayName: 'Sam Wilson', avatar: 14, cover: 1082, profile: {
    bio: 'Indie filmmaker & film critic. Documentaries about everyday Vietnam 🎬', location: 'Hanoi, Vietnam', hometown: 'Melbourne, Australia', storyAudience: 'public',
    gender: 'male', pronouns: 'he/him', relationship: 'single', birthDay: 21, birthMonth: 6, birthYear: 1990, languages: ['English', 'Vietnamese'],
    hobbies: ['Film', 'Documentaries', 'Cinema', 'Screenwriting'], work: [work('Long Shot Films', 'Director', 'Hanoi', 2019)],
    education: [school('Victorian College of the Arts', 'Film and Television', 2008, 2011)] } },
  { key: 'trangdo', email: 'trang@example.com', displayName: 'Trang Do', avatar: 21, cover: 237, profile: {
    bio: 'Veterinarian & dog rescue volunteer. Adopt, don\'t shop 🐶', location: 'Da Nang, Vietnam', hometown: 'Hoi An, Vietnam', storyAudience: 'public',
    gender: 'female', pronouns: 'she/her', relationship: 'single', birthDay: 16, birthMonth: 11, birthYear: 1994, languages: ['Vietnamese', 'English'],
    hobbies: ['Dogs', 'Cats', 'Animal rescue', 'Beach walks'], work: [work('Paws Clinic', 'Veterinarian', 'Da Nang', 2020)],
    education: [school('Vietnam National University of Agriculture', 'Veterinary Medicine', 2012, 2017, 'Doctor')] } },
  { key: 'hieuvo', email: 'hieu@example.com', displayName: 'Hieu Vo', avatar: 15, cover: 1047, profile: {
    bio: 'Street photographer. Film cameras, Saigon alleys and night light 📷', location: 'Ho Chi Minh City, Vietnam', hometown: 'Bien Hoa, Vietnam', storyAudience: 'public',
    gender: 'male', pronouns: 'he/him', relationship: 'single', birthDay: 3, birthMonth: 3, birthYear: 1996, languages: ['Vietnamese', 'English'],
    hobbies: ['Street photography', 'Film photography', 'Darkroom', 'Night walks'], work: [work('Freelance', 'Photographer', 'Ho Chi Minh City', 2019)],
    education: [school('Ho Chi Minh City University of Fine Arts', 'Photography', 2014, 2018)] } },
  { key: 'emmaj', email: 'emma@example.com', displayName: 'Emma Johnson', avatar: 23, cover: 292, profile: {
    bio: 'Vegan chef & food blogger. Plant-based Vietnamese recipes 🌱', location: 'Ho Chi Minh City, Vietnam', hometown: 'Portland, USA', storyAudience: 'public',
    gender: 'female', pronouns: 'she/her', relationship: 'married', birthDay: 10, birthMonth: 4, birthYear: 1991, languages: ['English', 'Vietnamese'],
    hobbies: ['Vegan cooking', 'Food photography', 'Markets', 'Yoga'], work: [work('Green Bowl Kitchen', 'Chef & founder', 'Ho Chi Minh City', 2021)],
    education: [school('Culinary Institute of America', 'Culinary Arts', 2010, 2012, 'Diploma')] } },
  { key: 'ducnguyen', email: 'duc@example.com', displayName: 'Duc Nguyen', avatar: 17, cover: 1058, profile: {
    bio: 'Strength coach. Gym, futsal on weekends, Premier League on Saturdays ⚽💪', location: 'Hanoi, Vietnam', hometown: 'Thanh Hoa, Vietnam', storyAudience: 'public',
    gender: 'male', pronouns: 'he/him', relationship: 'single', birthDay: 25, birthMonth: 12, birthYear: 1995, languages: ['Vietnamese', 'English'],
    hobbies: ['Gym', 'Football', 'Futsal', 'Nutrition'], work: [work('Iron House Gym', 'Strength & conditioning coach', 'Hanoi', 2021)],
    education: [school('Bac Ninh University of Physical Education', 'Sport Coaching', 2013, 2017)] } },
  { key: 'lanhoang', email: 'lan@example.com', displayName: 'Lan Hoang', avatar: 29, cover: 39, profile: {
    bio: 'Jazz pianist & music teacher. Thursday nights at a tiny jazz bar 🎹', location: 'Hanoi, Vietnam', hometown: 'Hanoi, Vietnam', storyAudience: 'public',
    gender: 'female', pronouns: 'she/her', relationship: 'in_relationship', birthDay: 8, birthMonth: 8, birthYear: 1994, languages: ['Vietnamese', 'English'],
    hobbies: ['Jazz', 'Piano', 'Vinyl', 'Songwriting'], work: [work('Hanoi Music Academy', 'Piano teacher', 'Hanoi', 2018)],
    education: [school('Vietnam National Academy of Music', 'Jazz Piano', 2012, 2016)] } },
  { key: 'tomaso', email: 'tomas@example.com', displayName: 'Tomas Ortega', avatar: 18, cover: 2, profile: {
    bio: 'Data scientist. Computer vision by day, board games by night.', location: 'Da Nang, Vietnam', hometown: 'Valencia, Spain', storyAudience: 'public',
    gender: 'male', pronouns: 'he/him', relationship: 'married', birthDay: 19, birthMonth: 5, birthYear: 1990, languages: ['Spanish', 'English'],
    hobbies: ['Data science', 'Computer vision', 'Board games', 'Kaggle'], work: [work('Sông Hàn Tech', 'Lead data scientist', 'Da Nang', 2023)],
    education: [school('Polytechnic University of Valencia', 'Artificial Intelligence', 2008, 2014, 'Master')] } },
  { key: 'vyle', email: 'vy@example.com', displayName: 'Vy Le', avatar: 30, cover: 24, profile: {
    bio: 'IELTS teacher. 8.5 overall, sharing study tips every week ✍️', location: 'Can Tho, Vietnam', hometown: 'Can Tho, Vietnam', storyAudience: 'public',
    gender: 'female', pronouns: 'she/her', relationship: 'single', birthDay: 1, birthMonth: 6, birthYear: 1998, languages: ['Vietnamese', 'English', 'Korean'],
    hobbies: ['Languages', 'Reading', 'Study vlogs', 'K-dramas'], work: [work('Mekong English Center', 'IELTS teacher', 'Can Tho', 2021)],
    education: [school('Can Tho University', 'English Language Teaching', 2016, 2020)] } }
];

/** A brand-new account that has not taken the interest survey: signing in opens /onboarding. */
export const NEWCOMERS: SeedPerson[] = [
  { key: 'namtran', email: 'new@example.com', displayName: 'Nam Tran', avatar: 50, cover: 10, interests: 'pending', profile: {
    bio: 'Just joined Oremus 👋', location: 'Da Nang, Vietnam', storyAudience: 'followers', gender: 'male', pronouns: 'he/him', languages: ['Vietnamese', 'English'] } }
];

export const TOPIC_GROUPS: SeedGroup[] = [
  { slug: 'ai-vietnam', name: 'AI & Machine Learning Vietnam', description: 'Deep learning papers, LLM experiments, datasets and career advice for AI engineers in Vietnam.', cover: 0,
    privacy: 'public', groupType: 'learning', location: 'Vietnam', tags: ['ai', 'machine learning', 'data science'],
    rules: [{ title: 'Share sources', details: 'Link the paper, repo or dataset you are talking about.' }, { title: 'No hype posts', details: 'Benchmarks and code, not buzzwords.' }],
    members: [['baonguyen', 'admin'], ['tomaso', 'moderator'], ['jonahlee', 'member'], ['khoapham', 'member'], ['maidang', 'member'], ['davidc', 'member']] },
  { slug: 'specialty-coffee-roasters', name: 'Specialty Coffee Roasters', description: 'Roast profiles, cupping notes, pour-over recipes and Vietnamese Arabica farms.', cover: 312,
    privacy: 'public', groupType: 'hobbies', location: 'Da Lat, Vietnam', tags: ['coffee', 'roasting', 'pour over'],
    rules: [{ title: 'Share your recipe', details: 'Dose, grind, water temperature and time.' }],
    members: [['linhchi', 'admin'], ['linhng', 'moderator'], ['huongpham', 'member'], ['emmaj', 'member'], ['davidc', 'member']] },
  { slug: 'vietnam-gamers', name: 'Vietnam Gamers Hub', description: 'Esports, co-op nights, Valorant scrims and indie game recommendations.', cover: 96,
    privacy: 'public', groupType: 'gaming', location: 'Vietnam', tags: ['gaming', 'esports', 'valorant'],
    rules: [{ title: 'No cheating talk', details: 'Hacks and boosting services get you banned.' }, { title: 'Be a good teammate', details: 'Toxicity stays in ranked, not here.' }],
    members: [['kevinpark', 'admin'], ['khoapham', 'moderator'], ['maidang', 'member'], ['ducnguyen', 'member'], ['tomaso', 'member']] },
  { slug: 'slow-readers-book-club', name: 'Slow Readers Book Club', description: 'One book a month, read slowly, discussed kindly. Novels, poetry and Vietnamese literature.', cover: 1073,
    privacy: 'public', groupType: 'learning', location: 'Hue, Vietnam', tags: ['books', 'reading', 'book club'],
    rules: [{ title: 'Mark spoilers', details: 'Put [spoiler] at the top of your post.' }],
    members: [['ngocanh', 'admin'], ['priyas', 'moderator'], ['vyle', 'member'], ['samwilson', 'member'], ['lanhoang', 'member']] },
  { slug: 'run-club-vietnam', name: 'Run Club Vietnam', description: 'Morning runs, marathon training plans, race reports and trail running across Vietnam.', cover: 17,
    privacy: 'public', groupType: 'hobbies', location: 'Da Nang, Vietnam', tags: ['running', 'marathon', 'trail running'],
    rules: [{ title: 'Post honest paces', details: 'Every pace is welcome here.' }],
    members: [['minhquan', 'admin'], ['ethanr', 'moderator'], ['lucasb', 'member'], ['ducnguyen', 'member'], ['yukit', 'member']] },
  { slug: 'yoga-mindful-living', name: 'Yoga & Mindful Living', description: 'Yoga flows, meditation, breathwork and slow, healthy living.', cover: 1043,
    privacy: 'public', groupType: 'hobbies', location: 'Hoi An, Vietnam', tags: ['yoga', 'meditation', 'wellness'],
    rules: [{ title: 'Kindness first', details: 'No body shaming, no diet culture.' }],
    members: [['yukit', 'admin'], ['emmaj', 'member'], ['priyas', 'member'], ['thaole', 'member']] },
  { slug: 'dive-vietnam', name: 'Dive Vietnam', description: 'Scuba diving, freediving and snorkeling spots, reef conservation and dive buddies.', cover: 1069,
    privacy: 'public', groupType: 'hobbies', location: 'Nha Trang, Vietnam', tags: ['diving', 'scuba', 'ocean'],
    rules: [{ title: 'Never dive alone', details: 'Use the buddy thread to find a partner.' }, { title: 'Do not touch the reef', details: 'Look, photograph, leave it as you found it.' }],
    members: [['rafaels', 'admin'], ['sofiam', 'member'], ['noahw', 'member'], ['tuanbui', 'member']] },
  { slug: 'home-bakers-vietnam', name: 'Home Bakers Vietnam', description: 'Sourdough starters, croissant lamination, cake fails and oven tips for humid kitchens.', cover: 1080,
    privacy: 'public', groupType: 'hobbies', location: 'Hanoi, Vietnam', tags: ['baking', 'sourdough', 'pastry'],
    rules: [{ title: 'Post your crumb shot', details: 'We want to see inside the loaf.' }],
    members: [['huongpham', 'admin'], ['chloed', 'member'], ['emmaj', 'member'], ['thaole', 'member'], ['linhchi', 'member']] },
  { slug: 'indie-film-night', name: 'Indie Film Night', description: 'Monthly screenings, documentary recommendations and Vietnamese independent cinema.', cover: 1082,
    privacy: 'public', groupType: 'social', location: 'Hanoi, Vietnam', tags: ['film', 'cinema', 'documentary'],
    rules: [{ title: 'Spoiler tags', details: 'Mark plot details clearly.' }],
    members: [['samwilson', 'admin'], ['danielk', 'member'], ['lanhoang', 'member'], ['hieuvo', 'member']] },
  { slug: 'paws-rescue-danang', name: 'Paws Rescue Đà Nẵng', description: 'Dog and cat adoption, foster homes, vet advice and lost pets in Đà Nẵng.', cover: 237,
    privacy: 'public', groupType: 'social', location: 'Da Nang, Vietnam', tags: ['pets', 'adoption', 'dogs'],
    rules: [{ title: 'No selling animals', details: 'Adoption only, never for money.' }],
    members: [['trangdo', 'admin'], ['oliviah', 'member'], ['hanasato', 'member'], ['leominh', 'member']] },
  { slug: 'thrift-style-saigon', name: 'Thrift & Style Saigon', description: 'Vintage markets, thrift hauls, outfit ideas and local fashion designers.', cover: 1076,
    privacy: 'public', groupType: 'buy_sell', location: 'Ho Chi Minh City, Vietnam', tags: ['fashion', 'vintage', 'thrift'],
    rules: [{ title: 'Prices in the post', details: 'For anything you sell or swap.' }],
    members: [['phuongle', 'admin'], ['chloed', 'member'], ['maidang', 'member'], ['vyle', 'member']] },
  { slug: 'ielts-study-together', name: 'IELTS Study Together', description: 'Daily speaking practice, writing feedback and study plans for IELTS and English exams.', cover: 24,
    privacy: 'public', groupType: 'learning', location: 'Vietnam', tags: ['ielts', 'english', 'study'],
    rules: [{ title: 'Feedback, not judgement', details: 'Correct kindly and explain why.' }],
    members: [['vyle', 'admin'], ['maidang', 'member'], ['ngocanh', 'member']] }
];

export const TOPIC_POSTS: SeedPost[] = [
  // Bao (AI)
  { key: 'bao-llm', author: 'baonguyen', topic: 'ai', hoursAgo: 5, photos: [0],
    text: 'We fine-tuned a small LLM on 40k Vietnamese customer-support chats. It beats our old rule-based bot on 8 of 10 tasks. The dataset cleaning took longer than the model training, as always.',
    comments: [['tomaso', 'What base model did you start from? And how did you handle diacritics in the tokenizer?', 'A 7B open model. Diacritics stay, we normalise Unicode to NFC first.'], ['khoapham', 'Would love a talk about this at the next Da Nang meetup!']] },
  { key: 'bao-dataset', author: 'baonguyen', topic: 'ai', hoursAgo: 60, group: 'ai-vietnam',
    text: 'Releasing an open dataset: 120k Vietnamese news headlines labelled by topic. Good for text classification and machine learning homework. Link in comments, licence is CC BY.' },
  { key: 'bao-chess', author: 'baonguyen', topic: 'ai', hoursAgo: 150,
    text: 'Played chess against the engine I trained in university. It still opens with the same weird pawn move. Neural networks remember your mistakes forever.' },
  { key: 'bao-vi', author: 'baonguyen', topic: 'ai', hoursAgo: 30,
    text: 'Trí tuệ nhân tạo không thay thế lập trình viên, nhưng lập trình viên biết dùng AI sẽ thay thế người không biết. Mọi người đang dùng công cụ AI nào cho công việc hằng ngày?' },

  // Tomas (data science)
  { key: 'tomas-vision', author: 'tomaso', topic: 'ai', hoursAgo: 20, group: 'ai-vietnam',
    text: 'Computer vision project update: our model counts motorbikes at Da Nang intersections with 94% accuracy. Night-time rain is still the hardest case for the dataset.' },
  { key: 'tomas-kaggle', author: 'tomaso', topic: 'ai', hoursAgo: 96,
    text: 'Finished top 5% in a Kaggle competition. The secret was boring: better validation splits, not a bigger deep learning model.' },
  { key: 'tomas-boardgames', author: 'tomaso', topic: 'gaming', hoursAgo: 200,
    text: 'Board games night: Wingspan, Catan and a very heated round of Codenames. Looking for more players in Đà Nẵng!' },

  // Linh Chi (coffee)
  { key: 'linhchi-roast', author: 'linhchi', topic: 'coffee', hoursAgo: 3, photos: [312], place: place('Đồi Mây Roastery', 'Cau Dat, Da Lat', 11.8526, 108.5617),
    text: 'New roast profile for our Cầu Đất Arabica: lighter, washed process, notes of jasmine and peach. Pour-over at 92°C, 1:16 ratio, 3 minutes. Coffee people, tell me what you taste.',
    comments: [['linhng', 'Saving a bag for Mây Coffee! The jasmine note is unreal.', 'Already packed one for you ☕'], ['huongpham', 'This would be perfect with my almond croissants.']] },
  { key: 'linhchi-cupping', author: 'linhchi', topic: 'coffee', hoursAgo: 40, group: 'specialty-coffee-roasters',
    text: 'Friday cupping results: natural process Robusta surprised everyone. Chocolate, dark cherry, almost no bitterness. Robusta deserves more respect.' },
  { key: 'linhchi-vi', author: 'linhchi', topic: 'coffee', hoursAgo: 75,
    text: 'Cà phê pha phin hay pour-over? Mình mê cả hai: phin cho buổi sáng đậm đà, pour-over cho buổi chiều nhẹ nhàng. Ghé Đà Lạt nhớ ghé xưởng rang của mình nha ☕' },
  { key: 'linhchi-latte', author: 'linhchi', topic: 'coffee', hoursAgo: 180, photos: [63],
    text: 'Latte art practice day 47. The tulip finally has three layers. The barista life is all about tiny victories.' },

  // Kevin (gaming)
  { key: 'kevin-valorant', author: 'kevinpark', topic: 'gaming', hoursAgo: 4, photos: [96],
    text: 'Valorant scrim tonight: our team came back from 3–11 to win 13–11. Streaming the VOD review on Twitch at 9pm, come learn from our mistakes 🎮',
    comments: [['khoapham', 'That clutch in round 22 was insane.', 'Pure luck and good comms 😄'], ['ducnguyen', 'Watching tonight!']] },
  { key: 'kevin-indie', author: 'kevinpark', topic: 'gaming', hoursAgo: 50, group: 'vietnam-gamers',
    text: 'Indie game recommendations for a rainy weekend: Hades, Stardew Valley, Celeste and Hollow Knight. What co-op games are you playing right now?' },
  { key: 'kevin-keyboard', author: 'kevinpark', topic: 'gaming', hoursAgo: 120,
    text: 'Built a new mechanical keyboard for streaming: linear switches, lubed stabilisers, sounds like rain on a window. Gamers, what switches do you use?' },
  { key: 'kevin-vi', author: 'kevinpark', topic: 'gaming', hoursAgo: 26,
    text: 'Tối nay có giải esports Liên Quân ở Sài Gòn, ai đi xem không? Mình làm caster, hứa sẽ hét to hơn lần trước 😂' },

  // Ngoc Anh (books)
  { key: 'ngocanh-bookclub', author: 'ngocanh', topic: 'books', hoursAgo: 8, photos: [1073], group: 'slow-readers-book-club',
    text: 'October book club pick: "The Sympathizer" by Viet Thanh Nguyen. We meet on the 28th to discuss chapters 1–10. Bring tea and your favourite quote.',
    comments: [['priyas', 'Finally! I have been waiting to talk about this novel.'], ['vyle', 'Can I join online from Cần Thơ?', 'Of course, we will stream the discussion.']] },
  { key: 'ngocanh-poetry', author: 'ngocanh', topic: 'books', hoursAgo: 70,
    text: 'Sunday poetry: rereading Xuân Diệu and Hàn Mặc Tử. Some poems feel written for this exact rainy afternoon in Huế.' },
  { key: 'ngocanh-reading', author: 'ngocanh', topic: 'books', hoursAgo: 160, photos: [24],
    text: 'My reading list for autumn: Pachinko, Norwegian Wood, The Remains of the Day and a stack of Vietnamese short stories. What book changed how you see the world?' },
  { key: 'ngocanh-vi', author: 'ngocanh', topic: 'books', hoursAgo: 33,
    text: 'Đọc sách chậm cũng là một cách nghỉ ngơi. Tháng này mình đọc lại "Nỗi buồn chiến tranh" của Bảo Ninh, vẫn day dứt như lần đầu.' },

  // Minh Quan (running)
  { key: 'quan-marathon', author: 'minhquan', topic: 'running', hoursAgo: 6, photos: [324], place: place('Dragon Bridge', 'Hai Chau, Da Nang', 16.0614, 108.2272),
    text: 'Da Nang International Marathon done: 2:58:41, my first sub-3 marathon! Negative split, the last 10k felt like flying. Thank you to everyone at the 5am run club 🏃',
    comments: [['ethanr', 'Huge! Sub-3 is a serious milestone, congrats mate.', 'Thanks! Trail season next.'], ['lucasb', 'Legend 👏']] },
  { key: 'quan-plan', author: 'minhquan', topic: 'running', hoursAgo: 90, group: 'run-club-vietnam',
    text: 'Free 12-week half marathon training plan for beginners: three easy runs, one interval session and one long run per week. Comment and I will send the spreadsheet.' },
  { key: 'quan-trail', author: 'minhquan', topic: 'running', hoursAgo: 210, photos: [17],
    text: 'Trail running in Bà Nà hills: 25 km, 1,400 m of climbing and a lot of mud. Road marathon pace means nothing on a mountain trail.' },
  { key: 'quan-vi', author: 'minhquan', topic: 'running', hoursAgo: 45,
    text: 'Chạy bộ buổi sáng ở biển Mỹ Khê là thói quen tốt nhất mình từng có. 5 giờ sáng, gió mát, mặt trời mọc. Ai muốn chạy chung thì inbox nha!' },

  // Yuki (yoga)
  { key: 'yuki-retreat', author: 'yukit', topic: 'fitness', hoursAgo: 12, group: 'yoga-mindful-living',
    text: 'Weekend yoga and meditation retreat in Hội An: sunrise vinyasa, silent breakfast, breathwork and yin yoga at sunset. Six spots left, all levels welcome 🧘' },
  { key: 'yuki-breath', author: 'yukit', topic: 'fitness', hoursAgo: 55,
    text: 'A two-minute breathwork practice for stressful days: inhale for four, hold for four, exhale for six. Mindfulness does not need an hour, just attention.' },
  { key: 'yuki-vegan', author: 'yukit', topic: 'food', hoursAgo: 140,
    text: 'Post-yoga vegan bowl: brown rice, tofu, pickled vegetables and miso dressing. Healthy food can be simple and still delicious.' },

  // David (startups)
  { key: 'david-pricing', author: 'davidc', topic: 'business', hoursAgo: 14,
    text: 'Startup lesson of the year: we doubled our SaaS price and lost only 4% of customers. Revenue grew 80%. Founders, you are probably undercharging.',
    comments: [['leominh', 'This matches what we saw at Lumen. Pricing is product design.']] },
  { key: 'david-fundraising', author: 'davidc', topic: 'business', hoursAgo: 110,
    text: 'Notes from our seed fundraising: 47 investor meetings, 3 term sheets, one great partner. The pitch deck mattered less than showing real customers and monthly revenue.' },
  { key: 'david-ai', author: 'davidc', topic: 'ai', hoursAgo: 65, group: 'ai-vietnam',
    text: 'Using AI to read invoices saved our customers 6 hours a week. The machine learning model was the easy part; trust and accuracy on messy scans was the hard part.' },

  // Phuong (fashion)
  { key: 'phuong-aodai', author: 'phuongle', topic: 'fashion', hoursAgo: 9, photos: [1076],
    text: 'New collection: modern áo dài in washed silk, shorter cut, wide trousers, made for riding a motorbike. Fashion should fit real life in Saigon 👗',
    comments: [['chloed', 'These are stunning. The colour palette!', 'Thank you! Inspired by old Saigon façades.']] },
  { key: 'phuong-thrift', author: 'phuongle', topic: 'fashion', hoursAgo: 80, group: 'thrift-style-saigon',
    text: 'Thrift haul from the Saturday vintage market: a 90s denim jacket, linen shirts and a leather bag, all under 400k. Sustainable fashion is cheaper too.' },
  { key: 'phuong-vi', author: 'phuongle', topic: 'fashion', hoursAgo: 190,
    text: 'Thời trang bền vững bắt đầu từ việc mặc lại đồ cũ. Tủ đồ của mình 60% là đồ secondhand và mình thấy rất vui với phong cách đó.' },

  // Rafael (diving)
  { key: 'rafael-turtle', author: 'rafaels', topic: 'ocean', hoursAgo: 7, photos: [1069], place: place('Hòn Mun Marine Park', 'Nha Trang, Khanh Hoa', 12.1694, 109.3047),
    text: 'Scuba dive at Hòn Mun this morning: a sea turtle, two cuttlefish and coral that is finally recovering. Visibility 15 metres, water 28°C 🐢',
    comments: [['sofiam', 'Booking my open water course with you next month!', 'Can\'t wait, bring your sunscreen (reef-safe!)'], ['noahw', 'Turtles are the best dive buddies.']] },
  { key: 'rafael-freedive', author: 'rafaels', topic: 'ocean', hoursAgo: 85, group: 'dive-vietnam',
    text: 'Freediving tip: relaxation beats lung capacity. Slow breathing on the surface, no hyperventilating, and always dive with a buddy watching from above.' },
  { key: 'rafael-reef', author: 'rafaels', topic: 'ocean', hoursAgo: 230,
    text: 'Reef clean-up day: 32 divers collected 60 kg of fishing nets and plastic from the ocean floor. Diving is more fun when the sea is clean.' },

  // Huong (baking)
  { key: 'huong-sourdough', author: 'huongpham', topic: 'baking', hoursAgo: 11, photos: [1080],
    text: 'Sourdough in Hanoi humidity: lower hydration (70%), shorter bulk fermentation and a very hot oven. Finally an open crumb! Bakers, what flour do you use?',
    comments: [['chloed', 'This crumb would make a Paris bakery jealous 🥖', 'High praise from you!'], ['emmaj', 'Recipe please!']] },
  { key: 'huong-croissant', author: 'huongpham', topic: 'baking', hoursAgo: 58, group: 'home-bakers-vietnam',
    text: 'Croissant lamination in a 32°C kitchen: freeze the butter block, roll fast, rest the dough between every fold. Pastry is patience plus air conditioning.' },
  { key: 'huong-vi', author: 'huongpham', topic: 'baking', hoursAgo: 130,
    text: 'Tiệm bánh nhỏ của mình vừa ra mắt bánh mì sourdough lúa mạch đen. Ai ở Hà Nội ghé thử nha, sáng nào cũng ra lò lúc 7 giờ 🥐' },

  // Sam (film)
  { key: 'sam-documentary', author: 'samwilson', topic: 'film', hoursAgo: 10,
    text: 'Our documentary about Hanoi street vendors got into a film festival in Busan! Three years of filming, 200 hours of footage, 82 minutes of film 🎬',
    comments: [['danielk', 'Congratulations! Who did the score?', 'A friend from Hanoi Music Academy, I will introduce you.']] },
  { key: 'sam-screening', author: 'samwilson', topic: 'film', hoursAgo: 48, group: 'indie-film-night',
    text: 'Indie Film Night this Friday: screening a Vietnamese independent movie followed by a Q&A with the director. Cinema is better together.' },
  { key: 'sam-list', author: 'samwilson', topic: 'film', hoursAgo: 170,
    text: 'Five films every documentary lover should watch: Hoop Dreams, Man on Wire, Shirkers, The Act of Killing and Minding the Gap.' },

  // Trang (pets)
  { key: 'trang-adopt', author: 'trangdo', topic: 'pets', hoursAgo: 2, photos: [237], group: 'paws-rescue-danang',
    text: 'Meet Bơ, a 4-month-old rescue puppy looking for a home. Vaccinated, playful, loves belly rubs. Dog adoption only, please share so he finds his family 🐶',
    comments: [['oliviah', 'Sharing everywhere! Mochi wants a little brother.'], ['hanasato', 'Those ears 🥹']] },
  { key: 'trang-vet', author: 'trangdo', topic: 'pets', hoursAgo: 62,
    text: 'Vet tip for the rainy season: dry your dog\'s paws and ears after every walk. Most skin infections I see in Đà Nẵng start with wet fur.' },
  { key: 'trang-cat', author: 'trangdo', topic: 'pets', hoursAgo: 145, photos: [40],
    text: 'Our clinic cat has officially adopted the reception desk. Pets choose their people, and sometimes their furniture.' },
  { key: 'trang-vi', author: 'trangdo', topic: 'pets', hoursAgo: 36,
    text: 'Nhận nuôi thú cưng thay vì mua nhé mọi người. Trạm cứu hộ đang có 12 bé chó mèo cần nhà mới ở Đà Nẵng 🐾' },

  // Hieu (photography)
  { key: 'hieu-night', author: 'hieuvo', topic: 'photography', hoursAgo: 13, photos: [[1047, 1200, 1500]],
    text: 'Night street photography in District 4: neon, rain and a 35mm lens at f/1.4. Film camera loaded with Portra 800, every frame counts 📷' },
  { key: 'hieu-darkroom', author: 'hieuvo', topic: 'photography', hoursAgo: 100,
    text: 'Developed my first black and white film roll at home. The darkroom smells terrible and I love it. Photography feels slower and more honest on film.' },
  { key: 'hieu-tips', author: 'hieuvo', topic: 'photography', hoursAgo: 52,
    text: 'Street photography tip: stand still in good light and let the scene come to you. The camera is the least important part of the photo.' },

  // Emma (vegan food)
  { key: 'emma-pho', author: 'emmaj', topic: 'food', hoursAgo: 15, photos: [292],
    text: 'Vegan phở recipe: charred onion and ginger, star anise, mushroom broth simmered for three hours. Plant-based cooking does not mean less flavour 🌱',
    comments: [['yukit', 'Making this tonight!'], ['quangvo', 'Respect. The broth is everything.']] },
  { key: 'emma-market', author: 'emmaj', topic: 'food', hoursAgo: 88, photos: [1080],
    text: 'Saturday market haul: dragon fruit, morning glory, tofu skin and fresh herbs. Cooking with local vegetables is the easiest way to eat well in Vietnam.' },
  { key: 'emma-vi', author: 'emmaj', topic: 'food', hoursAgo: 175,
    text: 'Món chay Việt Nam là kho tàng: đậu hũ sốt cà, canh nấm, gỏi cuốn chay. Nấu ăn thuần chay dễ hơn mọi người nghĩ!' },

  // Duc (fitness / football)
  { key: 'duc-gym', author: 'ducnguyen', topic: 'fitness', hoursAgo: 16,
    text: 'Gym beginners: squat, deadlift, push-up and row, three times a week, add a little weight every session. Strength training is boring and that is why it works 💪' },
  { key: 'duc-futsal', author: 'ducnguyen', topic: 'sport', hoursAgo: 42,
    text: 'Futsal on Sunday: we lost 6–5 after a last-minute goal. Football is cruel. Looking for a goalkeeper for next week in Cầu Giấy!' },
  { key: 'duc-vi', author: 'ducnguyen', topic: 'fitness', hoursAgo: 125,
    text: 'Tập gym không cần ăn kiêng khắc nghiệt. Ngủ đủ, ăn đủ protein, tập đều đặn là đủ để khỏe hơn mỗi tháng.' },

  // Lan (jazz)
  { key: 'lan-jazz', author: 'lanhoang', topic: 'music', hoursAgo: 18, photos: [39],
    text: 'Thursday jazz night: trio set with standards and one original song. The piano was slightly out of tune, which made it feel even more like jazz 🎹',
    comments: [['danielk', 'We should play together sometime, violin and piano?', 'Yes! Let\'s plan it.']] },
  { key: 'lan-students', author: 'lanhoang', topic: 'music', hoursAgo: 95,
    text: 'My youngest piano student played her first song with both hands today. Teaching music is the best job in the world.' },
  { key: 'lan-vinyl', author: 'lanhoang', topic: 'music', hoursAgo: 205,
    text: 'Vinyl Sunday: Bill Evans "Sunday at the Village Vanguard". If you are new to jazz, start here.' },

  // Vy (study / IELTS)
  { key: 'vy-ielts', author: 'vyle', topic: 'study', hoursAgo: 19, group: 'ielts-study-together',
    text: 'IELTS writing task 2 tip: one clear opinion, two body paragraphs, one example each. Examiners reward clarity, not fancy vocabulary. Post your essay and I will give feedback ✍️' },
  { key: 'vy-plan', author: 'vyle', topic: 'study', hoursAgo: 72,
    text: 'A 30-day English speaking plan: 15 minutes a day, record yourself, listen back, fix one mistake. Language learning is a habit, not a talent.' },
  { key: 'vy-vi', author: 'vyle', topic: 'study', hoursAgo: 150,
    text: 'Ôn thi IELTS mà không biết bắt đầu từ đâu? Mình chia sẻ lộ trình 3 tháng từ 5.5 lên 7.0, kèm tài liệu miễn phí. Comment "IELTS" nha!' },

  // Existing people, new subjects (so their profiles are a little richer too)
  { key: 'khoa-ai', author: 'khoapham', topic: 'ai', hoursAgo: 28, group: 'danang-developers',
    text: 'Tried running a small LLM locally for code review. It catches typos and missing null checks, but it still invents APIs. AI is a junior teammate, not a senior one.' },
  { key: 'sofia-dive', author: 'sofiam', topic: 'ocean', hoursAgo: 46,
    text: 'Snorkeling in Côn Đảo: clear water, parrotfish everywhere and a baby shark that wanted nothing to do with me. Next goal: scuba diving certification.' },
  { key: 'oliviah-bake', author: 'oliviah', topic: 'baking', hoursAgo: 38,
    text: 'Attempted my first sourdough loaf. It is flat, it is dense, it is mine. Bakers of Oremus, what did I do wrong?' },
  { key: 'danielk-film', author: 'danielk', topic: 'film', hoursAgo: 66,
    text: 'Scored my first short film this month. Writing music to picture is a completely different skill: silence is half the soundtrack.' }
];

export const TOPIC_STORIES: SeedStory[] = [
  { author: 'baonguyen', minutesAgo: 25, text: 'Training run #42: the model finally speaks Vietnamese 🤖', background: 'night', style: { font: 'typewriter', color: '#00c7be', effect: 'neon' } },
  { author: 'linhchi', minutesAgo: 15, photo: 312, text: 'Fresh roast: Cầu Đất Arabica ☕', style: { font: 'serif', effect: 'shadow', y: 80 } },
  { author: 'linhchi', minutesAgo: 140, text: 'Pour-over recipe: 15 g coffee, 250 g water, 92°C, 3 min', background: 'paper', style: { font: 'classic', color: '#1c1c1e', effect: 'none' } },
  { author: 'kevinpark', minutesAgo: 35, photo: 96, text: 'LIVE on Twitch tonight 9pm 🎮 Valorant ranked grind', style: { font: 'strong', effect: 'outline', color: '#ff375f', y: 18 } },
  { author: 'ngocanh', minutesAgo: 80, text: 'Book club tonight: The Sympathizer, chapters 1–10 📚', background: 'paper', style: { font: 'serif', color: '#1c1c1e', effect: 'none', size: 1.2 } },
  { author: 'minhquan', minutesAgo: 10, photo: 324, text: 'Sub-3 marathon ✅ 2:58:41', style: { font: 'strong', size: 1.8, color: '#34c759', effect: 'outline', animation: 'zoom' } },
  { author: 'minhquan', minutesAgo: 300, text: '5am run club, Mỹ Khê beach. Who is in? 🏃', background: 'sunset', style: { font: 'retro', animation: 'bounce' } },
  { author: 'yukit', minutesAgo: 55, text: 'Breathe in for 4, hold for 4, out for 6 🧘 Morning yoga at the beach', background: 'mint', style: { font: 'script', color: '#1c1c1e', effect: 'none', size: 1.2 } },
  { author: 'davidc', minutesAgo: 210, text: 'Startup lesson: charge more. Customers who value you will stay.', background: 'charcoal', style: { font: 'classic', effect: 'shadow' } },
  { author: 'phuongle', minutesAgo: 65, photo: 1076, text: 'New áo dài collection drops Friday 👗', style: { font: 'script', size: 1.4, effect: 'glow', y: 75 } },
  { author: 'rafaels', minutesAgo: 30, photo: 1069, text: 'Scuba dive #312: sea turtle at Hòn Mun 🐢', style: { font: 'classic', effect: 'shadow', y: 85 } },
  { author: 'huongpham', minutesAgo: 45, photo: 1080, text: 'Sourdough out of the oven at 7am 🥐', style: { font: 'serif', effect: 'shadow', y: 20 } },
  { author: 'samwilson', minutesAgo: 120, text: 'Our documentary is going to a film festival 🎬', background: 'night', style: { font: 'typewriter', color: '#ffcc00', effect: 'none' } },
  { author: 'trangdo', minutesAgo: 8, photo: 237, text: 'Bơ the rescue puppy needs a home 🐶 Dog adoption, please share!', style: { font: 'strong', effect: 'highlight', color: '#000000', y: 82 } },
  { author: 'hieuvo', minutesAgo: 95, photo: 1047, text: 'Night street photography, 35mm film 📷', style: { font: 'typewriter', effect: 'shadow', y: 88 } },
  { author: 'emmaj', minutesAgo: 70, photo: 292, text: 'Vegan phở simmering for 3 hours 🌱', style: { font: 'serif', effect: 'shadow', y: 78 } },
  { author: 'ducnguyen', minutesAgo: 160, text: 'Leg day. Squats, deadlifts, no excuses 💪', background: 'fire', style: { font: 'strong', size: 1.5, animation: 'pulse' } },
  { author: 'lanhoang', minutesAgo: 180, photo: 39, text: 'Jazz piano trio tonight 🎹', style: { font: 'script', color: '#ffcc00', effect: 'glow', y: 80 } },
  { author: 'tomaso', minutesAgo: 240, text: 'Computer vision demo day: counting motorbikes in the rain', background: 'ocean', style: { font: 'classic', effect: 'shadow' } },
  { author: 'vyle', minutesAgo: 50, text: 'IELTS tip of the day: one idea per paragraph ✍️', background: 'candy', style: { font: 'retro', color: '#1c1c1e', effect: 'none' } }
];

/** Friendships for the new people: among themselves and with Maya's friends (mutual friends), never with Maya. */
export const TOPIC_FRIENDS: Array<[string, string]> = [
  ['baonguyen', 'tomaso'], ['baonguyen', 'khoapham'], ['baonguyen', 'jonahlee'], ['tomaso', 'khoapham'], ['tomaso', 'maidang'],
  ['linhchi', 'linhng'], ['linhchi', 'huongpham'], ['linhchi', 'thaole'], ['huongpham', 'emmaj'], ['huongpham', 'chloed'],
  ['kevinpark', 'khoapham'], ['kevinpark', 'ducnguyen'], ['ngocanh', 'vyle'], ['ngocanh', 'priyas'], ['minhquan', 'ethanr'],
  ['minhquan', 'ducnguyen'], ['yukit', 'emmaj'], ['yukit', 'priyas'], ['davidc', 'leominh'], ['phuongle', 'chloed'],
  ['rafaels', 'sofiam'], ['rafaels', 'noahw'], ['samwilson', 'danielk'], ['samwilson', 'lanhoang'], ['trangdo', 'oliviah'],
  ['trangdo', 'hanasato'], ['hieuvo', 'marcor'], ['hieuvo', 'anikar'], ['lanhoang', 'danielk'], ['vyle', 'maidang']
];

export const TOPIC_FOLLOWS: Array<[string, string]> = [
  ['maidang', 'baonguyen'], ['jonahlee', 'tomaso'], ['sofiam', 'rafaels'], ['oliviah', 'trangdo'], ['chloed', 'phuongle'],
  ['danielk', 'samwilson'], ['priyas', 'ngocanh'], ['ethanr', 'minhquan'], ['anikar', 'hieuvo'], ['linhng', 'huongpham']
];

export const TOPIC_CHATS: SeedChat[] = [
  { members: ['baonguyen', 'tomaso'], messages: [[0, 'Want to co-present at the AI meetup?', 900], [1, 'Yes! Vision + language, best of both.', 890]] }
];

/**
 * Behaviour history for two sample accounts, so their "For you" page is already personalised.
 * The demo account (Maya) starts with none: her suggestions follow only what she does.
 */
export const TOPIC_SIGNALS: SeedSignal[] = [
  // Mai: an IT student into AI, English exams and gaming.
  { user: 'maidang', type: 'search', query: 'machine learning', hoursAgo: 2 },
  { user: 'maidang', type: 'search', query: 'IELTS writing', hoursAgo: 26 },
  { user: 'maidang', type: 'dwell', post: 'bao-llm', durationMs: 48_000, hoursAgo: 3 },
  { user: 'maidang', type: 'dwell', post: 'tomas-vision', durationMs: 31_000, hoursAgo: 4 },
  { user: 'maidang', type: 'open', profile: 'baonguyen', hoursAgo: 3 },
  { user: 'maidang', type: 'react', post: 'kevin-valorant', hoursAgo: 20 },
  { user: 'maidang', type: 'open', group: 'ielts-study-together', hoursAgo: 25 },
  // Olivia: pets and baking.
  { user: 'oliviah', type: 'search', query: 'dog adoption', hoursAgo: 1 },
  { user: 'oliviah', type: 'search', query: 'sourdough', hoursAgo: 30 },
  { user: 'oliviah', type: 'dwell', post: 'trang-adopt', durationMs: 25_000, hoursAgo: 1 },
  { user: 'oliviah', type: 'dwell', post: 'huong-sourdough', durationMs: 40_000, hoursAgo: 29 },
  { user: 'oliviah', type: 'open', group: 'home-bakers-vietnam', hoursAgo: 28 }
];
