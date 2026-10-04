import {
  Level,
  LEVELS,
  OPTIONS_PER_ITEM,
  READING_BATCH_SIZE,
  READING_TOPIC,
  TOPICS,
  VOCABULARY_BATCH_SIZE,
  VOCABULARY_TOPICS,
} from '@ft/shared';

import { Cell } from '../question-batch';

// Same text for every language and level: the examples are English illustrations the model adapts, never copies.
const CEFR_LEVEL_REFERENCE = `CEFR LEVEL REFERENCE: USE THIS AS THE PRIMARY DIFFICULTY CALIBRATION
The CEFR describes a learner's overall ability to use a language. For these test questions, translate that ability into observable linguistic difficulty: which words, structures, sentence patterns and inferences a candidate must handle to answer correctly.
The examples below are in English and only illustrate the difficulty of each level. Do NOT copy or translate them. Build original items using the equivalent structures of the target language; if a structure does not exist in that language, test the closest structure of comparable difficulty.
Passage length is fixed by the rules above at every level. Higher-level reading difficulty must come from density, structure, implicitness and register, not from length.

A1: Beginner / Breakthrough
- Overall ability: handles immediate needs in very familiar, predictable situations: greeting, introducing oneself, giving personal information (name, age, nationality, family, simple likes), ordering something, asking a price, making a very simple request. Relies heavily on memorised expressions.
- Vocabulary: the most frequent, concrete, everyday words (family, numbers, food, colours, days, common objects, basic verbs such as be, have, like, want, go). Almost no abstraction.
- Grammar: present tense of the most common verbs, the verb "to be" and "to have" or their equivalents, personal pronouns, basic articles/determiners, plurals, simple possessives, basic negation, simple questions, the most common prepositions of place and time.
- Syntax: very short simple sentences (typically 3-8 words), one clause, at most joined with "and" or "but". Very low information density.
- Reading: very short, highly predictable texts with clear context (a sign, a short note, a personal introduction, a menu). All information is explicit and stated in one sentence.
- Question targets: one basic, high-frequency form in a clear context (correct form of "to be", a basic article, a plural, a basic preposition, a very common noun or verb). Too easy: nothing is really tested because the context gives the answer away. Too hard: any tense other than the basic present, subordination, idioms, low-frequency words, inference.
- Examples: "I ___ from Canada." (am / is / are / be); "My sister ___ two children."; "I would like a coffee, please."; "The bank is next to the station."

A2: Elementary
- Overall ability: starts building own sentences beyond memorised phrases. Handles routine exchanges on familiar topics: shopping, simple work tasks, family, free time, travel, directions, daily routines. An exchange may contain several pieces of information.
- Vocabulary: common, concrete everyday vocabulary, with the first abstract words tied to daily life (problem, idea, weekend plans). Still high-frequency.
- Grammar: present tenses well controlled; functional use of the common past and future forms; frequent irregular verbs; questions and negation in common tenses; comparatives and superlatives where the language has them; object pronouns; common modals of ability, permission and obligation (can, must, have to); common prepositions of time, place and movement.
- Syntax: short to medium sentences (typically 6-14 words); two clauses linked by simple connectors (because, but, so, then, when, or). Can produce a short connected text.
- Reading: short simple texts on familiar matters: personal emails, notices, simple instructions, forms, short advertisements, timetables. Information is explicit; the reader may need to locate it among a few sentences.
- Question targets: choosing a common tense from a clear time marker, a comparative, a common modal, a frequent preposition, a simple connector, a common everyday word. The difficulty comes from combining two simple elements (a past event plus a cause, a time marker plus a tense), not from nuance. Too easy: A1 forms with no contextual reasoning. Too hard: perfect/progressive distinctions that need fine nuance, conditionals beyond the simplest, implicit meaning, abstract vocabulary.
- Examples: "I ___ to the supermarket yesterday because we had no food at home." (went); "This bag is ___ than that one."; "We are going to visit my grandparents next weekend."; "You have to turn left at the bank."

B1: Intermediate / Threshold
- Overall ability: functionally independent in most familiar situations. Can narrate past experiences, describe plans and ambitions, give and briefly justify an opinion, handle unexpected situations while travelling, and follow the main points of clear standard speech on familiar matters.
- Vocabulary: broader and less strictly concrete; familiar topics of personal interest (work, studies, travel, health, hobbies, current events at a general level). Some common phrasal or fixed expressions and common collocations.
- Grammar: systematic use of the main tenses including the contrast between completed and ongoing or past-to-present actions; basic conditionals (real and hypothetical present); relative clauses; common modals of possibility, advice and deduction; common passive forms; simple indirect questions; gerund/infinitive after frequent verbs.
- Syntax: longer, structured sentences (typically 10-20 words); frequent subordination (if, when, although, while, who, which, that); logical connectors (however, therefore, so that, as soon as). A sentence may relate two events in time, cause or condition.
- Reading: straightforward factual texts on familiar topics: articles, personal letters describing events and feelings, clear instructions. The reader must connect information across several sentences and grasp the main point.
- Question targets: recognising a conditional, temporal or causal relationship and the structure it requires; choosing a relative pronoun; contrasting two tenses from context; a common collocation or phrasal verb. Too easy: an answer found from a single time marker with no relation between clauses. Too hard: stylistic choices, fine nuances of modality, formal register, implicit attitude, advanced conditionals.
- Examples: "If I had more time, I ___ take a course in Spanish." (would); "The woman ___ lives next door is a nurse."; "I have lived here since 2019."; "Although it was raining, we decided to go out."

B2: Upper-Intermediate
- Overall ability: communicates spontaneously and precisely on a wide range of general and professional topics. Can take an active part in a discussion, defend an opinion with several arguments, explain, compare, qualify and justify. Understands standard speech at normal speed and the main ideas of complex texts, including technical discussion in one's own field.
- Vocabulary: clearly wider, including common abstract and professional terms (impact, requirement, approach, benefit, issue), frequent collocations, common phrasal verbs and idioms, and word families (derive the right noun, adjective or adverb).
- Grammar: complex tense combinations (past perfect, future perfect, perfect progressive); mixed and past conditionals; full passive, including with modals; reported speech with tense and reference shifts; modals with different degrees of certainty, including in the past (must have, might have, should have); complex subordination; participle clauses; common structures after "wish" or similar.
- Syntax: long but natural sentences with several clauses; sophisticated connectors (despite, whereas, provided that, as long as, on the other hand); moderate to high information density. The reader must follow the logical relationship between several ideas.
- Reading: texts of moderate complexity with an argument, abstract vocabulary and information that must be linked across the passage. Readily accessible implicit meaning (a reason, a purpose, a contrast) can be tested.
- Question targets: a verb form determined by the relationship between two events; a modal expressing a specific degree of certainty; the correct connector for a concession or condition; a precise collocation or word form. A B2 item must NOT be an A2 sentence with one rarer word: its difficulty must come from linguistic and cognitive structure. Too easy: a single-clause sentence answerable from a time marker alone. Too hard: literary or highly formal register, rare idioms, inversion, fine distinctions between near-synonyms.
- Examples: "The project ___ by the time the new manager arrived." (had been completed); "He said he ___ call me the following day."; "You should have told me earlier; I could have helped."; "Despite being tired, she finished the report."

C1: Advanced
- Overall ability: uses the language fluently, precisely and flexibly in social, academic and professional contexts. Understands long, demanding texts and recognises implicit meaning, the author's attitude, tone, intention or position. Can reformulate one idea with different nuances. Errors are rare and minor.
- Vocabulary: rich and precise; chooses between close formulations; good command of collocations, common idiomatic expressions and less frequent but natural words; aware of formal versus informal register.
- Grammar: full control of tense and modal nuance; inverted or marked structures where natural in the language (for example inverted conditionals, fronted negative adverbials); cleft and emphatic structures; complex nominalisation; subjunctive or equivalent moods where relevant; complex passive and impersonal constructions.
- Syntax: embedded clauses, multiple subordination, marked word order for emphasis or cohesion, sophisticated cohesive devices (nonetheless, insofar as, let alone, whereby). High information density.
- Reading: dense, linguistically complex texts on abstract or specialised topics. Questions can require distinguishing what is stated from what is implied, identifying attitude, tone, purpose or the function of a sentence in the argument.
- Question targets: structures combining form and meaning (an inverted conditional with the correct consequence), register-appropriate word choice, precise collocations, fine tense or modal nuance, inference in reading. Difficulty must come from the linguistic precision required, not from vocabulary alone. Too easy: any item answerable with B1-B2 grammar and a literal reading. Too hard: extremely rare or archaic vocabulary, specialised jargon, literary allusions.
- Examples: "Had the committee been informed earlier, they ___ the decision differently." (would have taken); "Not only did he miss the deadline, but he also failed to inform anyone."; "The findings would seem to suggest a different explanation."; collocations such as "pose a threat" or "raise concerns".

C2: Mastery / Proficiency
- Overall ability: understands virtually everything read or heard with ease. Can summarise and synthesise information from several sources, restructure and reformulate precisely, and grasp very fine shades of meaning, including humour, irony, understatement and implied attitude when the text supports them.
- Vocabulary: extremely rich; distinguishes between close synonyms; masters complex collocations and idioms; handles specialised, academic, professional and literary registers and is highly sensitive to context.
- Grammar: complete, flexible control, including rare but natural structures, subtle mood and aspect choices, and unusual word orders used for emphasis or style.
- Syntax: great syntactic flexibility; can process unusual but natural formulations, long periodic sentences and highly condensed phrasing.
- Reading: complex, abstract or stylistically marked texts where meaning depends on nuance, irony, register or what is left unsaid. An author's attitude may never be stated directly.
- Question targets: choosing between formulations that are all grammatical but differ in collocation, idiom, register or nuance, where only one is correct in the given context; recognising implied attitude or irony. C2 does NOT simply mean many rare words: difficulty must come from fine, flexible, nuanced command of the language. Too easy: anything a C1 candidate would answer reliably by grammar alone. Too hard or invalid: items whose answer depends on obscure trivia, or where a proficient native speaker could defend more than one option.
- Examples: "The decision was, to put it ___, controversial." (mildly, against softly / gently / lightly); "Little ___ they know what was about to happen." (did); choosing the one connector whose register fits a formal academic sentence; identifying an author's unstated scepticism in a passage.

FUNDAMENTAL CALIBRATION RULE
Do not equate CEFR level with vocabulary difficulty alone. Determine the level of an item from the combination of:
- vocabulary frequency and abstraction
- grammatical complexity
- syntactic complexity
- discourse complexity
- amount of contextual inference required
- semantic precision
- register
- implicit meaning
- reading complexity
- degree of spontaneity and flexibility required
An item does not become B2 because it contains one difficult word. An item does not become A1 because its words are simple if it requires a B2/C1 structure or inference.

DISTRACTOR QUALITY
Distractors must be plausible for a learner at the tested level, linguistically natural (real words and forms of the language), close enough to the correct answer to genuinely test the target skill, and objectively incorrect in the given context. Avoid absurd or obviously wrong distractors.
- A1/A2: distractors may reflect frequent learner errors (wrong person or number, wrong basic tense, wrong article or preposition).
- B1/B2: distractors may reflect confusions between tenses, modals, prepositions, conditionals, connectors, sentence structures or collocations.
- C1/C2: distractors may be much subtler and differ in register, collocation, semantic nuance or grammatical structure; they may be grammatical in isolation, but the context must make every distractor clearly wrong for a proficient speaker.

ANTI-PATTERNS. DO NOT:
- write A1 items with C1 vocabulary because the word is common in some contexts;
- write B2 items that are A2 sentences with one complicated word;
- write C1/C2 items based only on rare words;
- make an item artificially difficult with an unnecessarily long sentence;
- use grammatical structures above the target level without reason;
- test cultural or encyclopaedic knowledge instead of language;
- use ambiguous traps where more than one answer can be defended;
- confuse topic difficulty with linguistic difficulty.
The goal is to measure language proficiency, not general knowledge.`;

