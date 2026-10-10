// Curated emoji set for the composer/chat emoji picker. Each entry: [emoji, search keywords].
export type EmojiCategory = { id: string; label: string; icon: string; items: Array<[string, string]> };

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  { id: 'smileys', label: 'Smileys & people', icon: '😀', items: [
    ['😀', 'grin smile happy'], ['😃', 'smile happy joy'], ['😄', 'smile laugh happy'], ['😁', 'grin beam'], ['😆', 'laugh xd'], ['😅', 'sweat laugh nervous'], ['🤣', 'rofl rolling laugh'], ['😂', 'joy tears laugh lol'],
    ['🙂', 'slight smile'], ['🙃', 'upside down'], ['😉', 'wink'], ['😊', 'blush smile happy'], ['😇', 'angel halo innocent'], ['🥰', 'love hearts adore'], ['😍', 'heart eyes love'], ['🤩', 'star struck wow'],
    ['😘', 'kiss blow'], ['😗', 'kiss'], ['😚', 'kiss closed eyes'], ['😋', 'yum tasty delicious'], ['😛', 'tongue'], ['😜', 'wink tongue silly'], ['🤪', 'zany crazy'], ['😝', 'tongue squint'],
    ['🤗', 'hug'], ['🤭', 'oops giggle'], ['🤫', 'shush quiet'], ['🤔', 'thinking hmm'], ['🤐', 'zipper mouth'], ['🤨', 'raised eyebrow'], ['😐', 'neutral'], ['😑', 'expressionless'],
    ['😶', 'no mouth'], ['😏', 'smirk'], ['😒', 'unamused'], ['🙄', 'eye roll'], ['😬', 'grimace awkward'], ['😌', 'relieved calm'], ['😔', 'pensive sad'], ['😪', 'sleepy'],
    ['🤤', 'drool hungry'], ['😴', 'sleeping zzz tired'], ['😷', 'mask sick'], ['🤒', 'thermometer sick fever'], ['🤧', 'sneeze cold'], ['🥵', 'hot'], ['🥶', 'cold freezing'], ['🥴', 'woozy dizzy'],
    ['😵', 'dizzy'], ['🤯', 'mind blown exploding'], ['🤠', 'cowboy'], ['🥳', 'party celebrate'], ['😎', 'cool sunglasses'], ['🤓', 'nerd'], ['🧐', 'monocle'], ['😕', 'confused'],
    ['😟', 'worried'], ['🙁', 'frown'], ['😮', 'open mouth surprised wow'], ['😯', 'hushed'], ['😲', 'astonished shocked'], ['😳', 'flushed embarrassed'], ['🥺', 'pleading puppy eyes'], ['🥹', 'holding back tears'],
    ['😦', 'frowning'], ['😧', 'anguished'], ['😨', 'fearful scared'], ['😰', 'anxious sweat'], ['😥', 'sad relieved'], ['😢', 'cry sad tear'], ['😭', 'sob crying loud'], ['😱', 'scream fear'],
    ['😖', 'confounded'], ['😣', 'persevere'], ['😞', 'disappointed'], ['😓', 'downcast sweat'], ['😩', 'weary'], ['😫', 'tired'], ['🥱', 'yawn bored'], ['😤', 'triumph huff proud'],
    ['😡', 'pout angry mad'], ['😠', 'angry'], ['🤬', 'cursing swear'], ['😈', 'devil smile'], ['💀', 'skull dead'], ['💩', 'poop'], ['🤡', 'clown'], ['👻', 'ghost'],
    ['👽', 'alien'], ['🤖', 'robot'], ['😺', 'cat smile'], ['😹', 'cat joy'], ['😻', 'cat heart eyes'], ['🙈', 'see no evil monkey'], ['🙉', 'hear no evil'], ['🙊', 'speak no evil']
  ] },
  { id: 'gestures', label: 'Gestures & hearts', icon: '👍', items: [
    ['👍', 'thumbs up like yes'], ['👎', 'thumbs down dislike no'], ['👌', 'ok perfect'], ['✌️', 'victory peace'], ['🤞', 'fingers crossed luck'], ['🤟', 'love you'], ['🤘', 'rock on'], ['🤙', 'call me shaka'],
    ['👋', 'wave hello bye'], ['🤚', 'raised hand'], ['✋', 'hand stop high five'], ['👏', 'clap applause'], ['🙌', 'raise hands celebrate'], ['🤝', 'handshake deal'], ['🙏', 'pray thanks please'], ['💪', 'muscle strong flex'],
    ['👀', 'eyes look'], ['🫶', 'heart hands'], ['✍️', 'writing'], ['👉', 'point right'], ['👈', 'point left'], ['👆', 'point up'], ['👇', 'point down'], ['☝️', 'index up'],
    ['❤️', 'red heart love'], ['🧡', 'orange heart'], ['💛', 'yellow heart'], ['💚', 'green heart'], ['💙', 'blue heart'], ['💜', 'purple heart'], ['🖤', 'black heart'], ['🤍', 'white heart'],
    ['💔', 'broken heart'], ['❣️', 'heart exclamation'], ['💕', 'two hearts'], ['💞', 'revolving hearts'], ['💓', 'beating heart'], ['💗', 'growing heart'], ['💖', 'sparkling heart'], ['💘', 'cupid arrow heart'],
    ['💯', 'hundred perfect'], ['🔥', 'fire lit hot'], ['✨', 'sparkles'], ['⭐', 'star'], ['🌟', 'glowing star'], ['💥', 'boom collision'], ['💫', 'dizzy star'], ['💬', 'speech bubble chat']
  ] },
  { id: 'animals', label: 'Animals & nature', icon: '🐶', items: [
    ['🐶', 'dog puppy'], ['🐱', 'cat kitten'], ['🐭', 'mouse'], ['🐹', 'hamster'], ['🐰', 'rabbit bunny'], ['🦊', 'fox'], ['🐻', 'bear'], ['🐼', 'panda'],
    ['🐨', 'koala'], ['🐯', 'tiger'], ['🦁', 'lion'], ['🐮', 'cow'], ['🐷', 'pig'], ['🐸', 'frog'], ['🐵', 'monkey'], ['🐔', 'chicken'],
    ['🐧', 'penguin'], ['🐦', 'bird'], ['🦆', 'duck'], ['🦉', 'owl'], ['🐝', 'bee'], ['🦋', 'butterfly'], ['🐢', 'turtle'], ['🐍', 'snake'],
    ['🐙', 'octopus'], ['🐠', 'fish tropical'], ['🐬', 'dolphin'], ['🐳', 'whale'], ['🦄', 'unicorn'], ['🐕', 'dog'], ['🐈', 'cat'], ['🐾', 'paw prints'],
    ['🌸', 'cherry blossom flower'], ['🌹', 'rose flower'], ['🌻', 'sunflower'], ['🌷', 'tulip'], ['🌱', 'seedling plant sprout'], ['🌿', 'herb leaf'], ['🍀', 'clover luck'], ['🌴', 'palm tree beach'],
    ['🌳', 'tree'], ['🍁', 'maple leaf autumn'], ['🌙', 'moon night'], ['☀️', 'sun sunny'], ['🌈', 'rainbow'], ['⛅', 'cloud sun'], ['🌧️', 'rain'], ['❄️', 'snow cold']
  ] },
  { id: 'food', label: 'Food & drink', icon: '🍔', items: [
    ['🍏', 'green apple'], ['🍎', 'apple'], ['🍊', 'orange'], ['🍋', 'lemon'], ['🍌', 'banana'], ['🍉', 'watermelon'], ['🍇', 'grapes'], ['🍓', 'strawberry'],
    ['🥭', 'mango'], ['🍍', 'pineapple'], ['🥥', 'coconut'], ['🥑', 'avocado'], ['🌶️', 'chili pepper spicy'], ['🌽', 'corn'], ['🥕', 'carrot'], ['🥦', 'broccoli'],
    ['🍞', 'bread'], ['🥖', 'baguette banh mi'], ['🧀', 'cheese'], ['🍳', 'egg cooking'], ['🥓', 'bacon'], ['🍔', 'burger'], ['🍟', 'fries'], ['🍕', 'pizza'],
    ['🌭', 'hot dog'], ['🥪', 'sandwich'], ['🌮', 'taco'], ['🍜', 'noodles pho ramen'], ['🍲', 'pot food stew'], ['🍛', 'curry rice'], ['🍣', 'sushi'], ['🍱', 'bento'],
    ['🥟', 'dumpling'], ['🍤', 'shrimp tempura'], ['🍚', 'rice'], ['🍙', 'rice ball'], ['🍦', 'ice cream'], ['🍰', 'cake'], ['🎂', 'birthday cake'], ['🍩', 'donut'],
    ['🍪', 'cookie'], ['🍫', 'chocolate'], ['☕', 'coffee'], ['🍵', 'tea'], ['🧋', 'bubble tea boba'], ['🥤', 'drink soda'], ['🍺', 'beer'], ['🍷', 'wine']
  ] },
  { id: 'activities', label: 'Activities & travel', icon: '⚽', items: [
    ['⚽', 'soccer football'], ['🏀', 'basketball'], ['🏈', 'american football'], ['🎾', 'tennis'], ['🏸', 'badminton'], ['🏓', 'ping pong'], ['🏊', 'swim'], ['🚴', 'cycling bike'],
    ['🏃', 'run running'], ['🧘', 'yoga'], ['🏋️', 'weights gym'], ['🎮', 'video game'], ['🎲', 'dice game'], ['🎯', 'target dart'], ['🎨', 'art paint'], ['🎬', 'movie film'],
    ['🎤', 'microphone karaoke'], ['🎧', 'headphones music'], ['🎸', 'guitar'], ['🎹', 'piano'], ['🎉', 'party popper celebrate'], ['🎊', 'confetti'], ['🎁', 'gift present'], ['🏆', 'trophy win'],
    ['🚗', 'car'], ['🛵', 'scooter motorbike'], ['🚲', 'bicycle'], ['🚌', 'bus'], ['🚆', 'train'], ['✈️', 'airplane flight travel'], ['🚀', 'rocket'], ['⛵', 'sailboat'],
    ['🏖️', 'beach'], ['🏝️', 'island'], ['⛰️', 'mountain'], ['🏕️', 'camping'], ['🏙️', 'city'], ['🌉', 'bridge night'], ['🗺️', 'map'], ['📍', 'pin location']
  ] },
  { id: 'objects', label: 'Objects & symbols', icon: '💡', items: [
    ['📱', 'phone mobile'], ['💻', 'laptop computer'], ['⌚', 'watch'], ['📷', 'camera photo'], ['🎥', 'video camera'], ['📺', 'tv'], ['💡', 'idea bulb'], ['🔋', 'battery'],
    ['📚', 'books study'], ['📖', 'book read'], ['✏️', 'pencil'], ['📝', 'memo note'], ['📅', 'calendar date'], ['📌', 'pushpin'], ['📎', 'paperclip'], ['🔑', 'key'],
    ['💰', 'money bag'], ['💸', 'money wings'], ['🛒', 'shopping cart'], ['🎈', 'balloon'], ['🕯️', 'candle'], ['🧸', 'teddy bear'], ['💌', 'love letter'], ['📦', 'package'],
    ['✅', 'check yes done'], ['❌', 'cross no'], ['❓', 'question'], ['❗', 'exclamation'], ['⚠️', 'warning'], ['🚫', 'no prohibited'], ['➕', 'plus'], ['🔔', 'bell'],
    ['🎵', 'music note'], ['♻️', 'recycle'], ['🆗', 'ok button'], ['🆕', 'new'], ['🔝', 'top'], ['⏰', 'alarm clock'], ['⌛', 'hourglass'], ['🇻🇳', 'vietnam flag']
  ] }
];
