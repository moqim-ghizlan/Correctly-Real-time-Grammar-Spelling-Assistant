# Plan — synchronisation des données avec `chrome.storage.sync`

Statut : **plan, rien n'est implémenté.** Ce document décrit comment
synchroniser les raccourcis texte, les réglages et (en option) les clés API de
Correctly entre plusieurs PC, **sans backend**, avec le stockage synchronisé
intégré à Chrome. Il sert de base à la spec `v5/v5.14.md`.

---

## 1. Résumé en 10 lignes

1. Chrome offre `chrome.storage.sync` : les données écrites par l'extension
   suivent le compte Google, sur tous les PC où la synchronisation Chrome est
   active. Aucun serveur, aucune base, gratuit.
2. Condition : **même ID d'extension partout** → ajouter un champ `"key"`
   (clé publique) dans `frontend/manifest.json`.
3. Changer l'ID **une fois** fait repartir l'extension à vide : il faut
   exporter / ressaisir ses données avant (procédure en §4).
4. Le stockage local (`storage.local`) **reste la source de vérité** ;
   `storage.sync` n'est qu'une copie miroir. L'extension marche toujours hors
   ligne et sans compte Google.
5. La synchronisation est **désactivée par défaut** et s'active domaine par
   domaine dans une nouvelle section « Synchronisation » des paramètres.
6. Domaines : raccourcis texte, réglages, raccourcis clavier, et — option
   séparée — clés API + routes, **chiffrées avec une phrase secrète** avant
   de quitter le PC.
7. Jamais synchronisés : limites d'usage, journal et statistiques
   (IndexedDB), position de la poignée, autorisation « tous les sites ».
8. Limites Chrome strictes (≈ 100 Ko au total) → les raccourcis sont découpés
   en morceaux, et un dépassement est signalé, jamais tronqué en silence.
9. Version : **5.14.0** (nouvelle fonction visible + changement d'ID).
10. Site : **oui, à mettre à jour**. Vidéo : **non obligatoire** (§12).

---

## 2. Rappel : comment fonctionne `chrome.storage.sync`

| Point                  | Valeur / comportement                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API                    | identique à `storage.local` (`get`, `set`, `remove`, `onChanged` avec `areaName === 'sync'`)                                                                  |
| Permission             | `storage`, **déjà présente** dans le manifeste — rien à ajouter                                                                                               |
| Taille totale          | `QUOTA_BYTES` = 102 400 octets (clé + valeur JSON comptées)                                                                                                   |
| Taille par élément     | `QUOTA_BYTES_PER_ITEM` = 8 192 octets                                                                                                                         |
| Nombre d'éléments      | `MAX_ITEMS` = 512                                                                                                                                             |
| Écritures              | `MAX_WRITE_OPERATIONS_PER_MINUTE` = 120, `..._PER_HOUR` = 1 800 (un `set()` = 1 opération)                                                                    |
| Dépassement            | le `set()` échoue (promesse rejetée), rien n'est écrit                                                                                                        |
| Sans compte / sync off | l'API marche quand même, mais reste locale à ce profil (pas d'erreur)                                                                                         |
| Délai de propagation   | de quelques secondes à quelques minutes, non garanti                                                                                                          |
| Conflits               | Chrome applique « le dernier qui écrit gagne », **élément par élément**                                                                                       |
| Accès                  | `setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })` existe aussi pour `sync`                                                                                |
| Chiffrement            | en transit et au repos chez Google ; illisible pour Google seulement si l'utilisateur active la **phrase secrète de synchronisation Chrome**                  |
| Brave                  | Brave Sync ne fonctionne pas comme Chrome Sync ; la synchronisation de `storage.sync` y est **incertaine → à tester** (statut NON VÉRIFIÉ tant que non testé) |

Conséquence de la ligne « Conflits » : si un même lot de données est réparti
sur plusieurs éléments, un autre PC peut recevoir une moitié nouvelle et une
moitié ancienne. Le format (§6) doit donc détecter un état incomplet et
attendre.

---

## 3. Ce qui est synchronisé, et ce qui ne l'est pas

État actuel du code (lu le 2026-10-20) : tout est dans `chrome.storage.local`
via `browserStorage()` (`frontend/src/shared/storage.ts:31`).

