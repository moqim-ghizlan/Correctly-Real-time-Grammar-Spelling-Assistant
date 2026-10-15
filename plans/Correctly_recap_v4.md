# Récapitulatif du projet Correctly

Dernière mise à jour : 15 octobre 2026

Correctly est une extension Chrome/Brave qui souligne et aide à corriger les erreurs en français et en anglais. Le moteur LanguageTool tourne localement sur le PC. Le projet a évolué d’une extension de base vers une application Windows installable, avec son moteur Java inclus.

## Versions

### V1 — `v1.0.0`

Première version publiée de l’extension Manifest V3. Elle établit le parcours principal : détecter les erreurs dans les champs d’écriture, les souligner et proposer des corrections à appliquer. L’extension communique avec un serveur LanguageTool local ; aucun service cloud Correctly n’est utilisé. Les bases du projet, les tests et la documentation sont également en place.

Le rapport navigateur V1 est dans [`docs/BROWSER_VERIFICATION.md`](../docs/BROWSER_VERIFICATION.md). Les tests manuels sur les différents sites sont suivis dans [`docs/MANUAL_TESTS.md`](../docs/MANUAL_TESTS.md).

### V2 — `v2.0.0`

La V2 améliore la détection des éditeurs et la fiabilité pendant la saisie :

- elle suit l’éditeur actif au fil des interactions au lieu de balayer tous les champs de la page ;
- elle prend en charge davantage de champs et les éditeurs riches, dont les `contenteditable` et les Shadow DOM ouverts ;
- elle gère les textes longs en analysant le paragraphe autour du curseur ;
- elle ajoute ou consolide les langues FR/EN/Auto, les paramètres, les domaines désactivés et le dictionnaire personnel ;
- elle évite d’enregistrer le texte saisi sur disque.

Le contrat avec LanguageTool reste local. Les tests automatisés et des parcours de développement dans Brave avec le moteur réel ont été exécutés. Les tests manuels sur des comptes et sites réels restent à faire. Le suivi se trouve dans [`docs/V2.md`](../docs/V2.md).

### V3 — version portable Windows

La V3 garde le moteur de correction et l’extension V2, et ajoute une application Windows qui lance et surveille le serveur :

- serveur Python empaqueté dans `CorrectlyServer.exe` ;
- runtime Java et LanguageTool inclus dans le paquet ; Java, Python et Node.js ne sont donc pas requis chez l’utilisateur ;
- icône dans la zone de notification Windows pour démarrer, arrêter ou redémarrer le moteur ;
- écoute locale sur `127.0.0.1:8081` ;
- diagnostics sans sauvegarder le texte des utilisateurs.

Un paquet portable Windows a été construit. Les tests automatisés, le contrôle de l’extension dans Brave et les tests du paquet ont réussi. La recette complète sur Windows vierge, les tests Chrome et les parcours authentifiés sur des sites réels n’ont pas été achevés. Le rapport est dans [`docs/RELEASE_CHECKLIST.md`](../docs/RELEASE_CHECKLIST.md).

### V3.1 — `v3.1.0`

La V3.1 ajoute un installateur Windows par utilisateur et la gestion du démarrage à l’ouverture de session :

- `Correctly-V3.1-Setup.exe` installe le serveur et son moteur embarqué ;
- l’option de démarrage avec Windows est visible et activée par défaut ;
- mise à jour et désinstallation ciblent l’instance Correctly concernée et protègent les raccourcis d’autres installations ;
- l’extension Chrome/Brave reste à installer séparément, avec le ZIP fourni.

La compilation finale, les tests automatisés et 13 contrôles isolés de l’installateur ont réussi. Le rapport documente aussi les limites restantes : installation réelle sur Windows vierge, redémarrage Windows, fermeture d’une instance installée pendant une mise à jour/désinstallation, sites authentifiés, SmartScreen/antivirus et vérification finale des conditions de redistribution. Voir [`docs/V3.1_RAPPORT.md`](../docs/V3.1_RAPPORT.md) et [`docs/V3.1_INSTALLATION.md`](../docs/V3.1_INSTALLATION.md).

