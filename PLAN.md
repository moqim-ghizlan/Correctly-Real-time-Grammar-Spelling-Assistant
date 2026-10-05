# PLAN.md — Correctly

## 1. Nom du projet

**Correctly — Real-time Grammar & Spelling Assistant**

## 2. Description

Correctly est une extension Chrome/Brave locale et gratuite qui détecte en temps réel les fautes d’orthographe et de grammaire en français et en anglais.

L’extension doit souligner les mots ou portions de phrases contenant des erreurs directement dans les champs de saisie, puis permettre à l’utilisateur d’appliquer une correction :

- soit via une petite fenêtre de suggestion affichée au clic ;
- soit via le menu contextuel du clic droit.

Le projet doit rester gratuit, local autant que possible, léger, rapide, moderne, simple à maintenir et suffisamment propre pour un usage quotidien.

Le produit n’a pas pour objectif de reproduire Grammarly ou LanguageTool Premium dans leur totalité. L’objectif est de construire un assistant personnel solide, fonctionnel et agréable à utiliser.

---

# 3. Rôle de l’agent Codex

Tu es responsable de l’implémentation technique du projet.

Tu dois agir comme un développeur senior spécialisé dans :

- extensions Chrome Manifest V3 ;
- TypeScript ;
- JavaScript navigateur ;
- DOM ;
- gestion d’événements ;
- performance frontend ;
- tests unitaires ;
- tests d’intégration du code ;
- architecture logicielle ;
- interaction avec LanguageTool.

Tu dois respecter strictement ce plan.

Tu peux améliorer l’architecture si nécessaire, mais tu ne dois pas modifier les objectifs fonctionnels sans raison technique claire.

---

# 4. Limitation importante concernant les tests

Tu n’as PAS accès au navigateur réel de l’utilisateur.

Tu n’as PAS accès à son ordinateur.

Tu ne dois donc JAMAIS écrire :

```text
"J’ai testé l’extension dans Chrome"
```

ou :

```text
"Le clic droit fonctionne correctement dans Chrome"
```

ou :

```text
"J’ai vérifié que cela fonctionne sur Gmail"
```

si tu ne disposes pas réellement d’un navigateur contrôlable permettant ce test.

Ton travail de test doit porter sur :

- le code ;
- les fonctions ;
- les modules ;
- les transformations de texte ;
- les offsets ;
- le debounce ;
- le cache ;
- les appels réseau mockés ;
- la logique de remplacement ;
- la gestion des erreurs ;
- les interactions simulées dans un DOM de test.

Utiliser des outils comme :

- Vitest ;
- jsdom ;
- mocks ;
- tests unitaires ;
- tests d’intégration simulés.

Les tests réels suivants seront réalisés MANUELLEMENT par l’utilisateur :

- Chrome ;
- Brave ;
- Gmail ;
- ChatGPT ;
- LinkedIn ;
- Reddit ;
- différents champs de saisie ;
- affichage des soulignements ;
- popup graphique ;
- clic droit ;
- positionnement visuel ;
- comportement réel avec le navigateur.

À la fin du projet, tu dois fournir une checklist claire de tests manuels que l’utilisateur devra effectuer.

---

# 5. Objectif fonctionnel principal

Le comportement attendu est le suivant :

```text
Utilisateur écrit
      ↓
Détection d’une modification
      ↓
Debounce
      ↓
Extraction du texte utile
      ↓
Analyse LanguageTool
      ↓
Réception des erreurs
      ↓
Affichage d’un soulignement
      ↓
Interaction utilisateur
      ↓
Correction
```

Le fonctionnement doit sembler temps réel.

L’utilisateur ne doit pas sentir de ralentissement lors de la saisie.

---

# 6. Fonctionnalités obligatoires MVP

Le MVP doit contenir toutes les fonctionnalités suivantes.

## 6.1 Détection temps réel

Détecter les modifications du texte pendant que l’utilisateur écrit.

Utiliser principalement :

```text
input
```

Éviter d’utiliser `keyup` comme événement principal.

## 6.2 Debounce

Ne jamais lancer une correction à chaque touche.

Valeur par défaut :

```text
400 ms
```

