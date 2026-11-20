import { LEGAL_CONTACT_EMAIL, PRIVACY_CONTACT_EMAIL, type LegalDocument } from '../legal';

export const privacyPolicy: LegalDocument = {
  slug: 'privacy',
  title: 'Privacy Policy',
  description:
    'What ft_transcendence collects while you learn a language with it, why we collect it, what reaches Google Gemini, how long we keep it, and how to get it back or deleted.',
  lastUpdated: '2026-11-20',
  intro:
    'ft_transcendence is a language learning platform with an AI tutor. Teaching a language means keeping your answers, your level and your progress, and the tutor sends some of that to Google. This policy explains exactly what that means in practice, written to be read rather than skimmed.',
  sections: [
    {
      id: 'scope',
      heading: '1. Scope',
      paragraphs: [
        'This policy covers the ft_transcendence web application, its API, and the real-time connection that carries messages between friends and shows who is online. It applies to everyone who creates an account, and to visitors who only read public pages such as this one.',
        'ft_transcendence is an academic project built by students. It is not a commercial product, it is not backed by a company, and it should not be treated as a system of record for anything you cannot afford to lose. We still hold ourselves to the practices described here.',
      ],
    },
    {
      id: 'data-we-collect',
      heading: '2. Data we collect',
      paragraphs: [
        'Account data: the email address and display name you provide at signup, a password stored only as an Argon2 hash, the profile picture you upload if you choose one, your interface language, the time zone your browser reports (used to tell where your day starts for streaks and daily goals), and, if you enable it, two-factor authentication settings. We never store a password in a form we can read.',
        'Learning data: the languages you learn, the level the placement test sets from your answers or the level you choose instead, the placement questions you have already seen so they are not asked again, your daily goal, the answers you submit in lessons and exams with their scores, and the streaks, experience points, challenges and achievements of the gamification features.',
        'Tutor data: what you write to the tutor of a lesson discussion and what it answers. It is not stored on our servers: section 4 says where it goes and section 5 how long it lives.',
        'Interaction data: friend relationships, whether you are online right now (the number of app tabs you have open, with no history), the day you last opened the app while signed in (the day only, not the time, and only the latest), and the messages you send to your friends, each stored with when it was read (which the sender is never shown). Anything you send to another learner is visible to that learner.',
        'Technical data: the reverse proxy logs each request with its IP address, browser user agent, address and time, and the API logs error traces. Rate limiting counts requests per account or per IP address in memory only. Monitoring keeps aggregate figures, such as request rates and how many accounts exist, that identify no one. All of it serves to operate the service and to detect abuse, not to build a profile of you.',
      ],
    },
    {
      id: 'why-we-process',
      heading: '3. Why we process it',
      paragraphs: [
        'We process account data to authenticate you and to keep sessions attached to the right person. We process learning data to place you at the right level, to choose and score your lessons and exams, and to show you your own progress, and tutor data to answer your questions about a lesson. All of it is necessary to deliver the service you asked for.',
        'We process technical data on the basis of legitimate interest in keeping the platform available and free of abuse, which includes rate limiting. We do not use any of this data for advertising, and we do not sell it.',
      ],
    },
    {
      id: 'ai-processing',
      heading: '4. How the AI features use your data',
      paragraphs: [
        'Before each exam, the tutor of a lesson discussion runs on Google Gemini. Each message you send it goes to Google with the text of the lesson, the language and level of the lesson, your interface language, your wrong answers in its practice exercises (the exercise, what you answered and the right answer), and the earlier messages of the same discussion, but none of your account identifiers: no email address, display name or account number.',
        'This project uses the free tier of the Gemini API, and no provider that excludes training. On the free tier, Google may use these messages and the answers to improve its products, including its models, and people at Google may read them. Do not write anything personal to the tutor. Moving to a paid tier or to another provider is a change to this policy, made here before it takes effect.',
        'Gemini also writes some of the placement test questions. Those requests carry only a language, a level and a kind of question, never anything about you. Everything else runs on our own rules, with no language model involved: scoring your answers, setting your level, and choosing your lessons. The lessons themselves were written ahead of time and checked before publication.',
        'Placement sets the level at which lessons are offered to you. It has no legal or similarly significant effect: you can set your level yourself on the course page at any time, take the test again, and request a human review of any result through the contact address below.',
      ],
    },
    {
      id: 'retention',
      heading: '5. How long we keep data',
      paragraphs: [
        'Account data is kept until the account is deleted. Learning progress and results are kept for the life of the account, because removing them would reset the level and progress that make the platform useful. A friendship or friend request is kept until either of you removes, declines or cancels it, or the account is deleted. Messages are kept while both accounts in the conversation exist: removing a friend keeps the conversation readable by both of you, and deleting either account deletes it. A replaced or removed profile picture is deleted at once.',
        'Tutor discussions are never stored on our servers: your browser keeps the discussion until you leave the page, and the servers keep neither your messages nor the answers, only a count of the messages you sent in the last minute and the last day, for the limits. What Google keeps is set by its Gemini API terms. A sign-in session ends after seven days without use. What you typed in a lesson page but have not submitted yet stays in your browser until the lesson is finished or started again.',
        'Server logs that contain IP addresses are capped in size and rotated out, oldest first, and are never archived. Aggregate monitoring figures are kept for fifteen days. When an account is deleted, its account data, learning data and conversations with other learners are deleted with it. There are no backups.',
      ],
    },
    {
      id: 'sharing',
      heading: '6. Who else sees your data',
      paragraphs: [
        'Other learners see your display name, profile picture, and anything you send them. Only friends can message each other, and a conversation is visible to no one but the two people in it. Only your friends see whether you are online right now, as a dot by your name: a learner who has only sent you a request does not, and no one sees when you were last online. Any signed-in learner can open your profile, which shows the languages you learn, your level in each and your current streak. They can also find you by your display name or among the recently active learners, and send you a friend request. You are among the recently active from the day you open the app while signed in until a week after that day. The list is sorted by display name and shows no date, but someone watching it can tell when you come back after more than a week away. Your friends list is shown only to you. Your email address, time zone, interface language and two-factor settings are never shown to other learners. Your profile picture is served from an address no one can guess, but anyone who has that address can load the picture.',
        'Outside the platform, data reaches only the server that hosts it and Google, for the tutor described in section 4. We do not share data with advertisers, data brokers, or analytics networks. If we are ever compelled to disclose data by a lawful order, we will notify you unless prohibited from doing so.',
      ],
    },
    {
      id: 'cookies',
      heading: '7. Cookies and browser storage',
      paragraphs: [
        'We set three strictly necessary cookies. A session cookie (ft.sid) keeps you signed in: it is httpOnly, secure, same-site, and carries only a random session number, so client-side scripts cannot read it and it tracks nothing. A language cookie (NEXT_LOCALE) remembers which of the three languages to show you; it holds only a language code, which is also visible in the address bar. A course cookie (ft.lang) remembers which course you last opened, so we can take you back to it; it holds only a language code and is httpOnly.',
        "The browser's local storage keeps what you typed or picked on the lesson page you are on, so a reload does not lose it, and the lines of an exam dialogue already shown. It stays on your device, is never sent anywhere until you submit the answer, and is cleared when the lesson is finished or started again.",
        'There are no advertising or analytics cookies, which is why the platform shows no cookie consent banner: strictly necessary cookies and storage do not require one.',
      ],
    },
    {
      id: 'your-rights',
      heading: '8. Your rights',
      paragraphs: [
        'You can request access to the data we hold about you, correction of anything inaccurate, deletion of your account and its contents, a machine-readable export of your learning history, restriction of processing while a dispute is open, and objection to processing based on legitimate interest.',
        'Your profile page lets you change your display name and profile picture, and the course page lets you change your level. Account deletion and data export have no button yet: write to the contact address below and we do it for you. We answer within thirty days.',
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
        'When this policy changes materially, for example when a new category of data is collected or the model provider or its tier changes, we change this page before the change takes effect and update the date at the top. The platform sends no email, so this page is where changes are announced. A change that needs your consent is not applied to your data until you give it.',
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
    'The rules for using ft_transcendence: who may sign up, what counts as acceptable use, what the AI tutor is and is not, and how accounts end.',
  lastUpdated: '2026-11-20',
  intro:
    'These terms are the agreement between you and the ft_transcendence maintainers. They are short because the service is small, and specific because an AI tutor and messages between learners both create situations that generic terms do not cover.',
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
        'You may not harass, threaten, or abuse other learners; post sexual content involving minors or any other unlawful material; use the AI tutor to generate hate speech, malware, or content designed to deceive people; scrape the platform or automate accounts; attempt to bypass rate limits, the tutor message limits, or authentication; probe the infrastructure for weaknesses outside a good-faith security report; or resell access to the service.',
        "Rate limits and the tutor message limits protect a shared and genuinely limited resource: every learner's tutor runs on one Gemini key with a small quota. Circumventing them takes capacity from other learners and is treated as abuse rather than as a technical curiosity.",
      ],
    },
    {
      id: 'ai-content',
      heading: '4. AI-generated content',
      paragraphs: [
        'The tutor of a lesson discussion answers with a large language model, Google Gemini, and the same model wrote some of the placement test questions. The lessons were drafted with the help of a language model and checked before publication; scores and levels come from fixed rules, not from a model. Language models are confidently wrong on a regular basis. Treat everything the tutor produces as practice material from a fallible partner, not as authoritative instruction.',
        'Placement and exam results estimate your proficiency for the purpose of choosing your next lessons. They are not a certification, they map only loosely onto formal frameworks such as CEFR, and they carry no academic or professional weight. Do not present them as a qualification.',
        'Never rely on the tutor for medical, legal, financial, or safety-critical translation. If a mistranslation could hurt someone, use a qualified human translator.',
      ],
    },
    {
      id: 'user-content',
      heading: '5. Your content',
      paragraphs: [
        'You keep ownership of everything you write or upload: exercise answers, messages to your friends and to the tutor, your display name and profile picture. You grant us a non-exclusive licence to store, process, and display that content strictly to operate the service for you and for the learners you send it to. The licence ends when the content is deleted.',
        "We do not train models on your content ourselves. What you write to the tutor goes to Google on the free tier of the Gemini API, where Google may use it to improve its models and people at Google may read it, as the Privacy Policy explains. Do not post content you do not have the right to share, and do not paste secrets, credentials, or personal data, yours or anyone else's, into the tutor.",
      ],
    },
    {
      id: 'community',
      heading: '6. Friends and messages',
      paragraphs: [
        'Any signed-in learner can find you and send you a friend request, and friends can message each other. Speak to them the way you would want to be spoken to while making mistakes in a language you do not yet control, because that is exactly what they are doing.',
        'Unwanted requests, spam, and messages that harass, threaten or deceive spoil the platform for others and may cost you your account. Remove a friend who crosses a line, and report the behaviour to the contact address below rather than retaliating.',
      ],
    },
    {
      id: 'availability',
      heading: '7. Availability and changes',
      paragraphs: [
        'The service is provided as it is, with no uptime guarantee. It runs on student-managed infrastructure, has no backups, and may be taken down for maintenance, redeployed, reset, or discontinued. Keep a copy of anything you cannot afford to lose, or ask for an export under the Privacy Policy.',
        'Features may change or be removed. When a change removes something you depend on, we will say so on this page before it happens; the platform sends no email.',
      ],
    },
    {
      id: 'termination',
      heading: '8. Suspension and termination',
      paragraphs: [
        'You can have your account deleted at any time by writing to the privacy contact address; deletion follows the retention rules in the Privacy Policy.',
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
