# Correctly V3 — Plan complet de développement

**Nom du projet :** Correctly — Real-time Grammar & Spelling Assistant  
**Version ciblée :** V3 — Distribution autonome, moteur LanguageTool intégré  
**Plateforme prioritaire :** Windows 10/11 x64 ; extension Chrome/Brave Manifest V3  
**Statut :** Plan de développement à transmettre à un agent de code ; aucune fonctionnalité V3 n'est déclarée implémentée  
**Priorité :** conserver la qualité FR/EN et la compatibilité de la V1/V2 ; simplifier l'installation et le lancement ; réduire les opérations manuelles.  

> **Décision structurante :** la V3 n'est **pas** une réécriture du correcteur en Python pur. Python orchestre une distribution autonome de LanguageTool, qui reste exécuté par un runtime Java **embarqué**. L'utilisateur final n'installe pas Java séparément. C'est la stratégie qui minimise le risque de régression de qualité.

---

## 0. Contrat à destination de l'agent de développement

### 0.1 Mission

Créer une V3 de Correctly simple à utiliser : l'utilisateur installe/lance CorrectlyServer, voit une icône dans la zone de notification Windows et utilise l'extension Chrome/Brave sans lancer de terminal, configurer Java ou télécharger manuellement LanguageTool. Toutes les corrections continuent à être réalisées **localement** par la même distribution/version LanguageTool validée avec V2.

### 0.2 Règles absolues

1. **Ne jamais réécrire l'extension ou le moteur sans justification.** Partir du dépôt existant, explorer le code avant tout changement et conserver les tests V1/V2.
2. **Ne pas remplacer LanguageTool par SymSpell, Hunspell, Grammalecte ou un LLM** dans cette V3. Ces pistes peuvent faire l'objet de prototypes ultérieurs distincts.
3. **Ne pas introduire Django ou FastAPI par défaut.** Correctly parle déjà à `/v2/check` ; ajouter un second serveur serait de la complexité inutile. Un proxy Python est une option seulement si un besoin réel et mesurable apparaît.
4. **Ne jamais installer Java au niveau système** : livrer un runtime privé, compatible avec LanguageTool, dans le paquet Correctly.
5. **Ne pas modifier silencieusement les paramètres FR/EN**, les règles actives, les dictionnaires, le mode auto, ou le format de réponse du moteur ; préserver un résultat comparable à la V2.
6. **Ne rien exposer sur le réseau local ni Internet.** Bind uniquement sur `127.0.0.1` ; ne pas activer `--public`.
7. **Ne jamais perdre le texte saisi**, le focus, le curseur, les sélections, la possibilité d'annuler ou les corrections existantes lors de la migration.
8. **Ne pas tuer tous les processus `java.exe`/`javaw.exe` du PC.** Gérer uniquement le processus enfant que Correctly possède.
9. **Ne pas commencer par le mode PyInstaller `--onefile`.** Faire fonctionner `--onedir` puis mesurer les coûts et les risques avant de décider du packaging.
10. **Ne pas déclarer la V3 terminée** sans tests sur une machine où Java **n'est pas installé** et sans tests manuels sur Chrome/Brave et les sites cibles.

### 0.3 Définition explicite de « sans Java »

- **Oui :** aucune installation de Java, aucune variable `JAVA_HOME`, aucune manipulation du PATH, aucune console Java, aucun téléchargement à la première exécution.
- **Non :** le logiciel ne devient pas « Python pur » ; LanguageTool continue d'utiliser une JVM privée fournie dans le paquet.
- **Conséquence :** qualité pratiquement identique à conditions égales si la version, les ressources, règles et options LanguageTool restent les mêmes. Toute évolution de version doit être testée séparément.

---

## 1. Situation de départ et périmètre

### 1.1 Ce qui existe déjà (selon `RESUME.md`)

- Extension navigateur **Manifest V3**, en TypeScript, HTML, CSS, content scripts et service worker.
- Appels directs vers le moteur local : `POST http://127.0.0.1:8081/v2/check`.
- Correcteur LanguageTool local, actuellement démarré avec `javaw.exe` depuis le dossier `C:\LanguageTool\LanguageTool-20260923-snapshot`.
- Rendu et application des suggestions avec `offset`, `length`, `message`, `replacements`, `rule`, `category`.
- Français, anglais, auto ; debounce proche de 400 ms ; affichage de soulignements, popup, clic droit, dictionnaire local, sites désactivés.
- Lanceur Python/Windows tray avec `pystray`, `Pillow`, `subprocess`, `urllib`, puis compilation PyInstaller en `CorrectlyServer.exe`.
- Démarrage automatique via un raccourci dans `shell:startup`.
- Première validation V1 : 83 tests, lint/build/format au vert **au moment indiqué dans le résumé** ; vérifier le nombre et l'état actuels du dépôt.
- La V2 spécifie une détection générique d'éditeur actif, des adapters pour champs natifs/contenteditable, la gestion SPA/iframe/Shadow DOM, un meilleur mode Auto FR/EN, une analyse locale par paragraphe et les requêtes obsolètes. **L'implémentation effective de chacun de ces éléments doit être auditée dans le dépôt ; le document source les présente principalement comme objectifs.**

### 1.2 Ce que V3 change

**Dans le programme Windows :**
- Runtime Java privé intégré et chemin résolu automatiquement.
- Distribution LanguageTool privée intégrée (avec ses bibliothèques, ressources et licences).
- Lanceur robuste, état du serveur, journalisation, prévention des doublons, gestion des erreurs, arrêt propre et autostart.
- Package déplaçable/installable sans configuration manuelle.

**Dans l'extension :**
- Modification minimale : conserver le client LanguageTool et le JSON actuel.
- Ajouter/fiabiliser seulement la détection d'indisponibilité serveur et, si nécessaire, une indication simple « serveur arrêté ».
- Conserver le support et le comportement des champs V1/V2.

