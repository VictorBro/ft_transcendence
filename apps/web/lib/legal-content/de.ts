import { LEGAL_CONTACT_EMAIL, PRIVACY_CONTACT_EMAIL, type LegalDocument } from '../legal';

export const privacyPolicy: LegalDocument = {
  slug: 'privacy',
  title: 'Datenschutzerklärung',
  description:
    'Was ft_transcendence sammelt, während Sie damit eine Sprache lernen, warum wir es sammeln, wie lange wir es aufbewahren, und wie Sie es zurückerhalten oder löschen lassen können.',
  lastUpdated: '2026-08-01',
  intro:
    'ft_transcendence ist eine KI-gestützte Plattform zum Sprachenlernen. Eine Sprache gut zu unterrichten bedeutet, zu beobachten, wie Sie sie verwenden, daher verarbeitet dieser Dienst mehr über Ihr Lernverhalten als eine typische Website. Diese Richtlinie erklärt genau, was das in der Praxis bedeutet, geschrieben, um gelesen und nicht nur überflogen zu werden.',
  sections: [
    {
      id: 'scope',
      heading: '1. Geltungsbereich',
      paragraphs: [
        'Diese Richtlinie gilt für die ft_transcendence-Webanwendung, ihre API und den Echtzeit-Sitzungsdienst, der die Live-Übung zwischen zwei Lernenden ermöglicht. Sie gilt für jeden, der ein Konto erstellt, sowie für Besucher, die nur öffentliche Seiten wie diese lesen.',
        'ft_transcendence ist ein akademisches Projekt von Studierenden. Es ist kein kommerzielles Produkt, steht nicht hinter einem Unternehmen, und sollte nicht als System zur dauerhaften Aufbewahrung von etwas betrachtet werden, dessen Verlust Sie sich nicht leisten können. Wir halten uns dennoch an die hier beschriebenen Praktiken.',
      ],
    },
    {
      id: 'data-we-collect',
      heading: '2. Daten, die wir erheben',
      paragraphs: [
        'Kontodaten: die bei der Anmeldung angegebene E-Mail-Adresse und der Anzeigename, ein Passwort, das nur als Argon2-Hash gespeichert wird, und, falls aktiviert, Ihre Einstellungen zur Zwei-Faktor-Authentifizierung. Wir speichern ein Passwort niemals in einer lesbaren Form.',
        'Lerndaten: die gewählte Zielsprache und Kompetenzstufe, die zu Übungen und Bewertungen eingereichten Antworten, das von unserer Bewertungs-Engine daraus abgeleitete Niveau, Serien, Punktzahlen und Fortschrittsmarkierungen, die von den Gamification-Funktionen verwendet werden.',
        'Konversationsdaten: die Eingaben, die Sie an den KI-Tutor senden, und die Antworten, die er zurückgibt. In einem Sprachlernkontext sind diese Mitschriften das eigentliche Produkt, da sowohl Korrektur als auch Einstufung von Ihren vorherigen Versuchen abhängen, einschließlich der Fehler.',
        'Interaktionsdaten: Freundschaftsbeziehungen, Anwesenheitsstatus, im Chat oder während einer Live-Sitzung gesendete Nachrichten, und Ergebnisse von Zwei-Spieler-Übungsrunden. Alles, was Sie an einen anderen Lernenden senden, ist für diesen sichtbar.',
        'Technische Daten: IP-Adresse, Browser-User-Agent, Zeitstempel, und von Server-Logs erfasste Fehlerspuren. Diese werden erhoben, um den Dienst zu betreiben und Missbrauch zu erkennen, nicht um ein Profil von Ihnen zu erstellen.',
      ],
    },
    {
      id: 'why-we-process',
      heading: '3. Warum wir sie verarbeiten',
      paragraphs: [
        'Wir verarbeiten Kontodaten, um Sie zu authentifizieren und Sitzungen der richtigen Person zuzuordnen. Wir verarbeiten Lern- und Konversationsdaten, um Übungen mit dem richtigen Schwierigkeitsgrad zu generieren, Bewertungen zu benoten, und Ihnen Ihren eigenen Verlauf zu zeigen. Beides ist notwendig, um den von Ihnen gewünschten Dienst zu erbringen.',
        'Wir verarbeiten technische Daten auf Grundlage des berechtigten Interesses, die Plattform verfügbar und frei von Missbrauch zu halten, einschließlich Ratenbegrenzung und Blockierung von automatisiertem Traffic. Wir verwenden keine dieser Daten für Werbung, und wir verkaufen sie nicht.',
      ],
    },
    {
      id: 'ai-processing',
      heading: '4. Wie die KI-Funktionen Ihre Daten nutzen',
      paragraphs: [
        'Das Erstellen einer Lektion oder das Bewerten einer Antwort sendet den relevanten Ausschnitt Ihres Lernverlaufs an ein großes Sprachmodell. Dieser Ausschnitt ist das für die Aufgabe nötige Minimum: die aktuelle Übung, Ihre Antwort, Ihr Niveau, und kürzliche Fehler zum selben Thema. Kontokennungen sind nicht in der Eingabe enthalten.',
        'Retrieval Augmented Generation durchsucht einen kuratierten Korpus von Lernmaterial, nicht andere Benutzerkonten. Ihre Konversationen werden niemals als Kontext für einen anderen Lernenden abgerufen, und sie werden niemals dem gemeinsamen Korpus hinzugefügt.',
        'Wenn ein Drittanbieter-Modell verwendet wird, verlassen die Eingaben unsere Infrastruktur und werden gemäß den Bedingungen dieses Anbieters verarbeitet. Wir wählen Anbieter aus, die vertraglich ausschließen, Kunden-Eingaben für das Training von Modellen zu verwenden. Der jeweils verwendete Anbieter wird in der Projektdokumentation genannt, und ein Anbieterwechsel wird als Änderung dieser Richtlinie behandelt.',
        'Die automatisierte Einstufung beeinflusst, welche Übungen Ihnen angezeigt werden. Sie hat keine rechtliche oder ähnlich bedeutsame Wirkung, und Sie können über die untenstehende Kontaktadresse eine menschliche Überprüfung jedes Bewertungsergebnisses beantragen.',
      ],
    },
    {
      id: 'retention',
      heading: '5. Wie lange wir Daten aufbewahren',
      paragraphs: [
        'Kontodaten werden aufbewahrt, bis das Konto gelöscht wird. Lernfortschritt und Bewertungsergebnisse werden für die Lebensdauer des Kontos aufbewahrt, da ihre Entfernung die Einstufung zurücksetzen würde, die die Plattform nützlich macht.',
        'Mitschriften von KI-Konversationen werden zwölf Monate aufbewahrt und dann automatisch gelöscht. An andere Lernende gesendete Chat-Nachrichten werden zwölf Monate aufbewahrt. Server-Logs mit IP-Adressen werden dreißig Tage aufbewahrt und dann rotiert.',
        'Das Löschen Ihres Kontos entfernt Kontodaten, Lerndaten und Mitschriften innerhalb von dreißig Tagen. Nachrichten, die Sie an einen anderen Lernenden gesendet haben, bleiben für diesen sichtbar, getrennt von Ihrem Profil, da sie Teil einer Konversation sind, die Ihnen nicht allein gehört. Backups werden nach ihrem eigenen rollierenden Zyklus gelöscht, der innerhalb von neunzig Tagen abgeschlossen ist.',
      ],
    },
    {
      id: 'sharing',
      heading: '6. Wer sonst Ihre Daten sieht',
      paragraphs: [
        'Andere Lernende sehen Ihren Anzeigenamen, Avatar, Anwesenheitsstatus, und alles, was Sie ihnen senden. Nichts sonst in Ihrem Profil wird standardmäßig offengelegt.',
        'Außerhalb der Plattform erreichen Daten nur die Infrastruktur und Modellanbieter, die für den Betrieb erforderlich sind. Wir teilen keine Daten mit Werbetreibenden, Datenhändlern, oder Analysenetzwerken. Sollten wir jemals durch eine rechtmäßige Anordnung zur Offenlegung von Daten gezwungen werden, werden wir Sie benachrichtigen, sofern uns dies nicht untersagt ist.',
      ],
    },
    {
      id: 'cookies',
      heading: '7. Cookies und lokaler Speicher',
      paragraphs: [
        'Wir setzen ein einziges, unbedingt erforderliches Cookie: ein httpOnly, sicheres Sitzungscookie, das Sie angemeldet hält. Es enthält keine Tracking-Kennung und ist für clientseitige Skripte nicht lesbar. Der lokale Speicher enthält Oberflächeneinstellungen wie Sprache und Design.',
        'Es gibt keine Werbe- oder Analyse-Cookies, weshalb die Plattform kein Cookie-Einwilligungsbanner anzeigt: unbedingt erforderliche Cookies erfordern keines.',
      ],
    },
    {
      id: 'your-rights',
      heading: '8. Ihre Rechte',
      paragraphs: [
        'Sie können Auskunft über die von uns über Sie gespeicherten Daten verlangen, die Berichtigung ungenauer Angaben, die Löschung Ihres Kontos und seiner Inhalte, einen maschinenlesbaren Export Ihres Lernverlaufs und Ihrer Mitschriften, die Einschränkung der Verarbeitung während eines laufenden Streitfalls, und Widerspruch gegen eine auf berechtigtem Interesse beruhende Verarbeitung.',
        'Die Kontoeinstellungen decken die häufigen Fälle direkt ab: Profil bearbeiten, Daten exportieren, und Konto löschen, ohne jemanden zu kontaktieren. Für alles, was die Oberfläche nicht abdeckt, schreiben Sie an die untenstehende Kontaktadresse. Wir antworten innerhalb von dreißig Tagen.',
        'Wenn Sie im Europäischen Wirtschaftsraum oder im Vereinigten Königreich ansässig sind, haben Sie außerdem das Recht, sich bei Ihrer nationalen Aufsichtsbehörde zu beschweren. Die Ausübung dieser Rechte kostet Sie niemals den Zugang zum Dienst.',
      ],
    },
    {
      id: 'security',
      heading: '9. Sicherheit',
      paragraphs: [
        'Der gesamte Datenverkehr wird über HTTPS bereitgestellt. Passwörter werden mit Argon2 gehasht. Sitzungscookies sind httpOnly, sicher, und same-site. Datenbank und Cache sind außerhalb des internen Netzwerks nicht erreichbar; nur der Reverse Proxy akzeptiert externe Verbindungen.',
        'Kein System ist perfekt, und dieses wird von Studierenden gepflegt. Wenn Sie eine Schwachstelle finden, melden Sie sie an die untenstehende Kontaktadresse, anstatt sie öffentlich offenzulegen, und wir beheben sie, bevor wir etwas dazu sagen.',
      ],
    },
    {
      id: 'children',
      heading: '10. Mindestalter',
      paragraphs: [
        'Sie müssen mindestens sechzehn Jahre alt sein, um ein Konto zu erstellen. Wir erheben wissentlich keine Daten von Kindern unter diesem Alter. Sollten wir davon erfahren, werden das Konto und seine Daten gelöscht.',
      ],
    },
    {
      id: 'changes',
      heading: '11. Änderungen dieser Richtlinie',
      paragraphs: [
        'Wenn sich diese Richtlinie wesentlich ändert, zum Beispiel wenn eine neue Datenkategorie erhoben oder ein neuer Modellanbieter eingeführt wird, aktualisieren wir das Datum oben auf dieser Seite und benachrichtigen Kontoinhaber per E-Mail, bevor die Änderung wirksam wird.',
      ],
    },
    {
      id: 'contact',
      heading: '12. Kontakt',
      paragraphs: [
        `Fragen zum Datenschutz und Anfragen zu Ihren Rechten: ${PRIVACY_CONTACT_EMAIL}. Sicherheitsmeldungen gehen an dieselbe Adresse mit SECURITY in der Betreffzeile.`,
        'ft_transcendence ist ein akademisches Projekt, daher gibt es keine eigenständige juristische Person dahinter und keinen bestellten Datenschutzbeauftragten. Anfragen erreichen das betreuende Team direkt.',
      ],
    },
  ],
};