| Clé locale actuelle            | Contenu                                | Synchronisé ?                               | Pourquoi                                                                    |
| ------------------------------ | -------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------- |
| `correctly.v5.shortcuts`       | raccourcis texte (≤ 500 × 2 000 car.)  | **Oui** (domaine `shortcuts`)               | besoin principal                                                            |
| `correctly.v5.keybindings`     | raccourcis clavier propres à Correctly | **Oui** (domaine `keybindings`)             | même usage sur tous les PC                                                  |
| `correctly.v5.settings`        | réglages                               | **Oui, partiellement** (domaine `settings`) | voir sous-tableau                                                           |
| `correctly.v5.providers`       | profils de clés, routes clé + modèle   | **Option** (domaine `keys`)                 | lié aux secrets : les routes pointent vers des profils                      |
| `correctly.v5.secrets`         | clés API en clair                      | **Option, chiffré** (domaine `keys`)        | voir §7                                                                     |
| `correctly.v5.handle`          | position de la poignée                 | Non                                         | dépend de l'écran                                                           |
| `correctly.v5.usage`           | ancien compteur quotidien              | Non                                         | propre au PC                                                                |
| IndexedDB `correctly-v5-quota` | limites, journal, statistiques, prix   | **Non**                                     | journal par PC, transactions atomiques impossibles en sync, volume > 100 Ko |
| `correctly.shortcuts.v1` (V4)  | anciens raccourcis V4                  | Non, jamais touché                          | règle « ne jamais modifier les clés V4 »                                    |

Sous-tableau `correctly.v5.settings` :

| Champ                                       | Synchronisé ? | Raison                                                                  |
| ------------------------------------------- | ------------- | ----------------------------------------------------------------------- |
| `rewrite.*`                                 | oui           | préférences                                                             |
| `translation.*`                             | oui           | préférences                                                             |
| `ui.language`                               | oui           | préférence                                                              |
| `triggers.keyboard`, `triggers.contextMenu` | oui           | préférences                                                             |
| `triggers.smartButton`                      | **non**       | exige l'autorisation optionnelle « tous les sites », accordée PC par PC |
| `correction.consent`                        | **non**       | consentement donné sur ce PC ; ne doit pas s'activer à distance         |
| `safety.dailyTestAttemptLimit`              | non           | lié au compteur local                                                   |
| `gemini.*` (héritage V5.1)                  | non           | ancien champ, vidé par la migration V5.7                                |

Nouvelle clé locale (jamais synchronisée) :
`correctly.v5.syncPrefs` — choix de ce PC : synchronisation activée ou non,
domaines cochés, état de la dernière synchronisation par domaine, ID du PC.

---

## 4. Étape 0 — fixer l'ID de l'extension

### 4.1 Pourquoi

Une extension non empaquetée reçoit un ID calculé à partir du **chemin** de
son dossier : chaque PC a donc un ID différent, et `storage.sync` est rangé
par ID. Un champ `"key"` dans le manifeste fige l'ID, quel que soit le dossier
et le navigateur (Chrome comme Brave).

### 4.2 Comment (une seule fois, par le propriétaire)

Dans Git Bash, **hors du dépôt** (ex. dans un dossier perso sauvegardé) :

```bash
openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out correctly-key.pem
```

```bash
openssl rsa -in correctly-key.pem -pubout -outform DER | openssl base64 -A
```

Coller la sortie dans `frontend/manifest.json` :

```json
"key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...",
```

- La clé **publique** (`"key"`) est versionnée : ce n'est pas un secret.
- Le fichier `.pem` (clé **privée**) n'entre jamais dans le dépôt
  (`*.pem` est déjà dans `.gitignore`). Il ne sert qu'à signer un `.crx` ou à
  publier sur le Chrome Web Store plus tard. Le garder sauvegardé : le perdre
  ne casse rien aujourd'hui, mais empêcherait de signer avec le même ID.
- Ajouter à `scripts/audit-dist.mjs` deux contrôles : `manifest.key` présent
  et égal à la valeur attendue (ID stable), et aucun fichier `.pem` dans
  `dist/`.
- Noter l'ID obtenu (affiché dans `chrome://extensions`) dans
  `docs/v5.14/ARCHITECTURE.md`.

### 4.3 Conséquence : migration unique des données

Les données actuelles (`storage.local`, IndexedDB) appartiennent à l'**ancien**
ID. Avec le nouvel ID, l'extension démarre vide sur chaque PC. Ce n'est à
faire qu'une fois, avant d'installer 5.14.0 :

| Donnée                               | Comment la récupérer                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| Raccourcis texte                     | Paramètres → Raccourcis → **Exporter** (JSON, existe depuis V5.6), puis Importer dans 5.14 |
| Clés API                             | les ressaisir (aucun export de clé, volontairement)                                        |
| Routes, réglages, raccourcis clavier | les refaire à la main (peu de choses)                                                      |
| Limites d'usage                      | les refaire à la main                                                                      |
| Statistiques                         | exporter en CSV/JSON pour archive ; **non réimportables**, l'historique repart à zéro      |