**Ce que V3 ne fait pas :**
- Pas d'hébergement cloud, de comptes utilisateurs, de télémétrie ou d'analyse externe.
- Pas de LLM, de reformulation ou de correction stylistique nouvelle.
- Pas de changement du moteur de correction, de refonte graphique de l'extension ou de bascule de framework.
- Pas d'installateur universel multiplateforme dans la première itération.

---

## 2. Architecture cible

```text
Windows 10/11
│
├── Chrome / Brave
│   └── Extension Correctly (TypeScript, Manifest V3)
│       ├── Universal Editable Detector / EditorAdapter (V2)
│       ├── Debounce, cache, contrôle des requêtes obsolètes
│       ├── Overlays, popup, remplacement, menu contextuel
│       └── HTTP POST http://127.0.0.1:8081/v2/check
│
└── CorrectlyServer (Python compilé par PyInstaller)
    ├── Icône tray Windows + actions Démarrer / Arrêter / Redémarrer / Quitter
    ├── Gestion de l'état / du processus / du port
    ├── Test de santé local et messages d'erreur
    ├── Journaux locaux, sans texte utilisateur
    ├── Gestion de l'autostart facultatif
    └── lance en subprocess :
        runtime/bin/javaw.exe (runtime Java PRIVÉ)
             │
             └── LanguageTool HTTP server
                 ├── languagetool-server.jar
                 ├── libs, règles, dictionnaires, ressources
                 ├── server.properties
                 ├── Français / Anglais
                 └── écoute UNIQUEMENT sur 127.0.0.1:8081
```

### 2.1 Pourquoi l'extension parle directement à LanguageTool

- `/v2/check` est déjà le contrat réseau testé.
- Ajout d'une passerelle FastAPI = nouvelle dépendance, nouvel endpoint, second processus/thread, nouveaux tests, risques de latence et de divergence de réponse.
- Garder le chemin existant permet de mesurer objectivement les résultats du même moteur avant/après packaging.
- Le lanceur Python peut vérifier la disponibilité du serveur via HTTP sans devenir lui-même serveur.

**Option future seulement :** si un problème de sécurité, d'authentification locale, de port dynamique ou de normalisation impose un proxy, concevoir une couche API transparente qui reproduit exactement `/v2/check` ; documenter alors les nouvelles permissions navigateur, le CORS et les tests. Ne pas l'implémenter par défaut.

### 2.2 Contrat de communication

- Endpoint : `http://127.0.0.1:8081/v2/check`.
- Méthode : `POST` en `application/x-www-form-urlencoded`, selon le client existant.
- Entrées importantes : `text`, `language`, et tous les paramètres déjà transmis par V2.
- Sortie : JSON LanguageTool original ; **ne pas casser** les chemins utilisés par la popup et les overlays.
- Connexion limitée à loopback ; timeout maîtrisé ; pas d'envoi réseau externe.
- L'extension doit rester capable de réagir si le serveur est arrêté ou démarre lentement.

### 2.3 Invariants fonctionnels

1. Une même phrase envoyée au même LanguageTool configuré de la même façon renvoie un résultat équivalent avant/après migration.
2. Les offsets du moteur sont respectés par le client JavaScript ; tester tout particulièrement accents, apostrophes typographiques, emojis et caractères hors BMP.
3. Les requêtes obsolètes ne remplacent jamais les résultats plus récents.
4. L'extension n'enregistre pas le texte utilisateur dans les logs.
5. Le serveur est inaccessible depuis une autre machine du LAN.

---

## 3. Choisir et figer le moteur et la JVM

### 3.1 Conserver l'archive LanguageTool existante

**Étape obligatoire :** examiner la distribution actuelle `LanguageTool-20260923-snapshot` avant toute migration :

- Numéro/version réelle, build snapshot, archive/source et somme de contrôle si disponibles.
- Arborescence effective : JAR serveur, bibliothèques, dictionnaires, ressources, configuration.
- Arguments réellement utilisés par le lanceur et contenu effectif de `server.properties`.
- Règles activées/désactivées, variantes `fr`, `en-US`, `en-GB`, langues automatiques, personnalisations.
- Réponses de référence de la V2 et consommation RAM/CPU au repos et pendant la saisie.

**Interdiction :** ne pas remplacer en douce le snapshot par une autre release pendant le packaging. Si la version doit être modifiée, ouvrir un changement séparé et comparer explicitement les résultats.

### 3.2 Runtime Java embarqué

- Fournir une JVM Windows x64 issue d'une distribution documentée, par exemple Eclipse Temurin.
- Choisir une version Java compatible avec **la version exacte** du snapshot LanguageTool. Ne pas supposer que la version de Java installée localement chez le développeur convient à l'utilisateur.
- Les distributions récentes de LanguageTool nécessitent Java 17 ou supérieur (exigence documentée à partir de LT 6.6) ; **vérifier pour le snapshot précis**.
- Préférer initialement un runtime complet validé ; envisager `jlink` uniquement en optimisation ultérieure, après analyse des modules requis et des chargements dynamiques.
- Installer dans `runtime/`, sans écriture vers Program Files Java ni modification de PATH/JAVA_HOME.
- Inclure les avis de licences et les composants requis par les dépendances redistribuées.

### 3.3 Dépendances réellement nécessaires

Ne pas copier uniquement `languagetool-server.jar` : vérifier les répertoires `libs/`, fichiers de langues, règles, dictionnaires et ressources associés. Certains composants sont chargés à l'exécution.

Exécuter les vérifications avec le Java fourni, pas avec `java` trouvé sur le PATH :

```powershell
.\runtime\bin\java.exe -version
.\runtime\bin\java.exe -jar .\engine\languagetool-server.jar --help
```

Les arguments disponibles dépendent de la distribution ; vérifier l'aide réelle avant de coder la commande de lancement définitive.

