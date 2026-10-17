# Correctly --- Plan de réalisation du site vitrine premium

**Document destiné à l'agent de développement**\
**Projet :** site vitrine de Correctly\
**Stack demandée :** HTML sémantique, Tailwind CSS, JavaScript natif\
**Langues :** français et anglais\
**Thèmes :** clair et sombre, avec préférence système si possible\
**Objectif :** obtenir une présentation de qualité premium, comparable à
un produit logiciel soigneusement conçu, et non une landing page
générique.

------------------------------------------------------------------------

## 0. Mission de l'agent

Créer un site vitrine public pour **Correctly**, l'assistant d'écriture
pour Chrome et Brave, avec une identité visuelle cohérente, une
expérience responsive, des animations soignées, des démonstrations
interactives et une présentation claire des fonctionnalités et des
versions V5.1 à V5.11.

Le site doit faire comprendre en moins de dix secondes :

1.  Ce qu'est Correctly.
2.  À qui l'outil sert et quels problèmes il résout.
3.  Comment fonctionnent la correction, la reformulation et la
    traduction.
4.  Comment l'utilisateur garde le contrôle de ses textes.
5.  Quelles fonctionnalités existent réellement et lesquelles
    appartiennent encore à la feuille de route.
6.  Comment découvrir le code, installer l'extension ou suivre le
    projet.

**Le résultat recherché est un site premium, vivant, crédible et très
travaillé.** La qualité ne vient pas d'une accumulation d'effets : elle
vient de la direction artistique, de la hiérarchie visuelle, des
détails, de la fluidité, du contenu, de l'accessibilité et de la
cohérence de toutes les pages.

### Règle absolue : inspecter avant de construire

Les documents V5.1 à V5.11 sont des spécifications de fonctionnalités et
de comportement. Ils ne constituent pas, à eux seuls, une preuve que
toutes les fonctionnalités ont été implémentées.

Avant d'écrire le site :

-   Inspecter le dépôt, les branches, les tags, le README, le
    `manifest.json`, les scripts de build, les tests et le code
    réellement présent.
-   Vérifier les fonctionnalités observables dans le code et, lorsque
    c'est possible, dans l'extension exécutée.
-   Relever la version réellement identifiée par le dépôt. Ne pas
    supposer que V5.11 est la version publiée uniquement parce que son
    document existe.
-   Distinguer **disponible et vérifié**, **partiellement disponible**,
    **en développement**, **prévu** et **à vérifier**.
-   Ne jamais déduire qu'une fonctionnalité est terminée du nom d'un
    fichier comme `v5.2_done.md`.
-   Ne jamais afficher de faux chiffres, de faux avis, de faux
    utilisateurs, de fausses certifications ou de résultats de tests
    inventés.
-   Si une fonction n'est pas vérifiable, la présenter avec prudence ou
    la placer dans la feuille de route.

Ne pas casser l'extension existante. Le site doit vivre dans un dossier
séparé, par exemple `website/` ou `site/`, choisi après inspection du
dépôt. Ne pas remplacer le `package.json`, le système de build ou le
dossier `dist/` de l'extension sans nécessité démontrée.

------------------------------------------------------------------------

## 1. Positionnement produit

### 1.1 Description

Correctly est un assistant d'écriture conçu pour Chrome et Brave. Selon
les fonctions réellement disponibles dans la version auditée, il peut
aider à corriger un texte, le reformuler dans un style choisi ou le
traduire. L'expérience vise à rester simple : l'utilisateur choisit une
action, examine le résultat et décide de l'utiliser ou non.

### 1.2 Valeurs à mettre en avant

-   **Contrôle utilisateur :** les opérations d'IA sont déclenchées
    volontairement ; le texte n'est pas remplacé silencieusement.
-   **Choix :** correction, reformulation et traduction sont des actions
    distinctes.
-   **Transparence :** expliquer les limites, les fournisseurs
    configurés et les éventuels coûts d'API sans promesses absolues.
-   **Confidentialité :** expliquer précisément ce qui reste local et ce
    qui est transmis au fournisseur lorsqu'une action d'IA est demandée.
    Ne jamais dire que tout est « 100 % privé » si du texte est envoyé à
    un fournisseur externe.
-   **Utilité quotidienne :** présenter des cas concrets, pas uniquement
    des termes techniques.
-   **Simplicité :** une interface discrète, accessible depuis le
    navigateur, avec un aperçu avant application lorsque cette fonction
    est vérifiée.
-   **Maîtrise des coûts :** présenter les limites de requêtes et
    estimations uniquement si elles sont réellement présentes et
    vérifiées.

### 1.3 Ton éditorial

-   Clair, direct, humain et professionnel.
-   Éviter le jargon d'IA inutile et les promesses marketing
    invérifiables.
-   Éviter les phrases vagues comme « révolutionnez votre productivité »
    sans expliquer comment.
-   Ne pas présenter Correctly comme un SaaS multi-utilisateurs si le
    produit reste une extension personnelle.
-   Ne pas inventer de tarification, d'abonnement, de compte utilisateur
    ou de synchronisation cloud.
-   Utiliser des exemples de textes synthétiques, non personnels, pour
    toutes les démos.

------------------------------------------------------------------------

## 2. Direction artistique : niveau premium

### 2.1 Impression recherchée

Le site doit évoquer un produit logiciel haut de gamme : élégant,
précis, moderne et technique sans être froid. L'interface doit paraître
conçue sur mesure, pas assemblée à partir d'un template de landing page.

Mots-clés visuels :

-   typographie forte et lisible ;
-   grands espaces et marges maîtrisées ;
-   fonds profonds et dégradés subtils ;
-   accents lumineux violets/bleu électrique ou cyan, utilisés avec
    retenue ;
-   panneaux translucides et profondeur légère ;
-   lignes de grille très discrètes ;
-   ombres douces, contours fins et rayons cohérents ;
-   illustrations de l'interface réelle ou maquettes clairement
    identifiées ;
-   transitions fluides et micro-interactions ;
-   contraste suffisant et lecture confortable.

### 2.2 Palette de départ

Proposer un système de design avec variables CSS afin de pouvoir ajuster
la palette sans réécrire les composants.