Point de vigilance : chaque personne qui a installé le zip du site avant
5.14 subit le même changement d'ID. Les notes de version et le site doivent
le dire clairement (§12).

Option à décider (§14, D1) : livrer l'étape 0 seule plus tôt (5.13.4) pour
ne migrer qu'une fois et avant tout le reste, ou l'inclure dans 5.14.0.
**Recommandation : dans 5.14.0**, une seule rupture annoncée.

---

## 5. Architecture

### 5.1 Principes

- **Local d'abord** : toutes les lectures de l'extension continuent de lire
  `storage.local` comme aujourd'hui. Aucun module existant ne lit `sync`.
- **Un seul moteur de synchronisation, dans le service worker** :
  nouveau module `frontend/src/background/sync.ts` (orchestration) et
  `frontend/src/shared/sync.ts` (format, découpage, fusion : fonctions pures,
  testables).
- **Les écrivains ne changent pas** : la page de paramètres continue d'écrire
  dans `storage.local` (`mutateShortcuts`, `saveSettings`, providers…). Le
  worker observe ces écritures et les recopie vers `sync`.
- **Aucune requête réseau ajoutée** par Correctly : c'est Chrome qui
  synchronise. CSP, `host_permissions` et `connect-src` restent identiques.
- **Aucun log**, comme partout dans le worker.
- `chrome.storage.sync.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })`
  au démarrage du worker, comme pour `local`
  (`frontend/src/background/index.ts:389`).

### 5.2 Flux

```
Paramètres (page)                 Service worker                     Autre PC
      │ écrit storage.local              │                               │
      ├────────────────────────────────►│ onChanged('local')            │
      │                                  │ domaine coché ? empreinte ≠ ? │
      │                                  │ → découpe → storage.sync.set()│
      │                                  │                    Chrome Sync│
      │                                  │ ─────────────────────────────►│ onChanged('sync')
      │                                  │                               │ lot complet ?
      │                                  │                               │ → fusion → storage.local.set()
      │                                  │                               │ → page rafraîchie (onChanged local)
```

Points de déclenchement dans le worker :

1. `chrome.storage.onChanged` avec `areaName === 'local'` sur une clé d'un
   domaine coché → **envoi** (push).
2. `chrome.storage.onChanged` avec `areaName === 'sync'` → **réception**
   (pull + fusion).
3. `runtime.onStartup` / `onInstalled` / activation dans les paramètres →
   **réconciliation complète** (comparer local et sync, appliquer §6.4).

Les deux écouteurs `onChanged` existants (worker : `index.ts:550`, page :
`options/index.ts:150`) filtrent déjà `areaName === 'local'` : ils ne sont
pas perturbés par `sync`, et la page se met à jour toute seule quand le
worker réécrit `local` après une réception.

### 5.3 Éviter les boucles

Réception → écriture locale → `onChanged('local')` → envoi → … Pour couper
la boucle : `syncPrefs.state[domaine]` mémorise l'**empreinte** (SHA-256 du
JSON normalisé, `crypto.subtle.digest`) du dernier contenu synchronisé. Un
envoi n'a lieu que si l'empreinte locale diffère de cette valeur.

### 5.4 Service worker MV3 qui s'arrête

Le worker peut être suspendu à tout moment. Il n'y a pas de minuterie fiable
sans la permission `alarms` (non demandée) :

- pas de file d'attente en mémoire : chaque envoi relit l'état actuel de
  `local` et le compare à l'empreinte → un envoi perdu est rattrapé à la
  prochaine réconciliation (démarrage, prochaine modification) ;