---

## 4. Distribution cible et arborescence

### 4.1 Stratégie recommandée : PyInstaller `onedir`

La version initiale livrable doit ressembler à :

```text
Correctly-V3-Windows-x64/
├── CorrectlyServer.exe
├── _internal/                  # runtime Python généré par PyInstaller (selon version)
├── runtime/
│   ├── bin/javaw.exe
│   ├── bin/java.exe
│   ├── conf/
│   ├── legal/
│   └── ...
├── engine/
│   ├── languagetool-server.jar
│   ├── libs/
│   ├── org/ et/ou ressources selon distribution
│   ├── server.properties        # configuration validée
│   └── ...
├── licenses/
│   ├── LICENSES-THIRD-PARTY.md
│   └── avis fournis par les dépendances
├── VERSION.txt
└── README_INSTALL.md
```

L'arborescence exacte peut être ajustée au `.spec`, mais **la résolution des chemins doit correspondre exactement à la sortie réelle de PyInstaller**. Avec `onedir`, certains fichiers peuvent être rangés sous `_internal/` : décider explicitement s'ils sont embarqués là ou recopiés dans un dossier stable voisin de l'EXE. Tester le résultat packagé.

### 4.2 Pourquoi `onedir` d'abord

- Plus simple à déboguer et à mettre à jour ; l'exécutable trouve des dossiers stables.
- Évite de devoir extraire une JVM et les ressources LanguageTool à chaque démarrage.
- Réduit les risques de problèmes de dossier temporaire, d'antivirus, de fichiers verrouillés et de nettoyage.
- Meilleure transparence sur la présence des licences et sur la taille réelle des composants.

### 4.3 `onefile` seulement en phase optionnelle

Si un seul EXE est une exigence forte :

- Benchmark du temps de démarrage, de la taille, de l'extraction et de l'usage disque temporaire.
- Vérifier la gestion des processus enfants et le cycle de vie du répertoire temporaire PyInstaller.
- Préférer, pour un gros runtime, un **installeur Windows unique** contenant un dossier d'application stable plutôt qu'un gros EXE autoextractible à chaque démarrage.
- Ne pas prétendre qu'« un seul EXE » signifie « aucun fichier utilisé pendant l'exécution ».

### 4.4 Installer Windows (phase post-MVP)

Produire éventuellement un installeur Inno Setup ou NSIS : sélection de dossier, création du raccourci Démarrer, option démarrage automatique, désinstallation, conservation facultative des préférences. C'est une étape distincte du socle `onedir`.

---

## 5. Structure du dépôt proposée

Adapter au code existant ; ne pas déplacer inutilement les fichiers de l'extension.

```text
correctly/
├── extension/                    # V1/V2, TypeScript, tests, manifest, dist
├── windows-server/
│   ├── src/correctly_server/
│   │   ├── __main__.py
│   │   ├── app.py                 # cycle de vie
│   │   ├── settings.py            # options, chemins, port
│   │   ├── paths.py               # dev/frozen/onedir
│   │   ├── engine.py              # démarrage / arrêt JVM
│   │   ├── health.py              # sondage HTTP / état
│   │   ├── tray.py                # interface Windows
│   │   ├── singleton.py           # instance unique
│   │   ├── logging_config.py      # logs confidentiels
│   │   ├── autostart.py           # autostart opt-in
│   │   └── diagnostics.py         # export diagnostic redigé
│   ├── assets/
│   │   └── correctly.ico
│   ├── vendor/
│   │   ├── runtime/               # local, non commité si binaire volumineux
│   │   └── languagetool/          # distribution validée
│   ├── tests/
│   │   ├── test_paths.py
│   │   ├── test_engine.py
│   │   ├── test_health.py
│   │   ├── test_singleton.py
│   │   ├── test_autostart.py
│   │   └── test_packaging.py
│   ├── pyproject.toml
│   ├── requirements-build.txt
│   └── correctly.spec
├── scripts/
│   ├── prepare_vendor.ps1
│   ├── build_windows.ps1
│   ├── smoke_test_windows.ps1
│   └── verify_checksums.ps1
├── docs/
│   ├── PLAN_V3.md
│   ├── MIGRATION_V2_V3.md
│   ├── API_CONTRACT.md
│   ├── SECURITY.md
│   └── RELEASE_CHECKLIST.md
└── README.md
```

**Attention :** cette arborescence est une proposition, pas une description de fichiers déjà présents. L'agent doit vérifier les chemins du dépôt et réutiliser les modules existants si possible.

---

## 6. Gestion des chemins fiable

### 6.1 Problème à résoudre

La V1 référence actuellement le Java système et le dossier `C:\LanguageTool\...` ; ces chemins ne fonctionneront pas sur une autre machine.

### 6.2 Règle

- En mode source : résoudre les ressources dans `windows-server/vendor/` ou un chemin dev explicitement configuré.
- En mode `onedir` : résoudre les ressources relativement aux ressources empaquetées effectivement présentes, **pas à `os.getcwd()`**.
- Ne jamais faire confiance à un nom d'utilisateur, à une lettre de disque ou à un `JAVA_HOME` préexistant.
- Valider l'existence de `runtime/bin/javaw.exe`, du JAR serveur, des bibliothèques et de la configuration avant lancement.
- Afficher une erreur actionable si un fichier est absent.

### 6.3 Pseudocode de résolution

```python
from pathlib import Path
import sys


def get_bundle_root() -> Path:
    if getattr(sys, "frozen", False):
        # Root à adapter au .spec / emplacement réel des assets.
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return Path(__file__).resolve().parents[2]


def get_javaw_path() -> Path:
    return get_bundle_root() / "runtime" / "bin" / "javaw.exe"
```

**Important :** ce pseudocode **n'est pas prêt à être copié aveuglément** : le nombre de parents varie avec le dépôt et le `.spec`. Écrire d'abord des tests qui vérifient les chemins en mode source et sur le build final.

