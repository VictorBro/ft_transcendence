import { LEGAL_CONTACT_EMAIL, PRIVACY_CONTACT_EMAIL, type LegalDocument } from '../legal';

export const privacyPolicy: LegalDocument = {
  slug: 'privacy',
  title: 'Politique de confidentialité',
  description:
    'Ce que ft_transcendence collecte pendant que vous apprenez une langue avec la plateforme, pourquoi nous le collectons, combien de temps nous le conservons, et comment le récupérer ou le faire supprimer.',
  lastUpdated: '2026-08-01',
  intro:
    "ft_transcendence est une plateforme d'apprentissage des langues pilotée par IA. Bien enseigner une langue implique d'observer comment vous l'utilisez, ce service traite donc davantage d'informations sur votre comportement d'apprentissage qu'un site web classique. Cette politique explique précisément ce que cela signifie en pratique, écrite pour être lue plutôt que survolée.",
  sections: [
    {
      id: 'scope',
      heading: "1. Champ d'application",
      paragraphs: [
        "Cette politique couvre l'application web ft_transcendence, son API, et le service de session en temps réel qui alimente la pratique en direct entre deux apprenants. Elle s'applique à toute personne créant un compte, ainsi qu'aux visiteurs qui ne font que lire des pages publiques comme celle-ci.",
        "ft_transcendence est un projet académique réalisé par des étudiants. Ce n'est pas un produit commercial, il n'est adossé à aucune société, et ne doit pas être considéré comme un système d'enregistrement pour quoi que ce soit que vous ne pourriez pas vous permettre de perdre. Nous nous engageons malgré tout à respecter les pratiques décrites ici.",
      ],
    },
    {
      id: 'data-we-collect',
      heading: '2. Données que nous collectons',
      paragraphs: [
        "Données de compte : l'adresse e-mail et le nom d'affichage que vous fournissez à l'inscription, un mot de passe stocké uniquement sous forme de hash Argon2, et, si vous l'activez, vos paramètres d'authentification à deux facteurs. Nous ne stockons jamais un mot de passe sous une forme lisible.",
        "Données d'apprentissage : la langue cible et le niveau de compétence que vous choisissez, les réponses soumises aux exercices et évaluations, le niveau que notre moteur d'évaluation en déduit, les séries de réussites, les scores, et les indicateurs de progression utilisés par les fonctionnalités de gamification.",
        "Données de conversation : les invites que vous envoyez au tuteur IA et les réponses qu'il retourne. Dans un contexte d'apprentissage des langues, ces échanges sont le produit lui-même, car la correction et l'évaluation du niveau dépendent toutes deux de vos tentatives précédentes, erreurs comprises.",
        "Données d'interaction : relations d'amitié, statut de présence, messages envoyés en chat ou pendant une session en direct, et résultats des manches de pratique à deux joueurs. Tout ce que vous envoyez à un autre apprenant lui est visible.",
        "Données techniques : adresse IP, user agent du navigateur, horodatages, et traces d'erreurs capturées par les journaux serveur. Elles sont collectées pour faire fonctionner le service et détecter les abus, pas pour construire un profil vous concernant.",
      ],
    },
    {
      id: 'why-we-process',
      heading: '3. Pourquoi nous les traitons',
      paragraphs: [
        "Nous traitons les données de compte pour vous authentifier et rattacher les sessions à la bonne personne. Nous traitons les données d'apprentissage et de conversation pour générer des exercices au bon niveau de difficulté, noter les évaluations, et vous montrer votre propre historique. Les deux sont nécessaires pour fournir le service que vous avez demandé.",
        "Nous traitons les données techniques sur la base de l'intérêt légitime à maintenir la plateforme disponible et exempte d'abus, y compris la limitation de débit et le blocage du trafic automatisé. Nous n'utilisons aucune de ces données à des fins publicitaires, et nous ne les vendons pas.",
      ],
    },
    {
      id: 'ai-processing',
      heading: '4. Comment les fonctionnalités IA utilisent vos données',
      paragraphs: [
        "Générer une leçon ou noter une réponse envoie le fragment pertinent de votre historique d'apprentissage à un grand modèle de langage. Ce fragment est le minimum nécessaire à la tâche : l'exercice en cours, votre réponse, votre niveau, et les erreurs récentes sur le même sujet. Les identifiants de compte ne sont pas inclus dans l'invite.",
        'La génération augmentée par récupération interroge un corpus de matériel pédagogique sélectionné, pas les autres comptes utilisateurs. Vos conversations ne sont jamais récupérées comme contexte pour un autre apprenant, et elles ne sont jamais ajoutées au corpus partagé.',
        "Lorsqu'un fournisseur de modèle tiers est utilisé, les invites quittent notre infrastructure et sont traitées selon les conditions de ce fournisseur. Nous sélectionnons des fournisseurs qui excluent contractuellement les invites des utilisateurs de l'entraînement de leurs modèles. Le fournisseur utilisé à un instant donné est nommé dans la documentation du projet, et un changement de fournisseur est traité comme une modification de cette politique.",
        "L'évaluation automatisée du niveau influence les exercices qui vous sont présentés. Elle n'a aucun effet juridique ni effet similaire significatif, et vous pouvez demander une révision humaine de tout résultat d'évaluation via l'adresse de contact ci-dessous.",
      ],
    },
    {
      id: 'retention',
      heading: '5. Durée de conservation des données',
      paragraphs: [
        "Les données de compte sont conservées jusqu'à la suppression du compte. La progression d'apprentissage et les résultats d'évaluation sont conservés pendant toute la durée de vie du compte, car les supprimer réinitialiserait l'évaluation de niveau qui rend la plateforme utile.",
        "Les transcriptions des conversations IA sont conservées douze mois, puis supprimées automatiquement. Les messages de chat envoyés à d'autres apprenants sont conservés douze mois. Les journaux serveur contenant des adresses IP sont conservés trente jours, puis purgés.",
        "Supprimer votre compte retire les données de compte, les données d'apprentissage et les transcriptions sous trente jours. Les messages que vous avez envoyés à un autre apprenant restent visibles par cet apprenant, détachés de votre profil, car ils font partie d'une conversation que vous ne possédez pas seul. Les sauvegardes sont purgées selon leur propre cycle glissant, qui se termine sous quatre-vingt-dix jours.",
      ],
    },
    {
      id: 'sharing',
      heading: "6. Qui d'autre voit vos données",
      paragraphs: [
        "Les autres apprenants voient votre nom d'affichage, votre avatar, votre statut de présence, et tout ce que vous leur envoyez. Rien d'autre sur votre profil n'est exposé par défaut.",
        "En dehors de la plateforme, les données n'atteignent que l'infrastructure et les fournisseurs de modèles nécessaires à son fonctionnement. Nous ne partageons pas de données avec des annonceurs, des courtiers en données, ou des réseaux d'analyse. Si nous sommes un jour contraints de divulguer des données par une décision de justice, nous vous en informerons sauf interdiction de le faire.",
      ],
    },
    {
      id: 'cookies',
      heading: '7. Cookies et stockage local',
      paragraphs: [
        "Nous posons un seul cookie strictement nécessaire : un cookie de session httpOnly et sécurisé qui vous maintient connecté. Il ne porte aucun identifiant de suivi et n'est pas lisible par des scripts côté client. Le stockage local contient des préférences d'interface telles que la langue et le thème.",
        "Il n'y a pas de cookies publicitaires ou d'analyse, c'est pourquoi la plateforme n'affiche aucune bannière de consentement aux cookies : les cookies strictement nécessaires n'en requièrent pas.",
      ],
    },
    {
      id: 'your-rights',
      heading: '8. Vos droits',
      paragraphs: [
        "Vous pouvez demander l'accès aux données que nous détenons à votre sujet, la correction de toute inexactitude, la suppression de votre compte et de son contenu, un export lisible par machine de votre historique d'apprentissage et de vos transcriptions, la limitation du traitement pendant qu'un litige est en cours, et vous opposer à un traitement fondé sur l'intérêt légitime.",
        "Les paramètres du compte couvrent directement les cas courants : modifier votre profil, exporter vos données, et supprimer votre compte sans contacter personne. Pour tout ce que l'interface ne couvre pas, écrivez à l'adresse de contact ci-dessous. Nous répondons sous trente jours.",
        "Si vous résidez dans l'Espace économique européen ou au Royaume-Uni, vous avez également le droit de déposer une plainte auprès de votre autorité de contrôle nationale. Exercer l'un de ces droits ne vous coûte jamais l'accès au service.",
      ],
    },
    {
      id: 'security',
      heading: '9. Sécurité',
      paragraphs: [
        'Tout le trafic est servi via HTTPS. Les mots de passe sont hashés avec Argon2. Les cookies de session sont httpOnly, sécurisés, et same-site. La base de données et le cache ne sont pas exposés en dehors du réseau interne ; seul le reverse proxy accepte les connexions externes.',
        "Aucun système n'est parfait, et celui-ci est maintenu par des étudiants. Si vous découvrez une vulnérabilité, signalez-la à l'adresse de contact ci-dessous plutôt que de la divulguer publiquement, et nous la corrigerons avant d'en dire quoi que ce soit.",
      ],
    },
    {
      id: 'children',
      heading: '10. Âge minimum',
      paragraphs: [
        "Vous devez avoir au moins seize ans pour créer un compte. Nous ne collectons pas sciemment de données auprès d'enfants en dessous de cet âge. Si nous apprenons que c'est le cas, le compte et ses données sont supprimés.",
      ],
    },
    {
      id: 'changes',
      heading: '11. Modifications de cette politique',
      paragraphs: [
        "Lorsque cette politique change de manière substantielle, par exemple lorsqu'une nouvelle catégorie de données est collectée ou qu'un nouveau fournisseur de modèle est introduit, nous mettons à jour la date en haut de cette page et informons les titulaires de compte par e-mail avant que le changement ne prenne effet.",
      ],
    },
    {
      id: 'contact',
      heading: '12. Contact',
      paragraphs: [
        `Questions relatives à la confidentialité et demandes concernant vos droits : ${PRIVACY_CONTACT_EMAIL}. Les signalements de sécurité doivent être envoyés à la même adresse avec SECURITY dans l'objet.`,
        "ft_transcendence est un projet académique, il n'y a donc pas d'entité juridique distincte derrière ce projet ni de délégué à la protection des données désigné. Les demandes parviennent directement à l'équipe qui maintient le projet.",
      ],
    },
  ],
};