Exemple :

```text
j
je
je s
je su
je sui
je suis

→ une seule analyse après la pause
```

## 6.3 Langues

Support obligatoire :

```text
Français
Anglais
Auto
```

Le mode Auto doit être la valeur par défaut si le moteur utilisé le permet correctement.

## 6.4 Soulignement des erreurs

Les fautes doivent être soulignées.

Le soulignement doit être :

- propre ;
- visible ;
- discret ;
- non destructif ;
- sans modifier le texte original.

## 6.5 Fenêtre de correction

Un clic sur une erreur doit ouvrir une petite fenêtre.

Exemple :

```text
┌─────────────────────────────┐
│ Orthographe                 │
│                             │
│ Mot incorrect               │
│                             │
│ [ suis ]                    │
│                             │
│ Ignorer                     │
└─────────────────────────────┘
```

## 6.6 Correction en un clic

Cliquer sur une suggestion doit remplacer uniquement la portion concernée.

## 6.7 Clic droit

Sur une erreur :

```text
clic droit
↓
Corriger : "suggestion"
```

La meilleure suggestion doit être proposée.

## 6.8 Ignorer

Permettre :

```text
Ignorer cette erreur
```

L’erreur ne doit plus être affichée pour cette occurrence jusqu’à la prochaine modification significative du texte.

---

# 7. Fonctionnalités secondaires recommandées

Après le MVP uniquement :

- désactivation par site ;
- dictionnaire personnel ;
- activation/désactivation globale ;
- délai configurable ;
- affichage du nombre d’erreurs ;
- choix des catégories ;
- mode sombre ;
- stockage local des paramètres.

Ne pas commencer ces fonctionnalités tant que le cœur du MVP n’est pas stable.

---

# 8. Stack technique

Stack recommandée :

```text
TypeScript
Manifest V3
HTML
CSS
Vite
Vitest
jsdom
ESLint
Prettier
LanguageTool local
```

Ne pas utiliser React, Vue ou Angular pour la V1.

Il n’y a aucune justification pour utiliser un framework lourd dans ce projet.

---

# 9. Règles générales de développement

Le code doit respecter :

- TypeScript strict ;
- fonctions courtes ;
- noms explicites ;
- faible couplage ;
- modules testables ;
- constantes centralisées ;
- pas de duplication ;
- pas de valeurs magiques ;
- gestion claire des erreurs.

Ne pas créer une architecture inutilement complexe.

---

# 10. Architecture recommandée

```text
correctly/
│
├── manifest.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
│
├── src/
│   │
│   ├── background/
│   │   └── service-worker.ts
│   │
│   ├── content/
│   │   ├── content-script.ts
│   │   ├── field-detector.ts
│   │   ├── text-extractor.ts
│   │   ├── field-state.ts
│   │   ├── correction-controller.ts
│   │   ├── highlighter.ts
│   │   ├── overlay.ts
│   │   ├── suggestion-popup.ts
│   │   ├── replacement.ts
│   │   └── observers.ts
│   │
│   ├── correction/
│   │   ├── languagetool-client.ts
│   │   ├── correction-types.ts
│   │   ├── correction-cache.ts
│   │   └── language.ts
│   │
│   ├── context-menu/
│   │   └── context-menu.ts
│   │
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.ts
│   │   └── popup.css
│   │
│   ├── options/
│   │   ├── options.html
│   │   ├── options.ts
│   │   └── options.css
│   │
│   └── shared/
│       ├── constants.ts
│       ├── debounce.ts
│       ├── storage.ts
│       ├── logger.ts
│       └── utils.ts
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── fixtures/
│   └── mocks/
│
└── docs/
    ├── MANUAL_TESTS.md
    └── ARCHITECTURE.md
```

Cette architecture peut être légèrement adaptée.

Ne pas ajouter des dossiers sans nécessité.

---

# 11. Méthode de travail obligatoire

Travailler par phases.

Chaque phase doit :

1. modifier une partie limitée du projet ;
2. être compilable ;
3. être testée automatiquement ;
4. ne pas casser les tests précédents ;
5. être terminée avant de passer à la suivante.

Ordre obligatoire :

