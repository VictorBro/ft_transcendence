import type { LegalDocument } from './legal';

/**
 * Addresses use the RFC 2606 reserved `.example` TLD on purpose: this is an
 * academic build with no registered domain yet. Swap both before any public
 * deployment, or the contact obligations below cannot be honoured.
 */
export const PRIVACY_CONTACT_EMAIL = 'privacy@ft-transcendence.example';
export const LEGAL_CONTACT_EMAIL = 'legal@ft-transcendence.example';

export const privacyPolicy: LegalDocument = {
  slug: 'privacy',
  title: 'Privacy Policy',
  description:
    'What ft_transcendence collects while you learn a language with it, why we collect it, how long we keep it, and how to get it back or deleted.',
  lastUpdated: '2026-08-01',
  intro:
    'ft_transcendence is an AI-driven language learning platform. Teaching a language well means observing how you use it, so this service processes more about your learning behaviour than a typical website does. This policy explains exactly what that means in practice, written to be read rather than skimmed.',
  sections: [
    {
      id: 'scope',
      heading: '1. Scope',
      paragraphs: [
        'This policy covers the ft_transcendence web application, its API, and the real-time session service that powers live practice between two learners. It applies to everyone who creates an account, and to visitors who only read public pages such as this one.',
        'ft_transcendence is an academic project built by students. It is not a commercial product, it is not backed by a company, and it should not be treated as a system of record for anything you cannot afford to lose. We still hold ourselves to the practices described here.',
      ],
    },
    {
      id: 'data-we-collect',
      heading: '2. Data we collect',
      paragraphs: [
        'Account data: the email address and display name you provide at signup, a password stored only as an Argon2 hash, and, if you enable it, two-factor authentication settings. We never store a password in a form we can read.',
        'Learning data: the target language and proficiency level you select, answers submitted to exercises and assessments, the level our assessment engine infers from those answers, streaks, scores, and progress markers used by the gamification features.',
        'Conversation data: the prompts you send to the AI tutor and the responses it returns. In a language learning context these transcripts are the product, because correction and levelling both depend on your previous attempts, including the mistakes.',
        'Interaction data: friend relationships, presence status, messages sent in chat or during a live session, and results of two-player practice rounds. Anything you send to another learner is visible to that learner.',
        'Technical data: IP address, browser user agent, timestamps, and error traces captured by server logs. These are collected to operate the service and to detect abuse, not to build a profile of you.',
      ],
    },
    {
      id: 'why-we-process',
      heading: '3. Why we process it',
      paragraphs: [
        'We process account data to authenticate you and to keep sessions attached to the right person. We process learning and conversation data to generate exercises at the right difficulty, to score assessments, and to show you your own history. Both are necessary to deliver the service you asked for.',
        'We process technical data on the basis of legitimate interest in keeping the platform available and free of abuse, including rate limiting and blocking automated traffic. We do not use any of this data for advertising, and we do not sell it.',
      ],
    },
    {
      id: 'ai-processing',
      heading: '4. How the AI features use your data',
      paragraphs: [
        'Generating a lesson or grading an answer sends the relevant fragment of your learning history to a large language model. That fragment is the minimum needed for the task: the current exercise, your answer, your level, and recent errors on the same topic. Account identifiers are not included in the prompt.',
        'Retrieval augmented generation searches a curated corpus of learning material, not other user accounts. Your conversations are never retrieved as context for another learner, and they are never added to the shared corpus.',
        'Where a third-party model provider is used, prompts leave our infrastructure and are processed under that provider terms. We select providers that contractually exclude customer prompts from model training. The provider in use at any time is named in the project documentation, and switching providers is treated as a change to this policy.',
        'Automated levelling influences which exercises you see. It has no legal or similarly significant effect, and you can request a human review of any assessment result through the contact address below.',
      ],
    },
    {
      id: 'retention',
      heading: '5. How long we keep data',
      paragraphs: [
        'Account data is kept until you delete the account. Learning progress and assessment results are kept for the life of the account, because removing them would reset the levelling that makes the platform useful.',
        'AI conversation transcripts are kept for twelve months, then deleted automatically. Chat messages sent to other learners are kept for twelve months. Server logs containing IP addresses are kept for thirty days, then rotated out.',
        'Deleting your account removes account data, learning data, and transcripts within thirty days. Messages you sent to another learner remain visible to that learner, detached from your profile, because they are part of a conversation you do not solely own. Backups are purged on their own rolling cycle, which completes within ninety days.',
      ],
    },
    {
      id: 'sharing',
      heading: '6. Who else sees your data',
      paragraphs: [
        'Other learners see your display name, avatar, presence status, and anything you send them. Nothing else on your profile is exposed by default.',
        'Outside the platform, data reaches only the infrastructure and model providers required to run it. We do not share data with advertisers, data brokers, or analytics networks. If we are ever compelled to disclose data by a lawful order, we will notify you unless prohibited from doing so.',
      ],
    },
    {
      id: 'cookies',
      heading: '7. Cookies and local storage',
      paragraphs: [
        'We set one strictly necessary cookie: an httpOnly, secure session cookie that keeps you signed in. It carries no tracking identifier and is not readable by client-side scripts. Local storage holds interface preferences such as language and theme.',
        'There are no advertising or analytics cookies, which is why the platform shows no cookie consent banner: strictly necessary cookies do not require one.',
      ],
    },
    {
      id: 'your-rights',
      heading: '8. Your rights',
      paragraphs: [
        'You can request access to the data we hold about you, correction of anything inaccurate, deletion of your account and its contents, a machine-readable export of your learning history and transcripts, restriction of processing while a dispute is open, and objection to processing based on legitimate interest.',
        'Account settings cover the common cases directly: edit your profile, export your data, and delete your account without contacting anyone. For anything the interface does not cover, write to the contact address below. We answer within thirty days.',
        'If you are in the European Economic Area or the United Kingdom, you also have the right to lodge a complaint with your national supervisory authority. Exercising any of these rights never costs you access to the service.',
      ],
    },
    {
      id: 'security',
      heading: '9. Security',
      paragraphs: [
        'All traffic is served over HTTPS. Passwords are hashed with Argon2. Session cookies are httpOnly, secure, and same-site. The database and cache are not published outside the internal network; only the reverse proxy accepts external connections.',
        'No system is perfect, and this one is maintained by students. If you find a vulnerability, report it to the contact address below rather than disclosing it publicly, and we will fix it before saying anything about it.',
      ],
    },
    {
      id: 'children',
      heading: '10. Age requirement',
      paragraphs: [
        'You must be at least sixteen years old to create an account. We do not knowingly collect data from children below that age. If we learn that we have, the account and its data are deleted.',
      ],
    },
    {
      id: 'changes',
      heading: '11. Changes to this policy',
      paragraphs: [
        'When this policy changes materially, for example when a new category of data is collected or a new model provider is introduced, we update the date at the top of this page and notify account holders by email before the change takes effect.',
      ],
    },
    {
      id: 'contact',
      heading: '12. Contact',
      paragraphs: [
        `Privacy questions and rights requests: ${PRIVACY_CONTACT_EMAIL}. Security reports go to the same address with SECURITY in the subject line.`,
        'ft_transcendence is an academic project, so there is no separate legal entity behind it and no appointed data protection officer. Requests reach the maintaining team directly.',
      ],
    },
  ],
};