Le tag Git `v3.1.0` pointe sur le commit `03cb122`, dernier commit au moment de cette mise à jour. Les changements V4 sont présents dans l’arbre de travail mais ne sont pas encore commités ; les nouveaux modules, rapports V4 et ce récapitulatif sont également non suivis. Ils ne font donc pas partie du tag V3.1. Aucun tag V4 n’existe à ce stade.

### V4 — candidate RC1 du 15 octobre 2026

La V4 ajoute deux fonctions principales à l’extension : les **raccourcis de texte personnels** et la **correction groupée par phrase**. Elle conserve le serveur local de la V3.1, son port `8081`, ses runtimes embarqués et la gestion du démarrage Windows.

#### Raccourcis de texte

- Une section dans les paramètres permet de créer, modifier, activer, désactiver et supprimer des raccourcis, avec confirmation de suppression et validation des doublons. Jusqu’à 500 entrées sont prises en charge, sans exemples enregistrés automatiquement.
- Par exemple, après avoir enregistré `bjr → Bonjour`, saisir `bjr ` produit `Bonjour ` ; `bjr,` produit `Bonjour,`, avec un seul séparateur. Le remplacement respecte les frontières du mot : `abjr` reste intact. La détection gère Unicode et ignore la casse, tandis que le texte de remplacement est conservé tel que défini.
- L’expansion fonctionne sans LanguageTool et même si la correction générale est désactivée. Elle respecte son propre interrupteur et les domaines désactivés. Un collage ne déclenche pas l’expansion ; Tab et Entrée ne sont pas capturés.
- Les raccourcis restent dans `chrome.storage.local`, par profil de navigateur, sans synchronisation Chrome/Brave. Les modifications indépendantes de plusieurs pages de paramètres sont fusionnées ; les conflits sur une même entrée sont refusés. En cas de données corrompues, elles sont conservées et une erreur est affichée.

#### Correction par phrase et annulation

- La correction par phrase est activée par défaut. Depuis une suggestion, chaque changement doit être coché explicitement ; une liste permet de choisir une autre proposition. L’aperçu avant/après suit exactement ces choix, appliqués en une seule modification. Les mots non cochés restent intacts, notamment les noms propres. La portée reste la phrase cliquée, et les corrections individuelles restent disponibles.
- L’automatisation à une fin de phrase sûre se limite à trois règles d’espacement : `WHITESPACE_RULE`, `COMMA_PARENTHESIS_WHITESPACE` et `CONSECUTIVE_SPACES`. Elle exige une suggestion unique, sans modifier les caractères non blancs ni les retours à la ligne. Les autres corrections passent par une action explicite ; une pause de frappe ne suffit pas à autoriser une réécriture.
- Avant toute modification, l’extension vérifie notamment le texte exact, les offsets, la sélection, le focus, la composition IME et la validité de la réponse. Les conflits et résultats périmés empêchent l’application. La détection de phrase est bornée à 5 000 unités UTF-16 ; un fragment tronqué n’autorise pas de modification automatique.
- Le bouton « Annuler la modification Correctly » permet de revenir en arrière tant que le texte n’a pas changé. Ctrl+Z conserve son fonctionnement natif, qui dépend de l’éditeur.

Les nouvelles modifications prennent en charge les champs `input` de type texte, les `textarea` et les `contenteditable` composés d’un seul nœud texte. Elles s’abstiennent dans les structures riches complexes, les éditeurs de code et les frameworks identifiés. Les champs sensibles identifiables, en lecture seule ou désactivés sont protégés ; les inputs email/url/search/tel ne reçoivent pas ces nouvelles modifications. Les suggestions historiques restent accessibles dans les champs déjà compatibles.

#### Implémentation et outils ajoutés

