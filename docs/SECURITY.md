# Confidentialité et sécurité V3

Le client inchangé envoie le texte uniquement à l'endpoint loopback. Aucun cloud, compte, proxy Python, télémétrie ou téléchargement au démarrage. Le serveur privé est lancé sans `--public`, et l'option JVM IPv4 et le contrôle du listener exigent 127.0.0.1 avec le PID possédé. Le serveur préexistant sur un port occupé n'est jamais arrêté/adopté par la V3.

Le processus Java n'hérite pas de JAVA_TOOL_OPTIONS, _JAVA_OPTIONS, JDK_JAVA_OPTIONS, CLASSPATH ou JAVA_HOME. Le chemin Java est absolu, résolu à partir du paquet, sans recherche sur PATH. Aucun droit administrateur n'est requis pour la tray ou le raccourci utilisateur.

Le lanceur ne journalise que des événements et états fixes. Les sorties JVM sont dirigées vers DEVNULL. Aucun log HTTP ne contenant `text` n'est persisté par le lanceur. Les diagnostics contiennent versions, état, port et booléens de présence, sans chemins personnels, commandes, messages d'exception bruts ou environnement. Les rapports de test contiennent uniquement les phrases synthétiques explicitement incluses dans le corpus.

Les journaux d'état locaux sont limités à trois fichiers de 128 KiB sous `%LOCALAPPDATA%\Correctly`. Les préférences/dictionnaires de l'extension restent dans chrome.storage.local, selon le comportement V2. Les caches du moteur et du client restent en mémoire.

Loopback protège contre l'accès LAN direct, mais les logiciels locaux peuvent envoyer des requêtes. L'absence de CORS permissif ne constitue pas une authentification du serveur : une page peut potentiellement émettre une requête simple sans pouvoir lire la réponse. L'extension utilise ses permissions localhost existantes et son service worker. Aucune garantie d'isolation contre un logiciel malveillant déjà présent sur la machine n'est annoncée.

Le paquet et les fichiers de configuration doivent rester dans un dossier de confiance. Les checksums de build garantissent l'identité par rapport au lock local ; ils ne remplacent pas une signature du distributeur. La vérification LAN depuis une machine secondaire, l'exécution réseau débranché, la revue de redistribution et Windows Defender restent à documenter dans la matrice de recette.
