# Correctly V4 — diagnostic du feedback manuel

Date : 15 octobre 2026. Source : [feedback.md](feedback.md).

Les scénarios locaux ci-dessous sont vérifiés. Le signalement initial sur ChatGPT et celui de l’input de la capture ne sont pas déclarés entièrement résolus : leur environnement exact n’a pas été reproduit. Aucun EXE, Setup, ZIP de release, commit, tag ou publication n’a été produit pendant cette intervention. Seule l’extension dans `dist/` a été recompilée pour les essais.

## Mise à jour — nouveau feedback, correction partielle et prénom

Cette seconde intervention porte sur le **bug 1 bis** ajouté à `feedback.md`. La validation finale passe de 218 à **223 tests frontend**, avec lint, compilation de l’extension et parcours Brave réussis. Les sections suivantes conservent l’historique de la première intervention.

### Périmètre et origine de `Moqim → Mois`

La limite à une phrase correspond au produit actuel : « Corriger cette phrase » ne promet pas de corriger tout le champ. Plusieurs mots de la même phrase étaient bien corrigés ; présenter ce comportement comme une correction limitée à un seul mot serait inexact.

L’appel réel au serveur local `/v2/check`, en français, avec le texte du nouveau feedback retourne notamment les propositions ci-dessous. Les offsets correspondent exactement aux fragments : le prénom n’était pas remplacé à cause d’un décalage d’offset.

| Offset / longueur | Fragment   | Règle LanguageTool              | Proposition / traitement                                                                                       |
| ----------------- | ---------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 14 / 8            | `appelles` | `ACCORD_R_PERS_VERBE`           | `appelle`, proposée dans la première phrase                                                                    |
| 23 / 5            | `Moqim`    | `FR_SPELLING_RULE`              | `Mois` en premier, puis notamment `Moi` ; proposition discutable conservée uniquement si choisie explicitement |
| 40 / 8            | `Français` | `LANGUES`                       | `français`, proposée dans la première phrase                                                                   |
| 56 / 1            | `5`        | `NOMBRES_EN_LETTRES_2_IMPROVED` | `cinq`, suggestion de style exclue par le filtre de catégories existant                                        |
| 58 / 2            | `an`       | `AGREEMENT_NUMERAL_PLURAL`      | `ans`, proposée dans la première phrase                                                                        |
| 64 / 6            | `aimera`   | `ACCORD_R_PERS_VERBE`           | `aimerai`, proposée séparément dans la seconde phrase                                                          |

Cause confirmée du risque : le planificateur prenait `replacements[0]` pour toutes les propositions de la phrase. Un aperçu global existait, mais aucun moyen ne permettait de retirer une seule correction ou de choisir une autre proposition. Le contrat frontend ne contient pas de score de confiance permettant de certifier les noms propres ; aucune détection infaillible de prénom n’est ajoutée.

Avant correctif, le test `never applies the first spelling suggestion to a name without an explicit choice` échouait : le contrôleur acceptait de modifier la phrase sans sélection explicite. Après correction, cet appel est refusé.

### Choix individuels et aperçu fidèle

- Toutes les propositions groupées sont **décochées initialement**, y compris une suggestion unique. Le bouton reste désactivé tant qu’aucune modification applicable n’a été choisie.
- Chaque ligne montre le fragment original, l’explication du moteur et une liste permettant de choisir le remplacement. Une proposition non cochée conserve le texte original, notamment `Moqim`.
- L’aperçu avant/après est recalculé à chaque changement de case ou de remplacement. L’application reçoit exactement ces choix, vérifie qu’ils appartiennent toujours à l’analyse courante, puis utilise le même planificateur et une seule transaction.
- Les doublons, chevauchements sélectionnés, remplacements étrangers aux suggestions, propositions d’une autre phrase et résultats périmés sont refusés. Les conflits sont expliqués dans le panneau ; désélectionner une proposition permet de conserver l’autre.
- Les matches sans remplacement applicable sont comptés et signalés, sans faire croire qu’ils seront corrigés.
- Le panneau précise « Phrase courante uniquement », avertit sur les noms propres et indique que LanguageTool ne garantit pas une reformulation complète. Les suggestions individuelles restent disponibles.
- Les cases et menus de choix peuvent prendre le focus. La sélection de l’éditeur est sauvegardée à l’ouverture, puis restaurée avant application uniquement si son texte est intact. Les protections IME, champs sensibles et éditeurs riches restent inchangées.