function categoryBrief({ lang, level, category }: Cell) {
  switch (category) {
    case 'grammar':
      return {
        count: TOPICS.length,
        rules: `- "question" is one sentence with a single blank written "___".
- Write exactly one question for each of these topics, none repeated or skipped: ${TOPICS.join(', ')}.`,
        calibration: `TOPIC CALIBRATION
Each topic must be tested at the depth appropriate to ${level}, not at its most advanced form. For example, "subordinate_clauses" at A1/A2 means a simple "because" or "when" clause, while at C1/C2 it can mean multiple embedding or marked structures. The blank must target the linguistic point of the topic; the rest of the sentence must stay within ${level}.`,
        user: `Write ${TOPICS.length} ${level} grammar questions in "${lang}", one per topic.`,
      };
    case 'vocabulary':
      return {
        count: VOCABULARY_BATCH_SIZE,
        rules: `- "question" is one sentence with a single blank written "___".
- Test vocabulary, not grammar: collocations, word choice between close meanings, word formation, and set phrases (phrasal verbs included, where the language has them). Mix these kinds across the batch.
- Options that differ only in inflection (tense, person, number, case, agreement) make a grammar question: avoid them.
- "topic" is the closest fit among: ${VOCABULARY_TOPICS.join(', ')}.`,
        calibration: `VOCABULARY CALIBRATION
The tested word or phrase must match the Vocabulary line of ${level} above in frequency, abstraction, collocation and register. The rest of the sentence stays within ${level} and gives enough context for exactly one option to fit.`,
        user: `Write ${VOCABULARY_BATCH_SIZE} ${level} vocabulary questions in "${lang}".`,
      };
    case 'reading':
      return {
        count: READING_BATCH_SIZE,
        rules: `- Every question has its own standalone "readText" passage of 25 to 100 words. Never reuse a passage.
- "topic" is always "${READING_TOPIC}".`,
        calibration: `READING CALIBRATION
Calibrate the passage and the question separately.
- The passage itself must match ${level} in vocabulary, sentence complexity, discourse structure, information density, implicitness and register, independently from the question.
- The question must then test a comprehension skill appropriate to ${level}:
  - A1/A2: find explicitly stated information, identify a simple fact, understand a simple relationship.
  - B1/B2: connect several pieces of information, understand a consequence, identify the main idea, understand a fairly accessible intention.
  - C1/C2: inference, the author's attitude, nuance, implicit intention, complex relationships between ideas, distinctions between close formulations.
- The answer must be determined by the passage alone, never by world knowledge.`,
        user: `Write ${READING_BATCH_SIZE} ${level} reading comprehension questions in "${lang}", each with its own passage.`,
      };
  }
}