```text
1. Initialisation
2. Manifest
3. Détection champs
4. État par champ
5. Debounce
6. LanguageTool client
7. Cache
8. Race conditions
9. Modèle de corrections
10. Highlight textarea/input
11. Popup suggestion
12. Replacement
13. Contenteditable
14. Context menu
15. Ignore
16. Paramètres
17. Tests complets
18. Documentation
```

---

# 12. Phase 1 — Initialisation

Créer :

```text
package.json
tsconfig.json
vite.config.ts
vitest.config.ts
manifest.json
```

Configurer :

- TypeScript strict ;
- build extension ;
- tests ;
- lint ;
- format.

Scripts attendus :

```json
{
  "scripts": {
    "dev": "...",
    "build": "...",
    "test": "...",
    "test:watch": "...",
    "lint": "...",
    "format": "..."
  }
}
```

---

# 13. Phase 2 — Manifest V3

Créer un manifest minimal.

Permissions uniquement nécessaires.

Probablement :

```text
storage
contextMenus
```

Host permissions uniquement pour :

```text
http://127.0.0.1/*
http://localhost/*
```

si LanguageTool est local.

Ne pas demander :

```text
cookies
history
downloads
bookmarks
```

sans raison.

---

# 14. Phase 3 — Détection des champs

Support obligatoire :

```html
<textarea>
<input type="text">
<input type="search">
<div contenteditable="true">
```

Support également :

```html
<div role="textbox" contenteditable="true">
```

Champs à ignorer :

```html
<input type="password">
<input type="number">
<input type="email">
```

Le type email peut éventuellement être supporté plus tard.

Pour la V1 : ignorer.

---

# 15. Tests de code — détection de champs

Créer des tests jsdom.

Cas à tester :

```text
textarea → détecté
input text → détecté
input search → détecté
contenteditable → détecté
role textbox + contenteditable → détecté
password → ignoré
number → ignoré
email → ignoré
div normal → ignoré
```

---

# 16. Phase 4 — Champs dynamiques

Les pages modernes ajoutent des champs après chargement.

Utiliser :

```text
MutationObserver
```

Un champ ajouté plus tard doit être détecté.

Ne pas rescanner tout le document à chaque mutation.

Analyser seulement :

```text
addedNodes
```

---

# 17. Test code — MutationObserver

Dans jsdom :

1. charger une page ;
2. initialiser observer ;
3. ajouter un textarea ;
4. vérifier qu’il est enregistré.

Tester également l’ajout d’un conteneur contenant plusieurs champs.

---

# 18. Phase 5 — État par champ

Chaque champ doit avoir son propre état.

Exemple :

```ts
interface FieldState {
  element: HTMLElement;
  lastText: string;
  currentText: string;
  matches: CorrectionMatch[];
  ignoredMatches: Set<string>;
  requestId: number;
}
```

Ne pas stocker toutes les informations dans des variables globales.

Utiliser si possible :

```text
WeakMap<HTMLElement, FieldState>
```

---

# 19. Phase 6 — Extraction du texte

Créer une fonction unique :

```ts
getTextFromField(element)
```

Pour :

```text
input
textarea
contenteditable
```

Tester séparément.

---

# 20. Phase 7 — Détection de modification

Écouter :

```text
input
```

Lorsqu’un champ change :

```text
mise à jour état
↓
debounce
↓
analyse
```

---

# 21. Debounce obligatoire

Valeur :

```ts
const DEFAULT_DEBOUNCE_MS = 400;
```

Ne pas coder :

```ts
setTimeout(..., 400)
```

dans plusieurs fichiers.

---

# 22. Test unitaire — debounce

Scénario :

```text
10 appels en moins de 400 ms
```

Résultat attendu :

```text
1 seule exécution
```

Utiliser les fake timers de Vitest.

---

# 23. Phase 8 — LanguageTool local

Le moteur principal est LanguageTool.

URL par défaut :

```text
http://127.0.0.1:8081
```

Centraliser :

```ts
LANGUAGE_TOOL_BASE_URL
```

Ne jamais répéter l’URL partout.

---

# 24. Requête LanguageTool

Créer une classe ou fonction dédiée.

Exemple logique :