### Autre défaut confirmé : passage à la seconde phrase

Lorsque l’analyse portait seulement sur une première phrase commençant à l’offset 0, déplacer le curseur dans la seconde pouvait ne déclencher aucune nouvelle analyse : `selectionChanged` comparait seulement le début de la fenêtre, également 0 pour le paragraphe complet. La fin de fenêtre est désormais comparée elle aussi.

Le test `analyzes the second sentence after leaving a first-sentence window at offset zero` échouait avant correctif : le dernier appel concernait toujours `Je sui ici.` au lieu de `Tu es la.`. Il passe après correction. Brave vérifie aussi ce parcours : la seconde phrase devient analysable et applicable séparément, sans corriger la première.

### Vérifications et fichiers de cette seconde intervention

Les cinq nouveaux tests couvrent le refus d’application implicite sur un prénom, le choix exact d’une alternative en conservant un nom décoché, les offsets de deux phrases, les doublons/conflits et le passage entre fenêtres de phrase. Les tests existants sont adaptés à la sélection explicite, sans supprimer leurs assertions sur les résultats périmés, l’annulation ou les modifications automatiques prudentes.

Fichiers concernés : `v4-editing.ts` (modèle de revue et choix validés), `correction-controller.ts` (application explicite et fenêtre), `suggestion-popup.ts` (cases, alternatives, aperçu et portée), `editor-adapter.ts` (restauration de sélection), `application.ts` (transmission des choix), tests V4/interface, fixture et harnais Brave. Le backend, les versions et le packaging restent inchangés.

| Scénario                                              | Résultat observé                                                                                          |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Une phrase, input / textarea / contenteditable simple | Réussi dans Brave : choix réel par case, aperçu et application                                            |
| Deux phrases avec fautes dans chacune                 | Réussi : sélection et offsets propres à chaque phrase, aucun remplacement de l’autre phrase               |
| Exemple complet du nouveau feedback                   | Réussi dans Brave : `appelles`, `Français` et `an` choisis ; `Moqim` et toute la seconde phrase conservés |
| Traitement séparé de la seconde phrase de l’exemple   | Réussi dans Brave : `aimera → aimerai`, première phrase conservée                                         |
| Nom propre proposé par LanguageTool                   | Réussi : aucune présélection ; test d’interface et test navigateur de conservation de `Moqim`             |
| Suggestions conflictuelles ou dupliquées              | Refus sûr vérifié en tests ; un choix compatible isolé reste applicable                                   |
| Motif de troncature, champ exclu, résultat périmé     | Protections et tests précédents conservés                                                                 |
| ChatGPT réel, Chrome et véritables contrôles React    | Non vérifiés pendant cette intervention ; aucune nouvelle compatibilité revendiquée                       |

Commandes finales : `npm test` (**223 réussites, 11 fichiers**), `npm run lint` (réussi), `npm run build` (réussi, extension seule), `node scripts/verify-browser.mjs --v4` (réussi, Brave et LanguageTool réel). Le premier harnais de choix cherchait le fragment `sui`, alors que le moteur réel retournait ici le fragment `Je sui` ; cette hypothèse du test a été corrigée avant de retenir le résultat navigateur. Un lint intermédiaire a également été corrigé dans un test.

### Recette manuelle actualisée

1. Recharger l’extension pointant sur `dist/`, puis recharger les pages. Le ZIP et le Setup RC1 n’ont pas été actualisés.
2. Sur la page `npm run fixture`, utiliser le champ « Revue de deux phrases et d’un prénom », contenant l’exemple du feedback.
3. Cliquer sur une faute de la première phrase. Vérifier que les choix concernent seulement cette phrase, que toutes les cases sont décochées et que le bouton est désactivé.
4. Cocher `appelles → appelle`, `Français → français` et `an → ans`. Laisser `Moqim` décoché. Vérifier l’aperçu, puis appliquer : le prénom et toute la seconde phrase doivent rester intacts. Tester Annuler immédiatement.
5. Déplacer le curseur vers la seconde phrase, attendre l’analyse, puis ouvrir sa suggestion. Vérifier sa portée propre et choisir la correction souhaitée. Une formulation maladroite peut rester présente après les suggestions du moteur : cette fonction ne reformule pas le texte.
6. Sur une proposition offrant plusieurs remplacements, changer la liste puis vérifier que l’aperçu et le résultat appliqué correspondent exactement au choix. Décocher la proposition doit rétablir son fragment original dans l’aperçu.
7. Refaire ces essais dans l’input et le contenteditable simple, puis sur ChatGPT. Une exclusion d’éditeur doit rester explicite. Les étapes de raccourci, IME, collage et domaine désactivé de la première recette restent pertinentes.