export const termsOfService: LegalDocument = {
  slug: 'terms',
  title: 'Nutzungsbedingungen',
  description:
    'Die Regeln für die Nutzung von ft_transcendence: wer sich anmelden darf, was als akzeptable Nutzung gilt, was von KI generierte Lektionen sind und nicht sind, und wie Konten enden.',
  lastUpdated: '2026-08-01',
  intro:
    'Diese Bedingungen sind die Vereinbarung zwischen Ihnen und den Betreibern von ft_transcendence. Sie sind kurz, weil der Dienst klein ist, und spezifisch, weil sowohl ein KI-Tutor als auch Live-Sitzungen zwischen Fremden Situationen schaffen, die generische Bedingungen nicht abdecken.',
  sections: [
    {
      id: 'acceptance',
      heading: '1. Annahme',
      paragraphs: [
        'Die Erstellung eines Kontos bedeutet, dass Sie diese Bedingungen und die Datenschutzerklärung akzeptieren. Wenn Sie sie nicht akzeptieren, erstellen Sie kein Konto. Die weitere Nutzung der Plattform nach einer Änderung dieser Bedingungen bedeutet, dass Sie die aktualisierte Version akzeptieren.',
      ],
    },
    {
      id: 'eligibility',
      heading: '2. Berechtigung und Konten',
      paragraphs: [
        'Sie müssen mindestens sechzehn Jahre alt sein. Eine Person, ein Konto. Sie sind für die Sicherheit Ihrer Zugangsdaten und für alles, was über Ihr Konto getan wird, verantwortlich, daher aktivieren Sie die Zwei-Faktor-Authentifizierung, wenn Ihnen an diesem Konto etwas liegt.',
        'Geben Sie bei der Anmeldung korrekte Angaben an. Die Vortäuschung einer anderen Identität, sei es die eines Lernenden, eines Betreuers, oder eines Mitglieds des Lehrpersonals, führt zum sofortigen Ausschluss.',
      ],
    },
    {
      id: 'acceptable-use',
      heading: '3. Akzeptable Nutzung',
      paragraphs: [
        'Nutzen Sie ft_transcendence, um eine Sprache zu lernen und anderen dabei zu helfen, eine zu lernen. Das ist der gesamte vorgesehene Umfang.',
        'Sie dürfen andere Lernende nicht belästigen, bedrohen, oder missbrauchen; sexuelle Inhalte mit Minderjährigen oder anderes rechtswidriges Material veröffentlichen; den KI-Tutor verwenden, um Hassrede, Schadsoftware, oder Inhalte zur Täuschung von Menschen zu erzeugen; die Plattform scrapen oder Konten automatisieren; versuchen, Ratenbegrenzungen, Token-Budgets, oder die Authentifizierung zu umgehen; die Infrastruktur außerhalb einer gutgläubigen Sicherheitsmeldung auf Schwachstellen untersuchen; oder den Zugang zum Dienst weiterverkaufen.',
        'Ratenbegrenzungen und Token-Budgets pro Benutzer schützen eine gemeinsame und tatsächlich begrenzte Ressource. Sie zu umgehen, entzieht anderen Lernenden Kapazität und wird als Missbrauch behandelt, nicht als technische Spielerei.',
      ],
    },
    {
      id: 'ai-content',
      heading: '4. Von KI generierte Inhalte',
      paragraphs: [
        'Lektionen, Korrekturen, Übersetzungen, und Bewertungsergebnisse werden von einem großen Sprachmodell erzeugt. Sprachmodelle liegen regelmäßig mit großer Überzeugung falsch. Betrachten Sie alles, was der Tutor produziert, als Übungsmaterial eines fehlbaren Partners, nicht als maßgebliche Anleitung.',
        'Bewertungsergebnisse schätzen Ihr Kompetenzniveau zu dem einzigen Zweck, Ihre nächste Übung auszuwählen. Sie sind keine Zertifizierung, sie entsprechen nur lose formalen Rahmenwerken wie dem GER, und sie haben kein akademisches oder berufliches Gewicht. Präsentieren Sie sie nicht als Qualifikation.',
        'Verlassen Sie sich niemals auf den Tutor für medizinische, rechtliche, finanzielle, oder sicherheitskritische Übersetzungen. Wenn eine Fehlübersetzung jemandem schaden könnte, ziehen Sie einen qualifizierten menschlichen Übersetzer hinzu.',
      ],
    },
    {
      id: 'user-content',
      heading: '5. Ihre Inhalte',
      paragraphs: [
        'Sie behalten das Eigentum an allem, was Sie schreiben: Übungsantworten, Chat-Nachrichten, Profiltext. Sie gewähren uns eine nicht-exklusive Lizenz, diese Inhalte zu speichern, zu verarbeiten, und anzuzeigen, ausschließlich um den Dienst für Sie und die Lernenden, an die Sie sie senden, zu betreiben. Die Lizenz endet, wenn der Inhalt gelöscht wird.',
        'Wir trainieren keine Modelle mit Ihren Inhalten und fügen sie nicht dem gemeinsamen Lernkorpus hinzu. Veröffentlichen Sie keine Inhalte, an denen Sie kein Recht zur Weitergabe haben, und fügen Sie dem Tutor keine Geheimnisse, Zugangsdaten, oder personenbezogenen Daten anderer Personen ein.',
      ],
    },
    {
      id: 'live-sessions',
      heading: '6. Live-Sitzungen und Verhalten in der Community',
      paragraphs: [
        'Live-Übungen verbinden Sie in Echtzeit mit einem anderen Lernenden. Sprechen Sie mit ihm oder ihr so, wie Sie selbst angesprochen werden möchten, während Sie Fehler in einer Sprache machen, die Sie noch nicht beherrschen, denn genau das tut die andere Person gerade auch.',
        'Wiederholtes Verlassen einer Sitzung, absichtliches Verzögern einer zeitlich begrenzten Runde, oder die Nutzung automatisierter Hilfsmittel, um ein Duell zu gewinnen, verdirbt die Sitzung für den anderen Spieler und kann den Zugang zu Mehrspielerfunktionen kosten. Melden Sie Verhalten, das eine Grenze überschreitet, anstatt sich zu revanchieren.',
      ],
    },
    {
      id: 'availability',
      heading: '7. Verfügbarkeit und Änderungen',
      paragraphs: [
        'Der Dienst wird wie besehen bereitgestellt, ohne Verfügbarkeitsgarantie. Er läuft auf von Studierenden verwalteter Infrastruktur und kann für Wartungsarbeiten heruntergefahren, neu bereitgestellt, zurückgesetzt, oder eingestellt werden. Exportieren Sie alles, was Sie behalten möchten.',
        'Funktionen können sich ändern oder entfernt werden. Wenn eine Änderung etwas entfernt, von dem Sie abhängen, werden wir dies auf dieser Seite und, sofern Konten betroffen sind, per E-Mail mitteilen.',
      ],
    },
    {
      id: 'termination',
      heading: '8. Sperrung und Kündigung',
      paragraphs: [
        'Sie können Ihr Konto jederzeit in den Kontoeinstellungen löschen; die Löschung folgt dem in der Datenschutzerklärung festgelegten Aufbewahrungsplan.',
        'Wir können ein Konto sperren oder kündigen, das gegen diese Bedingungen verstößt. Außer bei schwerwiegendem Missbrauch werden wir Sie zunächst warnen und Ihnen die Möglichkeit zur Erklärung geben. Bei schwerwiegendem Missbrauch, einschließlich Belästigung, rechtswidriger Inhalte, oder Angriffen auf die Infrastruktur, erfolgt die Entfernung sofort und endgültig.',
        'Wird Ihr Konto gekündigt, können Sie dennoch einen Export Ihrer Daten gemäß der Datenschutzerklärung verlangen, es sei denn, dies würde einen anderen Lernenden offenlegen.',
      ],
    },
    {
      id: 'disclaimer',
      heading: '9. Haftungsausschluss',
      paragraphs: [
        'Der Dienst wird ohne Gewähr jeglicher Art bereitgestellt, weder ausdrücklich noch stillschweigend, einschließlich der Eignung für einen bestimmten Zweck und der Genauigkeit von KI-Ausgaben. Im gesetzlich zulässigen Höchstmaß haften die Betreiber nicht für indirekte oder Folgeschäden, Datenverluste, oder Entscheidungen, die Sie auf Grundlage von KI-generierten Inhalten treffen.',
        'Nichts in diesen Bedingungen beschränkt eine Haftung, die gesetzlich nicht beschränkt werden kann, einschließlich der Haftung für Tod oder Körperverletzung durch Fahrlässigkeit, oder für Betrug.',
      ],
    },
    {
      id: 'governing-law',
      heading: '10. Anwendbares Recht',
      paragraphs: [
        'Diese Bedingungen unterliegen französischem Recht, und die Gerichte Frankreichs sind für jeden Streitfall zuständig. Wenn Sie Verbraucher mit Wohnsitz anderswo in der Europäischen Union sind, entzieht Ihnen dies nicht den Schutz der zwingenden Vorschriften Ihres eigenen Landes.',
        'Sollte eine Bestimmung dieser Bedingungen unwirksam sein, bleibt der Rest in Kraft.',
      ],
    },
    {
      id: 'contact',
      heading: '11. Kontakt',
      paragraphs: [
        `Fragen zu diesen Bedingungen, Missbrauchsmeldungen, und Widersprüche gegen eine Sperrung: ${LEGAL_CONTACT_EMAIL}. Datenschutzanfragen werden separat unter der in der Datenschutzerklärung angegebenen Adresse bearbeitet.`,
      ],
    },
  ],
};

export const legalDocuments: LegalDocument[] = [privacyPolicy, termsOfService];