**Mode sombre :** - arrière-plan principal : bleu-noir ou anthracite
très profond ; - surfaces : nuances légèrement plus claires que le fond
; - texte principal : blanc cassé ; - texte secondaire : gris froid avec
contraste suffisant ; - accent : violet électrique ou bleu-violet ; -
accent secondaire : cyan limité aux détails, aux états et aux graphiques
utiles ; - bordures : fines, semi-transparentes, jamais trop lumineuses.

**Mode clair :** - fond : blanc cassé / gris très clair ; - surfaces :
blanc ; - texte : anthracite ; - texte secondaire : gris moyen lisible
; - accents identiques au mode sombre, adaptés pour garder le contraste
; - ombres plus discrètes que dans le mode sombre.

Ne pas utiliser une couleur vive pour chaque composant. Une couleur
d'accent principale suffit, accompagnée d'une seconde couleur d'accent
ponctuelle.

### 2.3 Typographie

-   Choisir une police sans-serif moderne et très lisible, avec une
    hiérarchie claire.
-   Préférer une police locale ou une stratégie de chargement optimisée
    ; si une police distante est utilisée, documenter cette dépendance
    et éviter de bloquer l'affichage.
-   Titres : grands, denses mais lisibles, avec une largeur de ligne
    contrôlée.
-   Paragraphes : largeur limitée, hauteur de ligne confortable.
-   Texte d'interface : taille adaptée aux petits écrans et au zoom.
-   Ne pas utiliser un dégradé sur tous les titres : réserver cet effet
    au titre principal ou à quelques mots choisis.

### 2.4 Système de composants

Créer des styles réutilisables et cohérents pour :

-   boutons primaire, secondaire, tertiaire et lien ;
-   navigation desktop et menu mobile ;
-   badges de statut ;
-   cartes de fonctionnalités ;
-   cartes de version ;
-   panneaux de démonstration ;
-   encarts de confidentialité ;
-   accordéons FAQ ;
-   séparateurs, champs de formulaire éventuels et notifications ;
-   éléments de navigation et pied de page.

Les états `hover`, `focus-visible`, `active`, `disabled` et les états
d'erreur doivent être dessinés, pas laissés aux styles par défaut du
navigateur.

------------------------------------------------------------------------

## 3. Architecture de la page et contenu

Construire une **page principale longue, éditorialisée et rythmée**,
avec une navigation simple. Si le contenu devient trop lourd, une page
dédiée aux versions peut être ajoutée, mais la page d'accueil doit
rester compréhensible sans navigation supplémentaire.

### 3.1 Barre de navigation

Contenu :

-   logo Correctly et nom du produit ;
-   liens : Fonctionnalités, Démonstration, Versions, Confidentialité,
    FAQ ;
-   sélecteur FR / EN ;
-   sélecteur de thème clair / sombre ;
-   CTA principal : **Découvrir Correctly** ou **Voir le projet** ;
-   menu mobile avec ouverture/fermeture accessible au clavier.

Comportement :

-   barre discrète au départ, puis éventuellement fond opaque et bordure
    fine lors du défilement ;
-   lien actif ou indicateur de section si cela améliore l'orientation ;
-   menu mobile qui se ferme après navigation et avec la touche `Escape`
    ;
-   aucun bouton factice. Chaque lien doit avoir une destination réelle.

### 3.2 Hero --- première impression

Le premier écran doit immédiatement montrer le produit et son utilité.

Proposition de texte français :

**Sur-titre :** `CORRECTLY · ASSISTANT D'ÉCRITURE POUR LE NAVIGATEUR`

**Titre :**\
« Écrivez comme vous le pensez. Exprimez-le comme vous le voulez. »

**Sous-titre :**\
« Corrigez, reformulez et traduisez vos textes depuis Chrome ou Brave,
tout en gardant le contrôle sur chaque modification. »

**Actions :** - bouton principal : `Découvrir les fonctionnalités` -
bouton secondaire : `Explorer les versions`

Adapter le texte final si l'audit révèle que certaines fonctions ne sont
pas encore disponibles. Ne pas affirmer qu'une fonction est disponible
si elle n'est pas vérifiée.

Proposition de titre anglais :

"Write what you mean. Say it the way you want."

Sous-titre anglais :

"Correct, rewrite and translate text from Chrome or Brave, while keeping
control over every change."

#### Visuel principal du hero

Le visuel est essentiel : ne pas se contenter d'une illustration
décorative abstraite.

Créer une composition soignée qui met en scène une **maquette du
produit** :

-   une fenêtre de navigateur stylisée ;
-   un texte source synthétique ;
-   le lanceur semi-circulaire Correctly sur le bord droit ;
-   la fenêtre modale centrée avec les trois onglets `Correction`,
    `Reformulation`, `Traduction` ;
-   un résultat avec une comparaison avant/après ;
-   des boutons `Appliquer`, `Copier` et `Annuler` si ces actions
    correspondent à la version auditée ;
-   quelques détails de profondeur, halos subtils et petites animations.

La maquette doit respecter la direction d'interface approuvée pour V5.11
: **un seul demi-cercle attaché au bord droit et une seule modale
centrée à trois onglets**, et non une barre horizontale de trois
boutons.

Si le visuel est une maquette, l'indiquer discrètement comme aperçu
illustratif. S'il existe des captures réelles, préférer les captures de
l'extension auditée. Ne jamais présenter une maquette comme une capture
authentique.

### 3.3 Bandeau de bénéfices

Juste sous le hero, afficher 3 ou 4 bénéfices courts, avec icônes SVG
légères :

-   Une action choisie par l'utilisateur.
-   Un aperçu avant application, lorsque disponible.
-   Des raccourcis de texte locaux, si vérifiés.
-   Une configuration claire des fournisseurs et de l'usage, si
    vérifiée.

Ne pas ajouter de chiffres décoratifs comme « 10 000 utilisateurs », «
99,9 % de précision » ou « 3 fois plus rapide ».

### 3.4 Section « Un seul outil, plusieurs façons d'écrire »

Présenter les trois grandes familles de tâches dans une composition
visuelle forte, avec un contenu simple.

**Correction** - Objectif : repérer et proposer une correction des
fautes. - Montrer un exemple synthétique avec quelques corrections
clairement visibles. - Préciser que le texte d'origine n'est remplacé
qu'après une action explicite si le mécanisme est vérifié.

**Reformulation** - Objectif : adapter le ton sans changer l'idée
principale. - Exemples de styles possibles, selon la version vérifiée :
professionnel, formel, amical, décontracté, poli, concis ou
humoristique. - Montrer deux propositions dans des styles différents,
sans suggérer qu'elles sont générées en temps réel par le site.