- un envoi = **un seul** `storage.sync.set()` contenant tous les morceaux du
  domaine (une seule opération d'écriture comptée, §2).

---

## 6. Format dans `storage.sync`

### 6.1 Clés

Toutes namespacées `correctly.v5.sync.*`, jamais les clés locales
elles-mêmes (le format synchronisé est indépendant du format local).

| Clé sync                           | Contenu                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `correctly.v5.sync.meta`           | `{ schemaVersion: 1 }` — permet de refuser un format futur inconnu |
| `correctly.v5.sync.<domaine>.head` | `{ revision, updatedAt, deviceId, chunks: n, hash }`               |
| `correctly.v5.sync.<domaine>.<i>`  | morceau `i` (0 ≤ i < n) : `{ revision, data: "<texte>" }`          |

Domaines : `shortcuts`, `settings`, `keybindings`, `keys`.

### 6.2 Découpage (raccourcis surtout)

- Le domaine est sérialisé en JSON (format normalisé), puis coupé en
  morceaux de **≤ 7 000 octets** UTF-8 (marge sous 8 192 pour la clé et
  l'enveloppe JSON). Couper sur des octets, jamais au milieu d'un caractère.
- `head.hash` = SHA-256 du JSON complet. `head.revision` augmente à chaque
  envoi.
- À l'envoi : écrire `head` + tous les morceaux dans **le même** `set()`,
  puis `remove()` les morceaux en trop (anciens `i ≥ n`).
- Avant d'envoyer, calculer la taille totale de **tous** les domaines
  (`getBytesInUse` + estimation) : si elle dépasse ~95 000 octets, ne rien
  écrire et afficher l'erreur `syncTooLarge` (code, traduit dans les deux
  langues). Jamais de troncature silencieuse.

Capacité réelle : 100 Ko ≈ quelques centaines de raccourcis courts. Le
maximum local (500 × 2 000 caractères ≈ 1–3 Mo) **ne tient pas** en sync.
La limite locale reste 500 ; la synchronisation, elle, s'arrête avec un
message clair si le total est trop gros. La section affiche l'occupation
(« 38 Ko / 100 Ko »).

### 6.3 Réception d'un lot

1. Lire `head` et tous les morceaux `0..n-1`.
2. Si un morceau manque ou a une `revision` ≠ `head.revision` → lot
   incomplet : **ne rien appliquer**, attendre le prochain `onChanged('sync')`.
3. Recoller, vérifier `hash`. Différent → ignorer (lot incomplet ou corrompu).
4. `JSON.parse` puis **normalisation** par les fonctions existantes
   (`normalizeSettings`, `parseStore` des raccourcis, normalisation des
   keybindings, des providers). Règle du projet : chaque lecture passe par
   `normalize*`. Données invalides → ignorées, état `damaged` affiché, rien
   n'est écrasé.

### 6.4 Conflits : règle choisie

Utilisateur unique, qui modifie en général sur un seul PC à la fois →
**le plus récent gagne, par domaine** (`head.updatedAt`, puis `deviceId`
pour départager), avec **filet de sécurité** :

- Si le PC a des modifications locales **non encore envoyées** (empreinte
  locale ≠ dernière empreinte synchronisée) et qu'un lot distant plus récent
  arrive, alors avant d'écraser : copier l'état local dans
  `correctly.v5.sync.backup.<domaine>` (local seulement) et afficher
  « Des modifications de ce PC ont été remplacées par celles d'un autre
  appareil — Restaurer ». Rien n'est perdu sans trace.
- Pour les raccourcis, option plus fine (D3, §14) : fusion par `id` de
  raccourci avec suppressions marquées (tombstones). Plus complexe ;
  **recommandation : non pour 5.14.0**, la règle par domaine + sauvegarde
  suffit pour un usage personnel.

### 6.5 Première activation sur un PC

| Cas                            | Action                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| sync vide, local rempli        | envoyer local                                                                                                 |
| sync rempli, local vide        | recevoir                                                                                                      |
| les deux remplis et différents | **demander** : « Garder ce PC » / « Prendre la version synchronisée » (l'autre est sauvegardée comme en §6.4) |
| les deux identiques            | rien                                                                                                          |

---

## 7. Clés API (domaine `keys`, option séparée)

### 7.1 Le risque

Avec `storage.sync`, une clé copiée part sur les serveurs de Google et sur
tous les PC du compte. Toute personne qui prend le contrôle du compte Google
obtient alors les clés → elle peut consommer la facture Gemini/OpenAI.

### 7.2 Choix recommandé : chiffrement par phrase secrète Correctly

- L'utilisateur choisit une **phrase secrète de synchronisation des clés**
  (distincte du mot de passe Google).
- Dérivation : PBKDF2-SHA-256, ≥ 600 000 itérations, sel aléatoire de 16
  octets → clé AES-GCM 256 bits (WebCrypto, **aucune dépendance**).
- Contenu chiffré : `providers` + `secrets` ensemble (les routes pointent vers
  des profils). IV aléatoire de 12 octets à chaque envoi. Dans sync :
  `{ salt, iv, ciphertext, kdf: { name, iterations } }` (base64).
- Mot de passe faux → le déchiffrement AES-GCM échoue → message « phrase
  secrète incorrecte », rien n'est écrasé.
- **Sur ce PC**, la clé dérivée (octets bruts) est gardée dans
  `storage.local` (accès `TRUSTED_CONTEXTS`). Justification : ce même
  stockage contient déjà les clés API en clair, donc aucun nouveau risque
  local ; cela permet au worker de rechiffrer et envoyer automatiquement
  sans redemander la phrase.
- Nouveau PC : les autres domaines arrivent seuls ; pour les clés, la section
  affiche « Clés synchronisées disponibles — Déverrouiller » → saisie de la
  phrase une fois.
- Phrase oubliée : les clés synchronisées sont perdues (on les ressaisit et
  on choisit une nouvelle phrase). C'est voulu.
- Changer la phrase : nouveau sel, rechiffrement, les autres PC devront la
  ressaisir.

### 7.3 Alternative plus simple (D2, §14)

Synchroniser les clés **sans** chiffrement Correctly, en comptant sur Google
(+ phrase secrète de synchronisation Chrome si activée). Moins de code, mais
protection uniquement par le compte Google. **Non recommandé**.

### 7.4 Ce qui ne change pas

- Le contrôleur de connexion lit toujours les secrets dans `storage.local`
  (route figée par requête, aucun repli) — inchangé.
- La clé n'apparaît jamais dans un message vers une page web ni un script
  injecté, jamais dans un log.
- Les limites d'usage ne sont pas synchronisées : chaque PC applique ses
  propres limites. À écrire dans la page et sur le site (« les limites
  comptent par navigateur »).

---

## 8. Interface (page de paramètres)

Nouvelle page « Synchronisation » dans le menu latéral (`options/nav.ts`) :

- Interrupteur général (désactivé par défaut) + texte qui explique : passe
  par le compte Google du navigateur, aucun serveur Correctly.
- Cases : Raccourcis texte · Réglages · Raccourcis clavier · Clés API et
  routes (chiffrées — demande la phrase secrète).
- État par domaine : « Synchronisé il y a 2 min », « En attente »,
  « Trop volumineux », « Données distantes illisibles ».
- Occupation : « 38 Ko / 100 Ko ».
- Boutons : « Synchroniser maintenant », « Restaurer la version remplacée »
  (si une sauvegarde §6.4 existe), « Effacer les données synchronisées »
  (avec confirmation — vide `correctly.v5.sync.*` du compte, pas le local).
- Avertissement si le navigateur ne synchronise pas (impossible à détecter
  sûrement par l'API ; afficher un rappel : « Vérifiez que la
  synchronisation Chrome est active et inclut les extensions »).

Bilingue obligatoire : toutes les chaînes dans `options/messages.ts` (fr et
en) ; le texte fixe de la page via `scripts/i18n-options.mjs` puis
`node scripts/i18n-options.mjs` et `npm run format`. Le code partagé renvoie
des **codes** (`SyncError` : `tooLarge`, `quota`, `rate`, `badPassphrase`,
`remoteDamaged`, `unknownSchema`…), jamais du texte.

---

## 9. Fichiers touchés (prévision)

| Fichier                                                                                    | Changement                                                             |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `frontend/manifest.json`                                                                   | `"key"`, version 5.14.0, `name`, `description`                         |
| `frontend/src/shared/sync.ts` (nouveau)                                                    | format, découpage, empreinte, fusion, normalisation, `SyncError`       |
| `frontend/src/shared/sync-crypto.ts` (nouveau)                                             | PBKDF2 + AES-GCM pour le domaine `keys`                                |
| `frontend/src/shared/storage.ts`                                                           | `browserSyncStorage()` (même interface `StorageArea`), clé `syncPrefs` |
| `frontend/src/shared/settings.ts`                                                          | extraction / réinjection des seuls champs synchronisables              |
| `frontend/src/background/sync.ts` (nouveau)                                                | écouteurs, push, pull, réconciliation                                  |
| `frontend/src/background/index.ts`                                                         | branchement des écouteurs, `setAccessLevel` sur `sync`                 |
| `frontend/src/options/sync-ui.ts` (nouveau) + `nav.ts`, `index.ts`, `messages.ts`, CSS     | page Synchronisation                                                   |
| `scripts/i18n-options.mjs` → `options.html`, `messages-html.ts`                            | texte fixe (généré)                                                    |
| `scripts/audit-dist.mjs`                                                                   | contrôles `key`, pas de `.pem`, version                                |
| `frontend/tests/helpers/fake-storage.ts`                                                   | faux `sync` avec quotas Chrome et `onChanged`                          |
| `frontend/tests/unit/sync*.test.ts`, `frontend/tests/integration/sync*.test.ts` (nouveaux) | §10                                                                    |
| `v5/v5.14.md` → `v5/v5.14_done.md`, `docs/v5.14/*`, `CLAUDE.md`, `README.md`               | docs                                                                   |

Pas de nouvelle dépendance, pas de nouvelle permission, pas de nouvel hôte.

---

## 10. Tests

### 10.1 Automatiques (Vitest + jsdom)

Faux stockage `sync` dans `fake-storage.ts` qui imite Chrome : quotas
(`QUOTA_BYTES`, `QUOTA_BYTES_PER_ITEM`, `MAX_ITEMS`, écritures par minute),
rejet du `set()` en cas de dépassement, `onChanged` avec `areaName: 'sync'`,
et possibilité de livrer les éléments **dans le désordre** ou en partie.

Tests unitaires (`shared/sync.ts`, `sync-crypto.ts`) :

- découpage / recollage aller-retour, y compris emoji, arabe, caractères
  sur 4 octets à la frontière d'un morceau ;
- chaque morceau ≤ 8 192 octets clé comprise ;
- lot incomplet (morceau manquant, révision différente, hash faux) → rien
  appliqué ;
- données distantes invalides → normalisées ou refusées, jamais écrites
  telles quelles ; schéma futur inconnu → refusé ;
- `settings` : seuls les champs du §3 partent ; `smartButton` et `consent`
  ne sont jamais écrasés par une réception ;
- règle de conflit : plus récent gagne, départage par `deviceId`,
  sauvegarde créée quand le local avait des modifications non envoyées ;
- taille totale > limite → `tooLarge`, aucune écriture ;
- chiffrement : aller-retour, mauvaise phrase → `badPassphrase`, IV
  différent à chaque envoi, texte chiffré ne contient pas la clé en clair.

Tests d'intégration (deux « PC » simulés : deux faux `local` + un faux
`sync` partagé) :

- modifier un raccourci sur A → apparaît sur B ; supprimer sur A → disparaît
  sur B ;
- modifications hors ligne sur A et B → le plus récent gagne, l'autre est
  restaurable ;
- pas de boucle : une réception ne déclenche pas de renvoi (compter les
  `set()`) ;
- domaine décoché → ni envoi ni réception ;
- synchronisation désactivée → aucun appel à `sync` du tout ;
- worker « redémarré » entre deux étapes → la réconciliation rattrape ;
- page de paramètres : activation, première activation avec conflit (§6.5),
  affichage de l'occupation et des erreurs, en français **et** en anglais ;
- non-régression : toute la suite existante passe sans changement de
  comportement quand la synchronisation est désactivée.

Commandes (racine) :

```powershell
npm run format:check
npm run lint
npm test
npm run build
```

### 10.2 Manuels (navigateur réel) — checklist `docs/v5.14/MANUAL_TEST_CHECKLIST.md`

Problème : Chrome refuse le même compte Google dans deux profils du même
Chrome. Solutions pour avoir « deux PC » :

- **Chrome stable + Chrome Beta ou Canary** sur le même PC (installations
  séparées, même compte autorisé) ← le plus simple ;
- ou deux vrais PC ;
- ou un PC + une machine virtuelle.

Outil utile : `chrome://sync-internals` (voir si les extensions se
synchronisent, l'heure de la dernière synchro).

Scénarios :

1. Même ID affiché dans `chrome://extensions` sur les deux navigateurs.
2. Activer la synchro sur A, ajouter 3 raccourcis → visibles sur B (noter le
   délai).
3. Modifier / supprimer sur B → répercuté sur A.
4. Réglage `ui.language` changé sur A → B passe dans la langue.
5. `smartButton` activé sur A → **reste désactivé** sur B tant qu'il n'est
   pas activé (et l'accès accordé) sur B.
6. Clés : activer avec phrase sur A ; sur B, « Déverrouiller » avec mauvaise
   phrase (refus), puis bonne phrase → génération réussie sur B (test live
   avec la clé du propriétaire, sinon BLOQUÉ).
7. Couper le réseau sur A, modifier ; modifier aussi sur B ; reconnecter →
   le plus récent gagne, « Restaurer » disponible.
8. Importer assez de longs raccourcis pour dépasser 100 Ko → message
   « trop volumineux », rien de cassé, le local reste complet.
9. Désactiver la synchro Chrome (paramètres du navigateur) → Correctly
   continue de marcher en local, sans erreur.
10. Désinstaller / réinstaller l'extension → vérifier si les données sync
    reviennent (comportement Chrome à constater et noter).
11. **Brave** : refaire 1–3. Résultat attendu incertain → noter PASS / FAIL
    honnêtement ; si FAIL, le dire sur le site.
12. Smoke test existant (`scripts/verify-browser.mjs`) : profil vierge non
    connecté → l'extension démarre, la page Synchronisation s'affiche, aucun
    appel réseau nouveau.

Statuts notés honnêtement : PASS / FAIL / NON TESTÉ / BLOQUÉ.

### 10.3 Sécurité (skill `correctly-security`)

- `dist/` : pas de `.pem`, CSP et `host_permissions` inchangées
  (`audit-dist.mjs`).
- `storage.sync` en `TRUSTED_CONTEXTS` : un script injecté ne peut pas le
  lire (test d'intégration + vérification manuelle dans la console d'un
  content script).
- Aucune clé en clair dans `sync` (inspection via la console de la page de
  paramètres : `chrome.storage.sync.get(null)`).
- Aucun log ajouté.

---

## 11. Version : 5.13.x ou 5.14 ?

**5.14.0.** Selon `processus.md` §1, une nouvelle fonction ou une interface
modifiée = mineure. Ici on a les deux, plus un changement d'ID qui oblige à
remigrer ses données : ce n'est pas un correctif.

- Tant que le travail n'est pas livré : la version reste 5.13.3 (ou le
  dernier correctif livré).
- Spec : `v5/v5.14.md` (plan), renommée `v5/v5.14_done.md` à la livraison.
- Docs : `docs/v5.14/` — `ARCHITECTURE.md` (sync, ID, format), `SECURITY.md`
  (clés chiffrées, menaces), `TEST_REPORT.md`, `MANUAL_TEST_CHECKLIST.md`,
  `RELEASE_NOTES.md` (avec la procédure de migration §4.3 en tête).
- Une 6.0.0 n'est pas justifiée : pas de refonte, pas de backend, données
  et fonctions conservées.

Règle CLAUDE.md « un jalon à la fois » : 5.14 = synchronisation uniquement.
Le reste (fusion fine par raccourci, synchro des limites…) = jalon suivant
si besoin.

---

## 12. Site et vidéo

### 12.1 Site (`website/`) : **oui, obligatoire**

Le site affirme aujourd'hui que tout reste dans le stockage local
(`website/src/data/fr.js` : `privacy.lede`, `dg.local`, `dg.localSub`,
`privacy.local.1`, et l'équivalent dans `en.js`). Avec 5.14 ce n'est plus
toujours vrai → le site deviendrait faux. À faire (fr **et** en, mêmes
clés) :

- Confidentialité : « Correctly n'a pas de serveur » reste vrai. Ajouter :
  synchronisation **optionnelle, désactivée par défaut**, via le compte
  Google du navigateur ; clés seulement si on le choisit, chiffrées par une
  phrase secrète ; limites et statistiques jamais synchronisées.
- Schéma de confidentialité : ajouter la flèche facultative « Chrome Sync ».
- Fonctions : carte « Synchronisation entre vos PC ».
- FAQ : « Mes données sont-elles sur un serveur ? », « Brave ? » (selon le
  résultat du test 11), « Pourquoi ai-je dû ressaisir mes clés en 5.14 ? ».
- Téléchargement : version 5.14.0, nouveau zip, taille, `dl.new1–3`, et
  l'avertissement de migration d'ID.
- Puis la procédure normale de `processus.md` §5 (`site.js`, `fr.js`,
  `en.js`, `index.html`, `verify.mjs`, `npm run build`, `npm run verify` à
  0 FAIL, `npx prettier --write website`).

### 12.2 Vidéo (`video-brag/`) : **non obligatoire**

- La vidéo montre la correction, la reformulation, la traduction, le résumé
  et une scène de paramètres (clés, routes, limites, 43–48 s). Rien de ce
  qu'elle montre ne devient faux : la synchronisation est une option
  désactivée par défaut, invisible dans les scènes existantes.
- `processus.md` : vidéo seulement « si l'interface montrée change ». Ce
  n'est pas le cas.
- Le texte de partage `video-brag/share-copy.txt` (« raccourcis texte en
  local ») reste vrai par défaut ; on peut ajouter « synchronisés entre vos
  PC si vous le souhaitez » — c'est un texte, pas la vidéo, aucun
  réencodage.
- Si un jour on veut montrer la synchro dans la vidéo : suivre
  `video-brag/SETUP.md` **en entier** dans la même tâche (réencodage, durée,
  chapitres, poster, `npm run verify`).

**Conclusion : le site suffit.**

---

## 13. Processus complet, dans l'ordre

1. **Décisions** du §14 validées par le propriétaire.
2. Écrire `v5/v5.14.md` (spec à partir de ce plan).
3. **Étape 0** : générer la clé, ajouter `"key"`, contrôles d'audit.
4. Implémenter `shared/sync.ts` + tests unitaires.
5. Implémenter `background/sync.ts` + tests d'intégration deux PC.
6. Implémenter la page Synchronisation (fr/en) + tests UI.
7. Domaine `keys` chiffré + tests (peut être une étape séparée dans le même
   jalon).
8. `npm run format:check`, `lint`, `test`, `build` → tout vert.
9. Revue sécurité (§10.3, skill `correctly-security`).
10. Tests manuels §10.2 → `docs/v5.14/TEST_REPORT.md` avec statuts honnêtes.
11. Monter la version à 5.14.0 partout (`processus.md` §3, partie mineure :
    `package.json`, manifeste `name`/`description`/`version`,
    `audit-dist.mjs`, `CLAUDE.md`, `README.md`, `scripts/package.mjs`,
    `scripts/verify-browser.mjs`, textes de version de la page).
12. `npm run package` → `release/Correctly-V5.14-Extension.zip` + SHA-256.
13. **Migration personnelle** du propriétaire (§4.3) sur chaque PC : exporter
    raccourcis + stats, installer 5.14, réimporter, ressaisir clés,
    activer la synchro sur le premier PC, puis sur les autres.
14. Site (§12.1), `npm run verify` à 0 FAIL. Pas de vidéo.
15. Sur demande explicite seulement : commit sur `dev` (code + docs +
    `website/` + `website/site/`), tag `v5.14.0`, push. Pas de fusion vers
    `main` sans demande.

### Après la livraison (vie courante)

- Correctif touchant la synchro (bug de fusion, message) → `5.14.1`, site
  mis à jour (version + zip + « Nouveautés »), pas de vidéo.
- Tout changement du format sync → monter `correctly.v5.sync.meta.schemaVersion`
  et prévoir la lecture de l'ancien format (des PC peuvent rester sur une
  version plus ancienne quelque temps : un ancien format inconnu est
  **refusé sans écraser**, jamais l'inverse).
- Surveiller l'occupation : si les raccourcis approchent 100 Ko, envisager
  la compression ou un backend (voir la discussion initiale) — jalon séparé.

---

## 14. Décisions à prendre par le propriétaire

| #   | Question                                                                                         | Recommandation                                       |
| --- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| D1  | Étape 0 (ID fixe) livrée seule avant (5.13.4) ou dans 5.14.0 ?                                   | dans 5.14.0                                          |
| D2  | Clés : chiffrées par phrase secrète Correctly, en clair via Google, ou pas de synchro des clés ? | chiffrées (§7.2) ; à défaut, ne pas les synchroniser |
| D3  | Conflits raccourcis : par domaine + sauvegarde, ou fusion par raccourci ?                        | par domaine + sauvegarde                             |
| D4  | Synchroniser aussi la configuration des limites d'usage ?                                        | non (IndexedDB, propre à chaque PC)                  |
| D5  | Brave : supporté officiellement ou « non garanti » ?                                             | décider après le test manuel 11                      |

---

## 15. Risques et limites

| Risque                                       | Gravité          | Parade                                                             |
| -------------------------------------------- | ---------------- | ------------------------------------------------------------------ |
| Perte des données au changement d'ID         | Haute (une fois) | procédure §4.3, notes de version, site                             |
| Compte Google compromis → clés volées        | Haute            | chiffrement par phrase secrète §7.2, validation en 2 étapes Google |
| Dépassement 100 Ko / 8 Ko / 512 éléments     | Moyenne          | découpage, contrôle de taille, message clair, local intact         |
| Lot reçu à moitié                            | Moyenne          | `head` + révision + hash, application seulement si complet         |
| Modifications concurrentes perdues           | Moyenne          | sauvegarde + « Restaurer »                                         |
| Boucle d'écritures → limite 120/min atteinte | Moyenne          | empreintes §5.3, test qui compte les `set()`                       |
| Brave ne synchronise pas                     | Moyenne          | test manuel, le dire honnêtement                                   |
| Sync Chrome coupée par l'utilisateur         | Faible           | rien ne casse, tout reste local                                    |
| Délais de propagation imprévisibles          | Faible           | afficher l'heure de la dernière synchro                            |
| Activation à distance d'un accès sensible    | Moyenne          | `smartButton` et `consent` jamais synchronisés                     |
| Site devenu faux sur la confidentialité      | Moyenne          | §12.1 dans la même livraison                                       |

Estimation : c'est un **jalon moyen à gros**. Le domaine `keys` chiffré en
est environ un tiers ; sans lui (D2 = pas de synchro des clés), le jalon est
nettement plus petit.
