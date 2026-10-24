import type { LocalizedText } from '../schemas/artifactCommon';

/**
 * The fixed texts of the lessons, in en, fr and de: the name of each step
 * ("Flashcards") and the instruction at the top of its pages ("Match each
 * word with its translation."). They are the same in every lesson of a
 * kind, so nobody writes them per lesson: the code puts them in.
 *
 * Most entries are a pair [step label, page instruction]:
 *
 *   COPY.matching[0] → { en: 'Matching', fr: 'Association', de: 'Zuordnen' }
 *   COPY.matching[1] → { en: 'Match each word with its translation.', … }
 *
 * Only COPY is read here, by vocabularyLesson.ts. The others are for the
 * authoring kit (#83), which builds the steps of grammar, functions and
 * reading lessons. Some texts say "French": #136 makes them name the
 * course language.
 */

/** A shortcut to write { en, fr, de } on one line. */
const L = (en: string, fr: string, de: string): LocalizedText => ({ en, fr, de });

/** Vocabulary lessons, plus the explanation, feedback and exam steps of grammar lessons. */
export const COPY = {
  introduction: [
    L('Introduction', 'Introduction', 'Einführung'),
    L(
      'Read the introduction and listen to the new words.',
      'Lisez l’introduction et écoutez les nouveaux mots.',
      'Lies die Einführung und hör dir die neuen Wörter an.',
    ),
  ],
  flashcards: [
    L('Flashcards', 'Cartes mémoire', 'Karteikarten'),
    L(
      'Recall each word, then turn the card to check it.',
      'Rappelez-vous chaque mot, puis retournez la carte pour vérifier.',
      'Erinnere dich an jedes Wort und dreh dann die Karte um.',
    ),
  ],
  matching: [
    L('Matching', 'Association', 'Zuordnen'),
    L(
      'Match each word with its translation.',
      'Associez chaque mot à sa traduction.',
      'Ordne jedem Wort seine Übersetzung zu.',
    ),
  ],
  gender: [
    L('Gender', 'Genre', 'Genus'),
    L(
      'Choose the gender of each noun.',
      'Choisissez le genre de chaque nom.',
      'Wähle das Genus jedes Nomens.',
    ),
  ],
  practice: [
    L('Practice', 'Entraînement', 'Übung'),
    L(
      'Choose the right word and type it.',
      'Choisissez le bon mot et écrivez-le.',
      'Wähle das richtige Wort und schreibe es.',
    ),
  ],
  listening: [
    L('Listening', 'Écoute', 'Hören'),
    L(
      'Listen and choose the word you hear.',
      'Écoutez et choisissez le mot entendu.',
      'Hör zu und wähle das Wort, das du hörst.',
    ),
  ],
  exam: [
    L('Final exam', 'Examen final', 'Abschlussprüfung'),
    L(
      'Translate each word into French, with its article for nouns.',
      'Traduisez chaque mot en français, avec l’article pour les noms.',
      'Übersetze jedes Wort ins Französische, bei Nomen mit Artikel.',
    ),
  ],
  dictation: [
    L('Dictation', 'Dictée', 'Diktat'),
    L(
      'Listen and write the word, with its article for nouns.',
      'Écoutez et écrivez le mot, avec l’article pour les noms.',
      'Hör zu und schreib das Wort, bei Nomen mit Artikel.',
    ),
  ],
  explanation: [
    L('Explanation', 'Explication', 'Erklärung'),
    L(
      'Read the explanation and the examples.',
      'Lisez l’explication et les exemples.',
      'Lies die Erklärung und die Beispiele.',
    ),
  ],
  feedback: [
    L('Your feedback', 'Votre retour', 'Dein Feedback'),
    L('Continue to the final exam.', 'Passez à l’examen final.', 'Weiter zur Abschlussprüfung.'),
  ],
  grammarExam: [
    L('Final exam', 'Examen final', 'Abschlussprüfung'),
    L(
      'Answer every item before the time runs out.',
      'Répondez à chaque question avant la fin du temps imparti.',
      'Beantworte jede Aufgabe, bevor die Zeit abläuft.',
    ),
  ],
} as const;

/** The page instruction of each grammar exercise type (one text, no step label). */
export const EXERCISE_INSTRUCTIONS = {
  grammar_person_matching: L(
    'Connect each pronoun with its partner.',
    'Reliez chaque pronom à son partenaire.',
    'Verbinde jedes Pronomen mit seinem Partner.',
  ),
  grammar_pronoun_form_match: L(
    'Choose the form for each pronoun.',
    'Choisissez la forme pour chaque pronom.',
    'Wähle die Form für jedes Pronomen.',
  ),
  grammar_pronoun_form_typing: L(
    'Type the form for each pronoun.',
    'Écrivez la forme pour chaque pronom.',
    'Schreib die Form zu jedem Pronomen.',
  ),
  grammar_gap_choice: L(
    'Choose the word that completes the sentence.',
    'Choisissez le mot qui complète la phrase.',
    'Wähle das Wort, das den Satz ergänzt.',
  ),
  grammar_gap_typing: L(
    'Type the missing words.',
    'Écrivez les mots manquants.',
    'Schreib die fehlenden Wörter.',
  ),
  grammar_word_order: L(
    'Put the words in the right order.',
    'Mettez les mots dans le bon ordre.',
    'Bring die Wörter in die richtige Reihenfolge.',
  ),
  grammar_error_spotter: L(
    'Find the wrong word and correct it.',
    'Trouvez le mot faux et corrigez-le.',
    'Finde das falsche Wort und korrigiere es.',
  ),
} as const;

