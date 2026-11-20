import { LEGAL_CONTACT_EMAIL, PRIVACY_CONTACT_EMAIL, type LegalDocument } from '../legal';

export const privacyPolicy: LegalDocument = {
  slug: 'privacy',
  title: 'Datenschutzerklärung',
  description:
    'Was ft_transcendence sammelt, während Sie damit eine Sprache lernen, warum wir es sammeln, was an Google Gemini geht, wie lange wir es aufbewahren, und wie Sie es zurückerhalten oder löschen lassen können.',
  lastUpdated: '2026-11-20',
  intro:
    'ft_transcendence ist eine Plattform zum Sprachenlernen mit einem KI-Tutor. Eine Sprache zu unterrichten bedeutet, Ihre Antworten, Ihr Niveau und Ihren Fortschritt aufzubewahren, und der Tutor sendet einen Teil davon an Google. Diese Richtlinie erklärt genau, was das in der Praxis bedeutet, geschrieben, um gelesen und nicht nur überflogen zu werden.',
  sections: [
    {
      id: 'scope',
      heading: '1. Geltungsbereich',
      paragraphs: [
        'Diese Richtlinie gilt für die ft_transcendence-Webanwendung, ihre API und die Echtzeitverbindung, die Nachrichten zwischen Freunden überträgt und zeigt, wer online ist. Sie gilt für jeden, der ein Konto erstellt, sowie für Besucher, die nur öffentliche Seiten wie diese lesen.',
        'ft_transcendence ist ein akademisches Projekt von Studierenden. Es ist kein kommerzielles Produkt, steht nicht hinter einem Unternehmen, und sollte nicht als System zur dauerhaften Aufbewahrung von etwas betrachtet werden, dessen Verlust Sie sich nicht leisten können. Wir halten uns dennoch an die hier beschriebenen Praktiken.',
      ],
    },
    {
      id: 'data-we-collect',
      heading: '2. Daten, die wir erheben',
      paragraphs: [
        'Kontodaten: die bei der Anmeldung angegebene E-Mail-Adresse und der Anzeigename, ein Passwort, das nur als Argon2-Hash gespeichert wird, das Profilbild, das Sie hochladen, falls Sie eines wählen, Ihre Oberflächensprache, die Zeitzone, die Ihr Browser meldet (damit wir wissen, wo Ihr Tag für Serien und Tagesziele beginnt), und, falls aktiviert, Ihre Einstellungen zur Zwei-Faktor-Authentifizierung. Wir speichern ein Passwort niemals in einer lesbaren Form.',
        'Lerndaten: die Sprachen, die Sie lernen, das Niveau, das der Einstufungstest aus Ihren Antworten festlegt, oder das Niveau, das Sie stattdessen wählen, die bereits gesehenen Einstufungsfragen, damit sie nicht wiederkommen, Ihr Tagesziel, die Antworten, die Sie in Lektionen und Prüfungen einreichen, mit ihren Punktzahlen, sowie Serien, Erfahrungspunkte, Herausforderungen und Erfolge der Gamification-Funktionen.',
        'Tutordaten: was Sie dem Tutor des Lektionsgesprächs schreiben und was er antwortet. Sie werden nicht auf unseren Servern gespeichert: Abschnitt 4 sagt, wohin sie gehen, und Abschnitt 5, wie lange sie bestehen.',
        'Interaktionsdaten: Freundschaftsbeziehungen, ob Sie gerade online sind (die Zahl der App-Tabs, die Sie geöffnet haben, ohne Verlauf), der Tag, an dem Sie die App zuletzt im angemeldeten Zustand geöffnet haben (nur der Tag, nicht die Uhrzeit, und nur der letzte), und die Nachrichten, die Sie an Ihre Freunde senden, jeweils mit dem Zeitpunkt, zu dem sie gelesen wurden (den der Absender nie sieht). Alles, was Sie an einen anderen Lernenden senden, ist für diesen sichtbar.',
        'Technische Daten: Der Reverse Proxy protokolliert jede Anfrage mit IP-Adresse, Browser-User-Agent, aufgerufener Adresse und Uhrzeit, und die API protokolliert Fehlerspuren. Die Ratenbegrenzung zählt Anfragen pro Konto oder pro IP-Adresse, nur im Arbeitsspeicher. Die Überwachung speichert zusammengefasste Zahlen, etwa Anfrageraten oder wie viele Konten es gibt, die niemanden identifizieren. All das dient dem Betrieb des Dienstes und der Erkennung von Missbrauch, nicht der Erstellung eines Profils von Ihnen.',
      ],
    },
    {
      id: 'why-we-process',
      heading: '3. Warum wir sie verarbeiten',
      paragraphs: [
        'Wir verarbeiten Kontodaten, um Sie zu authentifizieren und Sitzungen der richtigen Person zuzuordnen. Wir verarbeiten Lerndaten, um Sie auf dem richtigen Niveau einzustufen, Ihre Lektionen und Prüfungen auszuwählen und zu bewerten und Ihnen Ihren eigenen Fortschritt zu zeigen, und Tutordaten, um Ihre Fragen zu einer Lektion zu beantworten. All das ist notwendig, um den von Ihnen gewünschten Dienst zu erbringen.',
        'Wir verarbeiten technische Daten auf Grundlage des berechtigten Interesses, die Plattform verfügbar und frei von Missbrauch zu halten, wozu die Ratenbegrenzung gehört. Wir verwenden keine dieser Daten für Werbung, und wir verkaufen sie nicht.',
      ],
    },
    {
      id: 'ai-processing',
      heading: '4. Wie die KI-Funktionen Ihre Daten nutzen',
      paragraphs: [
        'Vor jeder Prüfung läuft der Tutor des Lektionsgesprächs mit Google Gemini. Jede Nachricht, die Sie ihm senden, geht an Google, zusammen mit dem Text der Lektion, ihrer Sprache und ihrem Niveau, Ihrer Oberflächensprache, Ihren falschen Antworten in ihren Übungen (die Übung, Ihre Antwort und die richtige Antwort) und den vorherigen Nachrichten desselben Gesprächs, jedoch ohne Kennungen Ihres Kontos: keine E-Mail-Adresse, kein Anzeigename, keine Kontonummer.',
        'Dieses Projekt nutzt die kostenlose Stufe der Gemini-API und keinen Anbieter, der das Training ausschließt. Auf der kostenlosen Stufe darf Google diese Nachrichten und die Antworten zur Verbesserung seiner Produkte, einschließlich seiner Modelle, verwenden, und Menschen bei Google können sie lesen. Schreiben Sie dem Tutor nichts Persönliches. Ein Wechsel zu einer kostenpflichtigen Stufe oder zu einem anderen Anbieter ist eine Änderung dieser Richtlinie und wird hier vorgenommen, bevor er wirksam wird.',
        'Gemini schreibt auch einen Teil der Fragen des Einstufungstests. Diese Anfragen enthalten nur eine Sprache, ein Niveau und eine Fragenart, niemals etwas über Sie. Alles andere läuft nach unseren eigenen Regeln, ohne Sprachmodell: die Bewertung Ihrer Antworten, die Festlegung Ihres Niveaus und die Auswahl Ihrer Lektionen. Die Lektionen selbst wurden vorab geschrieben und vor der Veröffentlichung geprüft.',
        'Die Einstufung legt fest, auf welchem Niveau Ihnen Lektionen angeboten werden. Sie hat keine rechtliche oder ähnlich bedeutsame Wirkung: Sie können Ihr Niveau jederzeit selbst auf der Kursseite festlegen, den Test wiederholen und über die untenstehende Kontaktadresse eine menschliche Überprüfung jedes Ergebnisses beantragen.',
      ],
    },
    {
      id: 'retention',
      heading: '5. Wie lange wir Daten aufbewahren',
      paragraphs: [
        'Kontodaten werden aufbewahrt, bis das Konto gelöscht wird. Lernfortschritt und Ergebnisse werden für die Lebensdauer des Kontos aufbewahrt, da ihre Entfernung das Niveau und den Fortschritt zurücksetzen würde, die die Plattform nützlich machen. Eine Freundschaft oder Freundschaftsanfrage bleibt gespeichert, bis einer von Ihnen beiden sie entfernt, ablehnt oder zurückzieht oder das Konto gelöscht wird. Nachrichten werden aufbewahrt, solange beide Konten der Unterhaltung bestehen: Wenn Sie einen Freund entfernen, bleibt die Unterhaltung für Sie beide lesbar, und wird eines der beiden Konten gelöscht, wird sie mitgelöscht. Ein ersetztes oder entferntes Profilbild wird sofort gelöscht.',
        'Gespräche mit dem Tutor werden nie auf unseren Servern gespeichert: Ihr Browser behält das Gespräch, bis Sie die Seite verlassen, und die Server speichern weder Ihre Nachrichten noch die Antworten, nur die Zahl der Nachrichten, die Sie in der letzten Minute und am letzten Tag gesendet haben, für die Limits. Was Google aufbewahrt, legen seine Bedingungen für die Gemini-API fest. Eine Anmeldesitzung endet nach sieben Tagen ohne Nutzung. Was Sie auf einer Lektionsseite eingegeben, aber noch nicht eingereicht haben, bleibt in Ihrem Browser, bis die Lektion abgeschlossen oder neu begonnen wird.',
        'Server-Logs, die IP-Adressen enthalten, sind in ihrer Größe begrenzt und werden laufend rotiert, die ältesten zuerst, und nie archiviert. Zusammengefasste Überwachungszahlen werden fünfzehn Tage aufbewahrt. Wird ein Konto gelöscht, werden seine Kontodaten, Lerndaten und Unterhaltungen mit anderen Lernenden mitgelöscht. Es gibt keine Backups.',
      ],
    },
    {
      id: 'sharing',
      heading: '6. Wer sonst Ihre Daten sieht',
      paragraphs: [
        'Andere Lernende sehen Ihren Anzeigenamen, Ihr Profilbild, und alles, was Sie ihnen senden. Nur Freunde können einander Nachrichten schreiben, und eine Unterhaltung sehen nur die beiden Personen, die sie führen. Nur Ihre Freunde sehen, ob Sie gerade online sind, als Punkt neben Ihrem Namen: Wer Ihnen nur eine Anfrage gesendet hat, sieht es nicht, und niemand sieht, wann Sie zuletzt online waren. Jeder angemeldete Lernende kann Ihr Profil öffnen, das die Sprachen zeigt, die Sie lernen, Ihr Niveau in jeder davon und Ihre aktuelle Serie. Er kann Sie außerdem über Ihren Anzeigenamen oder unter den kürzlich aktiven Lernenden finden und Ihnen eine Freundschaftsanfrage senden. Sie erscheinen unter den kürzlich aktiven Lernenden ab dem Tag, an dem Sie die App im angemeldeten Zustand öffnen, bis eine Woche nach diesem Tag. Die Liste ist nach Anzeigenamen sortiert und zeigt kein Datum, aber wer sie beobachtet, kann erkennen, wann Sie nach mehr als einer Woche Abwesenheit zurückkehren. Ihre Freundesliste sehen nur Sie. Ihre E-Mail-Adresse, Ihre Zeitzone, Ihre Oberflächensprache und Ihre Einstellungen zur Zwei-Faktor-Authentifizierung werden anderen Lernenden nie angezeigt. Ihr Profilbild liegt unter einer Adresse, die niemand erraten kann, aber wer diese Adresse hat, kann das Bild laden.',
        'Außerhalb der Plattform erreichen Daten nur den Server, auf dem sie läuft, und Google, für den in Abschnitt 4 beschriebenen Tutor. Wir teilen keine Daten mit Werbetreibenden, Datenhändlern, oder Analysenetzwerken. Sollten wir jemals durch eine rechtmäßige Anordnung zur Offenlegung von Daten gezwungen werden, werden wir Sie benachrichtigen, sofern uns dies nicht untersagt ist.',
      ],
    },
    {
      id: 'cookies',
      heading: '7. Cookies und Browserspeicher',
      paragraphs: [
        'Wir setzen drei unbedingt erforderliche Cookies. Ein Sitzungscookie (ft.sid) hält Sie angemeldet: es ist httpOnly, sicher, same-site und enthält nur eine zufällige Sitzungsnummer, sodass clientseitige Skripte es nicht lesen können und es nichts verfolgt. Ein Sprachcookie (NEXT_LOCALE) merkt sich, welche der drei Sprachen Ihnen angezeigt wird; es enthält nur einen Sprachcode, der ohnehin in der Adressleiste sichtbar ist. Ein Kurscookie (ft.lang) merkt sich den zuletzt geöffneten Kurs, damit wir Sie dorthin zurückbringen können; es enthält nur einen Sprachcode und ist httpOnly.',
        'Der lokale Speicher des Browsers behält, was Sie auf der aktuellen Lektionsseite eingegeben oder gewählt haben, damit ein Neuladen es nicht verliert, sowie die bereits angezeigten Zeilen eines Prüfungsdialogs. Er bleibt auf Ihrem Gerät, wird nirgendwohin gesendet, bevor Sie die Antwort einreichen, und wird geleert, wenn die Lektion abgeschlossen oder neu begonnen wird.',
        'Es gibt keine Werbe- oder Analyse-Cookies, weshalb die Plattform kein Cookie-Einwilligungsbanner anzeigt: unbedingt erforderliche Cookies und Speicher erfordern keines.',
      ],
    },
    {
      id: 'your-rights',
      heading: '8. Ihre Rechte',
      paragraphs: [
        'Sie können Auskunft über die von uns über Sie gespeicherten Daten verlangen, die Berichtigung ungenauer Angaben, die Löschung Ihres Kontos und seiner Inhalte, einen maschinenlesbaren Export Ihres Lernverlaufs, die Einschränkung der Verarbeitung während eines laufenden Streitfalls, und Widerspruch gegen eine auf berechtigtem Interesse beruhende Verarbeitung.',
        'Auf Ihrer Profilseite können Sie Ihren Anzeigenamen und Ihr Profilbild ändern, und auf der Kursseite können Sie Ihr Niveau ändern. Für die Kontolöschung und den Datenexport gibt es noch keine Schaltfläche: Schreiben Sie an die untenstehende Kontaktadresse, und wir erledigen es für Sie. Wir antworten innerhalb von dreißig Tagen.',
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
        'Wenn sich diese Richtlinie wesentlich ändert, zum Beispiel wenn eine neue Datenkategorie erhoben wird oder sich der Modellanbieter oder seine Stufe ändert, ändern wir diese Seite, bevor die Änderung wirksam wird, und aktualisieren das Datum oben. Die Plattform versendet keine E-Mails, daher werden Änderungen auf dieser Seite angekündigt. Eine Änderung, die Ihre Einwilligung erfordert, wird erst auf Ihre Daten angewendet, wenn Sie sie erteilt haben.',
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
    'Die Regeln für die Nutzung von ft_transcendence: wer sich anmelden darf, was als akzeptable Nutzung gilt, was der KI-Tutor ist und nicht ist, und wie Konten enden.',
  lastUpdated: '2026-11-20',
  intro:
    'Diese Bedingungen sind die Vereinbarung zwischen Ihnen und den Betreibern von ft_transcendence. Sie sind kurz, weil der Dienst klein ist, und spezifisch, weil sowohl ein KI-Tutor als auch Nachrichten zwischen Lernenden Situationen schaffen, die generische Bedingungen nicht abdecken.',
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
        'Sie dürfen andere Lernende nicht belästigen, bedrohen, oder missbrauchen; sexuelle Inhalte mit Minderjährigen oder anderes rechtswidriges Material veröffentlichen; den KI-Tutor verwenden, um Hassrede, Schadsoftware, oder Inhalte zur Täuschung von Menschen zu erzeugen; die Plattform scrapen oder Konten automatisieren; versuchen, Ratenbegrenzungen, die Nachrichtenlimits des Tutors, oder die Authentifizierung zu umgehen; die Infrastruktur außerhalb einer gutgläubigen Sicherheitsmeldung auf Schwachstellen untersuchen; oder den Zugang zum Dienst weiterverkaufen.',
        'Ratenbegrenzungen und die Nachrichtenlimits des Tutors schützen eine gemeinsame und tatsächlich begrenzte Ressource: Der Tutor aller Lernenden läuft über einen einzigen Gemini-Schlüssel mit kleinem Kontingent. Sie zu umgehen, entzieht anderen Lernenden Kapazität und wird als Missbrauch behandelt, nicht als technische Spielerei.',
      ],
    },
    {
      id: 'ai-content',
      heading: '4. Von KI generierte Inhalte',
      paragraphs: [
        'Der Tutor des Lektionsgesprächs antwortet mit einem großen Sprachmodell, Google Gemini, und dasselbe Modell hat einen Teil der Fragen des Einstufungstests geschrieben. Die Lektionen wurden mit Hilfe eines Sprachmodells entworfen und vor der Veröffentlichung geprüft; Punktzahlen und Niveaus kommen aus festen Regeln, nicht aus einem Modell. Sprachmodelle liegen regelmäßig mit großer Überzeugung falsch. Betrachten Sie alles, was der Tutor produziert, als Übungsmaterial eines fehlbaren Partners, nicht als maßgebliche Anleitung.',
        'Vor jeder Prüfung können Sie dem Tutor Fragen zur Lektion stellen. Ihre Fragen und der Text der Lektion werden an Google Gemini gesendet, wie in der Datenschutzerklärung beschrieben, und ft_transcendence speichert das Gespräch nicht. Während der Prüfung ist der Tutor nicht verfügbar.',
        'Einstufungs- und Prüfungsergebnisse schätzen Ihr Kompetenzniveau zu dem einzigen Zweck, Ihre nächsten Lektionen auszuwählen. Sie sind keine Zertifizierung, sie entsprechen nur lose formalen Rahmenwerken wie dem GER, und sie haben kein akademisches oder berufliches Gewicht. Präsentieren Sie sie nicht als Qualifikation.',
        'Verlassen Sie sich niemals auf den Tutor für medizinische, rechtliche, finanzielle, oder sicherheitskritische Übersetzungen. Wenn eine Fehlübersetzung jemandem schaden könnte, ziehen Sie einen qualifizierten menschlichen Übersetzer hinzu.',
      ],
    },
    {
      id: 'user-content',
      heading: '5. Ihre Inhalte',
      paragraphs: [
        'Sie behalten das Eigentum an allem, was Sie schreiben oder hochladen: Übungsantworten, Nachrichten an Ihre Freunde und an den Tutor, Ihr Anzeigename und Ihr Profilbild. Sie gewähren uns eine nicht-exklusive Lizenz, diese Inhalte zu speichern, zu verarbeiten, und anzuzeigen, ausschließlich um den Dienst für Sie und die Lernenden, an die Sie sie senden, zu betreiben. Die Lizenz endet, wenn der Inhalt gelöscht wird.',
        'Wir selbst trainieren keine Modelle mit Ihren Inhalten. Was Sie dem Tutor schreiben, geht auf der kostenlosen Stufe der Gemini-API an Google, wo Google es zur Verbesserung seiner Modelle verwenden darf und Menschen bei Google es lesen können, wie die Datenschutzerklärung erklärt. Veröffentlichen Sie keine Inhalte, an denen Sie kein Recht zur Weitergabe haben, und fügen Sie dem Tutor keine Geheimnisse, Zugangsdaten, oder personenbezogenen Daten ein, weder Ihre eigenen noch die anderer Personen.',
      ],
    },
    {
      id: 'community',
      heading: '6. Freunde und Nachrichten',
      paragraphs: [
        'Jeder angemeldete Lernende kann Sie finden und Ihnen eine Freundschaftsanfrage senden, und Freunde können einander Nachrichten schreiben. Sprechen Sie mit ihnen so, wie Sie selbst angesprochen werden möchten, während Sie Fehler in einer Sprache machen, die Sie noch nicht beherrschen, denn genau das tun die anderen gerade auch.',
        'Unerwünschte Anfragen, Spam und Nachrichten, die belästigen, bedrohen oder täuschen, verderben die Plattform für andere und können Sie Ihr Konto kosten. Entfernen Sie einen Freund, der eine Grenze überschreitet, und melden Sie das Verhalten an die untenstehende Kontaktadresse, anstatt sich zu revanchieren.',
      ],
    },
    {
      id: 'availability',
      heading: '7. Verfügbarkeit und Änderungen',
      paragraphs: [
        'Der Dienst wird wie besehen bereitgestellt, ohne Verfügbarkeitsgarantie. Er läuft auf von Studierenden verwalteter Infrastruktur, ohne Backups, und kann für Wartungsarbeiten heruntergefahren, neu bereitgestellt, zurückgesetzt, oder eingestellt werden. Bewahren Sie eine Kopie von allem auf, dessen Verlust Sie sich nicht leisten können, oder verlangen Sie einen Export gemäß der Datenschutzerklärung.',
        'Funktionen können sich ändern oder entfernt werden. Wenn eine Änderung etwas entfernt, von dem Sie abhängen, teilen wir dies auf dieser Seite mit, bevor es geschieht; die Plattform versendet keine E-Mails.',
      ],
    },
    {
      id: 'termination',
      heading: '8. Sperrung und Kündigung',
      paragraphs: [
        'Sie können Ihr Konto jederzeit löschen lassen, indem Sie an die Datenschutz-Kontaktadresse schreiben; die Löschung folgt den Aufbewahrungsregeln der Datenschutzerklärung.',
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
