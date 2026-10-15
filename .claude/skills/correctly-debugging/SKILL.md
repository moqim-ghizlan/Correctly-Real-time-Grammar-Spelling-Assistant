---
name: correctly-debugging
description: >-
  Diagnostique et corrige les bugs de Correctly : service worker MV3
  (suspension, messages refusés, port fermé), stockage et compteur quotidien,
  erreurs Gemini (clé, modèle, 429, timeout), page d'options, échecs de build
  ou du smoke test navigateur, et dans les futurs content scripts : curseur,
  sélection, focus, IME, contenteditable et Shadow DOM. À utiliser quand
  quelque chose ne marche pas, qu'un test échoue ou qu'un comportement est
  inattendu.
---

# Débogage de Correctly

Objectif : trouver la **cause racine**, la prouver par un test qui échoue,
corriger au plus petit endroit partagé, sans régression. Pour les règles
d'architecture, voir `correctly-extension` ; ne pas les répéter ici.

## Procédure

1. **Cas précis** : navigateur (Chrome/Brave + version), profil, page
   (options, ou site + type d'éditeur), action, attendu vs observé, message
   d'erreur affiché (code `ERROR_CODES`). Ne pas déclarer « reproduit » un bug
   seulement lu dans un rapport.
2. **Localiser la couche** fautive, dans l'ordre du flux :
   `UI (settings-ui.ts) → chrome.runtime.sendMessage → isTrustedSender /
isTest…Request (background/index.ts) → ConnectionController → UsageGuard →
gemini-client.ts → parsing → saveConnection → affichage`.
3. Lire seulement les fichiers de cette couche et leurs tests ; chercher les
   appelants avec Grep avant de toucher une fonction partagée.
4. **Test de non-régression d'abord** (rouge), avec `FakeStorage`
   (`failGet`/`failSet`, ticks asynchrones réels) et `fetch` mocké. Texte et
   clés factices uniquement (`CORRECTLY_TEST_SENTINEL_KEY…`).
5. Corriger la cause, pas le symptôme ; relancer le test ciblé puis
   `npm test`, `npm run lint`, `npm run build`.
6. Si la validation exige un vrai navigateur, une vraie clé ou un site réel,
   le dire et donner l'étape manuelle ; ne pas simuler la confirmation.

## Pistes par symptôme (hypothèses à vérifier)

**Service worker / messages**

- Réponse `undefined` ou « port closed » : listener qui ne renvoie pas `true`
  pour une réponse asynchrone, ou worker suspendu en cours de requête
  (comportement attendu : tentative déjà comptée, pas de rejeu).
- Message ignoré silencieusement : forme non exacte (champ en trop) ou
  `sender.url` hors de l'origine de l'extension.
- Inspecter : `chrome://extensions` → _service worker_ → console et Network.

**Stockage / compteur**

- Compteur faux ou mise à jour perdue : écriture hors de la chaîne sérialisée
  de `UsageGuard`, ou deux écrivains pour la même clé.
- Remise à zéro inattendue : date UTC au lieu de `localDate()`, ou valeur
  corrompue normalisée en défaut.
- « Connected » qui disparaît : `keyRevision` ou modèle différent du dernier
  résultat (comportement voulu).

**Gemini**

- 400 `API_KEY_INVALID` → `INVALID_KEY` ; 404 → `MODEL_UNAVAILABLE` (modèle
  retiré : mettre à jour `GEMINI_MODELS` après vérification de la doc
  officielle) ; 429 → `RATE_LIMITED` ; réponse vide/bloquée →
  `INVALID_RESPONSE` (vérifier `maxOutputTokens` vs tokens de réflexion).
- Ne jamais ajouter de retry automatique pour « réparer » une erreur.

**Build / outils**

- `npm run build` échoue à l'audit : lire le message de `audit-dist.mjs`
  (localhost, `http://`, `eval`, chaîne `AIza…`, permission inattendue) ; corriger
  la source, pas l'audit, sauf évolution voulue du manifeste.
- `test:browser` : chemin du navigateur codé en dur dans
  `scripts/verify-browser.mjs` ; `--offline` évite l'appel Google. Un échec du
  lanceur CDP n'est pas une incompatibilité de l'extension.

**Éditeurs (content scripts V5.2+, n'existent pas encore en V5.1)**

- Curseur/sélection : offsets UTF-16 (emoji, accents combinés), sélection
  perdue au clic sur l'UI de l'extension (sauvegarder la plage avant), texte
  visible ≠ valeur de l'éditeur.
- Focus : popup qui vole le focus, `blur` avant Apply, restauration après
  écriture.
- IME : ne rien écrire pendant `compositionstart`→`compositionend`.
- Shadow DOM : `document.activeElement` s'arrête à l'hôte ; descendre par
  `shadowRoot.activeElement` (ouverts seulement) ; `getSelection()` diffère
  selon le navigateur dans un shadow root ; utiliser `event.composedPath()`.
- Éditeurs contrôlés (React…) : `value =` direct ignoré ; écrire via le setter
  natif + événement `input`, ou passer en copie seule si non sûr.
- Réponse périmée : texte modifié entre la requête et l'Apply → refuser.

## Confidentialité pendant le debug

Pas de `console.log` laissé dans le code, jamais de clé, prompt ou texte réel
dans les logs, tests, captures ou rapports. Utiliser longueurs, codes et
exemples synthétiques.

## Rendu

Reproduction · cause (confirmée ou hypothèse) · correctif et fichiers · tests
lancés avec résultat · vérification manuelle restante.
