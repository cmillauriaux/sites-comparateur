# GEMINI.md - Directives de Développement & Stratégie de Pivot

Ce document définit la vision à long terme, la stratégie éditoriale de nouvelle génération et les standards techniques associés pour surmonter les pénalités algorithmiques de Google (Helpful Content System, E-E-A-T, March 2024 / 2025 Core Updates) en introduisant des **Outils Interactifs** et du **Journalisme de Données (OpenData)**.

---

## 🧭 1. Vision Stratégique (Le Pivot "Helpful Content")

Pour contrecarrer la perception du site par Google comme une "ferme d'affiliation d'IA" (thin affiliate content), la stratégie passe d'un modèle purement transactionnel à un modèle d'**utilité utilisateur maximale**.

### Principes Fondamentaux :
1.  **Zéro "synthèse de synthèse" :** Ne pas se contenter de réécrire des contenus génériques déjà présents sur le web.
2.  **Double Intégration des Outils :** Chaque outil interactif (calculateur, simulateur) doit vivre à la fois en tant que **page d'atterrissage autonome** (Landing Page SEO sous `/outils/[slug]/`) et en tant que **composant imbriqué dans les guides d'achat** pertinents.
3.  **Ancrage Open Data Réel :** Tirer parti des jeux de données publics officiels de l'État Français (ADEME, Météo-France) pour générer des classements et analyses exclusifs d'autorité, procurant des signaux E-E-A-T majeurs.
4.  **Zéro Framework Lourd :** Les outils interactifs sont codés en **Vanilla JavaScript / TypeScript léger** au sein des composants Astro pour préserver des scores de performance parfaits (PageSpeed 100/100).

---

## 🛠️ 2. Catalogue des Outils & Calculateurs (À implémenter)

### 📌 Pilote : Le Simulateur de Récupération d'Eau de Pluie (`/outils/recuperateur-eau-pluie/`)
*   **Objectif :** Estimer la capacité idéale d'un récupérateur d'eau en fonction du lieu d'habitation et de la toiture.
*   **Logique :** 
    *   *Saisies :* Département français, Surface au sol du toit (m²), Type de toiture (Tuiles: coeff 0.8, Ardoises: coeff 0.9, Ondulé: coeff 0.8, Toit plat végétalisé: coeff 0.3).
    *   *Données :* Fichier JSON contenant la pluviométrie moyenne annuelle (mm) par département en France (source : Météo-France).
    *   *Formule :* `Volume Récupérable (L/an) = Pluviométrie (mm) * Surface (m²) * Coeff de perte`.
    *   *Recommandation :* Suggerer le volume de cuve idéal (ex. < 500L, 1000L, 2000L, > 5000L) et intégrer les CTAs affiliés correspondants de manière contextuelle.
*   **Intégration guides :** Imbriquer dans `comment-choisir-un-souffleur-de-feuilles.mdx` (si pertinent) ou créer le guide d'achat dédié `comment-choisir-un-recuperateur-eau-de-pluie.mdx` pour y placer le composant.

### 📌 Outil 2 : Le Planificateur de Couches Potager en Lasagnes
*   **Objectif :** Calculer le volume et l'agencement exact des couches de matières organiques pour un carré potager surélevé ou une butte auto-fertile.
*   **Logique :** 
    *   *Saisies :* Longueur (cm), Largeur (cm), Hauteur du bac (cm).
    *   *Calcul :* Calculer le volume total en Litres (`L = (L * l * h) / 1000`).
    *   *Distribution des couches :* 
        *   Couche 1 (Fond - Bois mort/bûches) : 30% de la hauteur.
        *   Couche 2 (Brindilles/broyat) : 20% de la hauteur.
        *   Couche 3 (Déchets azotés/feuilles/tontes) : 20% de la hauteur.
        *   Couche 4 (Compost/fumier) : 15% de la hauteur.
        *   Couche 5 (Sommet - Terreau plantation) : 15% de la hauteur.
    *   *Sortie :* Nombre exact de litres de terreau, de compost, et quantité de broyat/bois à récupérer.
*   **Intégration guides :** À lier ou imbriquer sur tous les futurs articles et guides liés aux carrés potagers, terreaux et composteurs.