---

## 7. Gestion du processus LanguageTool

### 7.1 États internes

```text
STOPPED → STARTING → RUNNING → STOPPING → STOPPED
                 ↘ ERROR
             RUNNING → ERROR / STOPPED (arrêt imprévu)
```

Définir un enum `STOPPED`, `STARTING`, `RUNNING`, `STOPPING`, `ERROR`, et éventuellement `PORT_CONFLICT`.

### 7.2 Démarrage

1. Vérifier si le contrôleur est déjà actif.
2. Résoudre et valider chemins.
3. Vérifier disponibilité du port 8081.
4. Si occupé, identifier le service **sans tuer le processus inconnu**. Si l'endpoint répond mais qu'il ne s'agit pas du processus possédé, afficher « port occupé » et proposer des instructions, pas un remplacement silencieux.
5. Construire la ligne de commande **sous forme de liste**, jamais de commande shell concaténée.
6. Lancer **le `javaw.exe` embarqué** avec `subprocess.Popen`, `cwd` fixé sur le répertoire requis par LanguageTool et `shell=False`.
7. Définir prudemment la JVM (ex. `-Xmx512m` comme valeur de départ à **mesurer**, non une valeur universelle).
8. S'assurer de la liaison loopback selon les paramètres exacts de la distribution.
9. Réaliser une sonde HTTP courte, réessayée jusqu'à délai plafond configurable, sans bloquer l'UI tray.
10. Ne déclarer `RUNNING` qu'après un check HTTP réel validé, pas après le seul retour de `Popen`.

### 7.3 Sonde de santé

- Vérifier en boucle courte pendant `STARTING` que `http://127.0.0.1:8081/v2/check` répond à une requête de test **sans données utilisateur**.
- Exemple de phrase de santé : `I has a car` et langue `en-US` ; accepter un HTTP 200 avec un JSON valide qui contient la structure attendue (`matches`).
- Sur timeout : vérifier si le processus existe, puis afficher un diagnostic.
- Éviter les sondes en rafale à l'état RUNNING ; les effectuer à cadence raisonnable.
- Ne pas confondre « port ouvert » et « LanguageTool opérationnel ».

### 7.4 Arrêt et redémarrage

- À l'arrêt, demander une terminaison du **processus enfant possédé** puis attendre pendant un délai raisonnable.
- Si nécessaire, escalader vers arrêt forcé du processus enfant uniquement ; sur Windows, vérifier proprement la gestion d'un éventuel arbre de processus.
- Ne pas tuer d'autres programmes Java présents sur le PC.
- Redémarrage : `STOPPING → STOPPED → STARTING → RUNNING` en préservant les erreurs éventuelles.
- Quitter : règle UX explicite : **quitter l'application tray arrête aussi le serveur qu'elle a lancé** ; documenter ce comportement.

### 7.5 Prévenir les multiples instances

- Une seule instance tray contrôleur doit fonctionner à la fois.
- Utiliser un mécanisme Windows d'exclusion mutuelle (mutex nommé par session ou équivalent robuste).
- Si une autre instance Correctly est lancée : ne pas créer un second serveur ; informer ou se fermer proprement.
- La propriété du PID du serveur est liée à l'instance contrôleur, pour éviter une erreur sur un PID réutilisé.
- Cas particuliers : crash du contrôleur, Java orphelin, port bloqué, Windows sortie de veille ; diagnostiquer sans arrêter aveuglément un processus inconnu.

---

## 8. Interface tray et expérience Windows

### 8.1 Comportement visible

L'application démarre sans console ; une icône se place près de l'horloge. L'interface reste compacte.

**Menu proposé :**

```text
Correctly Server
────────────────────────────
● État : prêt / démarrage / arrêté / erreur
Démarrer le serveur
Arrêter le serveur
Redémarrer le serveur
────────────────────────────
Démarrer avec Windows  [✓/ ]
Tester le correcteur
Ouvrir les diagnostics
────────────────────────────
À propos / versions
Quitter
```

### 8.2 Comportements détaillés

- Lorsque le serveur démarre : désactiver « Démarrer », garder le tray réactif ; ne pas bloquer le thread UI.
- Lorsque le serveur tourne : « Démarrer » désactivé ; « Arrêter » et « Redémarrer » actifs.
- En cas d'échec : icône/état explicites et message compréhensible ; bouton diagnostic accessible.
- « Tester le correcteur » : envoyer une phrase **synthétique** en FR et EN et afficher succès/échec sans envoyer de données personnelles.
- « À propos » : version Correctly, version LanguageTool, version runtime, architecture x64.
- Option : notification discrète au premier démarrage réussi et en cas d'échec persistant ; pas de notification répétitive.
- `pystray` et `Pillow` existants peuvent rester ; pas besoin de PyQt/Electron pour une icône tray.

### 8.3 Démarrage automatique Windows

- Conserver initialement `shell:startup`, avec **un raccourci** vers le nouvel EXE stable et la case opt-in du menu.
- Les chemins du raccourci ne doivent pas viser un dossier temporaire ou un EXE dans un build de développement.
- Si on utilise un installeur : privilégier un emplacement stable, puis proposer autostart pendant l'installation.
- Désinstallation : supprimer uniquement les entrées créées par Correctly.
- Ne pas exiger les droits administrateur pour un usage personnel lorsque ce n'est pas nécessaire.

---

## 9. Robustesse, CPU, RAM et réactivité

### 9.1 Objectif

Ne pas dégrader la réactivité de l'extension ni ajouter une consommation mémoire inutile par rapport à la V2. Puisque le moteur reste LanguageTool, son empreinte mémoire ne disparaît **pas** grâce à Python.

### 9.2 Mesures à réaliser (valeurs à mesurer, pas à inventer)