/**
 * Functions lessons. The entries that are a single text (wordCards,
 * wordMatching, examWords, examDialogue) are page instructions for the
 * pages about words, or for the exam's other pages.
 */
export const FUNCTIONS_COPY = {
  flashcards: [
    L('Flashcards', 'Cartes mémoire', 'Karteikarten'),
    L(
      'Recall each expression, then turn the card to check it.',
      'Rappelez-vous chaque expression, puis retournez la carte pour vérifier.',
      'Erinnere dich an jeden Ausdruck und dreh dann die Karte um.',
    ),
  ],
  wordCards: L(
    'Recall each word, then turn the card to check it.',
    'Rappelez-vous chaque mot, puis retournez la carte pour vérifier.',
    'Erinnere dich an jedes Wort und dreh dann die Karte um.',
  ),
  dialogue: [
    L('Dialogue', 'Dialogue', 'Dialog'),
    L(
      'Read and listen. Turn a line to see its translation and a note.',
      'Lisez et écoutez. Retournez une réplique pour voir sa traduction et une remarque.',
      'Lies und hör zu. Dreh eine Zeile um, um Übersetzung und Hinweis zu sehen.',
    ),
  ],
  matching: [
    L('Matching', 'Association', 'Zuordnen'),
    L(
      'Match each expression with its translation.',
      'Associez chaque expression à sa traduction.',
      'Ordne jedem Ausdruck seine Übersetzung zu.',
    ),
  ],
  wordMatching: L(
    'Match each word with its translation.',
    'Associez chaque mot à sa traduction.',
    'Ordne jedem Wort seine Übersetzung zu.',
  ),
  gender: [
    L('Gender', 'Genre', 'Genus'),
    L(
      'Choose the gender of each noun.',
      'Choisissez le genre de chaque nom.',
      'Wähle das Genus jedes Nomens.',
    ),
  ],
  wordOrder: [
    L('Word order', 'Ordre des mots', 'Wortstellung'),
    L(
      'Put the words in order.',
      'Mettez les mots dans l’ordre.',
      'Bring die Wörter in die richtige Reihenfolge.',
    ),
  ],
  dialogueGaps: [
    L('Dialogue gaps', 'Dialogue à trous', 'Dialoglücken'),
    L(
      'Choose the expression that fits the gap.',
      'Choisissez l’expression qui complète la réplique.',
      'Wähle den Ausdruck, der in die Lücke passt.',
    ),
  ],
  exam: [
    L('Final exam', 'Examen final', 'Abschlussprüfung'),
    L(
      'Build the answer. Not every word fits.',
      'Construisez la réponse. Tous les mots ne servent pas.',
      'Bilde die Antwort. Nicht jedes Wort passt.',
    ),
  ],
  listening: [
    L('Listening', 'Écoute', 'Hören'),
    L(
      'Listen, then choose the reply that fits.',
      'Écoutez, puis choisissez la réponse qui convient.',
      'Hör zu und wähle dann die passende Antwort.',
    ),
  ],
  examWords: L(
    'Translate each word into French, with its article for nouns.',
    'Traduisez chaque mot en français, avec l’article pour les noms.',
    'Übersetze jedes Wort ins Französische, bei Nomen mit Artikel.',
  ),
  examDialogue: L(
    'Fill each gap with an expression from this lesson.',
    'Complétez chaque trou avec une expression de la leçon.',
    'Fülle jede Lücke mit einem Ausdruck aus dieser Lektion.',
  ),
} as const;

/** Reading lessons: one pair per step of READING_STAGES. */
export const READING_COPY = {
  flashcards: [
    L('Flashcards', 'Cartes mémoire', 'Karteikarten'),
    L(
      'Turn each card to learn the key words of the text.',
      'Retournez chaque carte pour découvrir les mots clés du texte.',
      'Dreh jede Karte um und lerne die Schlüsselwörter des Textes.',
    ),
  ],
  matching: [
    L('Matching', 'Association', 'Zuordnen'),
    L(
      'Match each key word with its meaning.',
      'Associez chaque mot clé à son sens.',
      'Ordne jedem Schlüsselwort seine Bedeutung zu.',
    ),
  ],
  skim: [
    L('Skim', 'Survol', 'Überfliegen'),
    L(
      'Look over the document quickly. When the time is up it is put away; then answer the question.',
      'Parcourez rapidement le document. À la fin du temps, il disparaît ; répondez ensuite à la question.',
      'Überfliege das Dokument. Wenn die Zeit um ist, verschwindet es; beantworte dann die Frage.',
    ),
  ],
  detail: [
    L('Detail', 'Détails', 'Details'),
    L(
      'Read the document carefully and answer the questions.',
      'Lisez le document attentivement et répondez aux questions.',
      'Lies das Dokument genau und beantworte die Fragen.',
    ),
  ],
  structure: [
    L('Structure', 'Structure', 'Aufbau'),
    L(
      'Put the information in the order the text gives it.',
      'Remettez les informations dans l’ordre du texte.',
      'Bring die Informationen in die Reihenfolge des Textes.',
    ),
  ],
  exam: [
    L('Final exam', 'Examen final', 'Abschlussprüfung'),
    L(
      'Read the new document and answer the questions. No help this time.',
      'Lisez le nouveau document et répondez aux questions. Cette fois, sans aide.',
      'Lies das neue Dokument und beantworte die Fragen. Diesmal ohne Hilfe.',
    ),
  ],
} as const;