Le module [`v4-editing.ts`](../frontend/src/content/v4-editing.ts) gère les transactions d’édition, l’expansion et la planification des corrections par phrase. Le stockage dédié est dans [`shortcuts.ts`](../frontend/src/shared/shortcuts.ts), et l’interface dans [`shortcuts-ui.ts`](../frontend/src/options/shortcuts-ui.ts). Le contrôleur de correction, la détection des champs et la fenêtre de suggestions intègrent ces fonctions. Aucune nouvelle permission de navigateur, dépendance, télémétrie ou infrastructure cloud n’est ajoutée.

Les scripts de construction produisent désormais le Setup RC1. [`refresh-extension.ps1`](../scripts/refresh-extension.ps1) permet d’actualiser le ZIP de l’extension et ses empreintes en vérifiant le Setup existant ; [`verify-release.py`](../scripts/verify-release.py) contrôle les SHA256 et le contenu du ZIP par rapport à `dist/`. Le harnais navigateur couvre les parcours V4 et un benchmark comparatif. Le contrôle de l’icône Windows a aussi été renforcé pour vérifier l’achèvement réel de l’action FR/EN.

#### Validation et statut de livraison

Après les deux [feedbacks manuels](../docs/feedback.md), des défauts de segmentation de l’aperçu, de maintien des suggestions au clic, de passage à la seconde phrase et d’expansion sur espace insécable ont été corrigés. Les changements groupés sont désormais choisis individuellement, sans présélection : l’exemple avec `Moqim` a été vérifié dans Brave en conservant le prénom et en traitant les deux phrases séparément. La validation passe à **223 tests frontend**, avec une matrice Brave sur input, textarea et contenteditable simple. Voir le [rapport des correctifs](../docs/Correctly_feedback_report_v4.md) pour les preuves et les cas restant à retester, notamment ChatGPT et l’input initialement signalé. Seul `dist/` a été recompilé ; le Setup et le ZIP RC1 n’intègrent pas ces correctifs.

Le [rapport V4](../docs/V4_TEST_REPORT.md) consigne les résultats suivants, obtenus lors de la préparation de la candidate :

| Contrôle                           | Résultat documenté                                     |
| ---------------------------------- | ------------------------------------------------------ |
| Tests frontend                     | 209 tests réussis, dont 150 historiques et 59 nouveaux |
| Tests backend                      | 64 tests réussis                                       |
| Lint, formatage et compilation     | Réussis                                                |
| Parcours automatisés Brave         | Historiques et V4 réussis avec le moteur local réel    |
| Construction Windows et Setup      | Réussie, avec smoke test du paquet                     |
| Installateur isolé / icône Windows | 13 contrôles / 5 contrôles réussis                     |
| Intégrité de livraison             | SHA256 et 13 fichiers du ZIP vérifiés                  |

Le benchmark local comparé à V3.1 ne montre pas d’explosion du temps de traitement des événements sur les longueurs testées (100, 5 000 et 50 000 unités UTF-16). Sa portée reste limitée : il ne mesure ni la latence complète de frappe ni les fuites mémoire sur une longue session.

Le lancement automatisé Chrome a échoué avec `Extension service worker not found` : la compatibilité Chrome reste à vérifier manuellement. Les tests Brave réussis ne certifient pas les sites authentifiés et éditeurs complexes non testés.

La version npm et le nom affiché sont `4.0.0-rc.1`. La version numérique de l’extension et du Setup est `3.99.0`, pour réserver `4.0.0` à la validation finale ; le serveur reste identifié `3.1.0`. Le Setup candidat et le ZIP séparé ont été construits, avec les sommes SHA256 actualisées. Aucun tag ni publication V4 n’a été effectué. Les validations restantes sont détaillées dans la [checklist V4](../docs/V4_RELEASE_CHECKLIST.md). La [note de version](../docs/V4_CHANGELOG.md) et l’[audit technique](../docs/V4_AUDIT.md) complètent ce récapitulatif.

