# Correctly V4 — Feedback des tests manuels et plan de correction

**Date :** 15 octobre 2026  
**Statut :** Bugs à analyser et corriger avant validation de la V4  
**Destinataire :** Agent de développement (Codex)

## Objectif et consignes essentielles

Quatre axes de dysfonctionnement ont été relevés lors des tests manuels de Correctly V4 : la correction groupée peut être absente, son résultat peut être partiel ou comporter des propositions inappropriées, les raccourcis de texte ne s’étendent pas dans certains champs `input`, et des corrections individuelles échouent parfois.

**Ne commence pas par modifier le code au hasard.** Étudie d'abord l'architecture, reproduis chaque bug, identifie ses causes racines et corrige-les avec le minimum de régressions. Ces problèmes pourraient partager une cause dans la détection des éditeurs, la gestion du focus, des événements ou des transactions d'édition : vérifie cette hypothèse, sans la présupposer.

**Interdiction de générer un EXE ou un installateur pendant ce travail.** La construction du serveur Windows, du Setup et des artefacts de release n'a lieu qu'à la fin de la version, après ma validation explicite. Aucun commit ni tag Git sans autorisation.

## Contexte technique selon `recap_v4.md`

La V4 conserve LanguageTool en local sur `127.0.0.1:8081` et ajoute :

- Les raccourcis personnels, par exemple `bjr` → `Bonjour`, déclenchés par un séparateur, indépendamment de LanguageTool.
- La correction groupée par phrase, activée par défaut : depuis une suggestion, un aperçu devrait permettre d'appliquer en une modification les propositions compatibles de la phrase.
- L'annulation de la dernière modification Correctly tant que le texte n'a pas été modifié.
- Des protections contre les modifications risquées : vérification du texte exact, offsets, sélection, focus, composition IME et validité de la réponse.

Le document précise que les **nouvelles modifications V4** prennent en charge les champs `input` textuels, les `textarea` et les `contenteditable` constitués d'un seul nœud texte. Elles s'abstiennent volontairement dans les structures riches complexes, les éditeurs de code et certains frameworks identifiés ; les champs sensibles et les `input` de types email/url/search/tel sont aussi exclus. **Ne supprime pas ces protections pour masquer les bugs.** Les éditeurs incompatibles doivent être identifiés et, si pertinent, leur limitation expliquée dans l'interface.

Principaux endroits à examiner : `frontend/src/content/v4-editing.ts`, le contrôleur de correction, la détection des champs, la fenêtre de suggestions, `frontend/src/shared/shortcuts.ts`, et les tests V4 existants. Consulte aussi `docs/V4_TEST_REPORT.md`, `docs/V4_AUDIT.md` et `docs/V4_RELEASE_CHECKLIST.md` lorsqu'ils sont présents dans le dépôt.

---

## Bug 1 — Correction groupée par phrase inaccessible ou non fonctionnelle

### Observation

Dans l'éditeur de ChatGPT, pour une phrase comportant plusieurs fautes comme :

> regarde recap v4 et explique moi comment je suis sencé corriger une pharse entiere

Cliquer sur **« regarde »** affiche un panneau **« Grammaire »**, l'explication relative à la majuscule, une suggestion **« Regarde »** et **« Ignorer cette erreur »**. Aucun accès visible à « Corriger la phrase » ou à l'aperçu groupé.

**Ce qu'on sait :** la commande attendue est absente de l'interface observée. **Ce qu'on ne sait pas encore :** s'il s'agit d'une condition d'affichage, d'une absence de corrections compatibles, d'une limitation de l'éditeur ChatGPT ou d'une erreur interne.

### Comportement attendu

Sur un éditeur compatible, lorsque plusieurs corrections sûres et non conflictuelles sont disponibles sur une phrase :

1. Ouvrir une suggestion doit donner accès de façon claire à **« Corriger la phrase »**.
2. Afficher un aperçu avant/après avec les modifications proposées.
3. Appliquer en une transaction les seules corrections compatibles après confirmation.
4. Préserver les corrections individuelles et le bouton d'annulation.
5. Si l'opération est indisponible, distinguer « aucune correction groupable », « éditeur non pris en charge » et « résultat périmé » plutôt que masquer silencieusement un problème.

