// Facebook-style "Feeling/activity" catalogue, shared by the server (validation, rendering) and the browser bundle.

export type Feeling = { key: string; label: string; emoji: string };
export type Activity = { key: string; verb: string; emoji: string; placeholder: string };

export const FEELINGS: Feeling[] = [
  { key: 'happy', label: 'happy', emoji: '😊' }, { key: 'blessed', label: 'blessed', emoji: '😇' }, { key: 'loved', label: 'loved', emoji: '🥰' },
  { key: 'sad', label: 'sad', emoji: '😢' }, { key: 'lovely', label: 'lovely', emoji: '😍' }, { key: 'thankful', label: 'thankful', emoji: '🙏' },
  { key: 'excited', label: 'excited', emoji: '🤩' }, { key: 'in_love', label: 'in love', emoji: '😍' }, { key: 'crazy', label: 'crazy', emoji: '🤪' },
  { key: 'grateful', label: 'grateful', emoji: '☺️' }, { key: 'blissful', label: 'blissful', emoji: '😌' }, { key: 'fantastic', label: 'fantastic', emoji: '🤗' },
  { key: 'silly', label: 'silly', emoji: '😜' }, { key: 'festive', label: 'festive', emoji: '🥳' }, { key: 'wonderful', label: 'wonderful', emoji: '🌟' },
  { key: 'cool', label: 'cool', emoji: '😎' }, { key: 'amused', label: 'amused', emoji: '😄' }, { key: 'relaxed', label: 'relaxed', emoji: '😌' },
  { key: 'positive', label: 'positive', emoji: '🙂' }, { key: 'chill', label: 'chill', emoji: '🧊' }, { key: 'hopeful', label: 'hopeful', emoji: '🤞' },
  { key: 'joyful', label: 'joyful', emoji: '😁' }, { key: 'tired', label: 'tired', emoji: '😴' }, { key: 'motivated', label: 'motivated', emoji: '💪' },
  { key: 'proud', label: 'proud', emoji: '😤' }, { key: 'alone', label: 'alone', emoji: '😔' }, { key: 'thoughtful', label: 'thoughtful', emoji: '🤔' },
  { key: 'ok', label: 'OK', emoji: '👌' }, { key: 'nostalgic', label: 'nostalgic', emoji: '🥹' }, { key: 'angry', label: 'angry', emoji: '😠' },
  { key: 'sick', label: 'sick', emoji: '🤒' }, { key: 'delighted', label: 'delighted', emoji: '😃' }, { key: 'drained', label: 'drained', emoji: '😩' },
  { key: 'emotional', label: 'emotional', emoji: '🥲' }, { key: 'confident', label: 'confident', emoji: '😏' }, { key: 'awesome', label: 'awesome', emoji: '🤘' },
  { key: 'fresh', label: 'fresh', emoji: '🌿' }, { key: 'determined', label: 'determined', emoji: '🔥' }, { key: 'hungry', label: 'hungry', emoji: '🤤' },
  { key: 'sleepy', label: 'sleepy', emoji: '🥱' }
];

export const ACTIVITIES: Activity[] = [
  { key: 'celebrating', verb: 'celebrating', emoji: '🎉', placeholder: 'What are you celebrating?' },
  { key: 'watching', verb: 'watching', emoji: '📺', placeholder: 'What are you watching?' },
  { key: 'eating', verb: 'eating', emoji: '🍜', placeholder: 'What are you eating?' },
  { key: 'drinking', verb: 'drinking', emoji: '☕', placeholder: 'What are you drinking?' },
  { key: 'traveling', verb: 'traveling to', emoji: '✈️', placeholder: 'Where are you going?' },
  { key: 'listening', verb: 'listening to', emoji: '🎧', placeholder: 'What are you listening to?' },
  { key: 'reading', verb: 'reading', emoji: '📖', placeholder: 'What are you reading?' },
  { key: 'playing', verb: 'playing', emoji: '🎮', placeholder: 'What are you playing?' },
  { key: 'attending', verb: 'attending', emoji: '📅', placeholder: 'What are you attending?' },
  { key: 'looking_for', verb: 'looking for', emoji: '🔍', placeholder: 'What are you looking for?' },
  { key: 'thinking', verb: 'thinking about', emoji: '💭', placeholder: 'What are you thinking about?' },
  { key: 'supporting', verb: 'supporting', emoji: '❤️', placeholder: 'What are you supporting?' }
];

export type PostFeeling = { type: 'feeling'; key: string } | { type: 'activity'; key: string; text: string };

/** Human text for a stored feeling/activity, e.g. { emoji: '😊', text: 'feeling happy' } or 'eating phở'. */
export function describeFeeling(value: PostFeeling | null | undefined): { emoji: string; text: string } | null {
  if (!value) return null;
  if (value.type === 'feeling') {
    const feeling = FEELINGS.find((item) => item.key === value.key);
    return feeling ? { emoji: feeling.emoji, text: `feeling ${feeling.label}` } : null;
  }
  const activity = ACTIVITIES.find((item) => item.key === value.key);
  return activity ? { emoji: activity.emoji, text: `${activity.verb} ${value.text}`.trim() } : null;
}