| Scénario | Mesures |
|---|---|
| Cold start Windows | Temps entre lancement EXE et disponibilité `/v2/check` |
| Second lancement | Aucune JVM dupliquée |
| Au repos | RAM totale Python + JVM, CPU moyen |
| Texte court FR | Latence médiane et p95, corrections obtenues |
| Texte court EN | Latence médiane et p95, corrections obtenues |
| Texte long | Latence, mémoire, gestion du debounce V2 |
| 100 requêtes successives | Stabilité, erreurs, fuites apparentes |
| Après veille/reprise | Retour automatique à un état cohérent |
| Crash JVM | Diagnostic clair, tray encore fonctionnel |

### 9.3 Recommandations de performance

- Pas de démarrage de JVM par requête : un seul serveur durable en mémoire.
- Pas de FastAPI/proxy inutile : supprimer une couche de sérialisation et de maintenance.
- Réutiliser debounce, cache et analyse par zone active de la V2, lorsque ces fonctions sont effectivement développées.
- Tester une limite raisonnable `-Xmx` ; ne pas optimiser avant d'avoir mesuré.
- Prévoir une relance contrôlée après crash, avec temporisation et nombre d'essais limité pour éviter une boucle infinie.

---

## 10. Confidentialité et sécurité

### 10.1 Exigences non négociables

- Aucun texte saisi ne doit sortir vers un serveur externe.
- Le moteur écoute uniquement en loopback ; ne pas activer d'option d'accès public.
- Pas de télémétrie, d'historique de texte ou de logs de requêtes HTTP contenant `text`.
- Dans les diagnostics, masquer les informations personnelles potentiellement présentes dans les chemins locaux et commandes.
- Désactiver le logging excessif du moteur ; traiter `stdout/stderr` sans faire grossir des fichiers indéfiniment.
- N'ajouter aucune permission navigateur qui n'est pas nécessaire ; conserver les permissions existantes si suffisantes.

### 10.2 Risque localhost

Le fait d'être sur `127.0.0.1` protège contre l'accès distant direct, **pas automatiquement contre toute requête initiée par une page web locale ou un logiciel local**. Auditer les réglages CORS/Origin de LanguageTool, les politiques navigateur et les permissions de l'extension ; éviter des en-têtes permissifs. Si le moteur local accepte des requêtes d'autres applications, documenter ce risque résiduel. Pour un usage personnel, le périmètre de menace doit être explicite et honnête.

### 10.3 Provenance et licence

- Télécharger le runtime Java et LanguageTool depuis leurs sources officielles/fiables.
- Documenter version, origine, checksum et date d'intégration.
- Garder les avis légaux et licences propres à la distribution utilisée et à ses dépendances. **Effectuer une revue de redistribution avant publication.**
- Ne pas télécharger/exécuter un binaire provenant d'un URL non vérifié dans le workflow de build.

---

## 11. Contrat API et compatibilité avec la V2

### 11.1 Compatibilité obligatoire

L'extension doit continuer à utiliser le client existant ; ne pas créer un protocole parallèle.

```text
POST /v2/check
Content-Type: application/x-www-form-urlencoded

text=...&language=fr
```

La réponse du serveur contient notamment un tableau `matches` avec ses champs habituels ; la V3 n'invente pas un nouveau schéma de correction.

### 11.2 Tests de comparaison

Pour chaque phrase de référence, sauvegarder la réponse **normalisée** de la version avant migration et après migration. Ignorer uniquement des champs d'identification non pertinents s'ils changent ; comparer strictement la position, les règles, les messages, les catégories et suggestions, en tenant compte de la configuration réelle.

Corpus de départ :

```text
FR : je sui content
FR : je suis aller au magasin hier
FR : ils est parti hier
FR : C'est une très belle journée.
EN : I has a car
EN : She go to school yesterday
EN : I have an apple.
Auto : i has 300€
Unicode : Bonjour 👋 je sui ici
```

**Ne pas attendre que le mode Auto corrige miraculeusement les phrases très courtes :** c'est un sujet V2 distinct ; ne pas changer sa logique à l'occasion du packaging.

### 11.3 Tests des corrections côté navigateur

- Soulignement apparaît au bon endroit après réponse.
- Popup propose les mêmes alternatives pertinentes.
- Un remplacement modifie uniquement la plage ciblée.
- Si le texte a changé, une correction obsolète ne s'applique pas.
- Focus/caret/selection restent cohérents.
- Les champs mot de passe sont exclus.
- Les modes FR/EN/Auto, dictionnaire personnel, catégories de correction et sites désactivés restent fonctionnels.

---

## 12. Plan de migration par étapes avec critères de sortie

### Phase 0 — Audit du dépôt et sauvegarde (bloquante)

**Tâches :**

1. Lire le README, `RESUME.md`, les scripts Python, `.spec`, la configuration LanguageTool, le manifeste et le client HTTP de l'extension.
2. Identifier ce qui est réellement développé en V2 et ce qui n'est qu'une intention.
3. Exécuter tests/lint/build de référence ; noter les résultats sans les corriger hors périmètre.
4. Répertorier chemins absolus, port, versions, binaires, options Java et licences.
5. Créer une branche `feature/correctly-v3-bundled-engine`, ou un tag/commit de sauvegarde selon le workflow du projet.
6. Sauvegarder un petit jeu de réponses de référence FR/EN sans données personnelles.

**Livrables :** `docs/BASELINE_V2.md`, baseline des tests et réponses JSON.

**Critère de sortie :** architecture et dépendances actuelles comprises et baseline reproductible.

### Phase 1 — Runtime + moteur autonomes

**Tâches :**

1. Choisir la distribution runtime, compatible avec le LanguageTool actuel.
2. Préparer le bundle dans `vendor/`, avec notices et checksums.
3. Exécuter `java.exe -version` depuis le dossier embarqué.
4. Lancer `languagetool-server.jar` avec le runtime embarqué (sans PATH Java).
5. Vérifier `/v2/check` FR et EN via requêtes POST.
6. Tester `127.0.0.1` plutôt que `0.0.0.0`.