```ts
checkText(text, language)
```

Retour :

```ts
Promise<CorrectionMatch[]>
```

Le reste de l’application ne doit pas dépendre directement du format JSON brut de LanguageTool.

---

# 25. Normalisation des données

Créer un modèle interne.

Exemple :

```ts
interface CorrectionMatch {
  id: string;
  offset: number;
  length: number;
  message: string;
  shortMessage?: string;
  replacements: string[];
  category: string;
  ruleId: string;
  sentence?: string;
}
```

Convertir immédiatement la réponse LanguageTool vers ce type.

---

# 26. Test code — client LanguageTool

Ne pas dépendre d’un vrai serveur dans les tests.

Mock de `fetch`.

Tester :

- réponse valide ;
- aucune erreur ;
- une erreur ;
- plusieurs erreurs ;
- aucune suggestion ;
- HTTP 500 ;
- timeout ;
- réponse JSON invalide ;
- fetch rejeté.

---

# 27. Gestion LanguageTool indisponible

Si LanguageTool est éteint :

NE PAS :

- crash ;
- boucle infinie ;
- retry agressif ;
- spam console.

Faire :

```text
état unavailable
```

Puis attendre avant nouvelle tentative.

Exemple :

```text
retry après 10 secondes
```

---

# 28. Phase 9 — Cache

Créer un cache.

Clé :

```text
langue + texte
```

Exemple :

```text
fr::bonjour je sui ici
```

Limite :

```text
100 entrées
```

Utiliser une stratégie simple LRU ou FIFO.

---

# 29. Test code — cache

Cas :

```text
texte A analysé
texte A redemandé
```

Résultat :

```text
pas de deuxième appel fetch
```

Tester également :

```text
101 entrées
```

Vérifier que le cache ne grossit pas indéfiniment.

---

# 30. Phase 10 — Requêtes obsolètes

Problème classique :

```text
requête A démarre
utilisateur continue
requête B démarre
B termine
A termine
```

Ne jamais afficher A après B.

Utiliser :

```text
requestId
```

À chaque analyse :

```text
state.requestId++
```

Une réponse ne doit être appliquée que si son ID correspond au dernier.

---

# 31. Test code — race condition

Mock :

```text
requête A lente
requête B rapide
```

Vérifier :

```text
seule B est appliquée
```

---

# 32. Phase 11 — Langue

Options :

```text
auto
fr
en
```

Si LanguageTool peut gérer `auto`, utiliser cette capacité.

Sinon créer une stratégie simple.

Ne pas construire un système NLP complexe pour détecter la langue.

---

# 33. Phase 12 — Highlight

Le système doit présenter visuellement les erreurs.

Types :

```text
spelling
grammar
style
other
```

Pour le MVP :

```text
spelling
grammar
```

suffisent.

---

# 34. Textarea et input

Important : un `<textarea>` ne permet pas de styliser individuellement ses mots.

Il faut donc créer un système d’overlay.

Structure conceptuelle :

```text
wrapper
├── overlay
└── textarea
```

L’overlay doit reproduire :

- taille ;
- padding ;
- font-family ;
- font-size ;
- font-weight ;
- line-height ;
- letter-spacing ;
- scroll.

---

# 35. Contraintes overlay

L’overlay :

```css
pointer-events: none;
```

Il ne doit jamais :

- bloquer le curseur ;
- bloquer la sélection ;
- bloquer le clic ;
- modifier le texte réel.

---

# 36. Synchronisation overlay

Synchroniser :

```text
scrollTop
scrollLeft
width
height
```

Tester la logique par fonctions séparées.

---

# 37. Sécurité HTML

Le texte utilisateur ne doit jamais être injecté directement via :

```text
innerHTML = userText
```

sans échappement.

Créer une fonction sûre.

Tester :

```text
<script>alert(1)</script>
```

Cela doit apparaître comme texte.

Jamais être exécuté.

---

# 38. Contenteditable

Ne pas modifier `innerHTML` en permanence.

Risques :

- curseur déplacé ;
- format perdu ;
- React cassé ;
- éditeur cassé.

Préférer une stratégie non destructive.