export const termsOfService: LegalDocument = {
  slug: 'terms',
  title: 'Terms of Service',
  description:
    'The rules for using ft_transcendence: who may sign up, what counts as acceptable use, what AI-generated lessons are and are not, and how accounts end.',
  lastUpdated: '2026-08-01',
  intro:
    'These terms are the agreement between you and the ft_transcendence maintainers. They are short because the service is small, and specific because an AI tutor and live sessions between strangers both create situations that generic terms do not cover.',
  sections: [
    {
      id: 'acceptance',
      heading: '1. Acceptance',
      paragraphs: [
        'Creating an account means you accept these terms and the Privacy Policy. If you do not accept them, do not create an account. Continuing to use the platform after a change to these terms means you accept the updated version.',
      ],
    },
    {
      id: 'eligibility',
      heading: '2. Eligibility and accounts',
      paragraphs: [
        'You must be at least sixteen years old. One person, one account. You are responsible for keeping your credentials safe and for everything done through your account, so enable two-factor authentication if the account matters to you.',
        'Provide accurate signup details. Impersonating another person, whether a learner, a maintainer, or a member of teaching staff, is grounds for immediate removal.',
      ],
    },
    {
      id: 'acceptable-use',
      heading: '3. Acceptable use',
      paragraphs: [
        'Use ft_transcendence to learn a language and to help others learn one. That is the whole intended scope.',
        'You may not harass, threaten, or abuse other learners; post sexual content involving minors or any other unlawful material; use the AI tutor to generate hate speech, malware, or content designed to deceive people; scrape the platform or automate accounts; attempt to bypass rate limits, token budgets, or authentication; probe the infrastructure for weaknesses outside a good-faith security report; or resell access to the service.',
        'Rate limits and per-user token budgets protect a shared and genuinely limited resource. Circumventing them takes capacity from other learners and is treated as abuse rather than as a technical curiosity.',
      ],
    },
    {
      id: 'ai-content',
      heading: '4. AI-generated content',
      paragraphs: [
        'Lessons, corrections, translations, and assessment results are produced by a large language model. Language models are confidently wrong on a regular basis. Treat everything the tutor produces as practice material from a fallible partner, not as authoritative instruction.',
        'Assessment results estimate your proficiency for the purpose of choosing your next exercise. They are not a certification, they map only loosely onto formal frameworks such as CEFR, and they carry no academic or professional weight. Do not present them as a qualification.',
        'Never rely on the tutor for medical, legal, financial, or safety-critical translation. If a mistranslation could hurt someone, use a qualified human translator.',
      ],
    },
    {
      id: 'user-content',
      heading: '5. Your content',
      paragraphs: [
        'You keep ownership of everything you write: exercise answers, chat messages, profile text. You grant us a non-exclusive licence to store, process, and display that content strictly to operate the service for you and for the learners you send it to. The licence ends when the content is deleted.',
        'We do not train models on your content and we do not add it to the shared learning corpus. Do not post content you do not have the right to share, and do not paste secrets, credentials, or personal data belonging to other people into the tutor.',
      ],
    },
    {
      id: 'live-sessions',
      heading: '6. Live sessions and community conduct',
      paragraphs: [
        'Live practice pairs you with another learner in real time. Speak to them the way you would want to be spoken to while making mistakes in a language you do not yet control, because that is exactly what they are doing.',
        'Leaving a session repeatedly, deliberately stalling a timed round, or using an automated helper to win a duel spoils the session for the other player and may cost you access to multiplayer features. Report behaviour that crosses a line rather than retaliating.',
      ],
    },
    {
      id: 'availability',
      heading: '7. Availability and changes',
      paragraphs: [
        'The service is provided as it is, with no uptime guarantee. It runs on student-managed infrastructure and may be taken down for maintenance, redeployed, reset, or discontinued. Export anything you want to keep.',
        'Features may change or be removed. When a change removes something you depend on, we will say so on this page and, where accounts are affected, by email.',
      ],
    },
    {
      id: 'termination',
      heading: '8. Suspension and termination',
      paragraphs: [
        'You can delete your account at any time from account settings; deletion follows the retention schedule in the Privacy Policy.',
        'We may suspend or terminate an account that breaks these terms. For anything other than serious abuse we will warn you first and give you a chance to explain. For serious abuse, including harassment, unlawful content, or attacks on the infrastructure, removal is immediate and permanent.',
        'If your account is terminated you may still request an export of your data under the Privacy Policy, unless doing so would expose another learner.',
      ],
    },
    {
      id: 'disclaimer',
      heading: '9. Disclaimers and liability',
      paragraphs: [
        'The service is provided without warranty of any kind, express or implied, including fitness for a particular purpose and accuracy of AI output. To the maximum extent permitted by law, the maintainers are not liable for indirect or consequential loss, lost data, or any decision you make on the basis of AI-generated content.',
        'Nothing in these terms limits liability that cannot be limited by law, including liability for death or personal injury caused by negligence, or for fraud.',
      ],
    },
    {
      id: 'governing-law',
      heading: '10. Governing law',
      paragraphs: [
        'These terms are governed by French law, and the courts of France have jurisdiction over any dispute. If you are a consumer resident elsewhere in the European Union, this does not deprive you of the protection of the mandatory rules of your own country.',
        'If any provision of these terms is found unenforceable, the rest stays in force.',
      ],
    },
    {
      id: 'contact',
      heading: '11. Contact',
      paragraphs: [
        `Questions about these terms, reports of abuse, and appeals against a suspension: ${LEGAL_CONTACT_EMAIL}. Privacy requests are handled separately at the address given in the Privacy Policy.`,
      ],
    },
  ],
};

export const legalDocuments: LegalDocument[] = [privacyPolicy, termsOfService];