### Évolution possible, non implémentée : tout le champ

Une commande distincte « Corriger tout le texte » demanderait une revue regroupant plusieurs phrases, une sélection individuelle des propositions, la collecte des analyses nécessaires et des tests de transaction/annulation sur le champ complet. Estimation indicative : **2 à 4 jours de développement et recette** pour les champs simples déjà pris en charge, à préciser selon la gestion des textes dépassant 5 000 unités UTF-16 ; hors nouveaux éditeurs riches et packaging Windows. Cette évolution n’est pas ajoutée silencieusement et ne constituerait toujours pas une reformulation linguistique complète.

## Audit et causes confirmées

### 1. Correction groupée absente

Le contrôleur construisait le segment à analyser avec `sentenceAt(texte, curseur)`, qui ne lit que le texte avant le curseur. Ce même segment servait ensuite à l’aperçu. Avec `Je sui ici` et le curseur à la position 1, LanguageTool recevait le texte complet via la fenêtre d’analyse, mais le segment de l’aperçu était seulement `J`. La faute `sui` se trouvait hors du segment ; l’aperçu retournait `null` et le panneau masquait toute commande groupée.

Preuve avant correctif : le nouveau test `reviews the whole sentence when analysis starts with the caret near its beginning` échouait (`null` au lieu de `Je suis ici`). Après correction, il passe. Le navigateur Brave confirme l’aperçu avant/après et l’application dans input, textarea et contenteditable simple, même sans ponctuation finale et avec le curseur près du début.

L’aperçu explicite cible désormais la phrase contenant la faute cliquée, indépendamment du curseur. La segmentation automatique de fin de phrase conserve ses règles prudentes. Les fragments tronqués et les phrases dépassant 5 000 unités UTF-16 sont refusés pour le groupement manuel.

Autre cause possible du signalement ChatGPT : `canTransform` exclut explicitement `.ProseMirror`, Slate, Quill, Lexical et les structures riches complexes. Cette exclusion est confirmée dans le code et les tests, mais le DOM de la session ChatGPT de l’utilisateur n’a pas été inspecté. Le panneau affiche désormais la raison d’indisponibilité : éditeur non pris en charge, correction désactivée, résultat périmé, phrase tronquée/trop longue ou absence de propositions groupables/conflit.

### 2. Raccourci dans un input

Le problème initial n’est pas reproduit dans un `input type="text"` simple : `cpg` reste intact sans séparateur, puis `cpg `, `cpg,` et `cpg.` produisent `Ce n'est pas grave` avec le séparateur conservé. Les trois cas passent dans les tests unitaires, y compris moteur indisponible et correction générale désactivée, et avec une vraie saisie dans Brave. Aucune cause d’échec propre à l’input de la capture n’est donc confirmée. Le séparateur, le type réel, les attributs sensibles et un éventuel framework restent à vérifier sur ce champ.

Un défaut supplémentaire a été reproduit dans un contenteditable simple : Brave insère l’espace final sous forme d’espace insécable U+00A0 (`cpg&nbsp;`), tandis que `shortcutExpansion` ne reconnaissait que l’espace ASCII et la ponctuation. Le harnais navigateur a échoué sur ce cas ; un test unitaire ajouté ensuite échouait également avant correction. U+00A0 est désormais reconnu et conservé, sans élargir le déclenchement à Tab, Entrée ou au collage. La matrice de saisie réelle passe après correction.

### 3. Correction individuelle intermittente