Pour V1 : utiliser autant que possible une couche visuelle ou Range API.

---

# 39. Règle stricte contenteditable

Si une technique fiable de soulignement non destructif n’est pas encore disponible :

NE PAS bricoler une solution qui réécrit tout le DOM.

Limiter temporairement la fonctionnalité.

Documenter clairement ce qui manque.

La stabilité passe avant le support complet.

---

# 40. Phase 13 — Popup de suggestion

Au clic sur une erreur : ouvrir une petite popup.

Contenu :

```text
catégorie
message
suggestion 1
suggestion 2
suggestion 3
ignorer
```

Maximum :

```text
5 suggestions
```

---

# 41. Design popup

Style :

- compact ;
- moderne ;
- sobre ;
- propre ;
- arrondi léger ;
- ombre légère.

Pas de design enfantin.

Pas de gradient inutile.

Pas de grosse animation.

Pas d’emojis dans l’UI principale.

---

# 42. Design cible

Exemple :

```text
width: 300px
border-radius: 10px
padding: 12px
```

Thème clair et sombre possible.

---

# 43. Positionnement popup

La popup doit s’ouvrir près de la faute.

Créer une fonction indépendante :

```ts
calculatePopupPosition(...)
```

Cette fonction doit être testable.

---

# 44. Test code — position popup

Tester :

```text
erreur centre écran
erreur bord droit
erreur bord gauche
erreur en bas
erreur en haut
```

La position retournée doit rester dans le viewport.

---

# 45. Fermeture popup

Fermer si :

```text
clic extérieur
Escape
nouveau champ actif
erreur supprimée
```

---

# 46. Phase 14 — Remplacement

Créer une fonction pure :

```ts
replaceTextRange(text, offset, length, replacement)
```

Exemple :

```text
texte : "je sui ici"
offset : 3
length : 3
replacement : "suis"

résultat : "je suis ici"
```

---

# 47. Tests remplacement obligatoires

Tester :

```text
début
milieu
fin
accents
apostrophes
emoji
caractères Unicode
texte vide
replacement vide
```

Attention aux offsets Unicode.

---

# 48. Vérification avant remplacement

Avant d’appliquer une correction, vérifier que le texte actuel correspond toujours à la version analysée.

Exemple :

Analyse :

```text
je sui ici
```

Puis l’utilisateur écrit :

```text
bonjour, je sui ici
```

Ne pas appliquer l’ancien offset aveuglément.

---

# 49. Stratégie de sécurité remplacement

Stocker avec chaque correction :

```text
sourceText
offset
length
originalFragment
```

Avant remplacement :

```text
currentText.slice(offset, offset + length)
```

doit correspondre à :

```text
originalFragment
```

Sinon :

```text
annuler correction
relancer analyse
```

---

# 50. Curseur

Le curseur ne doit jamais bouger pendant l’analyse.

Lors d’un remplacement :

- conserver la sélection ;
- calculer nouvelle position ;
- replacer le curseur logiquement.

---

# 51. Test code — curseur

Pour input/textarea simulés :

```text
selectionStart
selectionEnd
```

Tester remplacement :

- avant le curseur ;
- sur le curseur ;
- après le curseur.

---

# 52. Phase 15 — Menu clic droit

Utiliser :

```text
chrome.contextMenus
```

Créer un élément :

```text
Correctly: Corriger
```

Puis le mettre à jour lorsque nécessaire.

---

# 53. Contraintes clic droit

Chrome ne permet pas un menu contextuel totalement libre.

Le design doit respecter les limites natives.

La meilleure suggestion peut être affichée :

```text
Correctly → Corriger en "suis"
```

---

# 54. Communication content ↔ background

Le content script doit transmettre au service worker :

```text
erreur active
suggestion principale
field identifier
offset
```

Le service worker gère le menu.

---

# 55. Test code — context menu

Mock de :

```text
chrome.contextMenus
chrome.runtime
```

Tester :

- création ;
- mise à jour ;
- masquage ;
- click ;
- message vers content script.

---

# 56. Clic droit hors erreur

Aucune correction ne doit être proposée.

Le menu peut être masqué ou désactivé.

---

# 57. Phase 16 — Ignore

