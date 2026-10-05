# Suivi de PLAN.md

Le document PLAN.md d’origine est conservé. L’implémentation couvre les fonctionnalités de la V1 et les paramètres ; la validation navigateur reste ouverte.

| Bloc du plan                      | Résultat                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Initialisation, manifest          | TypeScript strict, Vite, Manifest V3, bundle autonome du content script, lint/format/tests                         |
| Champs, état, debounce            | Textarea, text/search, contenteditable simple ; champs dynamiques, nettoyage, composition IME ; états séparés      |
| LanguageTool, cache, concurrence  | Moteur local uniquement, normalisation validée, timeout, cooldown, cache LRU 100, rejet des réponses obsolètes     |
| Soulignement, popup, remplacement | Surcouches transparentes, popup isolée, maximum cinq suggestions, contrôle de la source, sélection recalculée      |
| Contenteditable                   | Range non destructif ; refus des remplacements traversant certains séparateurs ; éditeurs complexes encore limités |
| Menu contextuel, ignore           | Menu natif préparé au passage de la souris/clic droit, routage au frame ; ignore par occurrence                    |
| Paramètres                        | Activation, langues, délai, catégories, domaines désactivés, dictionnaire personnel, stockage local                |
| Tests et documentation            | Tests unitaires/intégration jsdom, validation des assets du build, fixture et checklist manuelle                   |

## Ce qui reste à valider

Toutes les cases de MANUAL_TESTS.md restent à réaliser dans Chrome/Brave. Aucun test réel sur Gmail, ChatGPT ou LinkedIn n’est revendiqué. Les prochaines améliorations possibles sont l’analyse de paragraphes longs, l’intégration spécifique aux éditeurs riches, le Shadow DOM et l’historique Annuler.
