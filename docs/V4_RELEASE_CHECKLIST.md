# Recette de sortie V4

Statut : **RC1 implémentée et testée localement, release finale non approuvée**.

- [x] Audit initial et conservation des fichiers utilisateur ; aucun reset, commit, tag ou publication.
- [x] Raccourcis locaux, UI, validation, stockage distinct et fusion des modifications indépendantes.
- [x] Expansion hors moteur, Unicode, frontières exactes, protections de sélection/IME/collage et domaines.
- [x] Planification et application groupée ; aperçu explicite pour les suggestions incertaines ; politique automatique d’espacement vérifiée avec le moteur réel.
- [x] Annulation explicite, conservation du caret/scroll et abstention sur DOM riche non pris en charge.
- [x] Tests frontend/backend, lint, build et benchmark comparatif local ; résultats dans le rapport.
- [x] Setup RC1 et ZIP séparé construits ; SHA256 et contenu du ZIP contrôlés.
- [x] Smoke EXE/JVM privés sur port isolé et contrôles automatisés de tray/installateur consignés dans `docs/validation/v4/`.
- [ ] Chrome : le lancement headless n’a pas chargé le service worker ; refaire avec l’extension chargée manuellement dans un profil de test.
- [ ] Reprendre les scénarios de raccourcis après fermeture complète/réouverture du navigateur puis redémarrage Windows. Un rechargement de page options est vérifié, pas ces redémarrages.
- [ ] Windows propre sans Java/Python/Node ni anciennes installations : première installation du Setup de production.
- [ ] Véritable connexion Windows, démarrage automatique et manipulation de l’icône installée.
- [ ] Mise à jour d’une installation V3.1 de production active et désinstallation active. La recette isolée ne remplace pas ce contrôle.
- [ ] ChatGPT, WhatsApp Web, Gmail, LinkedIn et Reddit dans Chrome/Brave, comptes de test ; IME réel et éditeurs contrôlés React/ProseMirror/Slate/Quill.
- [ ] Audit final des licences/provenance/redistribution Java, LanguageTool et Inno Setup ; notices présentes ne valent pas validation juridique.
- [ ] Defender/SmartScreen et décision de signature ; EXE actuellement non signés.
- [ ] Après réussite et approbation explicites : attribuer `4.0.0`, reconstruire et recalculer les empreintes, actualiser les rapports, puis seulement créer le tag/publier.

## Reproduire

Depuis la racine :

```powershell
npm test
npm run lint
npm run format:check
npm run build
backend/.venv/Scripts/python.exe -m pytest -c backend/pyproject.toml backend/tests -q --tb=short
node scripts/verify-browser.mjs --v4 --benchmark
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/create-setup.ps1 -NoOpen
```

`createSetup.cmd` appelle le même constructeur et conserve les anciennes sorties. Pour actualiser uniquement le ZIP après un changement frontend, compiler puis appeler `scripts/refresh-extension.ps1 -BundlePath <bundle validé>` ; le Setup existant est vérifié et ses sommes restent cohérentes. Les preuves de build/recette ne doivent pas être remplacées par une simple déclaration de compatibilité.
