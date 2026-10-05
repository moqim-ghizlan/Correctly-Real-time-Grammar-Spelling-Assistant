# Vérification navigateur — 5 octobre 2026

Vérification automatisée dans Brave headless avec un profil temporaire isolé, Chromium 154.0.8037.98 et LanguageTool réel 6.9-SNAPSHOT sur 8081.

Défauts reproduits : appel natif fetch avec un receiver incorrect (`Illegal invocation`) ; paramètre preferredVariants refusé en langues fr/en (HTTP 400) ; échecs sans diagnostic dans la page.

Le fetch est désormais appelé comme fonction indépendante. preferredVariants est envoyé uniquement en mode Auto. Les échecs produisent des avertissements limités sans texte utilisateur.

Sur une page HTTPS contrôlée avec textarea, les soulignements, la popup et les corrections au clic ont été vérifiés en Auto, Français et Anglais. « je sui aller au magasin hier » devient « je suis aller au magasin hier » ; « I has a car. » devient « I have a car. ». La phrase française n’est pas déclarée entièrement corrigée : seule la suggestion proposée par le moteur a été appliquée.

Aucune erreur ni avertissement navigateur pendant ces parcours. Les 88 tests Vitest, le lint et le build passent également.

Cette vérification ne couvre pas Google Chrome, les sites réels de l’utilisateur, les contenteditable complexes ni le menu contextuel natif. Les cases de MANUAL_TESTS.md restent à remplir manuellement.

Après reconstruction de dist, recharger l’extension dans chrome://extensions ou brave://extensions, puis recharger la page pour remplacer le content script déjà injecté.

## Restriction du mode Auto au français et à l’anglais

La phrase « i has 300€ » était détectée comme irlandais (ga-IE). Le paramètre preferredLanguages seul ne suffisait pas à limiter la détection. Le mode Auto utilise désormais forcePreferredLanguages avec fr/en, une préférence adaptée aux mots courants du texte court et un repli explicite si le serveur ignore la restriction.

Vérification réelle supplémentaire dans le même navigateur isolé : Auto corrige « i has 300€ » en « i have 300€ » via la suggestion du verbe. Les parcours Français et Anglais restent réussis, sans erreur navigateur. Les 112 tests unitaires/intégration passent, ainsi que lint et build. Les autres erreurs possibles de cette phrase (majuscule et format monétaire) restent des suggestions indépendantes.

## Rédaction riche et diagnostic Gmail

Le diagnostic fourni depuis Gmail montre un champ visible sous des ancêtres en `visibility: hidden`. Ces ancêtres empêchaient à tort l’affichage des annotations. Le calcul utilise désormais la visibilité du champ, et conserve le masquage par `display: none` ou une opacité nulle. Il respecte aussi le viewport lorsque le débordement de `body` lui est propagé, ainsi que les blocs de référence des éléments positionnés, sans perdre le découpage des zones défilantes.

La reproduction `tests/fixtures/compose.html` est accessible à `http://127.0.0.1:8080/compose` avec `npm run fixture`. Vérification dans Brave isolé avec l’extension compilée et LanguageTool réel : soulignement visible, popup, correction de « je sui ici. » en « je suis ici. », gras voisin et second paragraphe conservés. Réduction, réouverture, nouvelle saisie et nettoyage à la fermeture vérifiés, sans erreur ni avertissement navigateur. Les 122 tests, lint, format et build passent. Ce test reproduit les styles observés ; il ne constitue pas une vérification dans une session Gmail authentifiée. Recharger l’extension puis Gmail pour valider sur le compte utilisateur.

## Perte de texte lors du remplacement dans un éditeur contrôlé

Le signalement WhatsApp « salut, c'est moi, ta frere » devenant seulement « ton » a été reproduit avec Lexical 0.52.0 dans Brave. L’ancienne modification par `Range.deleteContents()` puis `Range.insertNode()` découpait une feuille de texte en plusieurs nœuds ; après l’événement input, le modèle Lexical et le DOM ne conservaient que « ton ».

Le remplacement utilise désormais `Text.replaceData()` sur le nœud existant. La limite de début est normalisée vers le nœud contenant le premier caractère pour préserver les styles aux frontières inline. La reproduction conserve maintenant « salut, c'est moi, ton frere » dans le DOM et le modèle. Une correction traversant plusieurs nœuds de texte est refusée avant toute modification ; elle doit être effectuée manuellement.

Vérification supplémentaire avec l’extension compilée, LanguageTool réel et un éditeur Lexical local : la popup corrige « Salut, c'est moi, je sui ici. » en « Salut, c'est moi, je suis ici. » ; le modèle reste complet et une frappe supplémentaire est conservée. Le correcteur natif est désactivé sur cette page de test. Les 126 tests passent. Aucune connexion à un compte WhatsApp n’a été utilisée ; le parcours sur le site réel reste à vérifier après rechargement.

## Échelle CSS et annotations

Un autre défaut a été reproduit à 90 % : les rectangles des mots incluent déjà le zoom CSS, tandis que les coordonnées de notre surcouche subissaient à nouveau ce zoom. La surcouche et la popup compensent désormais l’échelle du document. Les dimensions clientes et les miroirs des champs sont convertis à l’échelle effective du champ, conformément aux distinctions de [CSSOM View](https://www.w3.org/TR/cssom-view/#dom-element-currentcsszoom).

Dans la reproduction Lexical, alignement des soulignements, popup, correction et nouvelle saisie vérifiés à 90 %, 100 % et 125 %, sans erreur ni avertissement. Les parcours textarea Auto, Français et Anglais passent également à 90 %. Cette vérification porte sur des pages locales contrôlées, pas sur une session ChatGPT ou WhatsApp authentifiée.

Le délai de 100 ms choisi dans `constants.ts` est conservé. La validation et le champ des paramètres acceptent désormais ce minimum, pour éviter sa conversion automatique en 200 ms à l’enregistrement.