Créer un ID stable par occurrence.

Exemple basé sur :

```text
ruleId
offset
length
fragment
```

Quand utilisateur choisit Ignorer :

```text
ajouter ID au FieldState
```

---

# 58. Test ignore

Tester :

```text
erreur présente
ignorer
relancer affichage même état
```

Résultat :

```text
erreur cachée
```

Puis modifier texte.

L’ignore temporaire peut être réinitialisé.

---

# 59. Phase 17 — Paramètres

Après MVP fonctionnel.

Stocker avec :

```text
chrome.storage.local
```

Paramètres :

```text
enabled
language
debounceMs
spellingEnabled
grammarEnabled
disabledSites
```

---

# 60. Popup extension

Quand utilisateur clique sur l’icône :

```text
Correctly
Correction : Activée

Langue : Auto

[ Désactiver ]
[ Paramètres ]
```

Design minimal propre.

---

# 61. Désactiver sur un site

Prévoir :

```text
Désactiver sur ce site
```

Stocker hostname.

---

# 62. Dictionnaire personnel

Option post-MVP.

Stocker :

```text
customDictionary: string[]
```

Exemples :

```text
Django
OpenAI
Moqim
Drones
```

---

# 63. Performance

Règle absolue : l’extension ne doit pas ralentir la frappe.

Interdit :

```text
setInterval toutes les 100 ms
scan complet du DOM en boucle
requête à chaque touche
MutationObserver global coûteux
```

---

# 64. Taille de texte

Définir une limite.

Exemple :

```ts
MAX_TEXT_LENGTH = 5000;
```

Pour un texte très long : analyser seulement une portion proche du curseur ou un paragraphe.

Cette optimisation peut arriver après MVP.

---

# 65. Optimisation phrase courante

Idéalement :

```text
texte complet
↓
position curseur
↓
phrase autour curseur
↓
analyse uniquement cette phrase
```

Mais ne pas complexifier trop tôt.

Version initiale acceptable :

```text
analyse champ complet si < 5000 caractères
```

---

# 66. Sécurité

Ne jamais traiter :

```text
password
```

Ne jamais récupérer :

- cookies ;
- auth tokens ;
- page complète ;
- données inutiles.

---

# 67. Confidentialité

Par défaut :

```text
texte → localhost LanguageTool
```

Aucun texte ne doit aller sur internet.

Ne pas ajouter d’API distante cachée.

---

# 68. CSP

Respecter Manifest V3.

Interdit :

```text
eval
new Function
script CDN
code distant
```

---

# 69. Logs

Créer un logger simple.

Modes :

```text
debug
info
warn
error
```

En production : ne pas afficher les logs debug.

---

# 70. Gestion des erreurs

Toute opération async doit gérer les erreurs.

Pas de promesse rejetée non gérée.

Pas de crash global.

---

# 71. ESLint

Configurer au minimum :

- no-unused-vars ;
- no-explicit-any si possible ;
- no-floating-promises ;
- règles TypeScript recommandées.

---

# 72. TypeScript

Configurer :

```text
strict: true
noImplicitAny: true
strictNullChecks: true
```

Éviter `any`.

---

# 73. Tests obligatoires avant chaque fin de phase

Avant de considérer une phase terminée :

```bash
npm run lint
npm run test
npm run build
```

Les trois doivent réussir.

---

# 74. Interdiction de contourner les tests

Ne jamais :

- supprimer un test qui échoue juste pour passer ;
- remplacer une assertion par une assertion vide ;
- désactiver une règle ESLint sans raison ;
- ajouter `any` partout ;
- ignorer les erreurs TypeScript.

Corriger la cause réelle.

---

# 75. Tests unitaires minimum

Créer des tests pour :

1. field detection ;
2. text extraction ;
3. debounce ;
4. cache ;
5. LanguageTool parsing ;
6. replacement ;
7. stale request handling ;
8. popup positioning ;
9. ignore logic ;
10. language selection ;
11. settings ;
12. escaping HTML ;
13. context menu messaging.

---

# 76. Tests d’intégration code

Avec jsdom.

Créer une page fixture :

