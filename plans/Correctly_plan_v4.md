# Correctly V4 — Spécification fonctionnelle et plan d'implémentation pour agent de développement

**Statut :** candidate V4 RC1 implémentée ; recette automatisée et packaging suivis dans `docs/V4_TEST_REPORT.md`, validation finale encore ouverte  
**Version cible :** `v4.0.0`  
**Date :** 15 octobre 2026  
**Base documentaire :** `plans/Correctly_recap_v4.md` (état du projet au 15/10/2026)  
**Destinataire :** agent de développement travaillant directement dans le dépôt Correctly  
**Langue du document :** français

> **Mission principale :** réaliser deux évolutions complémentaires : (1) corriger un segment de phrase en un seul ensemble cohérent plutôt que d'appliquer des changements mot par mot pendant la saisie ; (2) proposer des raccourcis personnels de remplacement de texte, similaires au remplacement de texte sur iPhone, toujours actifs dans les champs compatibles. Conserver le comportement existant V3/V3.1, les fonctionnalités d'assistance, la confidentialité locale et le packaging Windows.

---

## 0. Directives impératives pour l'agent

1. **Lire d'abord le dépôt, ne pas deviner son architecture.** Examiner `README.md`, `plans/Correctly_recap_v4.md`, `frontend/`, `backend/`, `installer/`, `scripts/`, `docs/V3.1_RAPPORT.md`, `docs/V3.1_INSTALLATION.md`, `docs/V3.1_RECETTE_CHECKLIST.md`, les tests et le `package.json`. Les fichiers cités ci-dessous en tant que _propositions_ ne sont pas attestés par le récapitulatif : adapter les noms et points d'insertion au vrai code.
2. **Ne pas écraser l'état existant.** Commencer par `git status`, `git branch --show-current`, `git log -5 --oneline`, `git tag --list`. Le tag V3.1 `v3.1.0` pointe vers `03cb122` selon le récapitulatif ; des réorganisations `frontend/backend` postérieures peuvent ne pas être commitées. Ne jamais supprimer ni réinitialiser les modifications de l'utilisateur. Créer une branche V4 seulement si cela est sans risque, sinon documenter la situation.
3. **Préserver V3/V3.1 :** correction FR/EN/Auto, dictionnaire personnel, domaines désactivés, éditeurs `input` / `textarea` / `contenteditable` / Shadow DOM ouvert, moteur LanguageTool local, outil Windows en zone de notification, démarrage Windows et installation/désinstallation par utilisateur. Ne pas changer silencieusement le contrat HTTP ou le port local `127.0.0.1:8081`.
4. **Ne pas ajouter de service cloud, de base SQL, de LLM ni de dépendance lourde sans nécessité démontrée.** Le moteur LanguageTool Java embarqué reste utilisé ; Python est l'enveloppe de serveur Windows actuelle, pas un remplacement de LanguageTool. Les raccourcis sont traités dans le frontend en TypeScript.
5. **Ne pas enregistrer les textes ordinaires saisis.** Stocker seulement des préférences et les paires de raccourcis volontairement créées. Jamais de contenu de page, de corps de message, de texte à corriger, de journal détaillé de frappe ou de texte privé dans les logs.
6. **Assurer le fonctionnement au clavier, sans mutation surprise du document.** Préserver sélection, curseur, espaces, structures riches, undo/redo et événements attendus par les sites. Si une plateforme ne peut pas être modifiée sans risque, se désactiver proprement dans ce cas et documenter la limite.
7. **Chaque phase est terminée uniquement avec des tests.** Ne pas considérer une compilation réussie comme validation sur navigateurs ou sur Windows propre.
8. **Ne pas annoncer de réussite non observée.** Écrire un rapport V4 listant précisément tests exécutés, résultats et validations restantes. L'agent doit développer et tester, pas simplement produire une proposition.

---

## 1. État initial attesté par `plans/Correctly_recap_v4.md`

### 1.1 Jalons historiques

- **V1 (`v1.0.0`) :** extension Chrome/Brave Manifest V3, détection/soulignement des fautes, suggestions d'application, communication locale avec LanguageTool.
- **V2 (`v2.0.0`) :** suivi de l'éditeur actif, gestion plus étendue de `contenteditable` et Shadow DOM ouvert, traitement du paragraphe proche du curseur pour les textes longs, modes FR/EN/Auto, paramètres, domaines désactivés et dictionnaire personnel ; non-persistance du texte tapé.
- **V3 (portable Windows) :** `CorrectlyServer.exe` à base de Python, Java + LanguageTool embarqués, démarrage/arrêt/redémarrage via icône de notification, adresse locale `127.0.0.1:8081`.
- **V3.1 (`v3.1.0`) :** installateur Windows par utilisateur `Correctly-V3.1-Setup.exe`, démarrage à la connexion activé par défaut, routines de mise à jour/désinstallation ciblées ; extension installée séparément à partir d'un ZIP.

### 1.2 Arborescence actuelle d'après le récapitulatif

| Répertoire           | Rôle existant                                       |
| -------------------- | --------------------------------------------------- |
| `frontend/`          | Extension TypeScript, manifeste, interface et tests |
| `backend/`           | Serveur Windows, tests, ressources et construction  |
| `installer/`         | Configuration d'installation Windows                |
| `scripts/`           | Scripts de développement, de contrôle et de build   |
| `docs/`              | Rapports, guides et anciens plans                   |
| `dist/`              | Extension compilée                                  |
| `artifacts/release/` | Setup, ZIP et sommes SHA256                         |

