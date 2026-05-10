# Besoin fonctionnel — Sites guides d'achat affiliation

## 1. Objectif

Construire et exploiter un réseau de sites SEO de guides d'achat, automatisés de bout en bout, qui génèrent du revenu via l'affiliation (Amazon Associates et Awin). Chaque site couvre une niche produit sur un marché donné, propose à ses lecteurs des comparatifs et des tests de produits factuellement sourcés, et redirige les intentions d'achat vers les marchands partenaires.

## 2. Périmètre

### Quatre niches
- Jardin & Bricolage
- Sport & Fitness
- Cuisine & Électroménager cuisine
- Maison & Électroménager

### Trois marchés par niche
- France (fr-FR)
- États-Unis (en-US)
- Royaume-Uni (en-GB)

Chaque couple (niche, marché) est un site distinct : domaine propre, identifiant d'affiliation propre, sources éditoriales locales, ton rédactionnel local, propriété Search Console dédiée. À terme, jusqu'à douze sites en exploitation. Aujourd'hui seul le site Jardin & Bricolage France est en production ; les versions US et GB de cette même niche sont préparées mais en attente de domaines, d'identifiants d'affiliation et de localisation finale du contenu chrome (en-têtes, pieds de page, mentions légales).

## 3. Promesse de valeur au lecteur

Le visiteur cherche à acheter un produit (ex. « meilleur robot tondeuse »). Il doit trouver sur le site :
- soit un **avis détaillé** d'un produit unique avec note finale sur 10 et notes intermédiaires par critère,
- soit un **comparatif** de plusieurs produits avec critères de choix expliqués en amont, présentation par produit, et tableau récapitulatif.

L'article doit lui permettre de décider sans avoir à consulter d'autres sources, et lui proposer plusieurs liens d'achat clairement identifiés comme affiliés.

## 4. Pipeline éditorial automatisé

Le cycle de production tourne quotidiennement, sans intervention humaine, pour chaque site actif.

### Étape 1 — Détection d'opportunités SEO
Pour chaque site, le système interroge un fournisseur de données SEO (DataForSEO) à partir de mots-clés de départ propres à la niche et au marché. Il en extrait les requêtes pertinentes en filtrant sur le volume de recherche, la difficulté concurrentielle et le coût par clic, puis les classe par opportunité décroissante. Les nouvelles opportunités sont ajoutées à une file d'attente partagée, datée, qualifiée par intention de recherche (avis, comparatif, guide).

### Étape 2 — Rédaction d'un article ancré dans des sources
À chaque exécution, le système prend l'opportunité prioritaire encore non traitée pour le site concerné, scrape un nombre minimum de sources de référence préalablement whitelistées pour cette niche et ce marché (presse spécialisée, sites de tests indépendants, distributeurs, marques), agrège les faits extraits (prix, caractéristiques, classements, points forts, points faibles), et génère l'article correspondant en respectant la ligne éditoriale du marché.

**Règles non négociables de rédaction :**
- Aucune information n'est inventée : tout fait publié doit être traçable à une URL listée dans les sources de l'article.
- Au moins deux sources distinctes par article ; à défaut, l'article est abandonné, le mot-clé reste à traiter.
- Les contradictions entre sources sont citées explicitement plutôt que masquées.
- Les prix sont systématiquement datés et accompagnés d'un avertissement sur leur volatilité.
- Toutes les notes (intermédiaires et finale) doivent être adossées à un constat sourcé ; la note finale est une moyenne pondérée documentée.

### Étape 3 — Insertion des liens d'affiliation
Une fois l'article rédigé, le système recherche les produits cités sur la marketplace Amazon du marché concerné (amazon.fr / amazon.com / amazon.co.uk), récupère leurs identifiants produit, leur image et leur prix, et insère les liens affiliés signés avec l'identifiant Amazon Associates du marché. Selon la niche, des programmes Awin complémentaires peuvent être utilisés (Leroy Merlin, Décathlon, Boulanger, etc.). Chaque article doit comporter au minimum trois appels à l'action affiliés bien placés (après l'introduction, dans la fiche produit / verdict, dans la conclusion).