```html
<textarea id="a"></textarea>
<input id="b" type="text">
<div id="c" contenteditable="true"></div>
```

Simuler :

```text
focus
input
attente debounce
mock response LanguageTool
affichage erreur
clic suggestion
texte corrigé
```

---

# 77. Test d’intégration principal

Scénario :

```text
textarea = "je sui ici"
```

LanguageTool mock retourne :

```text
offset 3
length 3
replacement "suis"
```

Le système doit :

1. créer erreur ;
2. afficher annotation logique ;
3. accepter clic correction ;
4. obtenir :

```text
je suis ici
```

---

# 78. Test plusieurs champs

Fixture :

```text
textarea A
textarea B
input C
contenteditable D
```

Vérifier :

- états séparés ;
- corrections séparées ;
- aucune fuite d’état.

---

# 79. Test suppression champ

Créer champ dynamique.

Puis supprimer.

Vérifier :

- état supprimé ;
- listeners nettoyés si nécessaire ;
- overlay supprimé ;
- pas d’erreur.

---

# 80. Test requête obsolète

Simuler :

```text
texte A
requête A
texte B
requête B
B répond
A répond
```

Résultat final : B uniquement.

---

# 81. Test serveur indisponible

Mock fetch rejeté.

Résultat :

- pas de crash ;
- statut unavailable ;
- retry contrôlé.

---

# 82. Test XSS

Texte :

```html
<img src=x onerror=alert(1)>
<script>alert(1)</script>
```

Vérifier :

- affiché en texte ;
- jamais interprété comme HTML.

---

# 83. Test Unicode

Tester :

```text
é
è
à
ç
œ
😊
🇫🇷
```

Le remplacement ne doit pas casser le texte.

---

# 84. Tests français

Fixtures :

```text
je sui content
Il sont parti hier.
je vais a paris demain
```

Utiliser réponses mockées.

Ne pas dépendre du vrai comportement LanguageTool pour les tests unitaires.

---

# 85. Tests anglais

Fixtures :

```text
I has a car.
She go to school.
```

---

# 86. Ne pas tester LanguageTool comme une boîte noire

Les tests du projet doivent tester NOTRE code.

Ne pas créer une suite de tests fragile dépendant du serveur LanguageTool réel.

Les appels LanguageTool doivent être mockés dans les tests automatisés.

---

# 87. Tests manuels à fournir à l’utilisateur

À la fin, générer :

```text
docs/MANUAL_TESTS.md
```

Ce fichier est destiné à l’utilisateur.

Il doit expliquer précisément comment tester l’extension manuellement.

---

# 88. Checklist manuelle minimale

Le fichier MANUAL_TESTS.md devra contenir :

```text
[ ] Chrome charge l’extension
[ ] Brave charge l’extension
[ ] LanguageTool local démarre
[ ] textarea fonctionne
[ ] input fonctionne
[ ] contenteditable fonctionne
[ ] français fonctionne
[ ] anglais fonctionne
[ ] soulignement visible
[ ] popup visible
[ ] correction au clic
[ ] clic droit
[ ] curseur reste correct
[ ] frappe rapide fluide
[ ] scroll textarea
[ ] plusieurs champs
[ ] plusieurs onglets
[ ] ChatGPT
[ ] Gmail
[ ] LinkedIn
```

Ne pas cocher ces cases automatiquement.

C’est l’utilisateur qui les valide.

---

# 89. Ce qu’il ne faut surtout PAS faire

Ne jamais :

1. ajouter une API payante ;
2. envoyer le texte vers OpenAI ;
3. envoyer le texte vers Google ;
4. envoyer le texte vers un serveur distant ;
5. utiliser Grammarly API ;
6. faire une requête par caractère ;
7. réécrire entièrement un contenteditable ;
8. déplacer le curseur pendant analyse ;
9. modifier le texte automatiquement sans clic ;
10. stocker les textes de l’utilisateur ;
11. demander trop de permissions Chrome ;
12. ajouter React inutilement ;
13. ajouter une base de données ;
14. ajouter un backend cloud ;
15. ajouter Docker sans nécessité ;
16. complexifier avec microservices ;
17. mettre du code dans un seul fichier géant ;
18. utiliser `any` partout ;
19. masquer les erreurs TypeScript ;
20. considérer le projet fini uniquement parce qu’il compile.