/** The format comes from the response schema, so the prompt only carries the content rules. */
export function buildQuestionBatchPrompt(cell: Cell): { system: string; user: string } {
  const { lang, level, category } = cell;
  const { count, rules, calibration, user } = categoryBrief(cell);
  const index = LEVELS.indexOf(level);
  const lower: Level | undefined = LEVELS[index - 1];
  const upper: Level | undefined = LEVELS[index + 1];

  const system = `You are an expert CEFR language exam designer.
Write ${count} multiple-choice placement questions for category "${category}", in language "${lang}", at CEFR level ${level}.

RULES
${rules}
- Each question has ${OPTIONS_PER_ITEM} different options, and "answer" repeats the correct one verbatim. Exactly one option is correct; the other three are plausible but unambiguously wrong (see DISTRACTOR QUALITY).
- Everything (passages, questions, options) is in "${lang}".
- Calibrate every item with the CEFR LEVEL REFERENCE below.${lower ? ` Each item must be clearly harder than typical ${lower} material.` : ''}${upper ? ` No item may require knowledge normally associated with ${upper} or above.` : ''}
- No two questions in the batch may be the same.

${CEFR_LEVEL_REFERENCE}

${calibration}

INTERNAL CALIBRATION CHECK
Before writing each item, silently verify:
1. What linguistic ability is this question testing?
2. Is that ability appropriate for ${level}?
3. Would this question be clearly too easy for ${level}?
4. Would this question require knowledge normally associated with a higher CEFR level?
5. Is the difficulty coming from the intended language skill rather than from obscure vocabulary or unnecessary complexity?
6. Are the distractors appropriate for the same CEFR level?
7. For reading questions, is the passage itself appropriate for ${level}, independently from the question?
8. Is the question testing actual language proficiency rather than trivia or world knowledge?
Revise the item if any answer is unsatisfactory. Never put this check or your reasoning in the reply.`;

  return { system, user };
}
