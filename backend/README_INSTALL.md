# Correctly Server 3.1 pour Windows x64

Avec l’installateur `Correctly-V3.1-Setup.exe`, choisissez le dossier proposé et l’option de démarrage à l’ouverture de session, cochée par défaut. Vous pouvez lancer Correctly à la fin. Aucune installation séparée de Java ou Python n’est nécessaire ; le moteur fonctionne localement et hors ligne.

Avec un dossier portable, conservez **tout** son contenu dans un emplacement permanent et lancez `CorrectlyServer.exe`. Ne séparez pas `runtime`, `engine`, `_internal` ni les licences de l’EXE.

Ajoutez l’extension séparément : extrayez `Correctly-Extension.zip`, ouvrez `chrome://extensions` ou `brave://extensions`, activez le mode développeur et chargez le dossier `dist`. Gardez ce dossier et rechargez vos pages. Le setup ne modifie aucun profil navigateur.

L’icône près de l’horloge devient verte quand le correcteur est prêt. Le menu propose Démarrer, Arrêter, Redémarrer, Tester le correcteur, Diagnostics, Versions et Quitter. **Quitter arrête aussi le serveur.** Désactivez « Démarrer avec Windows » pour retirer le raccourci de connexion ; cette option reste indisponible pour les dossiers temporaires et ceux du dépôt.

Si le port 8081 est occupé, quittez l’ancien serveur avec son propre menu, désactivez son ancien autostart puis réessayez. Correctly ne tue jamais une application tierce ni une JVM par son nom. Si un fichier manque, réinstallez le paquet complet. Après un crash moteur, utilisez Redémarrer.

Les journaux d’état et diagnostics sont dans `%LOCALAPPDATA%\Correctly`, avec rotation. Aucun texte saisi dans vos sites n’est conservé par le lanceur. Les notices sont dans `licenses` et `runtime/legal`.

Pour désinstaller la version installée, utilisez **Applications installées → Correctly → Désinstaller**. Le serveur de cette installation est fermé et son raccourci de démarrage retiré. Vos paramètres et votre dictionnaire dans le navigateur sont conservés, ainsi que les diagnostics locaux. Retirez l’extension séparément si souhaité. Pour un dossier portable, désactivez l’autostart, quittez puis supprimez seulement son dossier.

Candidate V3.1 : la validation sur Windows vierge, après reconnexion/reboot et sur les sites Chrome/Brave reste nécessaire avant diffusion finale. Consultez le rapport de recette du dépôt.