## Organisation actuelle

- `frontend/` : code TypeScript, interface, manifeste et tests de l’extension.
- `backend/` : serveur Windows, tests, ressources et fichiers nécessaires à sa fabrication.
- `installer/` : définition de l’installateur Windows.
- `scripts/` : scripts de développement, vérification et compilation.
- `docs/` : guides et rapports.
- `plans/` : plans de version et r?capitulatif du projet.
- `dist/` : extension compilée à charger dans Chrome ou Brave.
- `artifacts/release/` : installateur, ZIP de l’extension et checksums pour distribution.

Les dépendances de développement (`node_modules/`, `backend/.venv/`, `backend/vendor/`) sont locales et ignorées par Git. Elles permettent de reconstruire le projet sur cette machine. Les fichiers de `artifacts/` sont des résultats de compilation et des archives, pas du code source.

## Où trouver les fichiers à envoyer

Dans `artifacts/release/` :

- `Correctly-V4-RC1-Setup.exe` installe le serveur et le moteur Windows pour la candidate V4 ;
- `Correctly-Extension.zip` contient l’extension à charger séparément dans Chrome/Brave ;
- `SHA256SUMS.txt` donne les empreintes pour vérifier les deux fichiers.

`release-manifest.json` décrit également les artefacts et leurs versions. Les anciens Setup V3.1 sont conservés à titre historique ; les checksums courants désignent la candidate V4. Les paquets `v4-installer-test` et `v4-upgrade-base` servent uniquement à la recette isolée.

Le Setup ne peut pas installer l’extension silencieusement dans le profil Chrome ou Brave. Il faut charger le contenu de l’archive ZIP via la page des extensions du navigateur et activer le mode développeur, conformément au guide [`docs/INSTALL_EXTENSION.md`](../docs/INSTALL_EXTENSION.md).

## Construire le projet

Depuis la racine du dépôt :

```powershell
# Recompiler l’extension dans dist/
npm run build

# Reconstruire l’extension, le serveur et l’installateur
.\createSetup.cmd
```

Les commandes de test et de qualité de l’extension sont `npm test` et `npm run lint`. Le guide racine [`README.md`](../README.md) contient les prérequis et les autres commandes.

## À faire pour préparer une diffusion complète

1. Installer le Setup sur un Windows propre, sans Java, Python ou Node.js, puis vérifier le premier lancement.
2. Redémarrer Windows et vérifier le démarrage automatique, puis le désactiver et le réactiver depuis l’application.
3. Tester une mise à jour et une désinstallation pendant que l’application installée tourne.
4. Tester l’extension dans Chrome et Brave sur des pages réelles, notamment ChatGPT, Gmail, WhatsApp Web, LinkedIn et Reddit, avec des comptes de test.
   Vérifier aussi les raccourcis après fermeture complète/réouverture du navigateur puis redémarrage Windows, ainsi que l’IME réel et les éditeurs contrôlés. Le rechargement de la page de paramètres a été testé, pas ces redémarrages.
5. Vérifier les licences, la provenance des archives Java/LanguageTool et les conditions de redistribution commerciale avant diffusion publique.
6. Vérifier le comportement de Microsoft Defender/SmartScreen et décider si les exécutables doivent être signés.
7. Après validation et approbation de la recette finale, attribuer `4.0.0`, reconstruire les livrables, recalculer les empreintes et actualiser les rapports avant de créer le tag ou publier.

Ces étapes sont des validations restantes ; la compilation réussie et la recette isolée ne les remplacent pas. Le suivi actuel est dans [`docs/V4_RELEASE_CHECKLIST.md`](../docs/V4_RELEASE_CHECKLIST.md), avec les preuves dans [`docs/V4_TEST_REPORT.md`](../docs/V4_TEST_REPORT.md). Les rapports V3.1 et leur [checklist historique](../docs/V3.1_RECETTE_CHECKLIST.md) restent disponibles.
