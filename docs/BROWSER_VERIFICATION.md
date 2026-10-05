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