### Étape 4 — Publication
L'article est publié sur le site correspondant, avec son URL canonique, ses images optimisées, ses balises SEO, ses mentions de transparence affiliation, et un bloc de sources visibles pour le lecteur (signal E-E-A-T). Le site est rebuilé et déployé automatiquement.

### Étape 5 — Demande d'indexation
Les nouvelles URLs publiées sont soumises à l'API d'indexation de Google Search Console pour accélérer leur prise en compte, dans la limite du quota quotidien et avec une trace d'historique pour ne pas re-soumettre.

### Étape 6 — Rafraîchissement périodique
Hebdomadairement, si la file d'opportunités d'un site est vide, le système la réalimente. À défaut, il identifie les articles publiés les plus anciens, re-scrape leurs sources, et les met à jour si les informations ont évolué (nouveau prix, nouveau classement, nouveau modèle de référence, etc.).

## 5. Différenciation par marché

Le contenu n'est jamais une traduction mécanique. Chaque marché a :
- sa **liste de sources** (Que Choisir / Les Numériques en France ; Wirecutter / Consumer Reports aux US ; Which? / Trusted Reviews au UK) ;
- son **ton de référence** (Les Numériques en français ; Wirecutter en anglais américain ; Which? / TechRadar en anglais britannique) ;
- son **orthographe** (US vs UK : color/colour, tire/tyre, trash/rubbish, etc.) ;
- ses **distributeurs** dans le tableau comparatif (Leroy Merlin / Castorama vs Home Depot / Lowe's vs B&Q / Screwfix) ;
- sa **marketplace Amazon** et son **identifiant d'affiliation** ;
- ses **mentions légales et obligations de transparence** propres à la juridiction (RGPD / CNIL en France, FTC aux US, ICO + ASA au UK) ;
- éventuellement ses **slugs d'URL localisés** (/comparatifs/ vs /comparison/ vs /comparison/).

## 6. Lignes éditoriales — deux types d'article

### Type Avis (test d'un produit)
Introduction → fiche technique → analyse par critère, chacune notée sur 10 → verdict avec note finale calculée comme moyenne pondérée des notes par critère → liste « pour / contre » → conclusion. Critères standards : performance, ergonomie, rapport qualité-prix, plus un ou deux critères propres à la niche (autonomie, bruit, etc.).

### Type Comparatif (plusieurs produits)
Ouverture par les **critères de choix** avant tout produit, puis présentation succincte (3 à 6 lignes) de chaque produit avec un appel à l'action affilié, puis tableau récapitulatif où les produits sont mis en regard sur les mêmes critères, avec un lien d'achat dans la dernière colonne. Le classement suit une logique nommée (« Notre choix », « Meilleur rapport qualité-prix », « Le moins cher », etc.).

## 7. Conformité et éthique

- Mention de transparence affiliation présente sur chaque article (« ce site contient des liens d'affiliation… ») et adaptée au cadre légal du marché.
- Page mentions légales / éditeur / hébergeur sur chaque site, dans la langue et la juridiction du marché.
- Page politique de confidentialité avec gestion cookies si tracking analytique.
- Aucun copier-coller des sources : le scraping sert à extraire des faits, jamais à reproduire du texte.
- Slugs d'URL stables après publication : une URL publiée et soumise à GSC ne doit jamais être renommée.

## 8. Vie d'une opportunité — synthèse

Une opportunité de mot-clé naît dans la file d'attente, est qualifiée par son intention, attend son tour dans la file de priorité, devient « en cours de rédaction », puis « publiée » avec son URL associée, puis « soumise à indexation », puis entre dans le cycle de mise à jour périodique. À tout moment l'état de la file est la source de vérité commune entre les différents jobs et entre les différents sites — elle est partagée, persistée et versionnée pour que toute exécution future reparte d'un état cohérent.

## 9. Critères de succès

- Production quotidienne d'articles factuellement corrects et originaux pour chaque site actif, sans intervention humaine.
- Indexation effective dans Google des nouvelles URLs sous quelques jours.
- Génération de revenus d'affiliation traçables par site et par marché, via les identifiants Amazon et Awin propres à chaque marché.
- Capacité à activer un nouveau couple (niche, marché) sans modification de code structurel : il suffit d'ajouter la fiche du nouveau site au registre central, ses sources, son domaine, son identifiant d'affiliation, et la matrice du pipeline le prend en charge automatiquement.
