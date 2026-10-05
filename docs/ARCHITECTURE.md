# Architecture Correctly

## Flux

`input → état du champ → debounce → message Chrome → service worker → LanguageTool local → corrections normalisées → surcouche → action utilisateur`.

Le content script est un bundle IIFE autonome, car les content scripts Manifest V3 ne chargent pas les imports ES comme une page d’extension. Le service worker et les deux pages sont des modules ES. Vite construit les deux formats séparément et copie le manifest et les icônes. Le build vérifie les fichiers référencés par le manifest et les pages.

## Modules

- `content/field-detector` : seuls textarea, input text/search et racines contenteditable. Password, number, email, readonly, disabled, îlots non éditables et UI Correctly exclus.
- `content/observers` : enregistrement des champs initiaux et inspection des nœuds ajoutés. Les changements d’attributs permettent de retirer immédiatement un input devenu password.
- `content/application` : cycle de vie, listeners, composition IME, scroll/resize, champs dynamiques, suppression des surcouches.
- `content/field-state` : état propre à chaque champ dans une WeakMap. La Map des contrôleurs est nettoyée au retrait des champs.
- `content/correction-controller` : identifiant de requête invalidé dès la modification, avant même la prochaine analyse. Réponse acceptée seulement si l’identifiant et le texte actuel correspondent.
- `correction/languagetool-client` : POST encodé, timeout de 8 s, normalisation validée, statut unavailable, délai de 10 s après échec, déduplication des requêtes identiques.
- `correction/correction-cache` : LRU de 100 résultats, séparés par langue et texte. Mémoire volatile du worker, non écrite sur disque.
- `content/overlay` et `highlighter` : miroir transparent du texte des inputs/textarea et rectangles Range des contenteditable, dans des Shadow Roots isolés. Toutes les surcouches sont `pointer-events:none`. Les mots ne sont jamais remplacés par des spans dans l’éditeur.
- `content/text-extractor` : modèle UTF-16 du texte et table des positions DOM, retours à la ligne explicites pour BR/blocs.
- `content/replacement` : vérification de la source entière et du fragment ; setter natif pour input/textarea, Range limité pour contenteditable ; ajustement du curseur/sélection et événement input.
- `content/suggestion-popup` : texte inséré par textContent, cinq suggestions maximum, fermeture au clic extérieur/Escape, coordonnées bornées au viewport.
- `context-menu` : menu natif préparé par le content script ; le clic est envoyé au frame exact de l’onglet. La correction active reste dans le content script, même après un redémarrage du worker.
- `shared/storage` : paramètres normalisés ; changements diffusés par storage.onChanged sans rechargement obligatoire de la page.

## Confidentialité et permissions

Les messages d’analyse ne sont acceptés que depuis cette extension et un content script. Le worker vérifie la désactivation du domaine de l’onglet avant l’appel au moteur. Aucun cookie, token, document complet ou texte n’est sauvegardé ou loggé. Les requêtes refusent les redirections et n’envoient pas de credentials.

Permissions : `storage` pour les réglages, `contextMenus` pour le clic droit, `activeTab` pour connaître le domaine au clic sur l’icône. Accès réseau : localhost et 127.0.0.1 uniquement. Les règles content_scripts couvrent les pages HTTP(S) pour y détecter les champs ; elles ne constituent pas une permission réseau vers une API distante.

Les textes de 5 000 caractères maximum sont analysés intégralement. Aucun polling, rescan périodique du document ni requête par touche. Le mode Auto impose les seules langues fr/en avec preferredLanguages et forcePreferredLanguages ; une préférence simple fondée sur les mots courants guide les textes courts. Si un serveur ignore cette restriction, une seconde analyse explicite est effectuée ; une réponse dans une troisième langue est rejetée. Les erreurs sont filtrées selon les catégories et le dictionnaire avant affichage. Ignorer ne concerne qu’une occurrence ; toute modification du texte réinitialise les occurrences ignorées.

## Vérification

Vitest + jsdom : réseau LanguageTool et APIs Chrome mockés. Les rectangles DOM sont simulés dans les tests d’intégration. Ces tests vérifient les interactions et le calcul, pas le rendu réel du navigateur. Le guide manuel est nécessaire pour valider les offsets visuels, les sites et le menu natif.

Références : [API contextMenus Chrome](https://developer.chrome.com/docs/extensions/reference/api/contextMenus), [serveur LanguageTool](https://dev.languagetool.org/http-server), [API LanguageTool](https://languagetool.org/http-api/swagger-ui/).