**Livrables :** script reproductible `prepare_vendor.ps1`, `docs/DEPENDENCIES.md`.

**Critère de sortie :** serveur complet lancé depuis une copie de dossier sur un PC sans Java système.

### Phase 2 — Refactor minimal du lanceur Python

**Tâches :**

1. Isoler fonctions de chemins, état, processus, sonde, menus et autostart.
2. Remplacer les chemins Java système par ceux du bundle.
3. Implémenter état explicite + vérification de port + sondes HTTP.
4. Prévoir arrêt propre et éviter l'arrêt des Java inconnus.
5. Prévenir lancement en double, gérer erreurs et logs sans texte utilisateur.
6. Ajouter des tests unitaires avec `subprocess.Popen`/HTTP simulés.

**Livrables :** lanceur local fonctionnel en source.

**Critère de sortie :** lancement/arrêt/redémarrage fiables, sans fenêtre terminal et sans chemins absolus.

### Phase 3 — Premier build Windows `onedir`

**Tâches :**

1. Créer/ajuster `correctly.spec` en fonction de l'arborescence retenue.
2. Compiler sur Windows x64 ; vérifier inclusion runtime, ressources LT et licences.
3. Tester la résolution des chemins **dans le build final**.
4. Déplacer le dossier build vers un autre emplacement et tester.
5. Vérifier qu'aucune installation Java ou Python système n'est utilisée.
6. Mesurer taille et cold start ; garder les résultats dans `docs/BENCHMARKS_V3.md`.

**Livrables :** `Correctly-V3-Windows-x64.zip` (dossier compressé prêt à extraire).

**Critère de sortie :** version portable fonctionnelle sur Windows sans installation Java/Python.

### Phase 4 — Integration navigateur sans régression

**Tâches :**

1. Tester Chrome et Brave avec l'extension existante.
2. Valider exactement le même endpoint et les mêmes paramètres.
3. Vérifier les permissions et la communication localhost.
4. Tester les champs natifs et contenteditable, selon la disponibilité réelle de la V2.
5. Vérifier les comportements d'erreur (server off, port conflict, serveur en démarrage).
6. Ne modifier l'extension qu'en cas de besoin avéré.

**Livrables :** rapport de tests intégration avec captures/notes si utiles.

**Critère de sortie :** qualité, affichage et application des corrections équivalents à l'état de référence.

### Phase 5 — Ergonomie et installation

**Tâches :**

1. Ajouter autostart opt-in et suppression du raccourci créé.
2. Ajouter action « Tester le correcteur » et informations versions.
3. Rédiger un guide d'installation utilisateur simple.
4. Tester démarrage, reboot, veille/reprise, fermeture, relance et nettoyage.
5. Facultatif : créer l'installeur Windows, sans l'imposer avant que le zip portable fonctionne.

**Livrables :** guide de première utilisation, procédure de désinstallation.

**Critère de sortie :** utilisation quotidienne sans ouvrir PowerShell/CMD ni installer Java.

### Phase 6 — Release finale et gel

**Tâches :**

1. Exécuter la matrice complète de test ci-dessous.
2. Corriger tous les bugs bloquants et documenter les limitations connues.
3. Vérifier licence, provenance et checksums.
4. Figer versions, produire checksum du zip, numéro de build et release notes.
5. Tagger `v3.0.0` uniquement après validation complète.

**Livrables :** release Windows x64, documentation et rapport de validation.

---

## 13. Matrice de tests détaillée

| ID | Test | Résultat attendu |
|---|---|---|
| T01 | Démarrer sans Java installé | Fonctionne avec JVM privée |
| T02 | Démarrer sans Python installé | EXE fonctionne |
| T03 | Dossier installé déplacé | Chemins résolus sans erreur |
| T04 | Dossier utilisateur avec espaces/accents | Aucun échec de lancement |
| T05 | Démarrer deux fois l'EXE | Une seule instance / pas de double JVM |
| T06 | Port 8081 déjà occupé par autre programme | Erreur claire, aucun kill externe |
| T07 | JAR absent ou corrompu | Échec explicite et diagnostiquable |
| T08 | Runtime Java absent | Échec explicite et diagnostiquable |
| T09 | Runtime incompatible | Erreur explicite, pas d'état RUNNING mensonger |
| T10 | JVM arrêtée brutalement | Tray reste actif, état ERREUR |
| T11 | Arrêter via tray | Seul le serveur possédé est arrêté |
| T12 | Redémarrer via tray | Serveur redevient prêt |
| T13 | Quitter tray | Serveur possédé est arrêté |
| T14 | Test HTTP FR | JSON valide, corrections comparables |
| T15 | Test HTTP EN | JSON valide, corrections comparables |
| T16 | Test Auto court | Même logique et limites qu'avant migration |
| T17 | Test orthographe et grammaire | Règles importantes conservées |
| T18 | Emojis/Unicode | Offsets fiables dans extension |
| T19 | Chrome / textarea | Soulignements et remplacements OK |
| T20 | Brave / contenteditable | Comportement V2 conservé |
| T21 | ChatGPT | Test manuel champ actif, si supporté en V2 |
| T22 | Gmail | Test manuel saisie, si supporté en V2 |
| T23 | WhatsApp Web | Test manuel saisie, si supporté en V2 |
| T24 | LinkedIn | Test manuel saisie, si supporté en V2 |
| T25 | Reddit | Test manuel saisie, si supporté en V2 |
| T26 | Changer rapidement de champ | Pas de résultat obsolète déplacé |
| T27 | Serveur coupé pendant saisie | Extension ne plante pas ; état de panne |
| T28 | Reboot Windows + autostart | Démarrage silencieux et prêt |
| T29 | Désactiver autostart | Aucune relance au démarrage suivant |
| T30 | Veille/réveil | Reprise ou diagnostic cohérent |
| T31 | Réseau désactivé | Correcteur local continue à fonctionner |
| T32 | Machine secondaire du LAN | Port serveur non accessible via IP LAN |
| T33 | Journaux après corrections | Aucune phrase utilisateur conservée |
| T34 | Petit test de charge | Pas de fuite apparente ni blocage UI |
| T35 | Antivirus Windows Defender | Pas de faux positif bloquant, ou limitation documentée |
| T36 | Installer / désinstaller optionnel | Aucune suppression de fichiers tiers |

