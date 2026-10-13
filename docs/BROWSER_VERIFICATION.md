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

## Audit V2 ? 5 octobre 2026

Audit des modules de d?tection, cycle de vie, texte/offsets, s?lection/remplacement, rendu, worker, ?changes, param?tres et langue. Corrections apport?es : ?tat du popup remis ? z?ro apr?s Escape/clic ext?rieur ; offsets de s?lection aux fronti?res des paragraphes ; masquage des ?diteurs transparents/inertes ; clipping et zoom des anc?tres hors Shadow DOM ; suivi apr?s remplacement du body ; garde contre les corrections devenues readonly/disabled ; respect de beforeinput annul? ; suppression du second input lorsqu?il a d?j? ?t? ?mis par l?insertion du navigateur.

Validation r?elle de dist dans Brave headless, Chromium 154.0.8037.98, avec profil temporaire isol? et serveur LanguageTool existant sur 8081. Les parcours passent : d?tection sans balayage initial, soulignements, popup cliqu?e via ?v?nements souris r?els, remplacement dans textarea, correction riche entre plusieurs feuilles inline, correction dans un Shadow Root ouvert, champ email sans API de s?lection, iframe autoris?e, pause/reprise IME, suppression d??diteur et correction cibl?e dans un texte d?passant 5 000 caract?res. Les requ?tes du service worker ont ?t? observ?es : aucun texte du champ password transmis, aucune fen?tre d?analyse sup?rieure ? 5 000 caract?res. Aucune exception JavaScript observ?e dans la page.

Script reproductible : npm run test:browser. N?cessite Node 24+, Brave install? (ou CORRECTLY_BROWSER_PATH). Le serveur r?el est utilis? s?il est pr?sent sur 8081 ; sinon le script d?marre une fixture d?terministe et le signale explicitement. La fixture valide le parcours, pas la qualit? linguistique. Le navigateur temporaire et les serveurs de test sont ferm?s ; le profil temporaire est supprim? ; le serveur LanguageTool pr?existant reste ouvert.

Les sites authentifi?s Gmail, WhatsApp, ChatGPT, LinkedIn et Reddit n?ont pas ?t? test?s dans cette session. Le menu natif, les frameworks riches propres ? chaque site et les Shadow Roots ferm?s ne sont pas valid?s par ces parcours. Il n?est donc pas possible de garantir un fonctionnement parfait sur tous les sites.

Contr?les finaux : **149 tests Vitest r?ussis**, lint, compilation TypeScript et build de distribution r?ussis. Les tests ajout?s couvrent notamment Escape/r?ouverture du popup, remplacement du body, offsets apr?s s?parateurs synth?tiques, clipping Shadow DOM, champs readonly, beforeinput annul? et absence de double input.
