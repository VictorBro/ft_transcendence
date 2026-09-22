import { Language, Level, QuestionCategory, Topic, TOPICS } from '@ft/shared';

export interface GenerateQuestionsPromptParams {
  lang: Language;
  threshold: integer;
  level: Level;
  category: QuestionCategory;
  /** Liste optionnelle des topics à couvrir (par exemple 5 topics cibles) */
  topics?: Topic[];
}

const TIME_LIMIT_TARGETS: Record<QuestionCategory, Record<Level, string>> = {
  vocabulary: { A1: '30', A2: '30', B1: '45', B2: '45', C1: '60', C2: '60' },
  grammar: { A1: '30', A2: '45', B1: '60', B2: '60', C1: '75', C2: '90' },
  reading: { A1: '60-75', A2: '75-90', B1: '90', B2: '105-120', C1: '120-165', C2: '150-180' },
};

export function buildGenerateQuestionsPrompt(params: GenerateQuestionsPromptParams): {
  system: string;
  user: string;
} {
  const { lang, level, category, topics } = params;
  const targetTimeS = TIME_LIMIT_TARGETS[category][level];

  // Si reading: topic unique imposé. Sinon, utiliser les topics passés ou tout TOPICS.
  const allowedTopics =
    category === 'reading'
      ? ['information_structure_and_pragmatics']
      : topics && topics.length > 0
        ? topics
        : TOPICS;

  const system = `You are an expert CEFR language exam designer.
You must generate exactly 5 multiple-choice placement questions for category "${category}".
Output strictly a JSON object with an "items" array containing 5 questions:
{
  "items": [
    {
      "level": "${level}",
      "topic": "${allowedTopics.join('" | "')}",
      "question": string,
      "options": [string, string, string, string],
      "answer": string,
      "timeLimitS": number${category === 'reading' ? ',\n      "readText": string' : ''}
    }
  ]
}
Rules:
1. Category & Topic constraints:
${
  category === 'reading'
    ? `   - Every question MUST have its own distinct, standalone "readText" passage (25-100 words appropriate for ${level}). Do NOT reuse passages between questions.\n   - All 5 questions must have "topic": "information_structure_and_pragmatics".`
    : `   - Do NOT include "readText".\n   - "question" must be a fill-in-the-blank sentence containing "___".\n   - ${
        topics && topics.length === 5
          ? `You MUST generate exactly ONE question for EACH of these 5 topics:\n     ${topics.join(', ')}`
          : `Each of the 5 questions MUST have a DIFFERENT topic chosen from:\n     ${allowedTopics.join(', ')}`
      }`
}
2. Options & Answer constraints:
   - "options" must contain EXACTLY 4 strings.
   - All 4 options must be strictly unique (no duplicates).
   - "answer" must match one of the 4 options verbatim (exact character-for-character match).
   - Exactly ONE option must be correct. The 3 distractors must be plausible but unambiguously wrong.
3. Language & Level:
   - All text (passages, questions, options, answers) must be entirely in language "${lang}".
   - Difficulty and vocabulary must strictly match CEFR level "${level}".
4. Time limit:
   - "timeLimitS" must be a positive integer reflecting target time for ${category} at ${level}: around ${targetTimeS} seconds.
5. Strict output format:
   - Output raw JSON only. No markdown formatting (no \`\`\`json), no commentary.`;

  const user =
    category === 'reading'
      ? `Generate 5 ${level} reading comprehension questions with passages in "${lang}".`
      : topics && topics.length === 5
        ? `Generate 5 ${level} ${category} questions in "${lang}" covering topics: ${topics.join(', ')}.`
        : `Generate 5 ${level} ${category} questions in "${lang}".`;

  return { system, user };
}
