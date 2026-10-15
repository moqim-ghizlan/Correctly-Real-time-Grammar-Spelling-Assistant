# V4 RC1 — rapport de validation

Mise à jour après les deux feedbacks manuels : les corrections et la nouvelle validation à **223 tests frontend** sont décrites dans le [rapport de diagnostic](Correctly_feedback_report_v4.md). Les changements groupés se choisissent maintenant individuellement, sans présélection, et les deux phrases de l’exemple sont vérifiées séparément dans Brave en conservant le prénom. Les chiffres et artefacts ci-dessous décrivent la préparation initiale de RC1 ; le Setup et le ZIP n’ont pas été reconstruits après ces correctifs.

Date : 15 octobre 2026. Machine : Windows 10 x64 build 19045, Node 24.21.0, CPython 3.14.8, PyInstaller 6.22.3, Inno Setup 6.7.3. Navigateur automatisé : Brave (`brave.exe`), version Chromium annoncée par CDP `Chrome/155.0.8059.80`. Moteur réel local LanguageTool 6.9-SNAPSHOT, JVM privée Temurin 25.0.4.1+1-LTS. Aucun compte ni texte personnel utilisé.

## Résultats observés

Baseline V3.1 : 150 tests frontend, lint et build passent. V4 : **209 tests frontend** (150 historiques + 59 nouveaux), **64 tests backend**. Les contrôles sont exécutés par les commandes de la checklist ; les preuves complémentaires sont dans [validation/v4](validation/v4).

| Contrôle                                   | Résultat final observé                                       |
| ------------------------------------------ | ------------------------------------------------------------ |
| `npm test`                                 | PASS — 209 tests, 11 fichiers                                |
| `npm run lint`                             | PASS                                                         |
| `npm run format:check`                     | PASS                                                         |
| `npm run build`                            | PASS — TypeScript, Vite, manifeste/assets                    |
| pytest backend                             | PASS — 64 tests                                              |
| Brave `--v4`                               | PASS — [sortie sauvegardée](validation/v4/browser-brave.txt) |
| Build Windows + Setup                      | PASS — PyInstaller et ISCC, code 0                           |
| Recette installateur isolée                | PASS — 13 contrôles                                          |
| Tray Windows avec achèvement FR/EN vérifié | PASS — 5 contrôles                                           |
| Empreintes et contenu ZIP                  | PASS — [preuve finale](validation/v4/release-integrity.json) |

Le navigateur vérifie les parcours historiques (suggestion, rich text, Shadow DOM, email, password, iframe, IME, long texte, nettoyage) et les nouveaux parcours V4 : création/persistance après reload, doublon immédiat, édition, désactivation, suppression confirmée, expansion réelle, séparateur unique, Undo, aperçu/groupement et auto-correction d’espacement après ponctuation. Aucun runtime JavaScript exceptionnel observé dans les parcours réussis.

Le lancement Chrome headless a échoué avec `Extension service worker not found`. Ce résultat est un **échec du harnais Chrome**, pas une preuve de fonctionnement ou d’incompatibilité du produit. Chrome reste à vérifier manuellement.

Le premier harnais tray a produit un avertissement d’action échouée tout en annonçant `ok=true` parce qu’il attendait seulement la fin du worker. Cette preuve initiale archivée dans `tray-first-attempt.json` n’est pas retenue comme validation de l’action FR/EN. Le harnais a été renforcé pour exiger son achèvement effectif ; la nouvelle recette complète passe dans `tray-validation.json`.

Des commandes sandboxées ont rencontré des refus d’accès esbuild/pytest et un échec du démarrage JVM. Les réexécutions autorisées hors sandbox ont réussi ; les premiers échecs ne sont pas comptés comme des tests passés. Les essais intermédiaires ont également détecté puis corrigé l’ordre du bouton de suggestion existant, la comparaison des propriétés après sérialisation Chrome, et le nom réel de la règle d’espacement `CONSECUTIVE_SPACES`.

## Matrice raccourcis

PASS indique la portée de la preuve décrite, sans certification des sites non testés.

