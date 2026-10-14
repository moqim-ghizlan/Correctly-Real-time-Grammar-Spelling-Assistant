# Contrat HTTP V2/V3

`POST http://127.0.0.1:8081/v2/check`, `application/x-www-form-urlencoded`. Paramètres inchangés : `text`, `language`, `enabledOnly=false`. Auto ajoute `preferredVariants=en-US`, `preferredLanguages` calculé par le client V2 et `forcePreferredLanguages=true`. Le repli FR/EN existant est conservé.

Réponse JSON LanguageTool originale. Le client continue à exploiter `matches[].offset`, `length`, `message`, `replacements`, `rule.id`, `rule.issueType`, `rule.category` et `language.code`. Offsets en unités UTF-16, contrôles de fraîcheur et sélection V2 inchangés. Aucune nouvelle API Python, permission ou adresse n'est introduite.

La santé du contrôleur utilise une phrase synthétique fixe avec HTTP POST et valide la structure `matches`. Elle ignore les proxies système, refuse les redirects et limite la taille de réponse. Les tests linguistiques utilisent uniquement le corpus synthétique enregistré dans `docs/baseline`.
