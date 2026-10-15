---
name: correctly-extension
description: >-
  Développe l'extension Correctly (Chrome/Brave, Manifest V3, TypeScript) :
  nouvelles fonctionnalités et refactorisations dans frontend/src (service
  worker, page d'options, contrats de messages, stockage, client Gemini,
  futurs content scripts V5.2+), avec leurs tests Vitest. À utiliser dès qu'on
  ajoute ou modifie du code applicatif ou le manifeste.
---

# Développement de l'extension Correctly

Les règles générales sont dans `CLAUDE.md`. Ce skill décrit **comment**
ajouter du code qui respecte l'architecture V5. Pour un bug, voir
`correctly-debugging` ; pour toute nouvelle permission ou donnée sensible,
appliquer aussi `correctly-security`.

## 1. Avant d'écrire

1. Identifier le jalon visé (`v5/v5.N.md`) et vérifier dans le code que les
   prérequis existent réellement. S'ils manquent, s'arrêter et le dire.
2. Lire les fichiers concernés et leurs tests, pas tout le dépôt. Points
   d'entrée : `frontend/src/background/index.ts`, `src/options/settings-ui.ts`,
   `src/shared/*.ts`, `frontend/manifest.json`, `frontend/vite.config.ts`.
3. Réutiliser l'existant avant d'ajouter : `CorrectlyError` + `ERROR_CODES`
   (`shared/errors.ts`), `STORAGE_KEYS` / `loadX` / `saveX`
   (`shared/storage.ts`), `normalize*` (`shared/settings.ts`), `localDate`,
   `GEMINI_MODELS`, `UsageGuard`, `FakeStorage` pour les tests.

## 2. Architecture à respecter

```text
page d'options / (futur) content script ──sendMessage({type,…})──► service worker ──fetch──► Gemini
```

- **Le service worker est le seul à appeler le réseau** et le seul à lire la
  clé. Les pages et content scripts envoient une action, jamais la clé.
- **Messages** : chaque action a une constante `correctly.v5.*` et un garde de
  forme stricte dans `shared/contracts.ts` (modèle : `isTestConnectionRequest`,
  clés exactes, pas de champ en trop). Le listener de `background/index.ts`
  filtre d'abord `isTrustedSender`, puis la forme ; la réponse est reconstruite
  champ par champ (modèle : `toConnectionResult`), jamais transmise brute.
- **Stockage** : uniquement `chrome.storage.local` via `StorageArea` injectable.
  Nouvelle donnée = nouvelle clé dans `STORAGE_KEYS` + fonction `normalize*`
  qui transforme toute valeur corrompue en défaut sûr. **Un seul écrivain par
  clé** (la page écrit `settings`, le worker écrit `connection`/`usage`).
- **Concurrence** : toute séquence lire→modifier→écrire partagée passe par une
  chaîne sérialisée (modèle : `UsageGuard`). Réserver/compter **avant** le
  `fetch`.
- **Gemini** : modèles uniquement depuis l'allowlist `GEMINI_MODELS` ; clé dans
  l'en-tête `x-goog-api-key` ; options `fetch` de `gemini-client.ts`
  (`credentials:'omit'`, `redirect:'error'`, timeout `AbortController`) ;
  **aucun retry automatique** ; texte d'erreur du fournisseur jamais affiché.
- **Erreurs UI** : codes de `ERROR_CODES` avec message fixe en anglais ; ajouter
  un code plutôt qu'un message libre.
- **Build** : chaque nouveau point d'entrée (ex. content script) doit être
  ajouté à `rollupOptions.input` de `frontend/vite.config.ts` **et** au
  manifeste ; `scripts/audit-dist.mjs` refuse tout ce qui n'est pas attendu
  (popup, permissions, hôtes, localhost…) : l'adapter consciemment, jamais le
  contourner.

## 3. Éditeurs de texte (V5.2+ uniquement)

Aucun content script n'existe en V5.1. Quand un jalon en ajoute :

- Pas de modification automatique : aperçu puis **Apply explicite**.
- Écriture directe seulement sur `textarea`, `input[type=text]` et
  `contenteditable` à nœud texte unique ; éditeurs riches
  (ProseMirror/Quill/Slate/Monaco, iframes cross-origin) → copie seule.
- Juste avant Apply : même élément, même texte source, même sélection, pas de
  composition IME en cours ; sinon refuser (« Text changed since generation »).
- Exclure `password`, `readonly`, `disabled`. Aucune clé ni nœud DOM dans les
  messages ; l'instantané de l'éditeur reste dans le content script.
- Détails de diagnostic curseur/focus/Shadow DOM : `correctly-debugging`.

## 4. Tests

- Chaque comportement ajouté a son test dans `frontend/tests/unit/` (logique
  pure, `FakeStorage`) ou `integration/` (worker, page d'options en jsdom).
- Couvrir : nominal, entrée invalide/corrompue, concurrence, échec stockage,
  échec réseau/timeout, et le fait qu'**aucune requête** ne part sans action
  explicite.
- Lancer le test ciblé (`npx vitest run --config frontend/vitest.config.ts
<fichier>`), puis `npm test`, `npm run lint` et `npm run build` avant de
  conclure.

## 5. Rendu

Fichiers modifiés · tests lancés et résultat réel · ce qui reste à vérifier
manuellement dans Chrome/Brave (`docs/v5.1/MANUAL_CHECKLIST.md`).