**Traduction** - Objectif : passer d'une langue à une autre, avec
possibilité de variantes régionales si vérifiée. - Citer le français,
l'anglais, l'arabe, le turc, l'allemand et l'espagnol uniquement si leur
prise en charge est confirmée dans la version auditée. - Si le dialecte
syrien est disponible, le mettre en avant comme un cas d'usage concret,
sans promettre une perfection linguistique.

La section doit être visuellement variée : alterner cartes, panneaux et
illustrations plutôt que répéter trois cartes identiques.

### 3.5 Démonstration interactive

Créer une section de démonstration locale, qui permet au visiteur de
comprendre le produit sans installer l'extension.

Fonctionnement attendu :

-   trois onglets : Correction, Reformulation, Traduction ;
-   texte source synthétique ;
-   options propres à chaque onglet ;
-   résultat de démonstration pré-écrit et cohérent avec l'action
    choisie ;
-   action permettant de remplacer l'exemple source par un autre exemple
    ;
-   bouton de copie si utile ;
-   indication claire : **« Démonstration interactive : les résultats
    sont des exemples prédéfinis. Aucun texte n'est envoyé à un modèle
    d'IA depuis cette page. »**

Règles impératives :

-   Cette démo ne doit pas appeler Gemini, OpenAI ou une autre API.
-   Ne demander aucune clé API au visiteur.
-   Ne pas envoyer le texte saisi sur un serveur.
-   Si le visiteur peut modifier le texte, ne pas prétendre que le
    résultat change réellement selon le contenu. Utiliser un exemple
    guidé ou afficher un message expliquant la limite.
-   Ne pas appliquer de modifications à une page externe : la démo ne
    touche qu'à son propre composant.
-   Les résultats doivent être du texte, jamais du HTML injecté.
-   Les boutons `Appliquer` / `Copier` / `Annuler` de la maquette ne
    doivent pas prétendre modifier le texte d'une page réelle.

Cette démo doit être l'une des parties les plus travaillées du site :
transitions entre onglets, mise en évidence des différences, états de
chargement simulés uniquement s'ils sont explicitement identifiés comme
animations de démonstration, et retours visuels précis.

### 3.6 Section « Le contrôle reste entre vos mains »

Expliquer le flux de travail en 3 ou 4 étapes :

1.  Sélectionner ou saisir le texte.
2.  Choisir une action et ses options.
3.  Examiner le résultat proposé.
4.  Appliquer, copier ou annuler selon les actions disponibles.

Utiliser une illustration de type workflow, un schéma SVG animé ou une
composition interactive. Le schéma doit expliquer un comportement réel,
pas servir uniquement de décoration.

Mettre en évidence : - pas de modification silencieuse ; - vérification
de la cible avant application, si le code le confirme ; - possibilité de
copier un résultat quand l'application directe n'est pas sûre, si
vérifié ; - possibilité d'annuler une modification, si vérifiée.

### 3.7 Section confidentialité et fonctionnement

Cette section doit être honnête et précise. Présenter les faits
confirmés dans le code.

Points à vérifier et expliquer :

-   Correctly est une extension Chrome/Brave.
-   L'architecture V5 prévue est côté extension, sans backend Correctly
    hébergé.
-   L'utilisateur configure ses propres clés API, si la configuration
    multi-fournisseur est réellement disponible.
-   Les requêtes d'IA sont déclenchées volontairement.
-   Le texte choisi est transmis au fournisseur configuré lorsqu'une
    action d'IA l'exige.
-   Les raccourcis de texte personnalisés sont locaux et sans appel IA,
    si cette fonction est vérifiée.
-   Les clés API ne doivent pas être exposées dans la page web ou les
    journaux, selon l'architecture réellement implémentée.
-   Les limites de requêtes locales ne constituent pas une garantie
    absolue de plafond monétaire.

Ne pas utiliser les formulations « aucune donnée ne quitte jamais votre
appareil » ou « sécurité absolue » si elles ne sont pas vraies. Une
section de confidentialité doit décrire les flux réels, pas promettre
plus que le produit ne peut garantir.

Visuel suggéré : schéma simple avec le navigateur, l'extension et le
fournisseur d'IA, montrant le chemin du texte uniquement lors d'une
action volontaire. Le schéma doit distinguer le traitement local des
requêtes externes.

### 3.8 Section fonctionnalités avancées

Construire une grille ou une mise en page éditoriale pour les fonctions
complémentaires qui sont réellement disponibles :

-   accès depuis le navigateur ;
-   raccourcis clavier et menu contextuel ;
-   bouton lanceur discret ;
-   styles de reformulation ;
-   langues et variantes régionales ;
-   raccourcis de texte personnalisés ;
-   configuration de plusieurs fournisseurs et modèles ;
-   limites et alertes de requêtes ;
-   statistiques locales et estimations de coûts.

L'agent doit faire correspondre chaque carte à une preuve dans le dépôt.
Les fonctions non confirmées ne doivent pas apparaître comme acquises :
elles peuvent être affichées dans la feuille de route avec un statut
explicite, ou omises de la section principale.

### 3.9 Chronologie des versions V5.1 à V5.11

Créer une vraie section « Évolution du projet » ou « De la fondation à
l'expérience unifiée ». Elle doit être très lisible et visuellement
marquante : timeline verticale sur mobile, timeline horizontale ou liste
éditoriale sur desktop si elle reste compréhensible.

Chaque version doit afficher : - numéro de version ; - titre court ; -
résumé d'une ou deux phrases ; - statut vérifié ; - éventuellement un
lien `Voir les détails` ouvrant un panneau ou une fiche.

Ne pas montrer onze gros blocs denses d'un seul coup. Utiliser une
timeline compacte avec des détails dépliables, ou des filtres par
thèmes. Garder tous les résumés accessibles sans dépendre de
l'animation.