Le contrôleur mémorisait l’offset d’une fenêtre de phrase à l’analyse, mais le comparait à celui d’une fenêtre de paragraphe lors de `selectionchange`. Exemple : analyser `Before. Je sui ici.` depuis la fin produit une fenêtre commençant à 8 ; déplacer le curseur sur `sui` calcule une fenêtre de paragraphe à 0. Le contrôleur effaçait alors les suggestions bien que leur texte source soit encore valide, ce qui pouvait supprimer le soulignement avant le clic.

Preuve avant correctif : `keeps valid individual suggestions when clicking inside an analyzed second sentence` échouait, car les matches devenaient `[]`. Après correction, les suggestions restent disponibles tant que la sélection demeure dans le texte analysé. Le scénario clic réel → suggestion → remplacement dans la deuxième phrase passe dans Brave sur les trois champs compatibles.

Les résultats tardifs restent invalidés lorsque la sélection change pendant une requête ; les vérifications du texte exact et des offsets sont conservées. Un refus d’application individuelle ou groupée produit maintenant un message accessible, au lieu d’échouer silencieusement. Cette correction prouve le scénario reproduit ; elle ne permet pas de garantir que tous les échecs intermittents observés sur des sites tiers avaient cette même cause.

## Fichiers et choix

- `frontend/src/content/v4-editing.ts` : segmentation destinée à la revue explicite, indication de troncature et séparateur U+00A0.
- `frontend/src/content/correction-controller.ts` : aperçu associé au match, contrôle du périmètre déjà analysé lors d’un changement de sélection et raisons d’indisponibilité.
- `frontend/src/content/suggestion-popup.ts` : aperçu avant/après et explication quand le groupement est indisponible.
- `frontend/src/content/application.ts` : affichage d’un message en cas de refus d’édition, nettoyé lors d’une nouvelle saisie ou d’un changement de champ.
- `frontend/tests/unit/v4.test.ts` et `interface.test.ts` : neuf nouveaux cas, dont les trois reproductions échouant avant leur correctif.
- `frontend/tests/fixtures/fields.html` : contenteditable simple, champ OTP et indications de test des séparateurs, en complément des champs riches et exclus existants.
- `scripts/verify-browser.mjs` : matrice des trois champs compatibles, raccourci `cpg`, clics individuels dans une deuxième phrase et revue sans ponctuation depuis le début de la phrase.

Le moteur de remplacement existant est réutilisé. Le backend, les permissions, les dépendances, les versions et les scripts de packaging n’ont pas été modifiés pour ces corrections. La grammaire n’est jamais appliquée automatiquement par ces changements ; l’automatisation reste limitée aux règles d’espacement existantes.

## Validation observée

| Commande                                                                        | Résultat                                                                             |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `npm test -- frontend/tests/unit/v4.test.ts` avant les deux premiers correctifs | 2 échecs attendus, 62 réussites                                                      |
| Même commande avant le correctif U+00A0                                         | 1 échec attendu, 66 réussites                                                        |
| `npm test` final                                                                | 218 tests réussis dans 11 fichiers                                                   |
| `npm run lint`                                                                  | Réussi                                                                               |
| `npm run build`                                                                 | Réussi, extension uniquement                                                         |
| `node scripts/verify-browser.mjs --v4` final                                    | Réussi, Brave avec le serveur LanguageTool réel déjà actif, laissé en fonctionnement |

Le premier lancement de Vitest en sandbox a échoué avant l’exécution des tests à cause d’un refus d’accès esbuild ; la réexécution autorisée hors sandbox a permis les reproductions. Un premier lint a signalé deux fonctions de test `async` sans `await` ; elles ont été corrigées. Le premier parcours contenteditable a révélé le défaut U+00A0, puis a réussi après correction. Ces essais intermédiaires ne sont pas comptés comme des validations réussies.

## Matrice finale

« Réussi » désigne le scénario local testé, avec le vrai navigateur Brave ; ce n’est pas une certification de tous les sites utilisant ce type de champ.