**Prudence :** le récapitulatif ne décrit pas les fonctions/classes concrètes de traitement du texte. Les propositions détaillées qui suivent sont des **choix de conception V4**, pas une description vérifiée du code actuel.

### 1.3 Vérifications V3.1 ouvertes à ne pas masquer

Recette sur Windows propre sans runtimes installés ; redémarrage de session ; mise à jour/désinstallation durant l'exécution ; parcours sur sites authentifiés ; comportement Defender/SmartScreen ; licences/provenance et droits de redistribution. Conserver ces éléments dans la checklist de sortie V4.

---

## 2. Objectif produit, périmètre et définition du succès

### 2.1 Correction au niveau de la phrase

**Objectif UX :** en écrivant une phrase, l'utilisateur ne voit pas le texte être réécrit continuellement mot par mot. Quand la phrase est terminée, Correctly l'analyse comme une unité, réunit les corrections compatibles et applique **une seule mutation groupée** ou offre une action groupée selon le mode de correction retenu.

Exemple illustratif, dépendant des suggestions effectives de LanguageTool :

- Avant : `Je suis aller au magasin hier.`
- Après validation groupée : `Je suis allé au magasin hier.`

**Attention :** « correction de phrase » ne veut pas dire réécriture stylistique IA. LanguageTool renvoie généralement des correspondances (`matches`) et des suggestions ; toutes ne sont pas certaines ni combinables. Ne jamais appliquer des suggestions ambiguës de façon aveugle.

### 2.2 Remplacement automatique des raccourcis