**Résumés de référence :**

  -------------------------------------------------------------------------
  Version                 Titre court             Résumé à adapter au
                                                  statut réel
  ----------------------- ----------------------- -------------------------
  **V5.1**                Fondation et connexion  Fondation de l'extension
                          IA                      V5, configuration de clé
                                                  Gemini, test de connexion
                                                  et premières protections
                                                  d'usage.

  **V5.2**                Correction en une       Détection et proposition
                          requête                 de correction dans une
                                                  seule requête, avec
                                                  aperçu et application
                                                  explicite lorsque le
                                                  texte peut être modifié
                                                  en toute sécurité.

  **V5.3**                Accès rapide dans le    Déclenchement par
                          navigateur              raccourci clavier, menu
                                                  contextuel et action
                                                  contextuelle, réunis
                                                  autour d'un aperçu
                                                  commun.

  **V5.4**                Reformulation par style Propositions de
                                                  reformulation dans
                                                  différents tons, avec
                                                  choix d'un ou plusieurs
                                                  styles et aperçu des
                                                  résultats.

  **V5.5**                Traduction et variantes Traduction et
                          linguistiques           reformulation traduite,
                                                  avec langues cibles et
                                                  variantes régionales
                                                  prévues, dont l'arabe
                                                  syrien.

  **V5.6**                Raccourcis de texte     Expansion locale de
                          personnels              raccourcis personnalisés,
                                                  gestion des entrées et
                                                  sauvegarde/restauration
                                                  JSON, avec protection
                                                  ciblée des raccourcis
                                                  pendant les opérations
                                                  d'IA.

  **V5.7**                Plusieurs fournisseurs  Configuration de profils
                          IA                      de clés et routage des
                                                  opérations entre Gemini
                                                  et OpenAI, si
                                                  l'intégration est
                                                  vérifiée.

  **V5.8**                Limites et alertes      Limites de requêtes
                          d'usage                 quotidiennes,
                                                  hebdomadaires et
                                                  mensuelles, par tâche et
                                                  globalement, avec
                                                  avertissements à
                                                  différents seuils.

  **V5.9**                Statistiques et coûts   Historique local des
                          estimés                 opérations et tableaux de
                                                  bord par période, tâche
                                                  et fournisseur, avec
                                                  estimation des coûts
                                                  lorsque les données le
                                                  permettent.

  **V5.10**               Audit et stabilisation  Audit d'intégration,
                                                  sécurité, tests de
                                                  non-régression,
                                                  vérification des quotas,
                                                  des données et
                                                  préparation d'une version
                                                  personnelle.

  **V5.11**               Interface unifiée       Lanceur semi-circulaire
                                                  sur le bord droit et
                                                  modale centrée avec trois
                                                  onglets : Correction,
                                                  Reformulation et
                                                  Traduction.
  -------------------------------------------------------------------------

#### Règles d'affichage des statuts

Utiliser une légende simple et identique partout : - **Disponible ---
vérifié** : la fonctionnalité existe et a été vérifiée dans le code ou
par un test reproductible. - **Partiel** : une partie seulement est
implémentée ou vérifiée. - **En développement** : des changements actifs
sont visibles, sans prétendre à une disponibilité stable. - **Prévu** :
décrit dans la feuille de route mais non vérifié dans le produit. - **À
vérifier** : preuves insuffisantes.

Le statut doit venir de l'audit du dépôt. Il ne doit pas être fixé
arbitrairement dans le HTML. Si possible, centraliser les versions et
leur statut dans un seul fichier de données local pour éviter des
incohérences entre les cartes, les filtres et les détails.

Les versions V5.10 (audit) et V5.11 (interface) sont des jalons
différents : ne pas présenter V5.10 comme une nouvelle fonctionnalité
utilisateur comparable aux autres, ni prétendre qu'un audit est passé
sans preuve.

### 3.10 Section cas d'usage

Proposer quelques scénarios concrets, sans prétendre que tous ont été
testés sur tous les sites :

-   rendre un message professionnel ;
-   corriger un e-mail avant de l'envoyer ;
-   raccourcir un paragraphe trop long ;
-   traduire une phrase ;
-   préparer un message en arabe syrien, si la capacité est vérifiée ;
-   insérer rapidement une signature ou une formule personnelle via un
    raccourci, si vérifié.

Chaque cas doit comprendre un problème, l'action choisie et le bénéfice.
Utiliser des exemples fictifs.

### 3.11 FAQ

Créer un accordéon accessible, avec au minimum les questions suivantes :

-   Qu'est-ce que Correctly ?
-   Est-ce compatible avec Chrome et Brave ?
-   Correctly fonctionne-t-il sans clé API ?
-   Quels fournisseurs sont pris en charge dans la version actuelle ?
-   Est-ce que Correctly modifie mon texte automatiquement ?
-   Mon texte est-il envoyé à un service externe ?
-   Les raccourcis de texte nécessitent-ils une requête d'IA ?
-   Comment les coûts d'API sont-ils calculés ?
-   Que faire si une zone de texte n'est pas compatible ?
-   Comment connaître les fonctionnalités disponibles dans chaque
    version ?

Les réponses doivent être générées à partir des capacités confirmées,
pas copiées d'une promesse générique.

### 3.12 Appel à l'action final

Le CTA final doit être visuellement fort mais honnête. Selon les liens
vérifiés dans le dépôt : - découvrir le dépôt Git ; - consulter le
README ; - obtenir les instructions d'installation ; - voir les versions
; - signaler un problème.

Vérifier le véritable dépôt distant (`git remote`) et les chemins des
documents avant de créer les liens. Ne pas inventer de lien vers le
Chrome Web Store si l'extension n'y est pas publiée. Ne pas présenter un
lien GitHub comme un bouton « Installer » si ce lien ne permet pas une
installation directe.

### 3.13 Footer

Inclure : - logo et description courte ; - navigation secondaire ; -
liens vérifiés vers le dépôt, la documentation et les problèmes ; -
sélecteur de langue ou rappel de la langue active ; - contrôle du thème
si utile ; - mention de version seulement si elle est confirmée ; - lien
vers la confidentialité si une vraie page est créée.

------------------------------------------------------------------------

## 4. Animations et interactions

L'objectif est d'avoir une expérience riche et fluide. **Ne pas
transformer le site en démonstration d'effets qui gêne la lecture.**
Chaque animation doit soutenir la compréhension, la hiérarchie ou le
plaisir d'utilisation.

### 4.1 Animations souhaitées

1.  **Entrée du hero :** apparition progressive du titre, du texte, des
    CTA et du visuel avec un décalage très court.
2.  **Arrière-plan :** halo ou gradient lent, très subtil, sans grande
    animation coûteuse.