export const termsOfService: LegalDocument = {
  slug: 'terms',
  title: "Conditions d'utilisation",
  description:
    "Les règles d'utilisation de ft_transcendence : qui peut s'inscrire, ce qui constitue un usage acceptable, ce que sont — et ne sont pas — les leçons générées par IA, et comment les comptes prennent fin.",
  lastUpdated: '2026-08-01',
  intro:
    "Ces conditions constituent l'accord entre vous et les mainteneurs de ft_transcendence. Elles sont courtes parce que le service est petit, et précises parce qu'un tuteur IA et des sessions en direct entre inconnus créent tous deux des situations que des conditions génériques ne couvrent pas.",
  sections: [
    {
      id: 'acceptance',
      heading: '1. Acceptation',
      paragraphs: [
        'Créer un compte signifie que vous acceptez ces conditions ainsi que la politique de confidentialité. Si vous ne les acceptez pas, ne créez pas de compte. Continuer à utiliser la plateforme après une modification de ces conditions signifie que vous acceptez la version mise à jour.',
      ],
    },
    {
      id: 'eligibility',
      heading: '2. Éligibilité et comptes',
      paragraphs: [
        "Vous devez avoir au moins seize ans. Une personne, un compte. Vous êtes responsable de la sécurité de vos identifiants et de tout ce qui est fait via votre compte, donc activez l'authentification à deux facteurs si ce compte compte pour vous.",
        "Fournissez des informations d'inscription exactes. Usurper l'identité d'une autre personne, qu'il s'agisse d'un apprenant, d'un mainteneur, ou d'un membre de l'équipe pédagogique, est motif d'exclusion immédiate.",
      ],
    },
    {
      id: 'acceptable-use',
      heading: '3. Usage acceptable',
      paragraphs: [
        "Utilisez ft_transcendence pour apprendre une langue et pour aider d'autres personnes à en apprendre une. C'est tout le périmètre visé.",
        "Vous ne pouvez pas harceler, menacer, ou maltraiter d'autres apprenants ; publier du contenu sexuel impliquant des mineurs ou tout autre contenu illégal ; utiliser le tuteur IA pour générer des discours de haine, des logiciels malveillants, ou du contenu conçu pour tromper les gens ; scraper la plateforme ou automatiser des comptes ; tenter de contourner les limites de débit, les budgets de tokens, ou l'authentification ; sonder l'infrastructure à la recherche de failles en dehors d'un signalement de sécurité de bonne foi ; ou revendre l'accès au service.",
        'Les limites de débit et les budgets de tokens par utilisateur protègent une ressource partagée et réellement limitée. Les contourner prend de la capacité aux autres apprenants et est traité comme un abus plutôt que comme une curiosité technique.',
      ],
    },
    {
      id: 'ai-content',
      heading: '4. Contenu généré par IA',
      paragraphs: [
        "Les leçons, corrections, traductions, et résultats d'évaluation sont produits par un grand modèle de langage. Les modèles de langage se trompent avec assurance de façon régulière. Considérez tout ce que produit le tuteur comme du matériel d'entraînement venant d'un partenaire faillible, pas comme un enseignement faisant autorité.",
        "Les résultats d'évaluation estiment votre niveau de compétence dans le seul but de choisir votre prochain exercice. Ce ne sont pas des certifications, ils ne correspondent que de façon approximative à des cadres formels comme le CECR, et ils n'ont aucune valeur académique ou professionnelle. Ne les présentez pas comme une qualification.",
        "Ne vous fiez jamais au tuteur pour des traductions médicales, juridiques, financières, ou critiques pour la sécurité. Si une erreur de traduction pouvait blesser quelqu'un, faites appel à un traducteur humain qualifié.",
      ],
    },
    {
      id: 'user-content',
      heading: '5. Votre contenu',
      paragraphs: [
        "Vous conservez la propriété de tout ce que vous écrivez : réponses aux exercices, messages de chat, texte de profil. Vous nous accordez une licence non exclusive pour stocker, traiter, et afficher ce contenu strictement dans le but de vous fournir le service, ainsi qu'aux apprenants à qui vous l'envoyez. La licence prend fin lorsque le contenu est supprimé.",
        "Nous n'entraînons pas de modèles sur votre contenu et nous ne l'ajoutons pas au corpus d'apprentissage partagé. Ne publiez pas de contenu que vous n'avez pas le droit de partager, et ne collez pas de secrets, d'identifiants, ou de données personnelles appartenant à d'autres personnes dans le tuteur.",
      ],
    },
    {
      id: 'live-sessions',
      heading: '6. Sessions en direct et conduite de la communauté',
      paragraphs: [
        "La pratique en direct vous associe à un autre apprenant en temps réel. Parlez-lui comme vous voudriez qu'on vous parle pendant que vous faites des erreurs dans une langue que vous ne maîtrisez pas encore, car c'est exactement ce qu'il ou elle est en train de faire.",
        "Quitter une session à répétition, retarder délibérément une manche chronométrée, ou utiliser une aide automatisée pour gagner un duel gâche la session pour l'autre joueur et peut vous coûter l'accès aux fonctionnalités multijoueurs. Signalez les comportements qui dépassent les limites plutôt que de riposter.",
      ],
    },
    {
      id: 'availability',
      heading: '7. Disponibilité et modifications',
      paragraphs: [
        'Le service est fourni tel quel, sans garantie de disponibilité. Il fonctionne sur une infrastructure gérée par des étudiants et peut être arrêté pour maintenance, redéployé, réinitialisé, ou interrompu. Exportez tout ce que vous souhaitez conserver.',
        "Les fonctionnalités peuvent changer ou être supprimées. Lorsqu'un changement supprime quelque chose dont vous dépendez, nous l'indiquerons sur cette page et, lorsque des comptes sont concernés, par e-mail.",
      ],
    },
    {
      id: 'termination',
      heading: '8. Suspension et résiliation',
      paragraphs: [
        'Vous pouvez supprimer votre compte à tout moment depuis les paramètres du compte ; la suppression suit le calendrier de conservation défini dans la politique de confidentialité.',
        "Nous pouvons suspendre ou résilier un compte qui enfreint ces conditions. Pour tout ce qui n'est pas un abus grave, nous vous avertirons d'abord et vous donnerons une chance de vous expliquer. Pour les abus graves, y compris le harcèlement, le contenu illégal, ou les attaques contre l'infrastructure, la suppression est immédiate et définitive.",
        'Si votre compte est résilié, vous pouvez toujours demander un export de vos données au titre de la politique de confidentialité, sauf si cela exposait un autre apprenant.',
      ],
    },
    {
      id: 'disclaimer',
      heading: '9. Clauses de non-responsabilité',
      paragraphs: [
        "Le service est fourni sans garantie d'aucune sorte, expresse ou implicite, y compris l'adéquation à un usage particulier et l'exactitude des sorties de l'IA. Dans toute la mesure permise par la loi, les mainteneurs ne sont pas responsables des pertes indirectes ou consécutives, des pertes de données, ou de toute décision que vous prenez sur la base d'un contenu généré par IA.",
        'Rien dans ces conditions ne limite une responsabilité qui ne peut être limitée par la loi, y compris la responsabilité pour décès ou dommage corporel causé par négligence, ou pour fraude.',
      ],
    },
    {
      id: 'governing-law',
      heading: '10. Droit applicable',
      paragraphs: [
        "Ces conditions sont régies par le droit français, et les tribunaux français sont compétents pour tout litige. Si vous êtes un consommateur résidant ailleurs dans l'Union européenne, cela ne vous prive pas de la protection des règles impératives de votre propre pays.",
        "Si une disposition de ces conditions s'avère inapplicable, le reste demeure en vigueur.",
      ],
    },
    {
      id: 'contact',
      heading: '11. Contact',
      paragraphs: [
        `Questions relatives à ces conditions, signalements d'abus, et recours contre une suspension : ${LEGAL_CONTACT_EMAIL}. Les demandes relatives à la confidentialité sont traitées séparément à l'adresse indiquée dans la politique de confidentialité.`,
      ],
    },
  ],
};

export const legalDocuments: LegalDocument[] = [privacyPolicy, termsOfService];