| ID    | Statut  | Preuve / limite                                                                                                                                                                         |
| ----- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SH-01 | PASS    | Ajout par formulaire dans Brave, entrée rendue et sauvegardée.                                                                                                                          |
| SH-02 | PASS    | Saisie réelle `bjr` puis espace ; un seul événement de remplacement.                                                                                                                    |
| SH-03 | PASS    | `abjr` ne s’étend pas, tests unitaires et Brave.                                                                                                                                        |
| SH-04 | PASS    | Virgule conservée exactement une fois, unitaires et Brave.                                                                                                                              |
| SH-05 | PASS    | Remplacement multi-mots testé ; pipeline raccourci puis phrase.                                                                                                                         |
| SH-06 | PASS    | Désactivation persistée dans Brave ; absence d’expansion testée en unité.                                                                                                               |
| SH-07 | PASS    | Réglage global de raccourcis testé ; correction désactivée n’empêche pas l’expansion.                                                                                                   |
| SH-08 | NOT RUN | Reload options vérifié, fermeture/réouverture complète navigateur et reboot non effectués.                                                                                              |
| SH-09 | PASS    | Expansion synchrone sans aucun appel au check injecté indisponible ; moteur utilisateur jamais arrêté.                                                                                  |
| SH-10 | PASS    | Doublon NFC/casse rejeté ; navigateur vérifie la validité immédiate.                                                                                                                    |
| SH-11 | PASS    | Modification et suppression confirmée observées dans Brave.                                                                                                                             |
| SH-12 | PASS    | Password/readOnly/disabled, OTP et types exclus testés ; confidentialité password en navigateur.                                                                                        |
| SH-13 | PASS    | Composition bloque le remplacement ; cycle IME synthétique observé en navigateur.                                                                                                       |
| SH-14 | PASS    | Collage et remplacement d’une sélection exclus dans les tests.                                                                                                                          |
| SH-15 | NOT RUN | Nœud texte simple testé avec sélection et sans HTML injecté ; sites React authentifiés non testés, éditeurs complexes exclus.                                                           |
| SH-16 | PASS    | Domaine désactivé empêche la registration et l’expansion dans l’intégration Application.                                                                                                |
| SH-17 | PASS    | Fusion de modifications indépendantes, refus de conflit et sérialisation testés ; storage.onChanged branche la remise à jour du cache. Deux fenêtres simultanées à tester manuellement. |
| SH-18 | PASS    | Accent décomposé et casse normalisés sans changer le remplacement.                                                                                                                      |
| SH-19 | PASS    | Annulation explicite observée dans Brave ; native Ctrl+Z non garanti.                                                                                                                   |
| SH-20 | PASS    | Tab/Entrée non capturés, dispatch clavier non annulé ; vrais chats non testés.                                                                                                          |

## Matrice phrase

| ID    | Statut  | Preuve / limite                                                                                              |
| ----- | ------- | ------------------------------------------------------------------------------------------------------------ |
| SE-01 | PASS    | Aucune mutation lors d’une pause ou phrase incomplète ; saisie Brave avant point intacte.                    |
| SE-02 | PASS    | Fin sûre avec moteur réel : espacement corrigé après point ; une transaction testée.                         |
| SE-03 | PASS    | Plusieurs matches calculés de droite à gauche sur copie ; une écriture groupée.                              |
| SE-04 | PASS    | Overlaps refusent le lot entier, sans mutation partielle.                                                    |
| SE-05 | PASS    | Réponse après modification rejetée par requestId et texte exact.                                             |
| SE-06 | PASS    | Dispose/changement de champ invalide ; onglet masqué annule les requêtes logiques.                           |
| SE-07 | PASS    | Erreurs et indisponibilité restent sans écriture ; tests existants client/contrôleur.                        |
| SE-08 | PASS    | Tests historiques FR/EN/Auto préservés ; phrase manuelle FR et auto-espacement EN avec vrai moteur.          |
| SE-09 | PASS    | Filtre du dictionnaire personnel conservé et tests historiques.                                              |
| SE-10 | PASS    | Abréviations, décimales, URL/email, ellipses et code empêchent les frontières automatiques hasardeuses.      |
| SE-11 | PASS    | Correction de la seconde phrase, préfixe intact ; frontières calculées séparément.                           |
| SE-12 | PASS    | Offsets UTF-16 conservés par adaptateurs ; tests Unicode historiques et normalisation V4.                    |
| SE-13 | PASS    | Sélection, caret ajusté, scroll et voisins testés ; sélection déplacée invalide l’auto.                      |
| SE-14 | PASS    | Nouvelle saisie invalide le résultat précédent ; requêtes hors ordre couvertes par tests historiques.        |
| SE-15 | PASS    | Liste sûre explicite ; ambiguïtés uniquement sous aperçu manuel, aucun premier choix imposé automatiquement. |
| SE-16 | PASS    | Structure riche laissée intacte ; action groupée masquée et mutation refusée.                                |
| SE-17 | PASS    | Expansion puis check du nouveau texte ; exactement une mutation d’expansion et une mutation de phrase.       |
| SE-18 | PASS    | Annuler explicite ; texte changé refuse le rollback, pas de capture Ctrl+Z.                                  |
| SE-19 | NOT RUN | Parcours authentifiés WhatsApp/ChatGPT non exécutés ; aucun keydown de soumission ajouté.                    |
| SE-20 | PASS    | Fenêtre bornée, tests longs textes, fixture 5 100 caractères et benchmark jusqu’à 50 000.                    |

## Non-régression et packaging

