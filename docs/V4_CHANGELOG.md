# Correctly V4 RC1

Candidate locale du 15 octobre 2026, sans publication ni tag final.

- Raccourcis personnels : création, édition, activation, suppression confirmée et validation immédiate dans les paramètres. Détection Unicode NFC insensible à la casse, remplacement conservé tel que défini, jusqu’à 500 entrées.
- Expansion à l’espace ou à une ponctuation sûre, indépendante du moteur et du bouton global de correction. Les domaines désactivés et le réglage propre aux raccourcis restent respectés. Aucun raccourci d’exemple n’est enregistré.
- Correction par phrase activée par défaut : choix individuel des changements et de leurs alternatives, toutes les cases initialement décochées, aperçu avant/après mis à jour puis une seule mutation pour les choix compatibles. Les mots non cochés, notamment les noms propres, sont conservés. La portée reste la phrase cliquée ; les suggestions individuelles restent disponibles.
- Automatisation limitée aux règles d’espacement `WHITESPACE_RULE`, `COMMA_PARENTHESIS_WHITESPACE`, `CONSECUTIVE_SPACES`, avec une seule suggestion, sans changement des caractères non blancs ni des retours à la ligne. Une pause seule n’autorise aucune réécriture.
- Vérification des offsets, texte exact, requêtes périmées, sélection, focus, composition et visibilité. Les conflits refusent le lot. Détection bornée à 5 000 unités UTF-16 ; un fragment tronqué n’autorise pas d’édition automatique.
- Bouton accessible « Annuler la modification Correctly », disponible tant que le texte n’a pas changé. Aucun détournement de Ctrl+Z ; l’historique natif reste dépendant de l’éditeur.
- Écritures de paramètres de raccourcis coordonnées entre pages par Web Locks, fusion des modifications indépendantes, refus des conflits sur la même entrée et propagation via storage.onChanged. Données corrompues conservées, fonction désactivée et erreur de récupération visible.
- Backend Python/Java/LanguageTool, port 8081, contrat HTTP, AppId d’installation et logique d’autostart conservés. Aucun cloud, SQL, télémétrie, permission nouvelle ou dépendance supplémentaire.

## Utilisation et limites

Créer par exemple `bjr → Bonjour` dans « Raccourcis de texte », puis saisir `bjr ` pour obtenir `Bonjour `. Seuls l’espace et la ponctuation tapés déclenchent le remplacement ; un collage ne le déclenche pas. Tab et Entrée ne sont jamais capturés, pour préserver l’envoi des messages.

Les nouvelles mutations prennent en charge les inputs texte, textarea et contenteditable composé d’un seul nœud texte. Les structures riches, éditeurs de code et frameworks identifiés sont exclus de ces mutations ; les anciennes suggestions restent accessibles dans les champs historiquement compatibles. Les champs password, OTP/paiement identifiables, readonly et disabled sont protégés. Les inputs email/url/search/tel ne reçoivent pas les nouvelles mutations.

Le stockage est `chrome.storage.local`, par profil, sans synchronisation Chrome/Brave ; une suppression du profil ou de l’extension peut supprimer les raccourcis. Ne pas enregistrer de données sensibles dans ces paires.

## Version candidate et distribution

Version npm et nom affiché : `4.0.0-rc.1`. Version numérique extension/Setup : `3.99.0`, supérieure à V3.1 mais réservant `4.0.0` à la recette finale exigée par [la spécification V4](../plans/Correctly_plan_v4.md). Le serveur inchangé reste identifié `3.1.0` et le répertoire portable historique conserve son nom V3.

Fichiers : `artifacts/release/Correctly-V4-RC1-Setup.exe`, `Correctly-Extension.zip`, `SHA256SUMS.txt`. L’extension s’installe séparément en chargeant le dossier `dist` extrait du ZIP. Le Setup ne touche pas aux profils des navigateurs. Les sorties `v4-installer-test` et `v4-upgrade-base` sont des constructions de test, jamais des livrables utilisateur.

La validation finale Chrome, Windows vierge, connexion/reboot, sites authentifiés et redistribution reste ouverte : voir [le rapport](V4_TEST_REPORT.md) et [la checklist](V4_RELEASE_CHECKLIST.md).
