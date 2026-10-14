# Ajouter l’extension Chrome ou Brave

Le setup installe le serveur Correctly. L’extension nécessite votre accord dans le navigateur ; elle n’est pas installée silencieusement et aucun profil/politique navigateur n’est modifié.

1. Extrayez **Correctly-Extension.zip** dans un dossier permanent. Conservez le dossier `dist` extrait : le navigateur continuera à l’utiliser.
2. Ouvrez `chrome://extensions` dans Chrome ou `brave://extensions` dans Brave.
3. Activez le **mode développeur**, cliquez sur **Charger l’extension non empaquetée**, puis sélectionnez **dist**.
4. Rechargez vos pages, laissez Correctly actif près de l’horloge et essayez « je sui content » ou « I has a car ».

Si votre organisation gère le navigateur, respectez ses règles de distribution. Une installation depuis le Chrome Web Store pourra remplacer cette procédure après publication ; aucun lien de boutique n’est disponible pour cette candidate.

L’extension reste en version **0.2.0**, conserve ses paramètres, dictionnaire et langues FR/EN, et contacte `http://127.0.0.1:8081/v2/check`. La version serveur 3.1 ajoute l’installation Windows, sans changement du moteur de correction.

En cas de mise à jour du dossier extension, cliquez sur **Recharger** dans sa carte puis rechargez les pages. Ne supprimez pas ce dossier pendant l’utilisation. Pour retirer l’extension, utilisez **Supprimer** dans la même page ; la désinstallation du serveur ne supprime pas les données navigateur.
