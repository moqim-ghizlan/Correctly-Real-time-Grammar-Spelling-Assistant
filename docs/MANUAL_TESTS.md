# Tests manuels — Correctly

Cette checklist reste à réaliser manuellement par l’utilisateur dans son navigateur et sur ses sites. Une vérification limitée dans Brave est décrite dans [le rapport navigateur](BROWSER_VERIFICATION.md). Les tests jsdom ne prouvent pas l’alignement visuel ou la compatibilité des éditeurs des sites.

## Préparation

1. Exécuter `npm install`, `npm run lint`, `npm test`, `npm run build`.
2. Démarrer LanguageTool sur le port 8081 selon le README.
3. Charger `dist/` en mode développeur dans Chrome/Brave. Recharger les onglets déjà ouverts.
4. Ouvrir l’icône Correctly et vérifier le statut du moteur local.
5. Exécuter `npm run fixture`, puis ouvrir `http://127.0.0.1:8080`.

## Chargement et confidentialité

- [ ] Chrome charge l’extension sans erreur de manifest, de module ou de CSP.
- [ ] Brave charge l’extension sans erreur.
- [ ] L’icône apparaît et les paramètres s’ouvrent.
- [ ] LanguageTool local démarre ; le bouton « Vérifier le moteur » signale sa disponibilité.
- [ ] Dans les outils développeur du service worker, les analyses ciblent seulement `http://127.0.0.1:8081/v2/check`.
- [ ] Password, email, number, readonly et fieldset désactivé ne sont pas analysés.
- [ ] Aucun texte saisi n’apparaît dans le stockage local de l’extension.

## Champs et langues

- [ ] Textarea : écrire « je sui content », attendre une pause et vérifier les erreurs du moteur.
- [ ] Input text : écrire « je sui ici », vérifier le soulignement et la correction.
- [ ] Input search : écrire « I has a car. ».
- [ ] Contenteditable simple : corriger « je sui content » et vérifier que le gras/italique voisins restent présents.
- [ ] Contenteditable avec plusieurs paragraphes : vérifier l’alignement des annotations ; les corrections traversant des séparateurs de paragraphes peuvent être refusées.
- [ ] Français : sélectionner Français, essayer « Il sont parti hier. » et « je vais a paris demain ».
- [ ] Anglais : sélectionner Anglais, essayer « I has a car. » et « She go to school. ».
- [ ] Auto : essayer séparément des phrases françaises et anglaises. Sur Windows, vérifier les limites du moteur et comparer à une langue explicite.
- [ ] Champs ajoutés dynamiquement : bouton Ajouter un champ ; le nouveau champ est analysé.
- [ ] Champs supprimés : bouton Supprimer ; aucune surcouche orpheline ni erreur console.
- [ ] Texte supérieur à 5 000 caractères : aucune requête d’analyse, aucune dégradation de la frappe.

## Affichage et interaction

- [ ] Les soulignements rouge/orange sont visibles et placés sous la portion fautive.
- [ ] La saisie, les clics, le curseur et la sélection restent utilisables sous la surcouche.
- [ ] Un clic sur une faute ouvre la popup près de la faute.
- [ ] La popup reste dans la fenêtre aux quatre bords, et les boutons sont lisibles en clair/sombre.
- [ ] Une suggestion remplace seulement la portion concernée.
- [ ] Une suggestion vide supprime seulement la portion fautive si le moteur en propose une.
- [ ] Ignorer masque uniquement l’occurrence choisie ; une modification permet une nouvelle détection.
- [ ] Clic extérieur, Escape et changement de champ ferment la popup.
- [ ] Clic droit sur une faute proposant une suggestion : le menu Correctly présente la meilleure suggestion. Passer la souris au-dessus avant d’ouvrir ; si nécessaire, fermer et rouvrir le menu natif.
- [ ] Choisir le menu corrige le bon champ dans le bon onglet/frame.
- [ ] Clic droit hors faute : aucune correction utilisable. Vérifier aussi après changement d’onglet.

## Curseur, géométrie et concurrence

- [ ] Le curseur et la sélection ne bougent pas pendant l’analyse.
- [ ] Corriger avant, dans et après une sélection : la nouvelle sélection reste logique.
- [ ] Emoji 😊, drapeau 🇫🇷, accents é è à ç œ, apostrophes : texte intact après correction.
- [ ] Frappe rapide et composition IME : aucune analyse partielle pendant la composition, aucune latence visible.
- [ ] Modifier le début de la phrase pendant une analyse : aucune ancienne correction appliquée au nouvel offset.
- [ ] Scroll vertical/horizontal du textarea : annotations alignées.
- [ ] Scroll de la page et du conteneur de la fixture : vérifier les annotations, y compris les zones masquées.
- [ ] Redimensionnement du champ et de la fenêtre, police, padding, line-height : annotations alignées.
- [ ] Zoom navigateur et champs avec transforms CSS : noter les limites éventuelles.
- [ ] Plusieurs champs : erreurs, ignore et corrections indépendants.
- [ ] Plusieurs onglets et frames : menu et corrections visent le bon contexte.

## Paramètres et panne

- [ ] Désactivation globale : les annotations disparaissent et aucune nouvelle analyse n’est envoyée.
- [ ] Désactivation sur le site courant : seules les pages du domaine concerné sont désactivées.
- [ ] Changement de langue et délai 200–2 000 ms pris en compte.
- [ ] Désactiver Orthographe/Grammaire masque la catégorie correspondante.
- [ ] Dictionnaire personnel : ajouter un mot signalé puis vérifier que ses erreurs d’orthographe sont masquées ; les accords de grammaire restent possibles.
- [ ] Réglages conservés après fermeture du navigateur.
- [ ] Arrêter LanguageTool : pas de crash, de spam ou de retries en boucle ; popup indique indisponible.
- [ ] Redémarrer LanguageTool, attendre 10 s, modifier le texte : analyses reprises.
- [ ] Revenir via Précédent/Suivant : pas de double enregistrement des champs.

## Sites réels

- [ ] ChatGPT : saisie, popup, correction, curseur.
- [ ] Gmail : nouveau message, format riche, correction, envoi intact.
- [ ] LinkedIn : publication/commentaire, correction, curseur.
- [ ] Reddit : commentaire, format, correction.
- [ ] Consigner les éditeurs où un événement input synthétique ne suffit pas, ainsi que l’historique Annuler après une correction.

Pour signaler un problème, noter navigateur/version, site, type de champ, langue, résultat attendu et obtenu. Utiliser une phrase de test sans données personnelles.