3.  **Maquette du produit :** flottement de quelques pixels, apparition
    séquencée des panneaux et mise en évidence discrète du résultat.
4.  **Défilement :** révélation légère des sections au premier passage
    dans le viewport.
5.  **Cartes :** élévation minime, bordure plus visible et ombre douce
    au survol.
6.  **Timeline :** ligne de progression discrète et apparition des
    points au défilement.
7.  **Comparaison avant/après :** surlignage ou transition de la zone
    modifiée dans un exemple prédéfini.
8.  **Onglets de démonstration :** transition de couleur et déplacement
    du curseur actif.
9.  **Boutons :** réponse visuelle au clic, au focus et à l'état
    désactivé.
10. **Navigation :** fond et bordure qui apparaissent au défilement.
11. **Graphiques ou schémas :** dessin SVG progressif uniquement si cela
    aide à comprendre le fonctionnement.
12. **Transitions de thème :** changement doux des couleurs sans flash
    blanc/noir.
13. **Transitions FR/EN :** changement propre du contenu sans mélanger
    les langues pendant le rendu.
14. **FAQ :** ouverture/fermeture fluide avec hauteur animée si elle
    reste accessible.

### 4.2 Règles techniques des animations

-   Privilégier `transform` et `opacity` ; éviter d'animer en permanence
    des propriétés qui déclenchent des recalculs de mise en page.
-   Ne pas lancer des animations infinies sur chaque carte.
-   Ne pas créer d'effet de curseur personnalisé intrusif.
-   Les effets de perspective/tilt doivent être très limités, désactivés
    sur tactile et ne jamais déplacer les éléments de façon gênante.
-   Ne pas bloquer le scroll avec des effets de type scroll-jacking.
-   Ne pas imposer de précharge longue ni d'écran d'attente décoratif.
-   Utiliser `IntersectionObserver` pour les animations d'apparition,
    avec un fallback qui laisse tout le contenu visible.
-   Ne pas multiplier les écouteurs de scroll ; utiliser une logique
    centralisée et passive si nécessaire.
-   Tester sur un ordinateur moyen et un téléphone d'entrée de gamme.

### 4.3 Respect de la réduction des animations

Implémenter `prefers-reduced-motion: reduce` : - supprimer les
mouvements décoratifs et les animations continues ; - remplacer les
révélations par une apparition immédiate ou une transition très courte
; - ne jamais cacher du contenu en attendant une animation ; - garder
toutes les fonctionnalités utilisables sans mouvement.

Le site doit rester beau si toutes les animations sont désactivées.

### 4.4 Interactions réelles à implémenter

-   sélecteur de langue FR/EN ;
-   sélecteur de thème clair/sombre, idéalement avec choix système si
    cela reste simple ;
-   navigation mobile ;
-   liens d'ancrage avec défilement doux, sauf si l'utilisateur préfère
    la réduction de mouvement ;
-   onglets de démonstration ;
-   FAQ ;
-   cartes de versions dépliables ou filtrables ;
-   bouton de copie pour les exemples, avec confirmation visuelle et
    fallback ;
-   boutons qui pointent vers de vraies destinations ;
-   fermeture de menus et panneaux avec `Escape` lorsque pertinent.

Aucun élément ne doit être visuellement cliquable sans action réelle.

------------------------------------------------------------------------

## 5. Langues : français et anglais

### 5.1 Exigence

Le site doit être entièrement bilingue. Il ne suffit pas de traduire le
titre et les boutons : **tous les textes visibles** doivent exister dans
les deux langues, y compris : - navigation ; - titres et paragraphes ; -
cartes et badges ; - démonstration ; - étapes ; - FAQ ; - versions et
statuts ; - messages de copie ; - texte alternatif des images ; -
descriptions SEO ; - footer ; - messages d'erreur et états vides.

### 5.2 Implémentation recommandée

-   Centraliser les chaînes dans deux dictionnaires (`fr` et `en`) ou
    fichiers JSON locaux.
-   Éviter de dupliquer toute la structure HTML uniquement pour changer
    de langue.
-   Ajouter des attributs `data-i18n` et un petit moteur de traduction
    natif, ou utiliser une structure équivalente facile à maintenir.
-   Ajouter `lang="fr"` ou `lang="en"` sur l'élément racine et mettre à
    jour cet attribut lors du changement.
-   Persister le choix de langue localement si souhaité.
-   Au premier chargement, utiliser une préférence explicite déjà
    enregistrée ; sinon détecter la langue du navigateur et retomber sur
    le français si elle n'est pas prise en charge.
-   Le sélecteur doit afficher clairement `FR` et `EN`.
-   Éviter les drapeaux comme seul indicateur de langue.
-   Ne jamais afficher une page mixant du français et de l'anglais à
    cause d'une chaîne oubliée.

### 5.3 Qualité des traductions

-   Traduire le sens, pas chaque mot littéralement.
-   Conserver les termes de produit identiques lorsque nécessaire.
-   Vérifier les textes longs, les retours à la ligne et les boutons
    dans les deux langues.
-   L'anglais doit être naturel et professionnel.
-   Vérifier les libellés de la timeline pour qu'ils restent courts dans
    les deux langues.

------------------------------------------------------------------------

## 6. Mode clair et mode sombre

-   Fournir un bouton accessible avec nom explicite et état actuel.
-   Prévoir au minimum clair et sombre ; proposer `system` en option si
    cela ne complexifie pas l'expérience.
-   Respecter `prefers-color-scheme` lors de la première visite si aucun
    choix n'est enregistré.
-   Persister le choix avec `localStorage` après consentement implicite
    à une préférence strictement locale ; aucune donnée ne doit être
    envoyée.
-   Éviter tout flash du mauvais thème au chargement : appliquer la
    préférence très tôt.
-   Tester les deux thèmes sur tous les composants, y compris les menus,
    badges, FAQ, panneaux de démo, SVG, focus et textes secondaires.
-   Ne pas inverser aveuglément toutes les couleurs : chaque thème doit
    être dessiné et vérifié.
-   S'assurer que les captures et visuels de la démo ne deviennent pas
    illisibles dans l'un des modes.

------------------------------------------------------------------------

## 7. Images, illustrations et vidéo

### 7.1 Priorité des assets

1.  Inspecter les assets du dépôt : logo, icônes, captures, GIF, vidéos,
    maquettes.
2.  Réutiliser les vrais assets quand ils sont actuels et cohérents avec
    le produit.