| Champ                                            | Correction individuelle                     | Correction groupée                            | Raccourci                                             |
| ------------------------------------------------ | ------------------------------------------- | --------------------------------------------- | ----------------------------------------------------- |
| Input texte simple                               | Réussi, clic dans une deuxième phrase       | Réussi, aperçu avant/après et application     | Réussi : espace, virgule, point                       |
| Textarea                                         | Réussi, clic dans une deuxième phrase       | Réussi, aperçu avant/après et application     | Réussi : espace, virgule, point ; annulation vérifiée |
| Contenteditable à un nœud texte                  | Réussi, clic dans une deuxième phrase       | Réussi, aperçu avant/après et application     | Réussi : espace insécable natif, virgule, point       |
| Contenteditable riche complexe                   | Parcours historique multi-feuilles réussi   | Non pris en charge volontairement             | Non pris en charge volontairement                     |
| Input email                                      | Parcours historique réussi                  | Non pris en charge volontairement             | Non pris en charge volontairement                     |
| Password, OTP identifiable, readonly, disabled   | Exclus volontairement ; protections testées | Exclus volontairement                         | Exclus volontairement                                 |
| ChatGPT réel / éditeur contrôlé par un framework | Non vérifié dans cette intervention         | Non vérifié ; exclusion possible selon le DOM | Non vérifié ; exclusion possible selon le DOM         |
| Chrome                                           | Non vérifié dans cette intervention         | Non vérifié                                   | Non vérifié                                           |

Les tests existants sur Unicode, chevauchements, suggestions ambiguës, IME, sélection non réduite, collage, réponses périmées, changements rapides, domaines désactivés et annulation passent toujours. Les tests ajoutés couvrent aussi la troncature manuelle, les raisons d’indisponibilité et les libellés avant/après. Aucun test avec un véritable framework contrôlé n’a été ajouté ; il ne faut pas assimiler un input natif à ce cas.

## Risques et limites

La sélection d’une phrase reste volontairement prudente autour des abréviations, URL et ponctuations ambiguës. Les nouvelles modifications n’étendent pas la prise en charge des éditeurs riches ou sensibles. Les essais restent locaux : ChatGPT authentifié, Chrome, IME réel et frameworks tiers demandent encore une recette manuelle. Le ZIP et le Setup RC1 existants ne contiennent pas ces nouveaux correctifs ; ils n’ont pas été reconstruits ni actualisés.

## Recette manuelle à refaire

1. Dans `brave://extensions` ou `chrome://extensions`, recharger l’extension qui pointe sur `dist/`, puis recharger les pages de test et ChatGPT pour remplacer l’ancien content script. Ne pas réutiliser le ZIP RC1 pour vérifier ces correctifs.
2. Lancer `npm run fixture` et ouvrir l’URL annoncée. Dans les paramètres de l’extension, enregistrer `cpg → Ce n'est pas grave`.
3. Dans input texte, textarea et contenteditable simple, taper `cpg` seul : il reste inchangé. Recommencer avec espace, virgule et point : vérifier le remplacement et un seul séparateur. Tester le bouton Annuler immédiatement après l’expansion.
4. Désactiver la correction générale en laissant les raccourcis activés : refaire ces essais. Vérifier aussi un domaine désactivé, un collage et une sélection remplacée : aucune expansion imprévue. Tab et Entrée doivent garder leur fonction normale.
5. Moteur actif, saisir `Je sui ici` dans chacun des trois champs, placer le curseur vers le début, attendre les soulignements puis cliquer sur `sui`. Vérifier « Avant », « Après », puis « Corriger cette phrase ». Confirmer et annuler immédiatement pour revenir au texte initial.
6. Saisir `Before. Je sui ici.`, attendre l’analyse, puis cliquer sur le soulignement de `sui` et choisir la suggestion individuelle. Vérifier `Before. Je suis ici.` sans perte de texte adjacent. Refaire après une frappe rapide et vérifier qu’une ancienne suggestion ne remplace pas un texte modifié.
7. Sur ChatGPT, retester la phrase du feedback. Si le panneau indique « éditeur non pris en charge », consigner cette limitation plutôt que supprimer les garde-fous. Si une suggestion individuelle échoue, relever le message affiché, le navigateur et les étapes exactes, avec une phrase de test sans données privées.
8. Tester le champ input initialement signalé avec un vrai séparateur. S’il échoue encore, relever son `type`, son `autocomplete`, son nom/id non sensible, le site et la présence éventuelle d’un framework. Le scénario local réussi ne suffit pas à clôturer ce signalement.