### Diagnostic demandé

- Retrouver les conditions exactes de disponibilité et de rendu de l'action groupée.
- Suivre le cycle complet : réponse LanguageTool → segmentation de phrase → regroupement des matches → calcul des offsets → aperçu → transaction d'édition.
- Tester les cas de corrections chevauchantes, ambiguës, périmées et de sélection/focus changé.
- Comparer un `textarea` local, un `input` textuel et le champ ChatGPT ; identifier précisément lesquels sont réellement compatibles selon les contraintes V4.
- Vérifier la limite de 5 000 unités UTF-16, les fragments tronqués et les règles d'automatisation limitées à l'espacement.
- N'ajouter aucune réécriture automatique de grammaire non explicitement validée.

---

## Bug 1 bis — Bouton présent mais correction limitée, aperçu risqué et périmètre ambigu

### Nouvelle observation (capture supplémentaire)

Texte saisi dans un éditeur :

> Bonjour, je m'appelles Moqim, je vis en Français depuis 5 an. J'aimera bien de demandé de me donné les cordonnés de ta tata.

Cette fois, le panneau propose bien **« Corriger cette phrase »**, mais son aperçu ne concerne que la première phrase (jusqu'au point après « an ») :

- **Avant affiché :** `Bonjour, je m'appelles Moqim, je vis en Français depuis 5 an.`
- **Après affiché :** `Bonjour, je m'appelle Mois, je vis en français depuis 5 ans.`

Cette capture apporte deux informations essentielles :

1. La correction groupée **n'est pas systématiquement absente** : elle apparaît dans ce scénario. L'image montre même plusieurs corrections dans la première phrase (`appelles`, `Français`, `an`) ; **il serait donc inexact de conclure qu'elle ne corrige littéralement qu'un seul mot**. En revanche, elle n'agit pas sur la suite du texte. Il faut distinguer cette limite fonctionnelle éventuelle du bug de visibilité identifié plus haut.
2. L'aperçu semble proposer **`Moqim` → `Mois`**, ce qui risque de déformer un prénom. Ce point doit être étudié indépendamment : des suggestions de LanguageTool peuvent être incorrectes, et un regroupement automatique ne doit pas les rendre silencieusement destructrices.

**Important :** la V4 est décrite dans `recap_v4.md` comme une **correction par phrase**, et non comme une correction de toutes les phrases d'un champ. S'arrêter au point peut donc être conforme au périmètre actuel, même si l'expérience utilisateur paraît incomplète. **Ne pas présenter ce comportement comme une cause racine confirmée ni transformer automatiquement la fonctionnalité en correction globale sans analyse.**

### Diagnostic et décisions attendus

- Reproduire avec **deux phrases contenant des erreurs dans chacune**, puis cliquer sur une erreur de la première et ensuite de la seconde. Vérifier que la phrase choisie, ses offsets et son aperçu correspondent exactement au segment sélectionné.
- Vérifier quelles erreurs LanguageTool retourne sur la phrase concernée, lesquelles sont retenues par le regroupement et pourquoi les autres sont exclues (conflit, absence de suggestion, protection, etc.). L'aperçu doit décrire fidèlement **toutes les corrections réellement prévues**.
- Investiguer la proposition `Moqim` → `Mois` : origine de la suggestion, confiance disponible, statut de nom propre, logique d'acceptation, vérification des offsets. Ne pas supposer sans preuve qu'il s'agit d'un bug d'offset : cela peut être une proposition incorrecte du moteur.
- Faire en sorte que les changements discutables, en particulier ceux qui touchent à un prénom ou à un nom propre, **ne soient pas appliqués sans choix explicite et informé**. Examiner la possibilité de désélectionner individuellement des changements dans l'aperçu et de conserver le mot original. Préserver toutes les protections déjà présentes.
- Clarifier dans l'interface la différence entre **corriger un mot**, **corriger la phrase courante** et, si cela est retenu comme nouvelle fonctionnalité, **corriger tout le texte du champ**. Une correction complète sur plusieurs phrases est une **évolution à proposer et à chiffrer**, pas une modification à ajouter silencieusement.
- Ne pas confondre correction selon des suggestions LanguageTool avec une **reformulation linguistique complète** : le moteur ne garantit pas de rendre naturelle une formulation comme `J'aimera bien de demandé de me donné...`. Documenter cette limite plutôt que promettre une réécriture parfaite.

### Critères d'acceptation

1. Dans une phrase avec plusieurs suggestions compatibles, l'aperçu contient exactement les changements effectivement applicables à **cette phrase**, et le bouton applique ce qui a été validé.
2. Dans un texte à deux phrases, aucune erreur de la seconde phrase ne doit être attribuée à la première, et la seconde doit pouvoir être traitée séparément lorsqu'elle est éligible.
3. Les modifications suspectes de noms propres doivent pouvoir être évitées avant validation ; pas d'application silencieuse de `Moqim` → `Mois`.
4. Si la correction groupée ne peut pas s'appliquer, le refus doit être sûr, explicable et reproductible.
5. Les correctifs ne doivent pas introduire une prétendue correction automatique de tout le texte sans validation du nouveau périmètre.

---

## Bug 2 — Les raccourcis ne s'étendent pas dans certains `input`

### Observation

Raccourci personnel configuré :

> `cpg` → `Ce n'est pas grave`

La saisie fonctionne dans un `textarea` (capture montrant le résultat développé), mais dans un champ `input` textuel de test, `cpg` reste affiché au lieu d'être remplacé, même dans le scénario où le raccourci devrait se déclencher.

### Comportement attendu

Dans les champs autorisés et compatibles (`textarea`, `input type="text"`, `contenteditable` simple), taper le raccourci **puis un séparateur déclencheur** produit le remplacement avec un seul séparateur, conformément au contrat de la V4. Un collage ne déclenche pas l'expansion ; Tab et Entrée ne doivent pas être interceptés. Les frontières de mots, Unicode, la casse, les domaines désactivés et le réglage autonome des raccourcis restent respectés.

### Diagnostic demandé

- Reproduire avec `cpg `, `cpg,` et `cpg.` dans chacun des types de champ. Vérifier et documenter précisément le séparateur nécessaire : la seule présence de `cpg` sans séparateur ne suffit pas à démontrer un bug.
- Comparer les chemins `input` / `textarea` / `contenteditable` : sélection du champ, garde-fous, accès à la valeur, offsets et API de remplacement.
- Examiner `beforeinput`, `input`, `keydown`, les événements de composition IME, les sélections et l'ordre des événements.
- Vérifier la mise à jour effective de la valeur et la compatibilité des événements avec les contrôles gérés par des frameworks.
- Contrôler l'indépendance de l'expansion vis-à-vis de LanguageTool et de l'interrupteur de correction générale.
- Ne pas activer l'expansion sur des types d'inputs exclus ni sur des champs sensibles.

---

## Bug 3 — La correction individuelle d'un mot échoue de manière intermittente

### Observation

Certaines erreurs sont soulignées, mais l'ouverture ou l'application d'une suggestion individuelle ne fonctionne pas toujours. Sur la capture du champ `input` avec `cpg`, le mot reste affiché et est souligné.

**Attention au diagnostic :** `cpg` est également un raccourci personnel. Son soulignement ne prouve pas qu'une suggestion LanguageTool valide existe ; il faut distinguer clairement **absence d'expansion du raccourci**, **détection d'une faute** et **échec réel d'application d'une suggestion**. Reproduire le troisième bug avec un exemple dont la suggestion individuelle est effectivement disponible.

### Comportement attendu

Sur un éditeur compatible, cliquer sur un soulignement présentant une suggestion valide doit ouvrir la suggestion, puis remplacer uniquement la portion ciblée, préserver le texte adjacent et rafraîchir l'analyse. Si la suggestion est périmée ou si le champ ne permet pas l'opération, ne pas modifier le mauvais texte : indiquer ou tracer la raison de l'abstention.

### Diagnostic demandé

- Tester le cycle clic sur soulignement → ouverture du panneau → choix → application → mise à jour du champ.
- Chercher les pertes de focus à l'ouverture du panneau, les décalages d'offsets, les références périmées et les changements de sélection.
- Vérifier les distinctions entre champ simple, champ contrôlé et `contenteditable`.
- Comparer le code historique de correction individuelle avec les nouveaux chemins V4, pour identifier les éventuelles régressions.
- Tester séparément des fautes courantes avec suggestions confirmées et les raccourcis personnels.

---

## Méthode de travail obligatoire

### 1. Audit avant correction

Lire les fichiers pertinents, reconstituer les flux d'événements et documenter pour chaque bug : procédure de reproduction, attendu, observé, cause racine **confirmée par le code ou par un test**, composants affectés et risques de régression. Si la cause reste une hypothèse, l'indiquer explicitement.

### 2. Reproduction automatisée et tests de non-régression

Créer une page de test contenant au minimum :

- `input type="text"` simple ;
- `textarea` ;
- `contenteditable` simple ;
- cas volontairement non pris en charge (éditeur riche complexe, champ sensible, type exclu) ;
- si possible, un input contrôlé par un framework.

Pour tous les problèmes, créer des tests qui échouent avant le correctif et passent après. Couvrir le séparateur, la ponctuation, le focus, la sélection, les caractères Unicode, les changements rapides de texte, les suggestions périmées et l'annulation.

### 3. Correction minimale mais structurellement saine

Ne pas contourner les garde-fous, ne pas dupliquer les moteurs de remplacement et ne pas réécrire inutilement les modules. Si plusieurs bugs ont la même cause, corriger le composant partagé. Conserver les fonctionnalités V1 à V3.1, les performances, Manifest V3 et le fonctionnement entièrement local.

### 4. Validation

Commandes permises : `npm test`, `npm run lint`, `npm run build`, tests ciblés et tests navigateur. Vérifier dans le navigateur réel les champs compatibles, puis tester ChatGPT en notant explicitement les limitations éventuelles. Les tests automatisés réussis ne suffisent pas à déclarer l'ensemble corrigé.

Établir une petite matrice **type de champ × fonctionnalité × résultat** (correction individuelle / correction groupée / raccourci), et une matrice distincte **une phrase / plusieurs phrases / nom propre / suggestions conflictuelles** en distinguant *réussi*, *échec* et *non pris en charge volontairement*.

### 5. Rapport de fin

Créer ou actualiser un rapport Markdown récapitulant :

1. Les causes racines de tous les problèmes et leurs preuves, en distinguant les bugs confirmés des limites de périmètre et des propositions LanguageTool incorrectes.
2. Les fichiers modifiés et les choix de conception.
3. Les tests ajoutés, les commandes exécutées et leurs résultats.
4. Les éventuelles limitations restantes.
5. Les risques de régression et les vérifications réalisées.
6. Les étapes exactes des tests manuels que je dois refaire.

Ne déclarer un problème **résolu** que si son scénario est vérifié, ou clairement préciser qu'il reste une validation manuelle à effectuer.

---

## Interdictions impératives pour cette étape

- **Ne pas créer d'EXE, d'installateur ou de paquet de release.**
- **Ne pas exécuter `createSetup.cmd`, PyInstaller, ni les scripts de construction de Setup ou de release.**
- **Ne pas publier, créer de tag ou faire de commit Git sans accord explicite.**
- **Ne pas modifier le backend ni reconditionner Java/LanguageTool sans nécessité démontrée.**
- **Ne pas lever les protections des champs sensibles ou des éditeurs non compatibles pour faire artificiellement passer les tests.**

**La construction de l'EXE est réservée à la toute fin de la V4, après validation explicite de ma part.** L'objectif maintenant est de stabiliser l'extension et de prouver que les dysfonctionnements identifiés sont compris et corrigés sans régression.