| ID    | Statut  | Preuve / limite                                                                                                                             |
| ----- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| RG-01 | PASS    | Tests backend et cycle Windows tray sur port isolé, rapport dédié V4.                                                                       |
| RG-02 | PASS    | Contrat local et port inchangés ; vrai serveur 8081 conservé pendant la recette.                                                            |
| RG-03 | NOT RUN | Contrôles isolés des raccourcis Startup ; vraie connexion/reboot non effectué.                                                              |
| RG-04 | PASS    | Migration non destructive des préférences frontend testée ; upgrade isolé du Setup, pas une installation V3.1 utilisateur active.           |
| RG-05 | PASS    | ZIP validé contre dist et chargé dans Brave ; Chrome reste non vérifié.                                                                     |
| RG-06 | PASS    | Seules préférences/paires volontaires persistées ; pas de nouveau journal de contenu, backend inchangé et tests de confidentialité passent. |
| RG-07 | PASS    | Un éditeur actif, dispose/observers existants ; nettoyage navigateur sans exception ; benchmark borné.                                      |
| RG-08 | PASS    | 150 tests frontend historiques et 64 backend passent.                                                                                       |
| RG-09 | BLOCKED | Build Windows réel réussi ; machine Windows vierge indisponible.                                                                            |
| RG-10 | BLOCKED | Notices intégrées, provenance/licences de redistribution finales non validées.                                                              |

## Performance mesurée

Baseline reconstruite depuis HEAD `03cb122` dans `artifacts/v4-baseline-source`, sans modifier les sources de travail. Même machine/navigateur ; 120 dispatchs input synchrones par longueur, délais d’analyse debouncés. Mesure limitée au traitement des événements, sans latence réseau. Les processus de build/recette et les deux navigateurs peuvent se concurrencer ; ce n’est pas une mesure de latence de frappe utilisateur ni une preuve d’absence de fuite mémoire sur plusieurs heures.

| Préfixe UTF-16 | V3.1 médiane / p95 (ms) | V4 médiane / p95 (ms) |
| -------------- | ----------------------- | --------------------- |
| 100            | 0,2 / 0,7               | 0,2 / 0,6             |
| 5 000          | 0,2 / 0,5               | 0,3 / 0,8             |
| 50 000         | 0,4 / 1,0               | 0,4 / 0,7             |

Sources : [baseline](validation/v4/benchmark-baseline.json), [candidate](validation/v4/benchmark-current.json). Aucun seuil inventé ni conclusion de supériorité : les chiffres ne montrent pas d’explosion sur ce parcours. Le heap instantané est enregistré, sans conclure sur sa rétention.

## Artefacts et recette Windows

Setup réel : `artifacts/release/Correctly-V4-RC1-Setup.exe`, 367 732 342 octets, SHA256 `f4432fdf9a9bce1341a3c925d6bbe251879dc6ead545c72f1301d86239016df7`, non signé. 2 350 fichiers de bundle, 761 816 722 octets ; moteur/runtime vérifiés contre le lock.

La version numérique du Setup et de l’extension est `3.99.0` (candidate affichée `4.0.0-rc.1`) ; serveur inchangé `3.1.0`. Aucun tag final `v4.0.0` créé. Le ZIP a été actualisé après les correctifs navigateur avec le script de validation dédié ; `SHA256SUMS.txt` et `release-manifest.json` font autorité pour ses empreintes finales.

`scripts/verify-release.py --report docs/validation/v4/release-integrity.json` recalcule les deux SHA256, les compare au manifeste et vérifie chacun des 13 fichiers de l’archive contre le `dist` final. Les anciens Setup V3.1 sont conservés ; les checksums courants désignent explicitement la candidate V4.

Smoke du paquet : [package-smoke.json](validation/v4/package-smoke.json), prêt FR/EN et arrêt du processus possédé. Installateur de test isolé et base de mise à jour construits avec AppId/dossiers/raccourcis distincts ; preuves détaillées et limites dans [installer](validation/v4/installer). Ces paquets de test utilisent le même backend reconstruit avec métadonnées Setup 3.1.0 puis 3.99.0 ; ce n’est pas une mise à jour d’une instance de production active.

La recette isolée passe **13 contrôles**, token non élevé, dont extraction des 2 350 fichiers vérifiés, activation/désactivation/persistance Startup, upgrade, corpus installé de 11 cas, double instance refusée, deux désinstallations et conservation des fichiers utilisateur/liens étrangers. Le code 7 du scénario de lien étranger est le refus attendu. Les vrais liens Startup et le listener de production restent identiques.

Les validations Windows vierge, vrai reboot, mise à jour/désinstallation active, Chrome manuel, sites authentifiés, Defender/SmartScreen et redistribution restent ouvertes. Aucune publication autorisée par ce rapport.