- L'utilisateur crée lui-même `déclencheur → remplacement` dans les paramètres.
- `bjr` + espace devient `Bonjour ` ; `jsp` + espace devient `Je ne sais pas `.
- Déclenchement par **fin de token** (espace, Tab, Entrée lorsque l'éditeur le permet, ponctuation sûre), sans devoir cliquer sur une suggestion.
- Fonctionne indépendamment de LanguageTool, y compris lorsque le serveur est arrêté.
- Actif par défaut dans les éditeurs pris en charge, sous réserve des domaines désactivés, des champs protégés et des exceptions de sécurité.

### 2.3 Critères de réussite utilisateur

1. Une phrase en cours n'est pas remplacée entièrement à chaque frappe.
2. Une phrase finalisée peut recevoir un lot de corrections cohérent, en **une transaction d'édition**, sans modifier les phrases voisines.
3. Un raccourci personnel se déploie automatiquement à une frontière de mot dans les éditeurs compatibles.
4. Les raccourcis restent présents après redémarrage du navigateur et de Windows.
5. L'extension reste utilisable sans serveur pour la seule fonction raccourcis.
6. Les paramètres, l'installation et le comportement existants V3.1 ne régressent pas.

### 2.4 Hors périmètre V4

- Pas de LLM, prédiction générative, apprentissage de raccourcis, correction cloud ou télémétrie de frappe.
- Pas de synchronisation automatique Chrome ↔ Brave ↔ autres machines.
- Pas d'installation silencieuse de l'extension dans le profil utilisateur.
- Pas de « correction parfaite » ou reformulation garantie ; limites dictées par les règles LanguageTool.
- Pas de changement majeur du runtime Windows si aucune adaptation n'est nécessaire.

---

## 3. Comportement détaillé : cycle de correction par phrase

### 3.1 Définition d'un segment

Créer une abstraction `SentenceSegment` couvrant une plage `[start, end)` dans la valeur textuelle logique de l'éditeur, plus la version/révision du texte, son contexte linguistique et un identifiant d'éditeur. La plage doit être **réversible vers l'éditeur réel** (offsets `input/textarea` ; mappage DOM/Range pour contenteditable). Le segment peut être une phrase complète ou un segment de secours limité lorsque les frontières sont incertaines.

Identifier en priorité les fins de phrase `.` `!` `?` (et éventuellement `…`), suivies d'une frontière plausible, plus des terminaisons par perte de focus et pause longue configurées comme _fallback_ d'analyse, pas comme permission automatique d'écraser une phrase incomplète. Tenir compte de `M.` / `Dr.`, nombres décimaux, URL, e-mails, ellipses, guillemets, parenthèses, retours à la ligne et contenus FR/EN. Les cas difficiles ne doivent **pas** déclencher d'édition automatique hasardeuse.

**Décision V4 :** pour éviter les modifications pendant l'écriture, ne lancer la **transaction auto de phrase** qu'après une frontière de phrase détectée avec confiance. Une pause peut produire des suggestions visuelles, mais ne force pas une réécriture automatique. Sur Entrée, respecter d'abord le rôle du clavier : dans un chat, Entrée peut envoyer le message ; ne jamais bloquer/en retarder l'envoi pour attendre LanguageTool.

### 3.2 Machine d'états recommandée

`EDITING` → `BOUNDARY_DETECTED` → `CHECK_PENDING` → `SUGGESTIONS_READY` → (`AUTO_APPLY_SAFE` ou `AWAIT_USER`) → `APPLIED` / `DISCARDED` → `EDITING`.

Chaque éditeur actif possède son propre état léger ; détruire états, timers, listeners et observers à la déconnexion. Un état n'est pas partagé entre deux champs ou deux onglets.

### 3.3 Détection et préparation de la requête

1. Observer l'éditeur actif par les mécanismes existants V2 ; ne pas scanner continuellement tous les champs.
2. Après l'entrée utilisateur, ignorer les états IME (`compositionstart` à `compositionend`) et les mutations émises par Correctly.
3. Trouver le segment complet le plus récent autour du curseur ou de la frontière nouvellement tapée.
4. Extraire **uniquement le segment nécessaire**, éventuellement un petit contexte à des fins de règles si indispensable, sans stocker sur disque.
5. Capturer `(editorId, revision, segment.start, segment.end, segment.text, languageMode)`.
6. Debouncer les appels au serveur pour éviter les rafales, tout en gardant les raccourcis indépendants et synchrones.
7. Si une nouvelle saisie modifie le segment, invalider la réponse précédente ; annuler la requête avec `AbortController` quand l'architecture le permet.

### 3.4 Validation des résultats LanguageTool

Les réponses LanguageTool sont **des propositions**, non des commandes. Pour chaque match : vérifier les offsets dans la chaîne _exactement envoyée_, l'existence de suggestions, la compatibilité avec la sélection courante, la révision et le texte encore présents, les catégories de règles exclues/dictionnaire personnel et la validité de la suggestion choisie.

Stratégie conservative pour le mode automatique : n'appliquer que les correspondances explicitement classées comme sûres par la politique interne V4 et pour lesquelles une suggestion unique/fortement fiable existe. **Ne pas supposer** que la première suggestion est toujours correcte. Si le moteur ne fournit pas assez d'indices pour juger la sécurité, garder les correspondances en suggestions manuelles.

Gestion des overlaps : trier, sélectionner un ensemble non chevauchant, signaler les conflits, refuser l'application groupée automatique en cas d'ambiguïté significative. Appliquer les remplacements de droite à gauche sur une **copie immuable** du texte du segment pour ne pas décaler les offsets ; construire ensuite un unique nouveau segment. Ne jamais effectuer de remplacements DOM successifs mot par mot. Les règles correctrices dépendent de la langue sélectionnée FR/EN/Auto déjà existante.

### 3.5 Application atomique

- Avant mutation, revérifier identité de l'éditeur, focus/validité du nœud, texte exact du segment, révision et sélection.
- Former `newSentence` hors DOM ; si identique à `oldSentence`, ne rien faire.
- Appliquer la modification complète en **une opération d'édition** compatible avec l'éditeur, avec la plus petite plage nécessaire, sans reconstruire tout le document.
- Préserver les préfixes et suffixes intacts, la sélection, les éléments riches et le scroll.
- Dans `input/textarea`, utiliser les API natives pertinentes telles que `setRangeText` lorsqu'elles respectent le site, avec gestion contrôlée de l'événement `input` si nécessaire. Dans les éditeurs `contenteditable`, travailler sur un `Range` sûr et les nœuds texte ; **éviter** `innerHTML = ...`, `textContent = ...` sur l'éditeur entier, ou des écritures qui écrasent la structure DOM.
- Tester le comportement d'annulation native ; **ne pas promettre** que `Ctrl+Z` sera fiable sur tous les éditeurs web : certaines APIs programmatiques ne créent pas d'étape d'undo. Si l'undo natif n'est pas préservé, fournir un bouton `Annuler` ou une transaction réversible explicite, sans intercepter abusivement Ctrl+Z.
- Les éditeurs contrôlés par React, ProseMirror, Slate, Quill, etc. peuvent réagir différemment : réutiliser les adaptateurs V2 existants ; mettre en place des fallbacks spécifiques **testés**, et refuser la mutation si non prise en charge.

### 3.6 UX proposée (décision de sécurité)

Deux niveaux :

- **Mode automatique conservateur** (objectif V4) : à la fin d'une phrase, corrections sûres regroupées en une transaction ; corrections douteuses restent soulignées ou présentées comme suggestions.
- **Mode révision** (option utile) : une action unique `Corriger cette phrase` applique en lot les suggestions sélectionnées avec prévisualisation de la phrase finale.

Un réglage `Correction par phrase` activé par défaut remplace le comportement d'application mot à mot _si l'actuel frontend offre une telle auto-application_. **Ne pas supprimer** l'accès aux suggestions existantes ni changer les autres modes sans vérifier leur fonctionnement réel. Ne pas confondre soulignement d'erreurs par mot avec application des corrections : les soulignements peuvent rester individuels tandis que la _mutation de texte_ est groupée.

### 3.7 Cas de sûreté et interruptions

- Si saisie après envoi de la requête, changement de champ/onglet, suppression de phrase, perte de sélection, éditeur détruit ou retour serveur tardif : **ne rien modifier**.
- Si phrase contenant code, URL, identifiants, texte sélectionné, balises structurées ou composition IME : s'abstenir d'auto-édition lorsque la confiance est insuffisante.
- Si erreur réseau, arrêt serveur, dépassement de délai : ne pas bloquer la frappe et garder l'éditeur intact.
- Les mots du dictionnaire personnel doivent rester protégés selon la logique déjà existante.

---

## 4. Comportement détaillé : remplacements automatiques de texte

### 4.1 Structure de données

Ajouter une structure versionnée dans `chrome.storage.local` :

```ts
type TextShortcut = {
  id: string; // stable, UUID ou identifiant généré
  trigger: string; // ex. "bjr"
  replacement: string; // ex. "Bonjour"
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

type ShortcutSettingsV1 = {
  schemaVersion: 1;
  enabled: boolean; // activé par défaut
  shortcuts: TextShortcut[];
};
```

Prévoir une **clé de stockage distincte** des paramètres/dictionnaire existants, ou utiliser le schéma de préférences existant sans écraser de champs. Exemple indicatif : `correctly.shortcuts.v1`. Au premier lancement, absence de clé signifie `enabled: true`, `shortcuts: []`. Ne pas créer automatiquement des raccourcis de démonstration. La migration depuis une version sans cette clé est non destructive. Pas de SQL ni de modification de la base backend.

**Limites et confidentialité :** `chrome.storage.local` conserve les données dans le profil de ce navigateur mais ne garantit pas la survie à la suppression du profil/de l'extension ; Chrome et Brave ne partagent pas cette zone par défaut. Ne pas enregistrer d'informations sensibles dans les déclencheurs/remplacements ; la page paramètres doit indiquer le caractère local du stockage.

### 4.2 Règles de création et de validation

- Un `trigger` est une courte séquence non vide, nettoyée des espaces de bord, sans espaces intérieurs pour V4. Les déclencheurs peuvent être FR/EN et Unicode ; gérer les accents correctement.
- Longueurs recommandées (ajustables après tests UX) : 1–32 caractères pour le déclencheur, 1–2 000 pour le remplacement. Limiter le nombre total d'entrées raisonnablement (par exemple 500) et montrer une erreur si plafond dépassé.
- Interdire doublons selon la règle de normalisation choisie : Unicode NFC + casse insensible pour la détection, tout en conservant la casse saisie pour l'interface.
- Écarter les déclencheurs contenant seulement des espaces, retours à la ligne, caractères de contrôle ou un séparateur de fin de mot ; autoriser les remplacements multi-mots, pas de HTML injecté.
- Échapper la sortie de la liste de paramètres (`textContent`, pas `innerHTML`) pour éviter le XSS.
- Prévoir une confirmation de suppression, ou suppression facilement annulable, et un retour visible en cas d'erreur d'écriture dans le stockage.

### 4.3 Déclenchement temps réel

1. Écouter la saisie **du seul éditeur actif**, en respectant les garde-fous V2.
2. À une frontière de token sûre (`espace`, éventuellement ponctuation, Tab et Entrée sous conditions), lire le token précédant cette frontière et la sélection/caret.
3. Chercher une correspondance exacte du trigger normalisé, **pas une sous-chaîne d'un mot** : `bjr` doit être remplacé, `abjr` ne doit pas l'être.
4. Si un match existe, remplacer seulement le token et conserver **exactement une fois** le séparateur déjà saisi (espace, ponctuation, etc.). Exemple `bjr,` → `Bonjour,` ; `bjr ` → `Bonjour `.
5. Éviter un second remplacement provoqué par les événements émis par Correctly (marquage transaction + révision), sans rendre l'éditeur insensible aux saisies normales suivantes.
6. Respecter la casse de remplacement **telle que définie par l'utilisateur** ; ne pas capitaliser arbitrairement.
7. Sur collage de plusieurs mots : par défaut **ne pas** réécrire tout le texte collé ; remplacer uniquement une frontière explicitement tapée ensuite. Tester/couvrir cette politique.
8. Sur `compositionstart`/IME, n'effectuer aucun remplacement jusqu'à la composition terminée ; ne pas remplacer au milieu d'une sélection multi-caractères.

**Ne pas capturer ou bloquer** la touche Entrée dans un champ de messagerie si elle déclenche l'envoi : les raccourcis y fonctionneront avec l'espace et la ponctuation ; pour Tab/Entrée, n'agir que si la plateforme assure que l'événement laisse le temps d'appliquer une mutation sans provoquer d'envoi inattendu.

### 4.4 Zones autorisées et exclues

Respecter les domaines désactivés préexistants et les règles de confidentialité. Désactiver systématiquement sur : `input[type=password]`, OTP/codes, champs `readonly`/`disabled`, éditeurs hors prise en charge, fenêtres sensibles identifiées, composition IME et zones `contenteditable=false`. Pour les champs type email, url, number, search, ou code, choisir une politique restrictive par défaut et documenter toute exception. Ne pas intervenir dans les champs dont le contenu réel ne peut être retrouvé de manière fiable.

### 4.5 Interface dans les paramètres

Créer/étendre une section **« Raccourcis de texte »** au sein des options existantes avec :

- interrupteur principal activé par défaut ;
- formulaire `Abréviation` / `Remplacer par` / `Ajouter` ;
- liste consultable avec état actif, édition et suppression ;
- validation immédiate (doublon, champ vide, entrée trop longue) ;
- sauvegarde persistante et message discret de succès/échec ;
- exemples explicatifs non enregistrés automatiquement ;
- utilisation au clavier, labels accessibles, focus logique et contraste approprié.

**Option facultative différée :** import/export JSON local des raccourcis, avec validation stricte avant import. La V4 peut sortir sans synchronisation ni import/export si les indispensables sont validés.

### 4.6 Interactions avec la correction par phrase

Pipeline logique : saisie utilisateur → détermination de frontière de token → éventuel déploiement d'un raccourci → détermination de frontière de phrase → analyse LanguageTool sur la **version finale à jour** de la phrase → correction groupée admissible.

Un raccourci doit **invalider** toute requête LanguageTool précédente concernant son segment. Les transformations n'entrent jamais en boucle. Les textes remplacés peuvent être ensuite vérifiés par LanguageTool, mais la phase d'analyse ne doit pas réintroduire le trigger. Émettre au plus une mutation pour l'expansion de raccourci ; pour une phrase, une mutation supplémentaire uniquement au moment de sa finalisation.

---

## 5. Architecture cible intégrée (conceptuelle)

```text
Navigateur Chrome/Brave (Manifest V3)
  ├── Options UI
  │     └── ShortcutRepository (chrome.storage.local)
  ├── Éditeur actif (réutiliser la détection V2)
  │     ├── EditorAdapter (input / textarea / rich editor)
  │     ├── InputEventCoordinator + IME/guards
  │     ├── ShortcutExpander  (local, sans serveur)
  │     ├── SentenceBoundaryDetector
  │     ├── SentenceCorrectionCoordinator
  │     │     ├── RequestRevisionGuard
  │     │     ├── LanguageToolClient existant
  │     │     ├── SafeMatchPlanner
  │     │     └── AtomicEditTransaction
  │     └── UI existante soulignements / suggestions
  └── Service worker / messages existants (si requis)
                       │ HTTP localhost (contrat inchangé)
  CorrectlyServer.exe (Python, Windows)
                       │
                LanguageTool (Java local)
```

L'architecture est un **découpage des responsabilités**, pas une exigence de créer un fichier/classe pour chaque nom. Réutiliser les utilitaires du dépôt, appliquer les conventions TypeScript strictes actuelles, éviter deux moteurs concurrents de synchronisation DOM.

### 5.1 Contrats internes suggérés

```ts
interface EditorSnapshot {
  editorId: string;
  revision: number;
  text: string;
  selectionStart: number;
  selectionEnd: number;
  isComposing: boolean;
}

interface TextRange {
  start: number;
  end: number;
}

interface EditProposal {
  editorId: string;
  expectedRevision: number;
  expectedText: string; // uniquement en mémoire
  range: TextRange;
  replacement: string;
  reason: 'shortcut' | 'sentence-correction';
}

interface ApplyResult {
  applied: boolean;
  reasonIfSkipped?: string;
}
```

**Important :** les offsets logiques UTF-16 utilisés par JavaScript et les offsets du moteur LanguageTool doivent être testés explicitement avec accents, emojis et caractères hors BMP. Les écarts de normalisation, s'ils existent, exigent un mapping testé ; ne pas décaler des caractères silencieusement.

### 5.2 Stratégie des événements

- Dédupliquer `beforeinput`, `input`, `keydown` : ne pas effectuer la même expansion deux fois.
- Les changements programmatiques doivent être identifiables comme provenant de Correctly.
- Utiliser un `WeakMap` ou mécanisme équivalent pour stocker le contexte des éditeurs sans retenir des DOM détachés.
- Nettoyer timers, callbacks, observers et requêtes lorsqu'un éditeur perd le focus ou disparaît.
- Le service worker MV3 pouvant être suspendu, **ne pas** dépendre d'un état volatile du worker pour conserver les raccourcis ; récupérer le stockage et mettre à jour les caches via `chrome.storage.onChanged` si nécessaire.
- Gestion multi-onglets : cache par contexte, diffusion de modifications des options, pas de fuite d'éditeurs entre onglets.

### 5.3 Politique en cas d'incertitude

**Ne pas modifier** est préférable à une modification destructrice. Les raccourcis sans correspondance exacte ne font rien ; les corrections chevauchantes/non sûres restent en suggestions ; éditeur inconnu ou incohérent → comportement ancien sans auto-édition. Journaliser au maximum des codes de diagnostic non sensibles, jamais le texte.

---

## 6. Plan d'exécution par phases (ordre obligatoire)

### Phase 0 — Audit et baseline

- Inspecter les points d'entrée frontend, composants options, API de stockage, logique d'éditeurs, appels LanguageTool, suggestions, application des remplacements et tests.
- Distinguer le comportement **réel** V3.1 (soulignement, clic sur suggestion, application) de la **cible** V4 (transaction de phrase). Ne pas affirmer qu'une correction mot par mot _automatique_ existe si le code actuel ne le confirme pas.
- Exécuter baseline : `npm test`, `npm run lint`, `npm run build` (selon scripts disponibles) ; consigner les résultats sans modifier le code pour masquer un échec existant.
- Identifier les conventions de version, le manifeste, la signature/packaging et les fonctionnalités associées au backend.
- **Livrable :** note `docs/V4_AUDIT.md` avec architecture constatée, adaptations au plan et état initial.

### Phase 1 — API des éditeurs et sécurité de mutation

- Adapter/réutiliser les interfaces d'éditeur pour obtenir valeur, caret, range et version.
- Définir l'écriture atomique d'une plage sur `input`, `textarea`, puis éditeurs riches compatibles.
- Ajouter verrouillage anti-boucle, tests de sélection, invalidation et rollback/annulation raisonnable.
- Tests unitaires de fonctions pures + tests DOM représentant éditeurs riches ; garder un fallback non destructif.
- **Livrable :** capacité réutilisable de mutation sûre, sans encore déclencher la correction automatique.

### Phase 2 — Dépôt des raccourcis

- Implémenter lecture/écriture versionnées `chrome.storage.local`, validation, déduplication, migration sans perte.
- Implémenter section options + tests de création, modification, suppression, désactivation, persistance.
- Prévoir cache et prise en compte d'updates depuis une autre page options/onglet.
- **Livrable :** gestion des raccourcis opérationnelle indépendamment du backend.

### Phase 3 — Expansion automatique

- Implémenter tokenisation/boundaries, filtre des champs, gestion de l'IME, sélection, paste, séparateurs.
- Brancher sur le traitement des entrées et utiliser l'API d'édition sûre de phase 1.
- Tester événement unique, espaces non doublés, ponctuation, remplacement multi-mots, undo/fallback, serveur indisponible.
- **Livrable :** `bjr` + espace → `Bonjour ` dans champs pris en charge.

### Phase 4 — Détection/validation des phrases

- Introduire détecteur de phrase et gestion des révisions/requêtes obsolètes.
- Récupérer matches via le client LanguageTool actuel, filtrer, détecter overlaps, calculer les corrections candidates sur une copie.
- Ajouter un mode manuel/révision groupée fiable avant le mode automatique ; vérifier l'intégrité du DOM et des offsets.
- **Livrable :** correction complète d'une phrase avec une transaction, en préservant les autres phrases.

### Phase 5 — Auto-application prudente et UX

- Autoriser auto-application groupée uniquement sur la frontière sûre et seulement pour des propositions à confiance suffisante ; les autres restent en suggestions.
- Configurer le mode par phrase dans les paramètres existants, conserver le comportement de soulignement et l'accès aux suggestions individuelles quand pertinent.
- Tester raccourci suivi de correction de phrase, changement de champ, requêtes hors ordre et interruptions.
- **Livrable :** pipeline cohérent sans correction mot à mot perturbatrice.

### Phase 6 — Intégration, performances et recette

- Passer les tests unitaires/intégration/E2E disponibles, lint, build.
- Vérifier manuellement Chrome et Brave : ChatGPT, WhatsApp Web, Gmail, LinkedIn, Reddit, éditeurs classiques, contenus longs, shadow roots ouverts si applicable. Utiliser des comptes de test et ne pas manipuler de données sensibles.
- Vérifier mémoire/CPU, restauration du focus/caret, frappe rapide, long texte, IME, multi-onglets, disabled domains et absence de boucles.
- Exécuter `npm run build` et `./createSetup.cmd` / `.\createSetup.cmd` sur Windows selon le projet ; vérifier les artefacts réels.
- **Livrable :** rapport `docs/V4_TEST_REPORT.md` avec résultats par environnement et reproductions des anomalies.

### Phase 7 — Release V4

- Mettre à jour numéros de version (frontend/manifeste/Setup/notes de version là où applicable) ; ne pas attribuer `v4.0.0` avant validation.
- Préparer `artifacts/release/` avec Setup V4, ZIP extension, `SHA256SUMS.txt` ; vérifier les noms exacts produits par le build.
- Conserver la procédure d'installation manuelle de l'extension Chrome/Brave (ne pas promettre une installation silencieuse).
- Refaire les tests critiques installateur : première installation, démarrage Windows, mise à jour depuis V3.1 sans perte de préférences, désinstallation propre, antivirus/licences.
- Ajouter `docs/V4_RELEASE_CHECKLIST.md`, `docs/V4_CHANGELOG.md`, mettre à jour `README.md` et `plans/Correctly_recap_v4.md` **après validation**, puis préparer le tag Git après accord du flux de travail du dépôt.

---

## 7. Matrice de tests à implémenter

Les identifiants suivants doivent figurer dans un rapport, avec `PASS`, `FAIL`, `BLOCKED` ou `NOT RUN` et la preuve pertinente.

### 7.1 Raccourcis — tests fonctionnels

| ID    | Scénario                                 | Résultat attendu                     |
| ----- | ---------------------------------------- | ------------------------------------ |
| SH-01 | Ajouter `bjr` → `Bonjour`                | Enregistré ; liste mise à jour       |
| SH-02 | Saisir `bjr` + espace                    | `Bonjour ` une seule fois            |
| SH-03 | Saisir `abjr` + espace                   | Aucun remplacement                   |
| SH-04 | Saisir `bjr,`                            | `Bonjour,` sans ponctuation doublée  |
| SH-05 | Saisir `jsp` → `Je ne sais pas`          | Texte multi-mots inséré correctement |
| SH-06 | Désactiver un raccourci                  | Aucun remplacement pour cette entrée |
| SH-07 | Couper l'option globale                  | Tous les raccourcis inactifs         |
| SH-08 | Redémarrer le navigateur                 | Paramètres et entrées conservés      |
| SH-09 | Backend LanguageTool arrêté              | Raccourcis encore utilisables        |
| SH-10 | Ajouter un trigger en doublon            | Erreur de validation, aucune perte   |
| SH-11 | Modifier et supprimer une entrée         | Persistance et rendu corrects        |
| SH-12 | Champ `password`, `readonly`, `disabled` | Jamais de remplacement               |
| SH-13 | Composition IME active                   | Pas de remplacement au milieu        |
| SH-14 | Sélection non réduite / collage          | Pas de réécriture imprévue           |
| SH-15 | Site à éditeur React/contenteditable     | Curseur et état du site préservés    |
| SH-16 | Domaines désactivés                      | Aucune intervention Correctly        |
| SH-17 | Deux onglets/options en parallèle        | Mise à jour cohérente du cache       |
| SH-18 | Raccourci avec caractères accentués      | Unicode géré sans corruption         |
| SH-19 | Retour arrière / Undo après expansion    | Undo natif ou alternative documentée |
| SH-20 | Entrée dans une messagerie               | Pas de blocage ni d'envoi inattendu  |

### 7.2 Phrase — tests fonctionnels

| ID    | Scénario                                | Résultat attendu                              |
| ----- | --------------------------------------- | --------------------------------------------- |
| SE-01 | Écriture d'une phrase non terminée      | Pas de remplacement complet pendant la frappe |
| SE-02 | Fin de phrase sûre                      | Une seule requête/transaction pertinente      |
| SE-03 | Plusieurs matches non chevauchants      | Une nouvelle phrase calculée, une mutation    |
| SE-04 | Matches chevauchants                    | Conflits exclus ; aucun écrasement            |
| SE-05 | Texte modifié pendant requête LT        | Résultat périmé ignoré                        |
| SE-06 | Changement de champ/onglet              | Aucun résultat appliqué au mauvais éditeur    |
| SE-07 | Arrêt du serveur / timeout              | Saisie intacte, pas de gel                    |
| SE-08 | Langues FR/EN/Auto                      | Modes existants respectés                     |
| SE-09 | Dictionnaire personnel                  | Mots protégés comme auparavant                |
| SE-10 | Phrase avec URL/`M.`/nombre `3.14`      | Pas de frontière hasardeuse                   |
| SE-11 | Deux phrases successives                | Seule la phrase ciblée est remplacée          |
| SE-12 | Phrase avec emoji et caractères Unicode | Offsets corrects, texte intact                |
| SE-13 | Sélection/caret/scroll                  | Aucun saut imprévu                            |
| SE-14 | Saisie rapide suivie de backspace       | Pas de correction périmée                     |
| SE-15 | Aucun match ou suggestion ambiguë       | Aucun auto-remplacement non fiable            |
| SE-16 | Phrase dans contenteditable complexe    | Mutation sûre ou abstention contrôlée         |
| SE-17 | `bjr` puis phrase complète              | Expansion puis analyse à jour, sans boucle    |
| SE-18 | Ctrl+Z / annuler la phrase              | Retour possible selon garantie documentée     |
| SE-19 | Entrée sur WhatsApp Web/ChatGPT         | Aucun message envoyé/empêché à tort           |
| SE-20 | Tests longs textes                      | Pas d'explosion des scans/réponses            |

### 7.3 Non-régression et sécurité

- `RG-01` : V3.1 démarre/arrête/redémarre le moteur depuis la zone de notification.
- `RG-02` : port et endpoints locaux inchangés, ou migration explicitement approuvée et testée.
- `RG-03` : installation et démarrage avec Windows fonctionnels.
- `RG-04` : mise à jour V3.1 → V4 ne supprime ni dictionnaire personnel ni domaines désactivés.
- `RG-05` : extension installée séparément ; ZIP chargeable dans Chrome et Brave.
- `RG-06` : pas de frappe ni de texte utilisateur dans les logs ou stockage.
- `RG-07` : aucun scan permanent de tous les champs ; pas de fuite d'observers.
- `RG-08` : tous les tests anciens encore pertinents passent.
- `RG-09` : Build Windows vierge ou blocage explicitement documenté.
- `RG-10` : licence et redistribution Java/LanguageTool/installateur vérifiées avant publication.

---

## 8. Performance, fiabilité, confidentialité

### 8.1 Objectifs de performance indicatifs

- Expansion de raccourci : traitement local à la frontière de token, sans appel réseau ni analyse du texte entier.
- Correction de phrase : une requête pertinente par version/segment, déduplication, `debounce` raisonnable (valeur initiale à définir avec mesure, par ex. 200–400 ms), annulation/invalidation des requêtes obsolètes.
- Ne pas déclencher de gros scans à chaque `keydown` ni réécrire le DOM entier.
- Le seuil d'acceptation ne doit pas reposer sur une valeur inventée : comparer des mesures V3.1 et V4 dans une matrice de frappe rapide et de textes longs, noter la machine/navigateur.

### 8.2 Sécurité et vie privée

- Aucun service tiers. LanguageTool fonctionne sur localhost.
- Ne jamais journaliser le contenu de la phrase, des champs, le texte des raccourcis ou les valeurs de formulaire ; éviter même les exemples de vrais utilisateurs dans les tests et rapports.
- `chrome.storage.local` contient exclusivement la liste explicitement enregistrée et les paramètres ; prévenir l'utilisateur que cette donnée persiste dans le profil et disparaît potentiellement à la désinstallation.
- Ne pas traiter les champs sensibles, champs de paiement, mots de passe, OTP ou éditeurs non fiables.
- Traiter le remplacement comme **texte**, jamais comme HTML interprété.
- Conserver les limitations d'accès `host_permissions` actuelles et n'ajouter des permissions qu'avec justification.

### 8.3 Gestion des erreurs

- Corruption des données stockées : isoler/ignorer les entrées invalides, ne pas effacer silencieusement toutes les entrées ; exposer une erreur récupérable.
- Storage quota ou erreur : ne pas prétendre sauvegarder ; conserver l'interface cohérente.
- Serveur indisponible : conserver les raccourcis et l'édition normale.
- DOM détaché, editor unsupported : abandon propre, nettoyage des listeners et timers.
- Requête annulée ou en retard : ne pas appliquer après nouvelle frappe.

---

## 9. Questions techniques que l'agent doit résoudre en inspectant le code

Ces points ne sont **pas déterminables à partir de `plans/Correctly_recap_v4.md` seul** :

1. Quels modules TS gèrent actuellement la détection d'éditeur, les événements de frappe, LanguageTool et les remplacements ?
2. La V3.1 applique-t-elle automatiquement des corrections mot par mot, ou seulement lorsque l'utilisateur clique ? Décrire le comportement exact avant de le modifier.
3. Comment le dictionnaire personnel et les domaines désactivés sont-ils stockés, validés et propagés ?
4. Quel mécanisme d'édition existant préserve l'undo natif et le fonctionnement des éditeurs riches ?
5. Le serveur retourne-t-il directement les matches LanguageTool, des règles transformées ou un contrat custom ?
6. Quels contrôles sont déjà présents pour les réponses périmées, IME, shadow roots, focus/blur et MutationObserver ?
7. Comment les versions et les artefacts de release sont-ils construits depuis le répertoire réel ?
8. Existe-t-il des tests E2E navigateur ; comment exécuter des parcours sur sites authentifiés sans toucher à des comptes personnels ?

**Règle :** consigner les réponses à ces questions dans `docs/V4_AUDIT.md`, puis adapter le détail d'implémentation sans changer le produit attendu.

---

## 10. Critères d'acceptation bloquants pour `v4.0.0`

La release n'est acceptable que si **toutes** ces conditions sont vérifiées :

- [ ] Un déclencheur personnel est enregistré, modifié, supprimé et persiste après redémarrage.
- [ ] L'expansion se fait automatiquement à la frontière du token, sans LanguageTool et sans modifier d'autres mots.
- [ ] La correction de phrase est groupée en une transaction ; aucune modification mot par mot pendant la saisie ne perturbe l'utilisateur.
- [ ] Les conflits, suggestions ambiguës et réponses LanguageTool obsolètes n'entraînent jamais d'auto-édition risquée.
- [ ] Focus, sélection, caret, contenu adjacent et texte riche restent intacts, ou l'auto-édition se désactive proprement sur l'éditeur concerné.
- [ ] Cas IME, espaces, ponctuation, retours à la ligne, undo et messageries testés.
- [ ] FR/EN/Auto, domaines désactivés, dictionnaire personnel et suggestions existantes préservés.
- [ ] L'extension reste compatible avec Chrome/Brave dans les scénarios testés.
- [ ] Le backend Python+Java+LanguageTool, tray, démarrage Windows, installation/mise à jour/désinstallation n'ont pas régressé.
- [ ] `npm test`, `npm run lint`, `npm run build` et la construction Setup sont exécutés et consignés ; les cas qui échouent ne sont pas décrits comme validés.
- [ ] Packaging V4 présent, SHA256 recalculés, notes de version et rapport de recette produits.
- [ ] Aucune donnée de frappe privée n'est stockée ou transmise à un cloud.

---

## 11. Livrables attendus

```text
docs/V4_AUDIT.md                # état de départ et architecture vérifiée
docs/V4_TEST_REPORT.md          # tests et résultats observés
docs/V4_RELEASE_CHECKLIST.md   # sortie et validations encore ouvertes
docs/V4_CHANGELOG.md           # nouveautés, limites et compatibilité
plans/Correctly_plan_v4.md       # cette spécification, maintenue en cas d'écart justifié
frontend/...                    # implémentation réelle et tests dans l'arborescence existante
artifacts/release/...           # nouveaux builds V4 + SHA256SUMS.txt
```

Modifier le `README.md` et `plans/Correctly_recap_v4.md` uniquement pour refléter les évolutions réellement terminées. Ne pas supprimer les rapports historiques V3/V3.1. Pour les fichiers proposés non encore présents, respecter la structure observée du dépôt.

---

## 12. Prompt d'exécution à donner à l'agent

> **Tu développes Correctly V4 dans le dépôt existant.** Lis intégralement `plans/Correctly_plan_v4.md`, `plans/Correctly_recap_v4.md`, `README.md` et les documents V3.1 ; commence par auditer `git status` et l'architecture réelle, documente-la dans `docs/V4_AUDIT.md`, puis implémente en phases : transaction d'édition sûre → stockage local des raccourcis et UI → expansion instantanée aux frontières de mots → détection des phrases et correction LanguageTool groupée → intégration/performance → tests/packaging. Préserve V3/V3.1, la confidentialité, le serveur local et les préférences. Ne remplace pas LanguageTool par un LLM, n'ajoute pas de SQL ou de cloud. Corrige uniquement les cas sûrs automatiquement ; évite les mutations si les offsets, l'éditeur ou la révision sont incertains. Fais tourner les tests et builds réels, rapporte honnêtement les échecs et les scénarios non testés. Ne crée pas de tag `v4.0.0` et ne publie pas sans validation explicite de la recette et du dépôt.

---

## 13. Synthèse des décisions V4

| Sujet                     | Décision                                                                    |
| ------------------------- | --------------------------------------------------------------------------- |
| Granularité de correction | Phrase complète, application groupée en une transaction                     |
| Déclenchement correction  | Fin de phrase sûre ; pause uniquement pour suggestions si nécessaire        |
| Politique automatique     | Conservatrice ; ambiguïtés proposées, non imposées                          |
| Moteur grammatical        | LanguageTool local existant                                                 |
| Raccourcis                | Toujours actifs par défaut sur champs pris en charge, à la frontière de mot |
| Stockage                  | `chrome.storage.local`, sans SQL et par profil de navigateur                |
| Interface                 | Section `Raccourcis de texte` dans les options existantes                   |
| En cas de serveur arrêté  | Raccourcis fonctionnels ; correction LT indisponible sans blocage           |
| Editeurs riches           | Préserver structure/caret/undo quand vérifié ; sinon ne pas auto-modifier   |
| V3/V3.1                   | Aucune régression autorisée ; installateur et démarrage Windows conservés   |
| Livraison                 | Code + tests + rapports + artefacts vérifiés ; pas juste un build vert      |

**Fin de la spécification V4.**
