---
name: token-efficiency
description: >-
  Réduit le coût en tokens des tâches Claude Code sur Correctly : lecture ciblée,
  recherche progressive, sorties concises, tests proportionnés et réutilisation
  du contexte. À appliquer pendant les tâches de développement, d'analyse ou
  de refactorisation lorsque l'efficacité de contexte est importante.
---

# Économie de tokens — Correctly

## Objectif

Obtenir un résultat vérifiable avec **le moins de contexte et d'actions inutiles**, sans sacrifier la qualité, la confidentialité ou les tests indispensables. Ce skill n'abaisse pas le prix du modèle et ne garantit pas une réduction chiffrée des tokens.

## Procédure

1. Reformuler la demande en **objectif, périmètre et critère de réussite**, en 1–3 phrases au maximum. Si la demande est claire, agir sans solliciter de confirmation.
2. Avant de lire beaucoup de code, localiser les fichiers pertinents avec `rg --files` ou `rg -n 'motif' chemin/ciblé`. Lire seulement les sections nécessaires. S'appuyer sur les chemins connus du projet et sur le diff courant, puis élargir **uniquement** en cas de besoin.
3. Utiliser `git status --short`, `git diff --name-only` et des diffs ciblés pour identifier les changements. Ne jamais supposer que l'arbre Git est propre ou que les documents historiques reflètent le code actuel.
4. Ne pas parcourir ni copier en contexte `node_modules/`, `backend/.venv/`, `backend/vendor/`, `dist/`, `artifacts/`, les exécutables, les bundles générés ou les logs massifs sauf nécessité précise.
5. Éviter de relire intégralement un fichier déjà consulté ; relire la section modifiée ou le diff. Ne pas répéter les commandes qui ont déjà réussi sans modification pertinente.
6. Choisir le **test le plus ciblé d'abord**, puis élargir selon la portée du changement. Ne jamais économiser des tokens en sautant les validations critiques pour la sécurité, l'intégrité du texte ou une livraison.
7. Garder les réponses courtes : résultat, fichiers changés, tests exécutés avec leur statut, limites réelles. Ne pas recopier tout le code ou les logs si un chemin et une synthèse suffisent.
8. Pour une session devenue très longue, conserver un récapitulatif compact (objectif, décisions, fichiers touchés, résultat des tests, étapes restantes) puis proposer `/compact` si pertinent. Ne pas effacer des informations nécessaires à la tâche.

## Règles de décision

- Pas de « scan complet » par défaut, pas de gros agents parallèles pour une question simple.
- Une erreur doit être examinée avec son contexte suffisant ; une sortie tronquée ne justifie pas une conclusion hâtive.
- Ne pas confondre **réduction de tokens** et **réduction du temps CPU** : les builds complets restent nécessaires avant une release.
- Ne pas modifier le code juste pour raccourcir la conversation.
- Ne pas imposer un modèle moins performant sur une modification complexe ou à risque sans demande de l'utilisateur.

## Fin de tâche

Répondre en général sous la forme : **Fait** · **Tests** · **À vérifier** ; ajouter plus de détails uniquement s'ils sont utiles.