3.  Capturer de nouvelles captures uniquement si l'extension peut être
    exécutée et si le résultat est authentique.
4.  Créer des illustrations locales en SVG/CSS pour les schémas et la
    maquette.
5.  Utiliser une image externe uniquement si elle est nécessaire,
    autorisée et optimisée.

### 7.2 Vidéo de démonstration

Si un environnement réel de l'extension est disponible, produire une
courte démo de 8 à 15 secondes montrant un parcours synthétique : -
ouverture du lanceur ; - ouverture de la modale ; - passage entre les
onglets ; - génération simulée ou réelle seulement si elle est
explicitement identifiée et sans exposer de clé ; - examen d'un résultat
; - action d'application/copie si disponible.

La vidéo doit être : - muette par défaut ; - `playsinline` ; - optimisée
pour le web ; - accompagnée d'une image poster ; - sans texte personnel
ni secret ; - accompagnée d'un contrôle pause/reprise si elle démarre
automatiquement.

Si aucune capture authentique n'est possible, **ne pas fabriquer une
vidéo prétendant montrer l'extension réelle**. Utiliser une maquette
CSS/SVG interactive ou une courte animation de démonstration clairement
présentée comme illustration.

### 7.3 Optimisation média

-   préférer SVG pour les icônes et schémas ;
-   compresser les images raster ;
-   définir les dimensions pour éviter le décalage de mise en page ;
-   charger les images sous la ligne de flottaison en différé ;
-   fournir des textes alternatifs utiles ;
-   ne pas utiliser de grandes images de stock sans rapport avec le
    produit ;
-   ne pas utiliser d'images avec filigrane ;
-   ne pas ajouter de vidéo lourde si elle n'apporte rien à la
    compréhension.

------------------------------------------------------------------------

## 8. Graphiques et données

Un graphique n'est utile que s'il transmet une information vraie.

Exemples appropriés : - schéma de flux entre navigateur, extension et
fournisseur IA ; - diagramme expliquant les étapes d'une opération ; -
comparaison visuelle avant/après sur un exemple synthétique ; -
représentation de la chronologie des versions.

Ne pas inventer un graphique de « précision », de « temps gagné », de «
nombre d'utilisateurs », de « coûts économisés » ou d'utilisation réelle
sans données fiables. Si le tableau de bord de l'extension existe, ne
pas afficher sur le site des données personnelles ou de fausses données
issues de ce tableau de bord.

Les graphiques illustratifs doivent être identifiés comme tels. Préférer
SVG ou HTML/CSS aux bibliothèques lourdes pour trois barres ou un simple
schéma.

------------------------------------------------------------------------

## 9. Stack et organisation technique

### 9.1 Stack obligatoire

-   HTML5 sémantique.
-   Tailwind CSS pour la mise en page et les styles utilitaires.
-   JavaScript natif, sans framework UI.
-   SVG inline ou fichiers SVG locaux pour les icônes et schémas.
-   Pas de React, Vue, Next.js ou framework similaire.
-   Pas de backend requis pour le site vitrine.
-   Pas d'appel à Gemini/OpenAI depuis le site vitrine.
-   Pas de collecte de texte visiteur ni de clé API.

### 9.2 Tailwind en production

-   Utiliser Tailwind avec un processus de build local et une feuille
    CSS compilée pour la production.
-   Ne pas dépendre du CDN Tailwind pour la version publiée.
-   Isoler les dépendances et scripts du site dans le dossier choisi
    après audit afin de ne pas casser le build de l'extension.
-   Verrouiller les versions dans un lockfile si npm est utilisé.
-   Générer une version statique facile à héberger.
-   Documenter les commandes de développement et de build dans le README
    du site.

### 9.3 Structure de fichiers indicative

Adapter les chemins au dépôt réel ; ce schéma est une proposition et non
une affirmation sur les fichiers existants.

``` text
website/
├── index.html
├── assets/
│   ├── images/
│   ├── video/
│   ├── icons/
│   └── logo/
├── src/
│   ├── css/
│   │   └── input.css
│   ├── js/
│   │   ├── main.js
│   │   ├── i18n.js
│   │   ├── theme.js
│   │   ├── demo.js
│   │   ├── versions.js
│   │   └── motion.js
│   └── data/
│       ├── fr.json
│       ├── en.json
│       └── versions.json
├── dist/
├── package.json
├── package-lock.json
└── README.md
```

Ne pas créer artificiellement tous ces fichiers s'ils compliquent
inutilement un site simple. L'objectif est la lisibilité, pas une
architecture excessive. Si le projet utilise déjà une structure
compatible, la réutiliser sans mélanger les livrables de l'extension et
du site.

### 9.4 Qualité du code

-   JavaScript modulaire, lisible et sans variables globales inutiles.
-   Aucune erreur console dans le parcours principal.
-   Pas d'écouteurs dupliqués lors des changements de langue ou de
    thème.
-   Pas d'injection HTML à partir du contenu utilisateur.
-   Pas de secrets ni de clés dans le code du site.
-   Pas de scripts tiers inutiles.
-   Gestion correcte des éléments absents et des erreurs de clipboard.
-   Éviter les dépendances si quelques lignes de JavaScript suffisent.

------------------------------------------------------------------------

## 10. SEO, partage et métadonnées

Implémenter au minimum : - titre de page précis ; - meta description
française et anglaise ; - balise `lang` correcte ; - URL canonique
uniquement si un domaine réel est connu ; - Open Graph et cartes de
partage avec image locale optimisée ; - favicon et icônes cohérentes ; -
titres `h1`, `h2`, `h3` hiérarchisés ; - liens internes descriptifs ; -
texte utile qui explique réellement le produit.

Ne pas inventer de domaine. Ne pas inclure des données structurées
`SoftwareApplication` avec prix, notation ou avis sans source
vérifiable. Si les pages sont générées statiquement, prévoir une
stratégie de métadonnées cohérente pour chaque langue.

------------------------------------------------------------------------

## 11. Accessibilité

L'accessibilité fait partie de la finition premium.

-   HTML sémantique et landmarks (`header`, `nav`, `main`, `section`,
    `footer`).
-   Un seul `h1` principal.
-   Navigation complète au clavier.
-   Focus visible et contrasté.
-   Boutons avec noms accessibles ; les icônes seules ont un nom
    accessible.