### 📌 Outil 3 : Le Calculateur d'Irrigation et Puissance de Pompe de Puits
*   **Objectif :** Résoudre le calcul physique complexe de la Hauteur Manométrique Totale (HMT) pour aider au choix d'une pompe d'arrosage.
*   **Logique :** 
    *   *Saisies :* Profondeur d'aspiration (m), Longueur du tuyau de refoulement (m), Dénivelé du refoulement (m), Débit souhaité (arroseurs à alimenter, ex: 3 arroseurs de 600 L/h = 1.8 m³/h).
    *   *Calculs :* Pression de fonctionnement requise aux arroseurs (généralement 2 à 3 bars) + pertes de charge (estimées à 10% de la longueur totale de tuyau) + dénivelé vertical total.
    *   *Sortie :* HMT requise (en mètres de colonne d'eau), Débit requis (m³/h), Pression idéale au départ (bars) et recommandations de pompes (immergée vs surface).

### 📌 Outil 4 : Le Simulateur de Rentabilité du Potager
*   **Objectif :** Prouver par les chiffres l'intérêt économique de faire son propre potager.
*   **Logique :** 
    *   *Saisies :* Nombre de pieds par légumes phares (tomates, tomates cerises, courgettes, salades, haricots verts).
    *   *Calcul :* Rendement moyen estimatif en kg (ex: Pied de tomate = 4kg, Courgette = 5kg) multiplié par le prix moyen au kg en magasin bio français. Moins le coût d'achat des plants, du terreau et de l'arrosage estimé.
    *   *Sortie :* Économie annuelle brute et nette générée.

---

## 📈 3. Journalisme de Données & E-E-A-T (OpenData)

Pour se positionner comme un site de référence incontournable, rédiger des analyses basées sur le croisement de données publiques françaises réelles.

### 📝 Étude 1 : Le Baromètre National de la Réparabilité de l'Outillage de Jardin
*   **Principe :** Analyser l'indice de réparabilité obligatoire en France pour évaluer objectivement les marques d'outillage de jardinage (tondeuses, nettoyeurs haute pression, etc.).
*   **Source Open Data :** Base de données publique de l'**ADEME** et du **Ministère de la Transition Écologique** (data.gouv.fr).
*   **Données à croiser :** Prix des pièces détachées par rapport au neuf, délais de livraison des pièces, facilité de démontage (scores sur 10 détaillés par la loi française).
*   **Objectif SEO :** Devenir la source citée par les blogs et forums lorsque les utilisateurs cherchent "quelle marque de tondeuse est la plus fiable ?".

### 📝 Étude 2 : Cartographie Nationale des Gelées et Calendrier de Semis Réel
*   **Principe :** Fournir des dates de semis réalistes basées sur la climatologie locale de chaque département.
*   **Source Open Data :** Statistiques de températures minimales et moyennes de **Météo-France** (sur les 30 dernières années) pour identifier les dates médianes hors-gel au printemps.
*   **Objectif SEO :** Se positionner sur les recherches ultra-locales "quand planter les tomates dans le [département]".

### 📝 Étude 3 : L'Observatoire de l'Inflation du Matériel de Bricolage
*   **Principe :** Utiliser les caches d'historique de prix accumulés par le site (Amazon, Leroy Merlin) pour publier une étude annuelle sur la saisonnalité des prix (quand les prix baissent-ils réellement ?).

---

## 💻 4. Architecture d'Implémentation Technique (Astro)

### 1. Composants d'Outils (`packages/site-template/src/components/tools/`)
*   Chaque outil est un composant Astro indépendant.
*   Il embarque son propre `<script>` Vanilla JS (ou TS) s'exécutant côté client via la directive `client:load` ou `client:visible`.
*   Les styles sont isolés et utilisent les variables CSS globales de la charte graphique de la niche (`var(--color-primary)`, `var(--color-hero-bg)`, etc.) pour conserver une harmonie parfaite quel que soit le site du réseau.

### 2. Pages Autonomes (`/outils/[slug]/`)
*   Déclarer une collection Astro `outils` (si nécessaire) ou créer un système de pages dynamiques sous `packages/site-template/src/pages/outils/`.
*   La route `packages/site-template/src/pages/outils/[slug].astro` gère l'affichage plein écran d'une calculette en l'enrobant d'un texte d'explication SEO, de FAQs structurelles et de maillage interne vers les guides d'achat complémentaires.

### 3. Intégration MDX
*   Pour intégrer un outil au sein d'un article, ajouter le composant dans le mapping global de `[slug].astro` :
    ```typescript
    import CalculateurEauPluie from '../../components/tools/CalculateurEauPluie.astro';
    const components = { ..., CalculateurEauPluie };
    ```
*   Puis l'appeler à la volée dans n'importe quel fichier `.mdx` :
    ```mdx
    <CalculateurEauPluie client:load />
    ```