**Exécution :** marquer chaque test PASS/FAIL/SKIPPED (motif) ; ne jamais écrire PASS sans exécution. Pour les tests sites V2 non encore supportés, inscrire « hors baseline » et ne pas les présenter comme une régression V3.

---

## 14. Critères de qualité chiffrés à adopter

Ce sont des **seuils de recette proposés**, pas des performances déjà mesurées :

- **Correction FR/EN :** même version/configuration LanguageTool => identité ou équivalence documentée des corrections sur le corpus de référence ; aucune perte de règle significative.
- **Fiabilité :** 20 cycles de lancement/arrêt/redémarrage sans processus orphelin ni duplication.
- **Démarrage :** mesurer la moyenne, p95 et pire cold start ; comparer à V2, sans annoncer un seuil arbitraire avant baseline.
- **Latence :** ne pas introduire de surcoût mesurable systématique du chemin HTTP (à version et charge moteur identiques).
- **Consommation mémoire :** mesurer le total Python + JVM, et justifier toute hausse importante.
- **Confidentialité :** zéro requête du moteur vers un service externe lors d'un test à réseau débranché ; aucune sauvegarde du texte utilisateur dans les journaux.
- **Prise en main :** démarrage sans aucune installation séparée de Python ou Java.
- **Couverture :** les tests existants de V1/V2 toujours au vert, sauf régression antérieure explicitement documentée.

---

## 15. Liste des problèmes possibles et plans de secours

### 15.1 « Ça marche sur mon PC mais pas ailleurs »

Cause probable : la distribution utilise encore le Java du PATH, il manque des bibliothèques ou le `.spec` ne regroupe pas les fichiers correctement.

**Action :** exécuter sur une VM Windows propre avec Java et Python absents, répertorier toute dépendance externe et corriger les chemins.

### 15.2 LanguageTool met du temps à démarrer

**Action :** état `STARTING` explicite, UI non bloquante, retries bornés et diagnostic. Ne pas déclencher un serveur à chaque correction.

### 15.3 Serveur déjà actif sur 8081

**Action :** ne jamais tuer le Java existant sans preuve de propriété ; informer et proposer arrêt du conflit ou changement de configuration coordonné, sans casser l'extension.

### 15.4 Le zip/EXE est volumineux

**Action :** c'est normal avec les dictionnaires et une JVM ; analyser les ressources et envisager ensuite un installeur ou un runtime `jlink` validé. Ne pas supprimer à l'aveugle des fichiers de langue.

### 15.5 PyInstaller `onefile` extrait lentement

**Action :** conserver `onedir` ou fournir un installeur unique qui installe le moteur une fois. Ne pas complexifier l'application pour satisfaire uniquement une apparence « un seul fichier ».

### 15.6 Les corrections changent sans explication

**Action :** vérifier que le moteur, les options de langue, le fichier de config et les règles sont identiques. Comparer le corpus d'or, rétablir la baseline avant optimisation.

### 15.7 Le runtime est refusé par un antivirus

**Action :** fournir des binaires de provenance vérifiable, signer le code si distribution publique, tester Defender et éliminer les comportements d'extraction/exécution suspects autant que possible. Ne pas demander de désactiver l'antivirus comme solution par défaut.

### 15.8 CORS/extension/localhost ne communiquent plus

**Action :** conserver endpoint et permissions, vérifier service worker, origine autorisée et options du serveur. Éviter d'ouvrir CORS à `*` sans examen de sécurité.

### 15.9 Correctly marche tant que la tray tourne, puis s'arrête

**Comportement prévu :** « Quitter » arrête le serveur contrôlé. Si l'utilisateur veut le laisser tourner, il doit fermer les menus sans quitter la tray. Prévoir une formulation claire dans l'interface.

---

## 16. Builds reproductibles et commandes envisagées

Les scripts doivent être adaptés au dépôt réel.

### 16.1 Préparation environnement Windows

```powershell
cd windows-server
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements-build.txt
```

**Remarque :** Python 3.11 est un exemple de version de build ; choisir et épingler celle qui est compatible avec le projet existant et les dépendances PyInstaller/pystray/Pillow. Aucun Python système ne sera exigé de l'utilisateur final.

### 16.2 Scripts attendus

```powershell
# télécharge ou copie uniquement les versions validées, vérifie checksums
.\scripts\prepare_vendor.ps1

# construit un bundle one-folder via le .spec
.\scripts\build_windows.ps1

# contrôle l'EXE et les endpoints avant release
.\scripts\smoke_test_windows.ps1
```

Ne pas inventer une URL de téléchargement ou une commande Java universelle tant que la version du snapshot et son `--help` n'ont pas été vérifiés.

### 16.3 Résultat attendu

```text
dist/Correctly-V3-Windows-x64/
  CorrectlyServer.exe
  runtime/...
  engine/...
  licenses/...
  README_INSTALL.md
```

Puis une archive :

```text
Correctly-V3-Windows-x64.zip
```

Une commande simple pour l'utilisateur : **extraire le dossier, lancer `CorrectlyServer.exe`**, laisser la tray active et activer l'extension.

---

## 17. Documentation à livrer