-   `aria-expanded`, `aria-controls` et rôles appropriés pour menus,
    onglets et FAQ.
-   Gestion du focus dans les panneaux si nécessaire.
-   Pas de contenu essentiel accessible uniquement au survol.
-   Contrastes conformes aux bonnes pratiques WCAG.
-   Textes alternatifs utiles pour les images informatives ; attribut
    vide pour les images purement décoratives.
-   Support du zoom 200 % et des petits écrans.
-   Respect de `prefers-reduced-motion`.
-   États d'interaction compréhensibles sans couleur seule.
-   Vérifier le clavier, les lecteurs d'écran courants si disponibles et
    l'outil d'audit automatisé.

------------------------------------------------------------------------

## 12. Responsive design

Le site doit être excellent sur : - grand écran desktop ; - ordinateur
portable ; - tablette ; - smartphone étroit.

Exigences : - pas de scroll horizontal non intentionnel ; - le hero ne
doit pas devenir une pile illisible de blocs ; - la maquette produit
doit se redimensionner ou passer sous le texte ; - la timeline devient
verticale sur mobile ; - les cartes utilisent une grille responsive ; -
les boutons restent faciles à toucher ; - le menu mobile reste
accessible ; - les textes ne sont pas coupés ; - la démo fonctionne au
tactile et au clavier ; - les vidéos ne débordent pas ; - les éléments
décoratifs ne masquent pas les CTA.

Ne pas simplement réduire le desktop : concevoir la composition mobile.

------------------------------------------------------------------------

## 13. Performance et robustesse

Objectifs de qualité : - contenu principal visible rapidement ; - CSS de
production compilé et minifié ; - JavaScript différé ou chargé en module
; - médias optimisés ; - animations fluides ; - pas de grandes
bibliothèques pour des effets simples ; - pas de dépendance obligatoire
à un service externe pour afficher la page ; - aucun flash de thème si
possible ; - erreurs JavaScript corrigées ; - aucun lien cassé ; -
aucune ressource locale manquante.

Vérifier si possible avec Lighthouse ou un outil équivalent : -
performance ; - accessibilité ; - bonnes pratiques ; - SEO.

Ne pas fabriquer un score de performance dans le site. Les scores sont
des résultats de tests, pas des éléments marketing.

------------------------------------------------------------------------

## 14. Sécurité et confidentialité du site vitrine

Le site vitrine ne doit pas hériter de secrets ou de données privées de
l'extension.

-   Aucun appel aux fournisseurs d'IA.
-   Aucune clé API dans le HTML, le CSS, le JS ou les fichiers publics.
-   Aucun envoi de texte saisi à un serveur.
-   Pas d'analytics ni de cookies publicitaires par défaut.
-   Ne pas intégrer une vidéo distante ou un widget tiers sans
    nécessité.
-   Si un lien externe s'ouvre dans un nouvel onglet, appliquer les
    protections appropriées.
-   Échapper et traiter comme texte tout contenu dynamique.
-   Ne pas présenter les protections de l'extension comme absolues.
-   Séparer les éventuels exemples de démonstration des données réelles.
-   Ne pas inclure de captures affichant des clés, identifiants,
    e-mails, URL privées ou données personnelles.

------------------------------------------------------------------------

## 15. Contenu de marque à préparer

Créer un contenu français et anglais cohérent pour les éléments suivants
:

-   slogan principal ;
-   description courte du produit ;
-   titre et sous-titre du hero ;
-   labels des trois fonctions principales ;
-   textes des étapes d'utilisation ;
-   bénéfices et limites ;
-   bloc confidentialité ;
-   résumés de chaque version ;
-   statuts de versions ;
-   FAQ ;
-   CTA et footer ;
-   métadonnées SEO ;
-   textes alternatifs ;
-   libellés d'accessibilité ;
-   messages de copie et états d'erreur.

Le contenu doit être stocké dans un système de traduction maintenable.
Éviter de disperser des phrases dans plusieurs fichiers JavaScript.

### Proposition de description courte

**FR :**\
« Correctly est un assistant d'écriture pour Chrome et Brave qui réunit
des outils de correction, de reformulation et de traduction, avec une
approche centrée sur le contrôle de l'utilisateur. »

**EN :**\
"Correctly is a writing assistant for Chrome and Brave that brings
together correction, rewriting and translation tools, with user control
at its core."

Adapter la description si l'audit révèle que certaines opérations ne
sont pas encore disponibles dans la version réelle.

------------------------------------------------------------------------

## 16. Plan d'exécution obligatoire

L'agent doit travailler par étapes et fournir une vérification à chaque
étape.

### Phase 1 --- Audit du dépôt

-   relever l'arborescence et le système de build ;
-   identifier le logo, les captures et les assets existants ;
-   vérifier la version actuelle et le dépôt Git distant ;
-   inventorier les fonctionnalités réellement disponibles ;
-   noter les liens et instructions d'installation valides ;
-   repérer les fichiers à protéger.

**Livrable :** rapport d'audit court et tableau de fonctionnalités
vérifiées.

### Phase 2 --- Fondations visuelles

-   créer le dossier du site sans casser l'extension ;
-   mettre en place Tailwind et la compilation ;
-   définir couleurs, typographie, espacements, rayons, ombres et
    breakpoints ;
-   créer boutons, cartes, badges, navigation et footer ;
-   valider les modes clair et sombre.

**Livrable :** système de design et structure responsive fonctionnelle.

### Phase 3 --- Hero et maquette produit

-   construire le hero ;
-   créer la maquette du lanceur et de la modale ;
-   mettre en place le premier groupe d'animations ;
-   vérifier que la composition reste forte en mobile ;
-   marquer clairement toute maquette non authentique.

**Livrable :** premier écran premium, lisible et interactif.

### Phase 4 --- Contenu principal

-   ajouter les trois fonctions ;
-   ajouter le flux de travail ;
-   ajouter confidentialité et fonctionnement ;
-   ajouter les cas d'usage ;
-   ajouter la FAQ ;
-   ajouter le CTA final.

**Livrable :** contenu complet sans liens factices.

### Phase 5 --- Démo interactive

-   implémenter les onglets ;
-   intégrer des exemples prédéfinis ;
-   afficher la note expliquant le fonctionnement de la démo ;
-   gérer copie et retours visuels ;
-   confirmer qu'aucun appel réseau d'IA n'existe.

