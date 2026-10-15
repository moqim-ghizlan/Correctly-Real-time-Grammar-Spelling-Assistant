---
name: correctly-security
description: >-
  Audite et protège la sécurité et la confidentialité de Correctly : clé API
  Gemini, texte de l'utilisateur, permissions et CSP du manifeste MV3,
  messages entre pages/content scripts et service worker, communication
  réseau avec l'API Gemini (seul serveur autorisé ; plus aucun serveur local),
  stockage, coûts et audit de dist/. À utiliser pour une revue de sécurité, un
  ajout de permission, d'hôte, de message, de donnée stockée ou d'envoi de
  texte au fournisseur.
---

# Sécurité et confidentialité de Correctly

Référence : `docs/v5.1/SECURITY.md` (contrôles et modèle de menace). Ce skill
dit quoi vérifier quand on change quelque chose. Toujours lire le code actuel.

## Frontières de confiance

```text
site web (non fiable) ─► content script (V5.2+) ─► service worker ─► generativelanguage.googleapis.com
                                 page d'options ─┘        │
                                                 chrome.storage.local (clé en clair)
```

**Il n'y a plus de serveur local.** Toute réintroduction de `localhost`,
`127.0.0.1`, d'un port, de native messaging ou d'un proxy est un changement
d'architecture interdit par les specs V5 sans accord explicite ; l'audit de
`dist/` la bloque.

## Checklist par type de changement

**Manifeste** (`frontend/manifest.json`)

- Permissions actuelles : `storage` ; hôte : `https://generativelanguage.googleapis.com/*`.
  Chaque ajout (`contextMenus`, `commands`, `activeTab`, `scripting`…) doit être
  justifié par le jalon, documenté dans `docs/`, et ajouté à l'allowlist de
  `scripts/audit-dist.mjs` avec son test dans `tests/unit/audit-dist.test.ts`.
- Refuser par défaut : `<all_urls>`, `tabs`, `clipboardRead`, `nativeMessaging`,
  `externally_connectable`, `web_accessible_resources` larges, `http://`.
- CSP `extension_pages` : pas de `unsafe-eval`/`unsafe-inline`, `connect-src`
  limité à `'self'` + l'hôte Gemini.

**Messages** (`shared/contracts.ts`, `background/index.ts`)

- `isTrustedSender` avant tout ; garde de forme exacte par action ; pas de
  `onMessageExternal`. Un content script (V5.2+) est un expéditeur moins fiable
  qu'une page d'options : n'exposer que des actions bornées (taille de texte
  maximale, une opération) et jamais une action « lire la clé/les réglages ».
- La clé ne transite **jamais** dans un message, le DOM d'un site, l'URL ou un
  log ; seulement dans l'en-tête `x-goog-api-key` du worker.

**Réseau** (`background/gemini-client.ts`)

- URL construite depuis l'origine constante + un ID de `GEMINI_MODELS`
  vérifié par motif ; `credentials:'omit'`, `redirect:'error'`,
  `referrerPolicy:'no-referrer'`, timeout, **aucun retry**.
- Réponse traitée comme non fiable : parser défensivement, n'afficher que du
  texte (`textContent`, jamais `innerHTML`), ne pas afficher ni stocker le
  texte d'erreur du fournisseur.

**Texte de l'utilisateur** (V5.2+)

- Envoi uniquement sur action explicite, avec consentement préalable affiché ;
  jamais à la frappe, au chargement d'une page ou sur un champ `password`.
- Envoyer le strict nécessaire (sélection, pas la page) ; ne rien persister.

**Stockage**

- `chrome.storage.local` uniquement (jamais `sync`), clés `correctly.v5.*`,
  lecture normalisée. La clé n'est **pas chiffrée** : ne jamais prétendre le
  contraire dans l'UI ou la doc. Ne pas stocker de dérivé de la clé (hash,
  suffixe masqué).

**Coût**

- Toute requête reste comptée par `UsageGuard` avant envoi, bornée
  (`maxOutputTokens`), une à la fois. Le plafond local n'est pas une limite de
  facturation : le rappeler.

**Dépôt et build**

- Aucune vraie clé dans le code, les tests, les fixtures, les captures
  (`docs/*/evidence/`) ou Git ; utiliser `TEST_KEY_SENTINEL`.
- `npm run build` doit passer l'audit (chaînes `AIza…`, `eval`, `new Function`,
  binaires, `.env`, `.map`, localhost/LanguageTool/Java). Ne jamais affaiblir
  une règle de l'audit pour faire passer un build.
- Nouvelle dépendance npm : vérifier nécessité, mainteneur, `npm audit` ; elle
  ne doit pas finir dans `dist/` sans raison.

## Procédure de revue

1. Lister ce qui change et quelles frontières il touche.
2. Lire manifeste, handlers, appels réseau, écritures DOM/stockage concernés.
3. Pour chaque constat : `Gravité | Emplacement | Risque concret | Preuve |
Correctif | Test`. Séparer vulnérabilités confirmées, risques à vérifier et
   bonnes pratiques ; ne rien inventer sans preuve dans le code.
4. Corriger seulement ce qui est demandé ; ajouter le test qui verrouille le
   contrôle ; relancer `npm test`, `npm run lint`, `npm run build`.
5. Mettre à jour `docs/v5.x/SECURITY.md` si un contrôle ou une menace change.

Pas de tests offensifs contre des sites ou services tiers.