---

# 90. Ce qu’il ne faut pas faire avec le texte utilisateur

Ne pas :

```text
sauvegarder le texte
logger le texte complet
envoyer le texte dans analytics
mettre le texte dans localStorage
mettre le texte dans chrome.storage
```

Le texte doit rester temporaire en mémoire.

---

# 91. Ce qu’il faut absolument protéger

Les éléments critiques :

```text
offsets
curseur
sélection
focus
DOM original
performance
ordre des requêtes
```

---

# 92. UI / UX générale

Le design doit être :

```text
moderne
minimal
sobre
professionnel
```

Mais pas premium complexe.

Le but :

```text
"outil sérieux fait proprement"
```

et non :

```text
"prototype étudiant bricolé"
```

---

# 93. Palette suggérée

Clair :

```text
Background : #FFFFFF
Text : #111827
Secondary : #6B7280
Border : #E5E7EB
Primary : #2563EB
Spelling : #DC2626
Grammar : #D97706
```

Sombre :

```text
Background : #111827
Text : #F9FAFB
Secondary : #9CA3AF
Border : #374151
```

---

# 94. Typographie

Utiliser :

```text
system-ui
-apple-system
BlinkMacSystemFont
Segoe UI
sans-serif
```

Pas besoin d’importer une font externe.

---

# 95. Animations

Maximum :

```text
opacity
transform léger
100–150 ms
```

Pas de transitions lourdes.

---

# 96. Icône

Prévoir une icône simple.

Concept possible :

```text
C + check
```

ou :

```text
lettre C soulignée
```

Pas prioritaire avant que le moteur fonctionne.

---

# 97. Gestion de version

Utiliser Git proprement.

Commits recommandés :

```text
feat: initialize extension
feat: detect editable fields
feat: add languagetool client
feat: add correction cache
feat: add textarea overlay
feat: add suggestion popup
feat: add replacement logic
feat: add context menu
test: add correction integration tests
docs: add manual testing guide
```

---

# 98. Critères de fin MVP

Le MVP n’est PAS terminé tant que :

```text
npm run lint
npm run test
npm run build
```

ne passent pas.

Et que les fonctions suivantes ne sont pas présentes :

- détection input ;
- debounce ;
- LanguageTool ;
- cache ;
- français ;
- anglais ;
- erreurs normalisées ;
- highlighting ;
- popup ;
- correction ;
- clic droit ;
- ignore ;
- protection race condition ;
- protection offsets ;
- tests automatisés ;
- guide de tests manuels.

---

# 99. Rapport final obligatoire de Codex

À la fin, produire un résumé sous cette forme :

```text
## Implémenté

- ...
- ...
- ...

## Tests automatisés

- X tests
- tous passent / problèmes restants

## Build

- succès / échec

## Limites connues

- ...
- ...

## Tests manuels à réaliser

Voir docs/MANUAL_TESTS.md

## Commandes

npm install
npm run test
npm run build
```

---

# 100. Ne jamais mentir sur l’état du projet

Si une fonctionnalité n’est pas fiable :

```text
support partiel
```

Si un test est impossible :

```text
test manuel requis
```

Si contenteditable n’est pas stable :

```text
textarea/input stables, contenteditable encore limité
```

Ne jamais déclarer une fonctionnalité terminée si elle n’est pas réellement implémentée dans le code.

---

# 101. Priorité absolue

Ordre des priorités :

```text
1. stabilité
2. correction correcte
3. curseur/focus
4. performance
5. simplicité
6. UX
7. fonctionnalités bonus
```

Une fonctionnalité bonus ne doit jamais casser une fonction de base.

---

# 102. Philosophie finale

Correctly doit être un outil :

```text
simple
rapide
local
gratuit
prévisible
fiable
```

Éviter toute dépendance inutile.

Éviter toute sophistication prématurée.

Faire d’abord une V1 solide.

Ensuite seulement :

- dictionnaire personnel ;
- meilleure détection de langue ;
- amélioration style ;
- suggestions avancées ;
- éventuellement IA locale.
