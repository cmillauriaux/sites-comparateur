# 🗺️ Feuille de Route : Outils Interactifs & Agrégation OpenData (`jardinguide.fr`)

Ce document sert de checklist et de cahier des charges fonctionnel pour le déploiement progressif des fonctionnalités "Helpful Content" et E-E-A-T sur le site JardinGuide.

---

## 🛠️ Partie 1 : Les Outils & Calculateurs Interactifs

Ces outils doivent être développés sous forme de composants Astro réutilisables (`packages/site-template/src/components/tools/`) en Vanilla JS/TS léger et intégrés à double niveau (page dédiée + imbrication d'articles).

### [ ] Outil 1 : Le Simulateur de Récupération d'Eau de Pluie (Pilote)
*   **Objectif :** Estimer la capacité de cuve idéale d'un foyer.
*   **Paramètres utilisateur :** Département (select), Surface au sol du toit (m²), Type de toiture (Tuile, Ardoise, Végétalisé).
*   **Données requises :** Table de pluviométrie moyenne (mm/an) des 96 départements métropolitains.
*   **Formule :** `Volume = Pluviométrie (mm) * Surface (m²) * Rendement Toiture (Tuile: 0.8, Ardoise: 0.9, Végétalisé: 0.3)`.
*   **Sortie :** Recommandation de volume de cuve (ex. < 500L, 1000L, 2000L, 5000L+) avec CTA d'affiliation filtrés de manière contextuelle.
*   **Guides d'intégration cibles :** 
    *   *Nouveau guide à créer :* `comment-choisir-un-recuperateur-eau-de-pluie.mdx` (Page d'accueil de l'outil).
    *   *Guide existant :* `comment-choisir-un-souffleur-de-feuilles.mdx` (maillage si opportun) ou guides d'arrosage.

### [ ] Outil 2 : Le Planificateur de Couches de Buttes & Carrés Potagers (Lasagnes)
*   **Objectif :** Calculer le volume de chaque matière organique pour réussir sa culture en lasagne.
*   **Paramètres utilisateur :** Longueur du bac (cm), Largeur du bac (cm), Hauteur du bac (cm).
*   **Formule :** 
    *   `Volume Total (L) = (L * l * h) / 1000`.
    *   *Couche 1 (Fond - Bois mort/bûches) :* 30% du volume.
    *   *Couche 2 (Brindilles/broyat carboné) :* 20% du volume.
    *   *Couche 3 (Déchets azotés/tontes/feuilles) :* 20% du volume.
    *   *Couche 4 (Compost mûr) :* 15% du volume.
    *   *Couche 5 (Sommet - Terreau de plantation) :* 15% du volume.
*   **Sortie :** Liste de courses détaillée avec le nombre précis de sacs de terreau (convertis en litres standards, ex: sacs de 50L) et compost à acheter ou récupérer.
*   **Guides d'intégration cibles :** Guides d'achat de terreaux, composteurs, carrés potagers.

### [ ] Outil 3 : Le Calculateur d'Irrigation et Puissance de Pompe de Puits (Calcul HMT)
*   **Objectif :** Simplifier le calcul complexe de la Hauteur Manométrique Totale (HMT) pour l'achat d'une pompe à eau de jardin.
*   **Paramètres utilisateur :** Profondeur d'aspiration (m), Longueur du tuyau (m), Dénivelé vertical (m), Nombre d'arroseurs à alimenter (calcul du débit requis).
*   **Formule :** 
    *   `Pertes de charges = Longueur totale tuyau * 0.1` (approximation standard de 10%).
    *   `HMT (m) = Profondeur + Dénivelé + Pertes de charge + (Pression d'utilisation souhaitée aux arroseurs en bars * 10)`.
*   **Sortie :** HMT exacte, Débit nécessaire en m³/h, puissance recommandée en Watts et suggestions de pompes adaptées.
*   **Guides d'intégration cibles :** Guides d'achat pompes de surface, pompes immergées, tuyaux d'arrosage.

### [ ] Outil 4 : Le Simulateur de Rentabilité Financière du Potager
*   **Objectif :** Calculer les économies d'achat de fruits et légumes réalisées grâce à un potager maison.
*   **Paramètres utilisateur :** Sélection du nombre de pieds pour les légumes populaires (Tomate, Tomate cerise, Courgette, Poivron, Aubergine, Salade).
*   **Données requises :** Rendement moyen par pied en France (Tomate: 4.5kg, Courgette: 5kg, Salade: 1 unité) et prix moyen constatés en supermarché Bio.
*   **Sortie :** Bilan financier : Coût estimé des fournitures (graines, eau, terreau) vs Valeur marchande des récoltes. Calcul de l'économie annuelle et du retour sur investissement (ROI).
*   **Guides d'intégration cibles :** Graines de légumes, serres de jardin, tables de culture.

---

## 📈 Partie 2 : Le Journalisme de Données & E-E-A-T (OpenData)

Rédiger des articles d'autorité, riches en graphiques ou tableaux de données interactifs, basés sur des bases de données de l'État Français ou vos propres données exclusives.

### [ ] Étude 1 : Le Baromètre National de la Réparabilité de l'Outillage de Jardin
*   **Objectif E-E-A-T :** Devenir la référence absolue sur la durabilité des marques de tondeuses et nettoyeurs haute pression en France.
*   **Sources de données :** Base de données publique de l'**ADEME** et du **Ministère de la Transition Écologique** (disponible sur data.gouv.fr) sur l'Indice de Réparabilité.
*   **Métriques clés à extraire :**
    *   Facilité de démontage (accès aux fixations).
    *   Disponibilité des pièces détachées (durée de disponibilité assurée par le fabricant).
    *   Rapport de prix des pièces détachées par rapport au prix de l'outil neuf.
*   **Livrable :** Un tableau de comparaison interactif classant les constructeurs (Stihl, Husqvarna, Ryobi, Bosch, Makita, Kärcher, Lavor) selon leur réparabilité réelle.

### [ ] Étude 2 : Cartographie Nationale des Gelées & Calendrier Horticole Départemental
*   **Objectif E-E-A-T :** Offrir une précision agronomique introuvable sur les sites d'affiliation classiques.
*   **Sources de données :** Données climatiques historiques de **Météo-France** (sur les 30 dernières années) sur les températures minimales.
*   **Métriques clés à extraire :** Date médiane historique du dernier gel de printemps par département français (Saints de Glace réels).
*   **Livrable :** Un sélecteur de département qui génère instantanément la date de sécurité hors-gel et adapte les dates idéales de semis et de plantation en pleine terre pour 20 variétés de plantes.

### [ ] Étude 3 : L'Observatoire de la Saisonnalité des Prix du Jardin (Données Propriétaires)
*   **Objectif E-E-A-T :** Exploiter vos propres données de scraping historiques pour offrir un conseil d'achat unique en son genre.
*   **Sources de données :** Vos fichiers locaux de cache de produits et de prix (`data/amazon-gallery-cache/`, etc.).
*   **Livrable :** Une étude statistique révélant les mois où les outils de jardinage (tondeuses, scarificateurs, taille-haies, nettoyeurs haute pression) subissent les plus fortes décotes et promotions.

---

## 🏗️ Calendrier et Plan de Déploiement Technique

1.  **Phase I : Socle Technique & Outil Pilote**
    *   [ ] Définir la structure `/outils/` dans `packages/site-template/` et configurer le routage dynamique.
    *   [ ] Développer le composant `CalculateurEauPluie.astro` avec style harmonisé et scripts de calcul côté client.
    *   [ ] Créer l'article-guide dédié sur `jardinguide.fr` et y inclure l'outil en interactif.
2.  **Phase II : Expansion des outils interactifs**
    *   [ ] Déployer l'outil Potager en Lasagnes.
    *   [ ] Déployer le calculateur de pompe et HMT.
3.  **Phase III : Études de Données (OpenData)**
    *   [ ] Extraire les fichiers OpenData de l'indice de réparabilité de l'ADEME, les compiler en JSON propre, et générer l'article de baromètre interactif national.