1. `README_INSTALL.md` : prérequis, installation en 3 étapes, démarrage avec Windows, fonctionnement offline, désinstallation.
2. `ARCHITECTURE_V3.md` : schéma précis, pourquoi Java est embarqué et non remplacé, contrat API, options.
3. `MIGRATION_V2_V3.md` : changements réellement effectués, impacts, compatibilité des paramètres.
4. `DEPENDENCIES.md` : versions Java/LT/Python, sources et sommes SHA-256.
5. `SECURITY.md` : loopback, logs, CORS, permissions et limites du modèle de confidentialité.
6. `BENCHMARKS_V3.md` : mesures avant/après, environnement exact, médiane et p95.
7. `RELEASE_CHECKLIST.md` : tableau de tests horodaté avec PASS/FAIL/SKIPPED et notes.
8. `LICENSES-THIRD-PARTY.md` : notices et conditions des composants réellement distribués.

---

## 18. Décisions importantes à ne pas oublier

### Décision A — Python orchestre, LanguageTool corrige

C'est la seule décision qui garantit un **risque minimal de perte de qualité** sans recréer un correcteur grammatical FR/EN complet. Elle ne signifie pas que Java a disparu du runtime.

### Décision B — Pas de FastAPI en V3 initiale

Le client dispose déjà du endpoint LanguageTool ; ajouter Python comme reverse proxy n'aiderait ni la qualité ni la simplicité. Le contrôle de processus Java par Python suffit.

### Décision C — `onedir` d'abord, installateur ensuite

Les composants LanguageTool/JVM sont volumineux ; un dossier autonome empaqueté est plus simple à maintenir qu'un EXE géant qui les extrait à chaque lancement.

### Décision D — V2 et V3 sont deux axes indépendants

V2 = fiabilité des éditeurs et interactions du navigateur.  
V3 = distribution, exécution et ergonomie Windows.  
On peut fusionner les deux une fois qu'ils sont testés, mais ne pas attribuer à V3 les fonctionnalités V2 encore en projet.

### Décision E — Aucun accès externe

L'application doit rester utilisable hors ligne, et les textes ne doivent pas être envoyés vers un service cloud.

---

## 19. Message de mission prêt à copier à l'agent Codex

> Tu travailles sur mon dépôt **Correctly**. Lis d'abord `RESUME.md` et `PLAN_V3.md`, puis inspecte réellement le code source existant. Implémente une V3 qui conserve l'extension TypeScript/V2 et la **même qualité de LanguageTool FR/EN**, sans installation manuelle de Java. Le programme Windows **Python + pystray**, compilé avec PyInstaller, doit embarquer une distribution complète du **moteur LanguageTool actuel** et un **runtime Java privé compatible**, démarrer `javaw.exe` localement sur `127.0.0.1:8081`, continuer à exposer `/v2/check`, afficher l'état dans la tray, autoriser démarrage/arrêt/redémarrage, gérer les conflits de port, le démarrage automatique facultatif et les diagnostics sans journaliser le texte utilisateur. N'ajoute pas FastAPI/Django ni de nouveau moteur de correction. Réutilise les modules existants ; pas de régression de la V1/V2. Commence par auditer le dépôt, relever les versions et produire une baseline de tests et de réponses FR/EN. Développe ensuite par phases, avec tests automatiques et une sortie **Windows x64 `onedir`** déplaçable. La validation finale doit inclure une machine Windows sans Java/Python installés, des tests Chrome/Brave, et un rapport PASS/FAIL. Ne prétends pas avoir testé ce que tu n'as pas exécuté. Ne change pas silencieusement la version LanguageTool ni les règles.

---

## 20. Définition de « V3 terminée »

La V3 est terminée **uniquement si** :

- [ ] Aucun Java ni Python n'a besoin d'être installé par l'utilisateur final.
- [ ] L'extension Correctly existante fonctionne sans modification majeure.
- [ ] `POST /v2/check` conserve le contrat existant.
- [ ] Les corrections françaises et anglaises sont équivalentes à la baseline.
- [ ] Le lanceur utilise **exclusivement** son runtime Java embarqué.
- [ ] Le serveur démarre sans console visible et une icône apparaît près de l'horloge.
- [ ] Démarrer / arrêter / redémarrer / quitter fonctionnent correctement.
- [ ] Une seconde instance n'ouvre pas de seconde JVM.
- [ ] Aucun Java extérieur n'est tué lors de l'arrêt.
- [ ] Le serveur n'écoute pas sur l'adresse réseau publique.
- [ ] Le texte utilisateur n'est pas écrit dans les logs.
- [ ] Le paquet reste utilisable hors ligne.
- [ ] L'autostart est optionnel et désactivable.
- [ ] Le dossier `onedir` fonctionne après déplacement et sur un Windows propre.
- [ ] Les suites de tests V1/V2 restent valides ou leurs exclusions sont justifiées.
- [ ] La documentation, les licences et le rapport de recette sont fournis.

---

## 21. Ressources techniques de référence

- API HTTP LanguageTool : https://dev.languagetool.org/http-server.html
- Documentation LanguageTool et prérequis Java : https://dev.languagetool.org/java-api
- Distribution standalone LanguageTool : https://github.com/languagetool-org/languagetool/tree/master/languagetool-standalone
- PyInstaller, chemins des fichiers empaquetés : https://pyinstaller.org/en/stable/runtime-information.html
- PyInstaller, différences one-folder / one-file : https://pyinstaller.org/en/stable/operating-mode.html
- Eclipse Temurin, conditions et sources du runtime : https://adoptium.net/fr/docs/faq

> **Note finale :** Ce document décrit une stratégie précise mais ne remplace pas un audit du dépôt, du snapshot LanguageTool, du runtime compatible et de la licence de redistribution. Les arborescences, exemples de code et paramètres JVM sont des guides de réalisation à vérifier lors de l'implémentation réelle.
