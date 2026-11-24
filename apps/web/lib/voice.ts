import type { Language } from '@ft/shared';

/*
 * Which browser voice reads a lesson aloud (#213). speechSynthesis lists
 * every installed voice, the robotic ones first more often than not: the
 * choice ranks them instead of taking the first of the language.
 */

/** The part of a SpeechSynthesisVoice the choice reads. */
export type VoiceInfo = Pick<SpeechSynthesisVoice, 'lang' | 'name' | 'localService' | 'default'>;

/** The regions a course teaches, best first: the others of the language come after. */
const MAIN_REGIONS: Record<Language, string[]> = {
  fr: ['fr-fr'],
  de: ['de-de'],
  en: ['en-gb', 'en-us'],
};

/** Names of the natural-sounding voices: Chrome's online ones, Edge's neural ones, macOS's downloads. */
const NATURAL = /\b(google|natural|neural|enhanced|premium|online)\b/i;

/*
 * The API says nothing of a voice's gender: the names do. Female voices
 * of Chrome, Edge/Windows, macOS and iOS for the course languages. Chrome's
 * "Google français", "Google Deutsch" and "Google US English" are female
 * too, but have no first name: they win on NATURAL.
 */
const FEMALE =
  /\b(female|femme|frau|woman|am[ée]lie|audrey|aurélie|marie|julie|hortense|denise|eloise|vivienne|brigitte|celeste|coralie|jacqueline|josephine|yvette|anna|helena|hedda|katja|petra|amala|seraphina|elke|gisela|klarissa|louisa|maja|tanja|ingrid|kate|serena|stephanie|martha|susan|samantha|allison|ava|zoe|nicky|karen|moira|tessa|fiona|victoria|zira|hazel|aria|jenny|libby|sonia|maisie|mia|michelle|emma|catherine)\b/i;
const MALE =
  /\b(male|homme|mann|thomas|henri|paul|claude|guy|remy|rémy|jacques|antoine|jérôme|jerome|yannick|markus|stefan|conrad|killian|florian|ralf|daniel|alex|fred|aaron|arthur|oliver|rishi|tom|reed|rocko|george|ryan|christopher|eric|roger|steffan|david|mark|james)\b/i;

const lower = (s: string) => s.toLowerCase().replace('_', '-');

/** A voice of the language: `fr`, `fr-FR`, `fr_CA`… */
const speaks = (voice: VoiceInfo, lang: Language) => lower(voice.lang).split('-')[0] === lang;

/** How well a voice fits, compared field by field, the first one first. */
function rank(voice: VoiceInfo, lang: Language): number[] {
  const regions = MAIN_REGIONS[lang];
  const region = regions.indexOf(lower(voice.lang));
  return [
    // 1. The course's main region, in its order, then any other region.
    region === -1 ? 0 : regions.length - region,
    // 2. A natural voice, then a female one, then an online one, then the default.
    NATURAL.test(voice.name) ? 1 : 0,
    FEMALE.test(voice.name) ? 1 : MALE.test(voice.name) ? -1 : 0,
    voice.localService ? 0 : 1,
    voice.default ? 1 : 0,
  ];
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    const d = (b[i] ?? 0) - (a[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** The best voice of the language, or null when it has none. Ties keep the browser's order. */
export function pickVoice<V extends VoiceInfo>(voices: readonly V[], lang: Language): V | null {
  let best: V | null = null;
  let bestRank: number[] = [];
  for (const voice of voices) {
    if (!speaks(voice, lang)) continue;
    const r = rank(voice, lang);
    if (!best || compare(r, bestRank) < 0) {
      best = voice;
      bestRank = r;
    }
  }
  return best;
}

/*
 * The text as it should be heard. A voice reads out what it sees: the
 * underscores of a blank, the asterisks of Markdown, a slash. A blank
 * becomes a pause, an "a / b" an "a, b", and the markup goes.
 */
export function spokenText(text: string): string {
  return text
    .replace(/_{2,}|…{2,}|\.{4,}/g, ', ')
    .replace(/\s*\/\s*/g, ', ')
    .replace(/[_*#`~|<>{}[\]\\^=+]/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/,\s*,+/g, ',')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,]+|[\s,]+$/g, '');
}

/** Slower than the browser's 1: a learner hears every sound. */
export const SPEECH_RATE = 0.85;
