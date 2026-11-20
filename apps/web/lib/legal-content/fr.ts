import { LEGAL_CONTACT_EMAIL, PRIVACY_CONTACT_EMAIL, type LegalDocument } from '../legal';

export const privacyPolicy: LegalDocument = {
  slug: 'privacy',
  title: 'Politique de confidentialité',
  description:
    'Ce que ft_transcendence collecte pendant que vous apprenez une langue avec la plateforme, pourquoi nous le collectons, ce qui part chez Google Gemini, combien de temps nous le conservons, et comment le récupérer ou le faire supprimer.',
  lastUpdated: '2026-11-20',
  intro:
    "ft_transcendence est une plateforme d'apprentissage des langues dotée d'un tuteur IA. Enseigner une langue implique de conserver vos réponses, votre niveau et votre progression, et le tuteur en envoie une partie à Google. Cette politique explique précisément ce que cela signifie en pratique, écrite pour être lue plutôt que survolée.",
  sections: [
    {
      id: 'scope',
      heading: "1. Champ d'application",
      paragraphs: [
        "Cette politique couvre l'application web ft_transcendence, son API, et la connexion en temps réel qui transporte les messages entre amis et montre qui est en ligne. Elle s'applique à toute personne créant un compte, ainsi qu'aux visiteurs qui ne font que lire des pages publiques comme celle-ci.",
        "ft_transcendence est un projet académique réalisé par des étudiants. Ce n'est pas un produit commercial, il n'est adossé à aucune société, et ne doit pas être considéré comme un système d'enregistrement pour quoi que ce soit que vous ne pourriez pas vous permettre de perdre. Nous nous engageons malgré tout à respecter les pratiques décrites ici.",
      ],
    },
    {
      id: 'data-we-collect',
      heading: '2. Données que nous collectons',
      paragraphs: [
        "Données de compte : l'adresse e-mail et le nom d'affichage que vous fournissez à l'inscription, un mot de passe stocké uniquement sous forme de hash Argon2, la photo de profil que vous téléversez si vous en choisissez une, votre langue d'interface, le fuseau horaire que signale votre navigateur (pour savoir où commence votre journée pour les séries et les objectifs quotidiens), et, si vous l'activez, vos paramètres d'authentification à deux facteurs. Nous ne stockons jamais un mot de passe sous une forme lisible.",
        "Données d'apprentissage : les langues que vous apprenez, le niveau que le test de placement fixe à partir de vos réponses ou celui que vous choisissez à la place, les questions de placement déjà vues pour qu'elles ne reviennent pas, votre objectif quotidien, les réponses que vous soumettez dans les leçons et les examens avec leurs scores, et les séries de jours, points d'expérience, défis et succès des fonctionnalités de gamification.",
        "Données du tuteur : ce que vous écrivez au tuteur de la discussion d'une leçon et ce qu'il répond. Elles ne sont pas conservées sur nos serveurs : la section 4 dit où elles vont et la section 5 combien de temps elles vivent.",
        "Données d'interaction : relations d'amitié, si vous êtes en ligne en ce moment (le nombre d'onglets de l'application que vous avez ouverts, sans historique), le jour où vous avez ouvert l'application pour la dernière fois en étant connecté (le jour seulement, pas l'heure, et seul le plus récent), et les messages que vous envoyez à vos amis, chacun conservé avec le moment où il a été lu (que l'expéditeur ne voit jamais). Tout ce que vous envoyez à un autre apprenant lui est visible.",
        "Données techniques : le reverse proxy journalise chaque requête avec son adresse IP, le user agent du navigateur, l'adresse demandée et l'heure, et l'API journalise les traces d'erreurs. La limitation de débit compte les requêtes par compte ou par adresse IP, en mémoire seulement. La supervision conserve des chiffres agrégés, comme le nombre de requêtes ou de comptes, qui n'identifient personne. Tout cela sert à faire fonctionner le service et à détecter les abus, pas à construire un profil vous concernant.",
      ],
    },
    {
      id: 'why-we-process',
      heading: '3. Pourquoi nous les traitons',
      paragraphs: [
        "Nous traitons les données de compte pour vous authentifier et rattacher les sessions à la bonne personne. Nous traitons les données d'apprentissage pour vous placer au bon niveau, choisir et noter vos leçons et vos examens, et vous montrer votre propre progression, et les données du tuteur pour répondre à vos questions sur une leçon. Tout cela est nécessaire pour fournir le service que vous avez demandé.",
        "Nous traitons les données techniques sur la base de l'intérêt légitime à maintenir la plateforme disponible et exempte d'abus, ce qui comprend la limitation de débit. Nous n'utilisons aucune de ces données à des fins publicitaires, et nous ne les vendons pas.",
      ],
    },
    {
      id: 'ai-processing',
      heading: '4. Comment les fonctionnalités IA utilisent vos données',
      paragraphs: [
        "Avant chaque examen, le tuteur de la discussion d'une leçon fonctionne avec Google Gemini. Chaque message que vous lui envoyez part chez Google avec le texte de la leçon, la langue et le niveau de la leçon, votre langue d'interface, vos réponses fausses dans ses exercices d'entraînement (l'exercice, ce que vous avez répondu et la bonne réponse) et les messages précédents de la même discussion, mais aucun identifiant de votre compte : ni adresse e-mail, ni nom d'affichage, ni numéro de compte.",
        "Ce projet utilise le niveau gratuit de l'API Gemini, et aucun fournisseur qui exclut l'entraînement. Sur le niveau gratuit, Google peut utiliser ces messages et les réponses pour améliorer ses produits, dont ses modèles, et des personnes chez Google peuvent les lire. N'écrivez rien de personnel au tuteur. Passer à un niveau payant ou à un autre fournisseur est une modification de cette politique, faite ici avant de prendre effet.",
        "Gemini écrit aussi une partie des questions du test de placement. Ces requêtes ne portent qu'une langue, un niveau et un type de question, jamais rien qui vous concerne. Tout le reste fonctionne selon nos propres règles, sans modèle de langage : la notation de vos réponses, la fixation de votre niveau et le choix de vos leçons. Les leçons elles-mêmes ont été écrites à l'avance et vérifiées avant publication.",
        "Le placement fixe le niveau auquel les leçons vous sont proposées. Il n'a aucun effet juridique ni effet similaire significatif : vous pouvez fixer votre niveau vous-même à tout moment sur la page du cours, repasser le test, et demander une révision humaine de tout résultat via l'adresse de contact ci-dessous.",
      ],
    },
    {
      id: 'retention',
      heading: '5. Durée de conservation des données',
      paragraphs: [
        "Les données de compte sont conservées jusqu'à la suppression du compte. La progression d'apprentissage et les résultats sont conservés pendant toute la durée de vie du compte, car les supprimer réinitialiserait le niveau et la progression qui rendent la plateforme utile. Une amitié ou une demande d'ami est conservée jusqu'à ce que l'un de vous deux la retire, la refuse ou l'annule, ou que le compte soit supprimé. Les messages sont conservés tant que les deux comptes de la conversation existent : retirer un ami laisse la conversation lisible par vous deux, et la suppression de l'un des deux comptes la supprime. Une photo de profil remplacée ou retirée est supprimée aussitôt.",
        "Les discussions avec le tuteur ne sont jamais conservées sur nos serveurs : votre navigateur garde la discussion jusqu'à ce que vous quittiez la page, et les serveurs ne gardent ni vos messages ni les réponses, seulement le nombre de messages envoyés dans la dernière minute et la dernière journée, pour les limites. Ce que Google conserve est fixé par ses conditions de l'API Gemini. Une session de connexion prend fin après sept jours sans utilisation. Ce que vous avez saisi sur une page de leçon sans l'avoir encore soumis reste dans votre navigateur jusqu'à ce que la leçon soit terminée ou recommencée.",
        "Les journaux serveur qui contiennent des adresses IP sont limités en taille et purgés au fil de l'eau, les plus anciens d'abord, et ne sont jamais archivés. Les chiffres agrégés de supervision sont conservés quinze jours. Quand un compte est supprimé, ses données de compte, ses données d'apprentissage et ses conversations avec d'autres apprenants sont supprimées avec lui. Il n'y a pas de sauvegardes.",
      ],
    },
    {
      id: 'sharing',
      heading: "6. Qui d'autre voit vos données",
      paragraphs: [
        "Les autres apprenants voient votre nom d'affichage, votre photo de profil, et tout ce que vous leur envoyez. Seuls les amis peuvent s'écrire, et une conversation n'est visible que par les deux personnes qui y participent. Seuls vos amis voient si vous êtes en ligne en ce moment, par une pastille à côté de votre nom : un apprenant qui vous a seulement envoyé une demande ne le voit pas, et personne ne voit quand vous étiez en ligne pour la dernière fois. Tout apprenant connecté peut ouvrir votre profil, qui montre les langues que vous apprenez, votre niveau dans chacune et votre série de jours en cours. Il peut aussi vous trouver par votre nom d'affichage ou parmi les apprenants actifs récemment, et vous envoyer une demande d'ami. Vous figurez parmi les apprenants actifs récemment à partir du jour où vous ouvrez l'application en étant connecté, et jusqu'à une semaine après ce jour. La liste est triée par nom d'affichage et ne montre aucune date, mais quelqu'un qui la surveille peut voir quand vous revenez après plus d'une semaine d'absence. Votre liste d'amis n'est visible que par vous. Votre adresse e-mail, votre fuseau horaire, votre langue d'interface et vos paramètres d'authentification à deux facteurs ne sont jamais montrés aux autres apprenants. Votre photo de profil est servie depuis une adresse que personne ne peut deviner, mais toute personne qui a cette adresse peut charger la photo.",
        "En dehors de la plateforme, les données n'atteignent que le serveur qui l'héberge et Google, pour le tuteur décrit à la section 4. Nous ne partageons pas de données avec des annonceurs, des courtiers en données, ou des réseaux d'analyse. Si nous sommes un jour contraints de divulguer des données par une décision de justice, nous vous en informerons sauf interdiction de le faire.",
      ],
    },
    {
      id: 'cookies',
      heading: '7. Cookies et stockage du navigateur',
      paragraphs: [
        "Nous posons trois cookies strictement nécessaires. Un cookie de session (ft.sid) vous maintient connecté : il est httpOnly, sécurisé, same-site, et ne porte qu'un numéro de session aléatoire, si bien que les scripts côté client ne peuvent pas le lire et qu'il ne suit rien. Un cookie de langue (NEXT_LOCALE) retient laquelle des trois langues vous afficher ; il ne contient qu'un code de langue, également visible dans la barre d'adresse. Un cookie de cours (ft.lang) retient le dernier cours ouvert, afin de vous y ramener ; il ne contient qu'un code de langue et est httpOnly.",
        "Le stockage local du navigateur garde ce que vous avez saisi ou choisi sur la page de leçon où vous êtes, pour qu'un rechargement ne le perde pas, ainsi que les répliques déjà affichées d'un dialogue d'examen. Il reste sur votre appareil, n'est envoyé nulle part avant que vous soumettiez la réponse, et est effacé quand la leçon est terminée ou recommencée.",
        "Il n'y a pas de cookies publicitaires ou d'analyse, c'est pourquoi la plateforme n'affiche aucune bannière de consentement aux cookies : les cookies et le stockage strictement nécessaires n'en requièrent pas.",
      ],
    },
    {
      id: 'your-rights',
      heading: '8. Vos droits',
      paragraphs: [
        "Vous pouvez demander l'accès aux données que nous détenons à votre sujet, la correction de toute inexactitude, la suppression de votre compte et de son contenu, un export lisible par machine de votre historique d'apprentissage, la limitation du traitement pendant qu'un litige est en cours, et vous opposer à un traitement fondé sur l'intérêt légitime.",
        "Votre page de profil vous permet de changer votre nom d'affichage et votre photo de profil, et la page du cours vous permet de changer votre niveau. La suppression du compte et l'export des données n'ont pas encore de bouton : écrivez à l'adresse de contact ci-dessous et nous le faisons pour vous. Nous répondons sous trente jours.",
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
        "Lorsque cette politique change de manière substantielle, par exemple lorsqu'une nouvelle catégorie de données est collectée ou que le fournisseur de modèle ou son niveau change, nous modifions cette page avant que le changement ne prenne effet et mettons à jour la date en haut. La plateforme n'envoie aucun e-mail : c'est sur cette page que les changements sont annoncés. Un changement qui demande votre consentement n'est pas appliqué à vos données avant que vous l'ayez donné.",
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
    "Les règles d'utilisation de ft_transcendence : qui peut s'inscrire, ce qui constitue un usage acceptable, ce qu'est (et n'est pas) le tuteur IA, et comment les comptes prennent fin.",
  lastUpdated: '2026-11-20',
  intro:
    "Ces conditions constituent l'accord entre vous et les mainteneurs de ft_transcendence. Elles sont courtes parce que le service est petit, et précises parce qu'un tuteur IA et des messages entre apprenants créent tous deux des situations que des conditions génériques ne couvrent pas.",
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
        "Vous ne pouvez pas harceler, menacer, ou maltraiter d'autres apprenants ; publier du contenu sexuel impliquant des mineurs ou tout autre contenu illégal ; utiliser le tuteur IA pour générer des discours de haine, des logiciels malveillants, ou du contenu conçu pour tromper les gens ; scraper la plateforme ou automatiser des comptes ; tenter de contourner les limites de débit, les limites de messages du tuteur, ou l'authentification ; sonder l'infrastructure à la recherche de failles en dehors d'un signalement de sécurité de bonne foi ; ou revendre l'accès au service.",
        'Les limites de débit et les limites de messages du tuteur protègent une ressource partagée et réellement limitée : le tuteur de tous les apprenants fonctionne avec une seule clé Gemini au quota réduit. Les contourner prend de la capacité aux autres apprenants et est traité comme un abus plutôt que comme une curiosité technique.',
      ],
    },
    {
      id: 'ai-content',
      heading: '4. Contenu généré par IA',
      paragraphs: [
        "Le tuteur de la discussion d'une leçon répond avec un grand modèle de langage, Google Gemini, et le même modèle a écrit une partie des questions du test de placement. Les leçons ont été rédigées avec l'aide d'un modèle de langage et vérifiées avant publication ; les scores et les niveaux viennent de règles fixes, pas d'un modèle. Les modèles de langage se trompent avec assurance de façon régulière. Considérez tout ce que produit le tuteur comme du matériel d'entraînement venant d'un partenaire faillible, pas comme un enseignement faisant autorité.",
        "Les résultats du placement et des examens estiment votre niveau de compétence dans le seul but de choisir vos prochaines leçons. Ce ne sont pas des certifications, ils ne correspondent que de façon approximative à des cadres formels comme le CECR, et ils n'ont aucune valeur académique ou professionnelle. Ne les présentez pas comme une qualification.",
        "Ne vous fiez jamais au tuteur pour des traductions médicales, juridiques, financières, ou critiques pour la sécurité. Si une erreur de traduction pouvait blesser quelqu'un, faites appel à un traducteur humain qualifié.",
      ],
    },
    {
      id: 'user-content',
      heading: '5. Votre contenu',
      paragraphs: [
        "Vous conservez la propriété de tout ce que vous écrivez ou téléversez : réponses aux exercices, messages à vos amis et au tuteur, nom d'affichage et photo de profil. Vous nous accordez une licence non exclusive pour stocker, traiter, et afficher ce contenu strictement dans le but de vous fournir le service, ainsi qu'aux apprenants à qui vous l'envoyez. La licence prend fin lorsque le contenu est supprimé.",
        "Nous n'entraînons nous-mêmes aucun modèle sur votre contenu. Ce que vous écrivez au tuteur part chez Google sur le niveau gratuit de l'API Gemini, où Google peut l'utiliser pour améliorer ses modèles et des personnes chez Google peuvent le lire, comme l'explique la politique de confidentialité. Ne publiez pas de contenu que vous n'avez pas le droit de partager, et ne collez dans le tuteur ni secrets, ni identifiants, ni données personnelles, les vôtres ou celles d'autres personnes.",
      ],
    },
    {
      id: 'community',
      heading: '6. Amis et messages',
      paragraphs: [
        "Tout apprenant connecté peut vous trouver et vous envoyer une demande d'ami, et les amis peuvent s'écrire. Parlez-leur comme vous voudriez qu'on vous parle pendant que vous faites des erreurs dans une langue que vous ne maîtrisez pas encore, car c'est exactement ce qu'ils sont en train de faire.",
        "Les demandes non désirées, le spam, et les messages qui harcèlent, menacent ou trompent gâchent la plateforme pour les autres et peuvent vous coûter votre compte. Retirez un ami qui dépasse les limites, et signalez le comportement à l'adresse de contact ci-dessous plutôt que de riposter.",
      ],
    },
    {
      id: 'availability',
      heading: '7. Disponibilité et modifications',
      paragraphs: [
        'Le service est fourni tel quel, sans garantie de disponibilité. Il fonctionne sur une infrastructure gérée par des étudiants, sans sauvegardes, et peut être arrêté pour maintenance, redéployé, réinitialisé, ou interrompu. Gardez une copie de tout ce que vous ne pouvez pas vous permettre de perdre, ou demandez un export au titre de la politique de confidentialité.',
        "Les fonctionnalités peuvent changer ou être supprimées. Lorsqu'un changement supprime quelque chose dont vous dépendez, nous l'indiquerons sur cette page avant qu'il n'ait lieu ; la plateforme n'envoie aucun e-mail.",
      ],
    },
    {
      id: 'termination',
      heading: '8. Suspension et résiliation',
      paragraphs: [
        "Vous pouvez faire supprimer votre compte à tout moment en écrivant à l'adresse de contact confidentialité ; la suppression suit les règles de conservation de la politique de confidentialité.",
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