**Livrable :** démo utilisable et locale.

### Phase 6 --- Timeline V5.1--V5.11

-   ajouter les onze versions ;
-   centraliser leurs résumés et statuts ;
-   relier les statuts à l'audit du dépôt ;
-   rendre les détails accessibles au clavier ;
-   tester l'affichage en français et en anglais.

**Livrable :** chronologie claire et honnête.

### Phase 7 --- Langues, thèmes et motion

-   compléter toutes les chaînes FR/EN ;
-   implémenter le sélecteur de thème ;
-   tester la persistance des préférences ;
-   ajouter les animations utiles ;
-   implémenter la réduction des animations ;
-   vérifier qu'aucune section ne reste invisible si JavaScript échoue.

**Livrable :** expérience cohérente et accessible.

### Phase 8 --- Médias, SEO et finition

-   ajouter les captures réelles si disponibles ;
-   produire une vidéo courte seulement si une capture authentique est
    possible ;
-   optimiser les images ;
-   ajouter les métadonnées, favicon et image de partage ;
-   vérifier les textes alternatifs et les liens.

**Livrable :** site prêt à être présenté et partagé.

### Phase 9 --- QA et livraison

-   tester desktop, tablette et mobile ;
-   tester FR/EN sur toute la page ;
-   tester clair/sombre ;
-   tester clavier et réduction des animations ;
-   vérifier la console et les ressources réseau ;
-   tester tous les CTA et liens ;
-   lancer build, lint et audit disponibles ;
-   corriger les problèmes avant livraison ;
-   documenter comment lancer, construire et déployer le site.

**Livrable :** site compilé, vérifié et documentation d'utilisation.

------------------------------------------------------------------------

## 17. Critères d'acceptation

Le site n'est pas terminé tant que les points suivants ne sont pas
vérifiés.

### Design

-   [ ] Le premier écran montre immédiatement le produit et son intérêt.
-   [ ] Le site ne ressemble pas à un template générique.
-   [ ] La maquette principale correspond à l'interface approuvée :
    demi-cercle sur le bord droit et modale centrée à trois onglets.
-   [ ] Les composants ont des états cohérents.
-   [ ] Les animations servent le contenu.
-   [ ] Les deux thèmes sont réellement travaillés.

### Fonctionnalité

-   [ ] FR/EN fonctionne sur toutes les sections.
-   [ ] Aucun texte visible ne reste accidentellement dans l'autre
    langue.
-   [ ] Le thème fonctionne et persiste.
-   [ ] Le menu mobile fonctionne au clavier et au tactile.
-   [ ] La démo fonctionne sans réseau d'IA.
-   [ ] Les versions peuvent être explorées sans interaction
    inaccessible.
-   [ ] Tous les boutons et liens ont une vraie action.
-   [ ] Les erreurs de copie sont gérées.

### Exactitude produit

-   [ ] Chaque fonctionnalité présentée comme disponible a été vérifiée.
-   [ ] Les versions sont décrites fidèlement.
-   [ ] Les fonctions non vérifiées ont un statut explicite.
-   [ ] Aucun chiffre, avis, prix ou certification n'a été inventé.
-   [ ] Les liens Git et d'installation sont réels.
-   [ ] Le site ne prétend pas que l'extension est publiée dans un store
    si ce n'est pas le cas.

### Accessibilité

-   [ ] Navigation clavier complète.
-   [ ] Focus visible.
-   [ ] Contrastes suffisants.
-   [ ] Réduction des animations respectée.
-   [ ] Contenu lisible à 200 % de zoom.
-   [ ] Aucun contenu essentiel ne dépend du survol.

### Technique

-   [ ] Le build du site ne casse pas le build de l'extension.
-   [ ] Tailwind est compilé pour la production, sans CDN obligatoire.
-   [ ] Aucune erreur console importante.
-   [ ] Aucun asset cassé.
-   [ ] Aucun appel à une API d'IA depuis le site.
-   [ ] Aucun secret dans les assets publics.
-   [ ] Aucun scroll horizontal involontaire sur mobile.
-   [ ] Les commandes de build et de lancement sont documentées.

------------------------------------------------------------------------

## 18. Rapport final obligatoire de l'agent

À la fin, l'agent doit fournir :

1.  Résumé de ce qui a été construit.
2.  Arborescence réelle des fichiers créés ou modifiés.
3.  Commandes exactes pour lancer et construire le site.
4.  Résultats réels des tests exécutés.
5.  Fonctionnalités produit confirmées et sources de vérification.
6.  Fonctionnalités encore à vérifier ou à présenter comme prévues.
7.  Liens testés et liens manquants.
8.  État de l'accessibilité, du responsive, de FR/EN et des thèmes.
9.  Limites restantes.
10. Procédure de déploiement adaptée à l'hébergement réellement
    disponible.

**Interdiction de déclarer un test réussi sans l'avoir exécuté.** Si un
test ne peut pas être exécuté, marquer `BLOQUÉ` ou `NON EXÉCUTÉ` et
expliquer pourquoi.

------------------------------------------------------------------------

## 19. Instruction finale à copier dans l'agent

> Construis le site vitrine premium de Correctly en suivant
> intégralement ce document. Commence par auditer le dépôt réel et les
> fonctionnalités réellement implémentées ; les documents V5.1 à V5.11
> sont une feuille de route/specification, pas une preuve de livraison.
> Préserve l'extension existante et isole le site dans un dossier
> adapté. Utilise HTML sémantique, Tailwind CSS compilé pour la
> production et JavaScript natif, sans framework UI ni backend. Crée une
> expérience premium, responsive, bilingue FR/EN, avec thème
> clair/sombre, animations fluides, réduction de mouvement, une maquette
> fidèle au lanceur semi-circulaire et à la modale à trois onglets, une
> démo locale sans appel d'IA, une section fonctionnalités,
> confidentialité, FAQ et une chronologie V5.1--V5.11. Vérifie chaque
> affirmation produit avant de l'afficher comme disponible. Ne fabrique
> ni chiffres, ni avis, ni captures présentées comme réelles, ni liens
> d'installation. Ne prétends pas qu'une fonctionnalité ou un test est
> terminé sans preuve. Termine par un rapport d'implémentation avec les
> fichiers, les commandes, les tests réellement exécutés et les limites
> restantes.

------------------------------------------------------------------------

**Fin du cahier des charges.**
