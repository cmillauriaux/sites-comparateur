# Brief Claude Code — Site VetoEtMonAnimal

**Domaine cible** : `toutveto.fr` (+ `toutveto.com` en redirect 301 défensif)
**Date du brief** : mai 2026
**Cycle de vie ciblé** : 8-14 mois pour 80 % du potentiel SEO atteint
**Langue** : français (FR-FR)
**Marché géo** : France métropolitaine + Belgique/Suisse FR (audience secondaire)

---

## 1. Objectif business

Comparateur éditorial + guide d'achat sur l'assurance santé animale et les tarifs vétérinaires. Monétisation 100 % affiliation (Niveau 1, 2 et 4) — pas de courtage direct, pas d'ORIAS. Cible : 12 000–20 000 €/mois bruts à 14 mois.

### Business model
- **55 % du CA** : Awin (SantéVet 6 €/lead intégré, Zooplus 3 % cross-sell) + Kwanko/NetAffiliation (Wanimo 10 % + 0,30 €/formulaire) + Affilae (La Ferme des Animaux 5-10 %, Homycat 7-11 %)
- **20 % du CA** : programmes propriétaires (Lassie direct sur `fr.lassie.co/programme-daffiliation`, SantéVet propriétaire en parallèle 6 €/lead + 45 €/vente web)
- **15 % du CA** : Amazon Partenaires France (cookie 24h, cross-sell alimentation/accessoires/jouets)
- **10 % du CA** : Tune via ComfortClick (Animigo jusqu'à 25 % — suppléments) + autres opportunités (Acheel, Goodflair, Kozoo selon disponibilité)

### Audience cible
- **Persona A — Nouveau propriétaire** : 25-40 ans, vient d'adopter un chiot/chaton, cherche à anticiper les frais vétérinaires (vaccins, stérilisation, alimentation).
- **Persona B — Propriétaire en arbitrage** : 35-55 ans, animal en santé moyenne, compare les assurances santé après un premier gros frais vétérinaire.
- **Persona C — Senior responsable** : 55+ ans, chien/chat vieillissant, recherche couverture maladie chronique et services funéraires animaux.

---

## 2. Architecture éditoriale (hub-and-spoke)

```
vetomonanimal.fr/
├── / (homepage = entrée comparateur + magazine)
├── /assurance/                       [HUB 1 — Comparateur assurances santé]
│   ├── /assurance/chien/
│   ├── /assurance/chat/
│   ├── /assurance/nac/
│   ├── /assurance/chien/comparatif/
│   ├── /assurance/chat/comparatif/
│   ├── /assurance/santevet-avis/
│   ├── /assurance/lassie-avis/
│   ├── /assurance/acheel-avis/
│   ├── /assurance/goodflair-avis/
│   ├── /assurance/dalma-avis/
│   ├── /assurance/kozoo-avis/
│   ├── /assurance/bulle-bleue-avis/
│   ├── /assurance/assur-opoil-avis/
│   ├── /assurance/fidanimo-avis/
│   ├── /assurance/animaux-sante-avis/
│   ├── /assurance/agria-avis/
│   ├── /assurance/jim-and-joe-avis/
│   └── /assurance/patolo-avis/
├── /tarifs-veto/                     [HUB 2 — Tarifs et prix vétérinaires]
│   ├── /tarifs-veto/consultation/
│   ├── /tarifs-veto/vaccin-chien/
│   ├── /tarifs-veto/vaccin-chat/
│   ├── /tarifs-veto/sterilisation-chat/
│   ├── /tarifs-veto/castration-chien/
│   ├── /tarifs-veto/detartrage/
│   ├── /tarifs-veto/euthanasie-chien/
│   ├── /tarifs-veto/euthanasie-chat/
│   ├── /tarifs-veto/puce-electronique/
│   ├── /tarifs-veto/operation/
│   └── /tarifs-veto/toilettage/
├── /sante-animale/                   [HUB 3 — Magazine santé animale]
│   ├── /sante-animale/maladies-chien/
│   ├── /sante-animale/maladies-chat/
│   ├── /sante-animale/parasites/
│   ├── /sante-animale/alimentation/
│   └── /sante-animale/prevention/
├── /accessoires/                     [HUB 4 — Cross-sell produits Amazon/Zooplus]
│   ├── /accessoires/chien/
│   ├── /accessoires/chat/
│   └── /accessoires/comparatifs-marques/
└── /blog/                            [Articles éditoriaux TOFU/MOFU]
    └── [50+ articles, voir section 6]
```

### Schéma de maillage
- Chaque fiche assureur link vers **Hub 1 (parent) + comparatif espèce concernée + 4 fiches assureurs frères + 2 articles blog**.
- Chaque page tarif link vers **Hub 2 (parent) + Hub 1 (intention assurance suite) + 3 autres tarifs + 2 articles blog**.
- Le Hub 1 (assurance) doit toujours être proposé en CTA dans le Hub 2 (tarifs) — c'est la logique business : "vous trouvez les frais élevés ? souscrivez une assurance".

---

## 3. Pillar pages (hubs) — détail

### Hub 1 — Comparateur assurances santé animale
- **URL** : `/assurance/`
- **H1** : "Assurance santé animale 2026 : comparatif des 15 meilleurs contrats"
- **Cibles primaires** : `assurance chien` (18 100, CPC 18,10 €), `mutuelle chien` (14 800, CPC 18,62 €), `assurance chien comparatif` (2 900, CPC 14,43 €), `mutuelle chien comparatif` (1 600, CPC 13,82 €), `assurance chien tarif` (1 600, CPC 10,47 €), `meilleure assurance chien` (1 900, CPC 13,11 €), `assurance santé chien` (1 300, CPC 14,16 €)
- **Cibles secondaires** : `eca assurance chien` (2 400, CPC 6,93 €), `eca assurance animaux` (1 900, CPC 5,84 €)
- **Sections obligatoires** :
  1. Tableau comparatif 12-15 assureurs (colonnes : note, prix à partir de, taux remboursement, plafond annuel, délai carence, franchise, CTA)
  2. Méthodologie comparative transparente (cf. section 12)
  3. Comment choisir une assurance santé (critères)
  4. Top 3 selon le profil (chiot, race à risque, sénior, budget)
  5. Comprendre franchise/plafond/délai de carence (lexique)
  6. FAQ 12+ questions
- **CTA d'affiliation** : SantéVet (6 €/lead Awin OU 6 €/lead + 45 €/vente web direct), Lassie direct, autres assureurs selon programmes ouverts.

### Hub 2 — Tarifs vétérinaires
- **URL** : `/tarifs-veto/`
- **H1** : "Tarifs vétérinaires 2026 : prix moyens par acte en France"
- **Cibles primaires** : `prix consultation vétérinaire` (2 900, CPC 5,04 €), `prix vaccin chat` (6 600, CPC 5,02 €), `prix vaccin chien` (2 400, CPC 8,77 €), `castrer chien prix` (2 900, CPC 5,12 €), `prix euthanasie chien` (2 400), `prix toilettage chien` (2 400), `détartrage chien prix` (1 900), `prix euthanasie chat` (1 600), `stérilisation chat mâle prix` (1 600, CPC 6,67 €), `prix puce chat` (1 900, CPC 6,75 €)
- **Sections obligatoires** :
  1. Carte de France des tarifs moyens (par région) — utilise les données SNVEL
  2. Liste exhaustive des actes avec fourchette prix (15+ actes)
  3. Pourquoi des écarts de prix ? (libre fixation, RAA)
  4. Comment réduire les frais vétérinaires (assurance, dispensaires, écoles vétérinaires)
  5. CTA assurance en bas de page
- **CTA d'affiliation** : redirection vers Hub 1, puis SantéVet/Lassie en direct.

### Hub 3 — Magazine santé animale (top of funnel)
- **URL** : `/sante-animale/`
- **H1** : "Santé animale : tout savoir pour mon chien, chat ou NAC"
- **Cibles primaires** : longue-traîne maladies, symptômes, prévention (volume cumulé estimé 100 000+ recherches/mois)
- **Sections obligatoires** :
  1. Encyclopédie maladies fréquentes (10-15 fiches)
  2. Calendrier vaccinal chien/chat
  3. Parasites et prévention
  4. Alimentation : croquettes vs ration ménagère vs BARF
  5. Prévention seniors
- **CTA d'affiliation** : indirect via maillage vers Hub 1 (assurance) et Hub 4 (accessoires Amazon/Zooplus).

### Hub 4 — Cross-sell accessoires
- **URL** : `/accessoires/`
- **H1** : "Accessoires chien et chat : nos guides d'achat 2026"
- **Cibles primaires** : `accessoires chien`, `accessoires chat`, `panier chien`, `arbre à chat`, `collier chien`, `harnais chien`, `gamelle chat`, `litière chat` (volumes longue-traîne)
- **CTA d'affiliation** : Amazon Partenaires (catalogue 15-25 k produits), Zooplus (jusqu'à 3 %), Wanimo (10 % + 0,30 €/formulaire), Homycat (chats premium), La Ferme des Animaux.

---

## 4. Top 30 keywords priorisés (à exécuter dans l'ordre)

| # | Keyword | Volume | CPC € | Hub | Priorité |
|---|---|---|---|---|---|
| 1 | assurance chien | 18 100 | 18,10 | Hub 1 | P0 |
| 2 | mutuelle chien | 14 800 | 18,62 | Hub 1 | P0 |
| 3 | prix vaccin chat | 6 600 | 5,02 | Hub 2 | P0 |
| 4 | prix consultation vétérinaire | 2 900 | 5,04 | Hub 2 | P0 |
| 5 | castrer chien prix | 2 900 | 5,12 | Hub 2 | P0 |
| 6 | assurance chien comparatif | 2 900 | 14,43 | Hub 1 | P0 |
| 7 | prix vaccin chien | 2 400 | 8,77 | Hub 2 | P0 |
| 8 | eca assurance chien | 2 400 | 6,93 | Hub 1 | P1 |
| 9 | prix euthanasie chien | 2 400 | 2,27 | Hub 2 | P1 |
| 10 | meilleure assurance chien | 1 900 | 13,11 | Hub 1 | P0 |
| 11 | eca assurance animaux | 1 900 | 5,84 | Hub 1 | P1 |
| 12 | détartrage chien prix | 1 900 | 2,68 | Hub 2 | P1 |
| 13 | prix puce chat | 1 900 | 6,75 | Hub 2 | P1 |
| 14 | prix euthanasie chat | 1 600 | 1,84 | Hub 2 | P1 |
| 15 | stérilisation chat mâle prix | 1 600 | 6,67 | Hub 2 | P1 |
| 16 | mutuelle chien comparatif | 1 600 | 13,82 | Hub 1 | P0 |
| 17 | assurance chien tarif | 1 600 | 10,47 | Hub 1 | P1 |
| 18 | assurance santé chien | 1 300 | 14,16 | Hub 1 | P1 |
| 19 | prix toilettage chien | 2 400 | 0,86 | Hub 2 | P1 |
| 20 | santevet avis | longue-traîne | — | Hub 1 | P0 |
| 21 | lassie avis | longue-traîne | — | Hub 1 | P0 |
| 22 | acheel assurance chien avis | longue-traîne | — | Hub 1 | P1 |
| 23 | goodflair avis | longue-traîne | — | Hub 1 | P1 |
| 24 | dalma assurance avis | longue-traîne | — | Hub 1 | P1 |
| 25 | kozoo assurance avis | longue-traîne | — | Hub 1 | P2 |
| 26 | bulle bleue avis | longue-traîne | — | Hub 1 | P2 |
| 27 | calendrier vaccinal chien | longue-traîne | — | Hub 3 | P1 |
| 28 | calendrier vaccinal chat | longue-traîne | — | Hub 3 | P1 |
| 29 | comment choisir mutuelle chien | longue-traîne | — | Hub 1 | P1 |
| 30 | assurance chat sans franchise | longue-traîne | — | Hub 1 | P1 |

**Priorisation** :
- **P0** : à publier dans les 30 premiers jours
- **P1** : à publier mois 2-5
- **P2** : à publier mois 6-9

**⚠️ Note SEO importante** : les keywords `assurance chien` (CPC 18,10 €) et `mutuelle chien` (CPC 18,62 €) sont **massivement compétitifs** (LeLynx, Hyperassur, Réassurez-moi, MutuelleAnimaux, Wamiz). Stratégie : **viser d'abord les variantes longue-traîne** (avis assureurs, comparatif par espèce, "assurance chien sans franchise", "assurance chien races à risque") où la concurrence est plus faible. Le ranking sur les keywords principaux viendra par autorité progressive (12-18 mois).

---

## 5. Pages satellite — templates structurels

### Template "Fiche assureur" (avis SantéVet, Lassie, etc.)

```markdown
# Avis {Marque} : notre test détaillé en {année}

## En bref
{Pour qui ? Note globale /10. Top 3 avantages, top 2 inconvénients. CTA "Obtenir un devis gratuit"}

## Présentation de {Marque}
{Historique, statut juridique — courtier MGA ou assureur agréé ACPR — ORIAS si applicable}

## Formules et tarifs
{Tableau des formules, tarifs pour 3 profils types : chien 1 an, chien 7 ans, chat d'intérieur}

## Garanties et plafonds
{Détail accident, maladie, prévention. Franchise. Plafond annuel.}

## Délai de carence
{Tableau accident/maladie/chirurgie}

## Services additionnels
{Téléconsultation, app, médaille, etc.}

## Avantages
{5-8 bullets pros}

## Inconvénients
{3-5 bullets cons}

## Avis clients
{Synthèse des avis Trustpilot, Google Reviews, Wamiz — ne pas inventer, citer notes et nombre d'avis}

## Notre verdict
{Conclusion claire : pour qui, pour quel budget}

## FAQ {Marque}
{6-8 questions}

## Comparaison avec les concurrents
{Mini-tableau vs 2-3 alternatives}
```

### Template "Page prix vétérinaire" (vaccin, castration, etc.)

```markdown
# Prix {acte} : combien ça coûte en {année} ?

## En bref
{Fourchette de prix nationale, ce qui est inclus, conseils pour optimiser}

## Prix moyen en France
{Tableau par région avec données SNVEL ou Goodflair Observatoire}

## Détail des frais
{Consultation, anesthésie, examens préopératoires, hospitalisation, médicaments)

## Variations selon...
{Race, âge, vétérinaire, urgence, région}

## Comment réduire ce coût
{Assurance, dispensaire SPA, école vétérinaire (ENVA Maisons-Alfort, VetAgro Sup, Oniris, ENVT)}

## L'assurance santé en couverture
{Tableau : quels assureurs couvrent cet acte et à quel taux. CTA Hub 1}

## FAQ
{5-7 questions ciblées}

## Pour aller plus loin
{Maillage interne vers actes complémentaires}
```

**Densité keyword** : keyword principal 6-10× dans le texte.
**Longueur** : 2 500-4 000 mots pour les P0 ; 1 500-2 500 pour P1/P2.
**Images** : 4-8 par page (photos de chiens/chats sourcées Pexels/Adobe Stock + schémas tarifaires).
**Schema.org** : `Article`, `FAQPage`, `Review` (pour fiches assureurs), `BreadcrumbList`, `LocalBusiness` non applicable.

---

## 6. Articles de blog à publier (TOFU/MOFU)

50 articles à écrire sur 14 mois.

### Cluster assurance — éducationnel (12 articles)
1. "Assurance santé chien : est-ce vraiment rentable ? Calcul réel en 2026"
2. "Délai de carence assurance animal : pourquoi c'est crucial"
3. "Franchise vs plafond annuel : comment vraiment comparer les contrats"
4. "Maladies héréditaires chien : quelles assurances couvrent en 2026"
5. "Assurance pour un vieux chien (+ 8 ans) : quelles options réelles ?"
6. "Assurer un chiot dès l'adoption : timing et bonnes pratiques"
7. "Race prédisposée (Bouledogue, Berger Allemand, Cavalier) : quelle assurance"
8. "Courtier gestionnaire (MGA) vs assureur agréé ACPR : la vraie différence"
9. "Téléconsultation vétérinaire : quelles assurances la proposent ?"
10. "Forfait prévention assurance animal : ce qui est vraiment inclus"
11. "Résilier son assurance santé animale : procédure 2026 (loi Hamon)"
12. "Assurance NAC (lapin, furet, perroquet) : où trouver une couverture"

### Cluster tarifs vétérinaires (15 articles)
13. "Pourquoi le prix des consultations vétérinaires augmente en 2026"
14. "Vaccins obligatoires chien : calendrier complet et prix"
15. "Vaccins obligatoires chat : calendrier et coût annuel"
16. "Prix d'une stérilisation femelle chienne : selon taille et région"
17. "Prix opération chirurgicale chien : 10 interventions courantes"
18. "Tarif d'une césarienne chienne : ce qu'il faut savoir"
19. "Coût torsion d'estomac chien : un cas d'urgence à 2000 €+"
20. "Frais de garde vétérinaire de nuit : qui appeler en urgence et combien"
21. "Vermifuge chien et chat : prix et fréquence"
22. "Antiparasitaires externes (puces, tiques) : comparatif prix 2026"
23. "Coût ostéopathie animale : tarifs moyens en France"
24. "Tarif radiographie / échographie / scanner vétérinaire"
25. "Honoraires vétérinaires à domicile : surcoût et conditions"
26. "Prix sterilisation chatte : pourquoi varie autant selon les régions"
27. "Coût d'une fin de vie animale : euthanasie, crémation, urne"

### Cluster santé animale (15 articles)
28. "Symptômes douleur chien : 10 signes qui doivent alerter"
29. "Mon chat boit beaucoup : 7 causes médicales possibles"
30. "Diabète chez le chien : symptômes, traitement, coût"
31. "Insuffisance rénale chronique chat : guide complet"
32. "Otite chien : symptômes, traitement, coût"
33. "Tumeur mammaire chienne : prévention et traitement"
34. "Dysplasie hanche chien : races à risque et coût opération"
35. "Cataracte chez le chien sénior : opération et alternatives"
36. "Allergies alimentaires chien : diagnostic et croquettes adaptées"
37. "Arthrose chien sénior : compléments et solutions"
38. "Mon chien mange de l'herbe : c'est grave ?"
39. "Stérilisation chat : âge idéal, avantages, inconvénients"
40. "Vaccin chien antirabique : obligatoire ou pas en 2026 ?"
41. "Tatouage ou puce électronique chien : que choisir ?"
42. "Pension chien : choisir, prix moyens, alternatives"

### Cluster accessoires & alimentation (8 articles)
43. "Meilleures croquettes chien 2026 : test de 12 marques"
44. "Croquettes chat : sans céréales, sans gluten, lecture des étiquettes"
45. "Top 7 distributeurs croquettes automatiques connectés"
46. "Arbre à chat : 5 modèles testés (Trixie, Ferplast, Vesper)"
47. "Litière chat agglomérante vs végétale vs cristaux : comparatif"
48. "Harnais chien anti-traction : top 6 modèles 2026"
49. "Caisse de transport chien : choisir selon la taille et l'usage"
50. "Compléments alimentaires chien : faits, mythes, et marques"

---

## 7. Sources grounded — UTILISER UNIQUEMENT CES SOURCES

**Principe** : aucune information chiffrée, aucun tarif, aucune mention de pathologie ne doit être inventée. Toute affirmation doit citer une source publique vérifiable. **Particulièrement crucial sur une thématique santé.**

### Sources institutionnelles et professionnelles (priorité 1)
- **Ordre National des Vétérinaires (ONV)** — veterinaire.fr (annuaire, déontologie, communiqués)
- **SNVEL (Syndicat National des Vétérinaires d'Exercice Libéral)** — snvel.fr (positions économiques, communiqués sur tarifs)
- **AFVAC (Association Française des Vétérinaires d'Animaux de Compagnie)** — afvac.com (recommandations cliniques)
- **AVEF (Association Vétérinaire Équine Française)** pour les NAC équidés — avef.fr
- **ANSES (Agence nationale de sécurité sanitaire)** — anses.fr (toxicovigilance, alimentation animale)
- **DGAL (Direction Générale de l'Alimentation)** — agriculture.gouv.fr (réglementation vaccinale, identification)
- **I-CAD (gestionnaire fichier national identification)** — i-cad.fr (puce/tatouage obligatoires)
- **Légifrance** — legifrance.gouv.fr (Code rural Art. L211-12 et suivants, loi du 6 janvier 1999, loi Hamon de 2014)

### Sources scientifiques et études vétérinaires (priorité 1)
- **Écoles Nationales Vétérinaires françaises** : ENVA Maisons-Alfort (vet-alfort.fr), VetAgro Sup (vetagro-sup.fr), Oniris Nantes (oniris-nantes.fr), ENVT Toulouse (envt.fr) — pour publications scientifiques, dispensaires, tarifs étudiants
- **Le Point Vétérinaire** — lepointveterinaire.fr (presse pro accessible aux abonnés)
- **Veterinary Practice News** — pour études internationales (en anglais, à traduire et adapter)
- **AVMA (American Veterinary Medical Association)** — avma.org (études internationales)

### Sources données marché (priorité 2)
- **FACCO (Fédération des Fabricants d'Aliments)** — facco.fr (statistiques possession animaux France, mise à jour annuelle)
- **Kantar — étude annuelle FACCO/Kantar** sur la possession d'animaux en France
- **France Assureurs** (ex-FFA) — franceassureurs.fr (données marché assurance affinitaire)
- **Goodflair Observatoire** — goodflair.com (publication d'observatoires sur les coûts vétérinaires, à citer comme source partielle vu qu'ils sont assureurs)
- **SantéVet — études internes** — santevet.com (études commandées : Bio'Sat 2022, SurveyMonkey 2022 sur 351 titulaires d'assurance santé animale)
- **ACPR** — acpr.banque-france.fr (régulation, ORIAS, conformité courtage)

### Sources média et grand public (priorité 3)
- **30 Millions d'Amis** — 30millionsdamis.fr (presse, témoignages, association)
- **SPA — Société Protectrice des Animaux** — la-spa.fr
- **WamizMag** — wamiz.com (presse grand public)
- **60 Millions de Consommateurs** — 60millions-mag.com (tests croquettes, comparatifs assurances)
- **Que Choisir** — quechoisir.org (UFC, tests et alertes secteur)

### Sources marques (priorité 3 — pour fiches assureurs uniquement)
- SantéVet (santevet.com), Lassie (fr.lassie.co), Acheel (acheel.com/animaux), Goodflair (goodflair.com), Dalma (dalma.co), Kozoo (kozoo.com), Bulle Bleue (bullebleue.fr), Fidanimo (fidanimo.com), Animaux Santé (animaux-sante.com), Agria (agria.fr), Assur O'Poil (assuropoil.fr), Jim & Joe (jimandjoe.fr), Patolo (patolo.fr)
- Pour chaque assureur : **toujours consulter les Conditions Générales** (CG) disponibles sur leur site avant de rédiger l'avis.

### ⚠️ Sources INTERDITES
- Sites de "conseil santé animale" sans signature vétérinaire identifiée
- Forums ou groupes Facebook comme source primaire (témoignages OK en illustration, jamais comme fait médical)
- Sites de pet-influenceurs sans certification
- Wikipédia comme source primaire (acceptable en référence secondaire uniquement)
- Contenu généré par IA sans validation humaine

### Format de citation obligatoire
Chaque fait sourcé doit apparaître avec un lien hypertexte dans le HTML final :
```html
<p>96 % des vétérinaires français recommandent SantéVet selon
<a href="https://www.santevet.com/programme-daffiliation-santevet"
 rel="nofollow noopener" target="_blank">une étude Bio'Sat de 2022
 sur 150 vétérinaires répondants</a>.</p>
```

### Vétérinaire signataire (E-E-A-T critique)
**Pour respecter les standards Google Helpful Content / YMYL santé**, tous les articles santé doivent être **revus par un vétérinaire identifié** (signature, photo, n° ordinal). Plusieurs options :
- Embaucher un·e vétérinaire en freelance à 80-150 €/article révisé
- Partenariat avec une école vétérinaire (étudiants stagiaires sous supervision)
- Mention obligatoire sur chaque article : "Article revu médicalement par Dr. X, vétérinaire diplômé(e) [école], n° ordinal [XXX]"

---

## 8. Programmes d'affiliation — intégration par hub

### Inscription préalable (ordre obligatoire)

1. **J+1** : Amazon Partenaires France (cross-sell — 15-25 k produits dispo). ⚠️ Mention obligatoire footer.
2. **J+2** : Affilae → La Ferme des Animaux (5-10 %), Homycat (7-11 %).
3. **J+3** : **SantéVet en direct** (santevet.com/programme-daffiliation-santevet) — modèle propriétaire 6 €/lead + 45 €/vente web.
4. **J+3** : **Lassie en direct** (fr.lassie.co/programme-daffiliation) — propriétaire.
5. **J+7** : Awin (5 € remboursés à la 1ère commission) → SantéVet (en complément si refus du propriétaire), Zooplus.
6. **J+10** : Kwanko (Skale) / NetAffiliation → Wanimo (10 % nouveaux clients + 0,30 €/formulaire).
7. **Mois 2** : Tune via ComfortClick → Animigo (jusqu'à 25 %).
8. **Mois 2-3** : surveillance trimestrielle Awin/Kwanko/Affilae pour Acheel, Goodflair, Kozoo (programmes intermittents).

### Mapping affiliation par hub

| Hub | Marchand prioritaire | Marchand secondaire | Commission attendue |
|---|---|---|---|
| Hub 1 — Assurance | **SantéVet** (Awin 6 €/lead OU direct 6 €/lead + 45 €/vente web) | **Lassie direct**, Wanimo (cross-sell devis), futurs deals | 6 € + 45 € (SantéVet propriétaire), variable Lassie |
| Hub 2 — Tarifs véto | redirection vers Hub 1 | Amazon (kits soin) | indirect |
| Hub 3 — Santé animale | redirection vers Hub 1 + Hub 4 | Animigo (suppléments, 25 % via Tune) | 25 % Animigo |
| Hub 4 — Accessoires | Amazon Partenaires | Zooplus (3 %), Wanimo (10 %), Homycat (11 % palier or) | 3-11 % |

### Règle "pas plus de 1 lien d'affiliation pour 200 mots"
Le ratio commercial/éditorial doit rester équilibré pour ne pas pénaliser le SEO. Sur chaque page d'assurance, **maximum 2 boxes CTA full-width** (top + bottom) et liens contextuels dans le texte.

### ⚠️ Règles légales spécifiques au secteur assurance
Même si le site **n'est pas immatriculé ORIAS** et fait uniquement de l'apport éditorial vers des comparateurs/assureurs ORIAS :
- **Ne pas faire de "conseil personnalisé"** type "Pour votre Berger Allemand, je vous recommande SantéVet" — c'est de l'intermédiation illégale. À la place : "Pour les races prédisposées comme le Berger Allemand, SantéVet figure parmi les assureurs qui couvrent les maladies héréditaires (cf. CG)."
- **Mentions transparentes obligatoires** sur chaque page assurance :
  - "Site éditorial indépendant. Non immatriculé ORIAS. Liens commerciaux signalés."
  - "Les informations présentées sont à titre informatif. Pour souscrire un contrat, consultez directement l'assureur."
- **Pas de promesse de prix garanti ni de comparaison "indépendante"** sans expliciter la méthodologie.
- Voir aussi : **DDA (directive distribution assurance)** transposée en droit FR le 1er octobre 2018 — concerne les intermédiaires, mais influence l'attente client en matière de transparence.

---

## 9. Stack technique recommandé

- **CMS** : WordPress + Astra Pro ou GeneratePress.
- **Hosting** : o2switch (7 €/mois) ou Hostinger Cloud Startup (10 €/mois).
- **Plugins** :
  - Rank Math Pro (SEO)
  - WP Rocket (cache)
  - Imagify ou Shortpixel (images WebP)
  - WP Tables Generator ou TablePress (tableaux comparatifs assureurs)
  - Lasso ou AAWP (gestion liens affiliés multi-réseaux)
  - Schema Pro (FAQPage, Review, Article)
  - Yoast Local SEO si pages géolocalisées par région (Hub 2 cartographie tarifs)
- **Analytics** : Plausible.io (RGPD-friendly) ou Matomo selfhost.
- **Tracking affiliation** : utiliser le système de chaque programme (SantéVet direct, Lassie direct, Awin, etc.) avec **sub-IDs par page** pour identifier le contenu performant.
- **Calculateur de devis fictif** : développer en vanilla JS, simule une comparaison entre 3-5 assureurs, redirige vers les liens affiliés selon le profil. **Ne pas créer un vrai comparateur ORIAS-régulé**.
- **Module review/notation** : système maison ou WP Product Review pour les fiches assureurs.

### Performance cibles
- LCP < 2,5 s mobile
- INP < 200 ms
- CLS < 0,1
- Score PageSpeed > 90 mobile

---

## 10. Roadmap éditoriale 14 mois

| Mois | Livrables | Volume cumulé |
|---|---|---|
| M1 | Setup tech + Hub 1 (Assurance) + 3 fiches assureurs P0 (SantéVet, Lassie, Acheel) + 4 articles blog | 9 pages |
| M2 | Hub 2 (Tarifs véto) + 5 satellites prix P0 + 4 articles blog | 19 pages |
| M3 | 4 fiches assureurs supplémentaires + 5 articles blog + lancement newsletter | 28 pages |
| M4 | Hub 3 (Santé animale) + 6 satellites + 5 articles | 40 pages |
| M5 | Hub 4 (Accessoires) + 4 satellites + 5 articles + 1ère vague backlinks | 50 pages |
| M6 | Complétion fiches assureurs (12 total) + 5 articles | 62 pages |
| M7-9 | 18 articles blog + refresh des hubs + déploiement calculateur JS | 80 pages |
| M10-12 | 12 articles + partenariats vétérinaires signataires + presse | 92 pages |
| M13-14 | Optimisation conversion + 8 articles + bilan | 100 pages |

### Production hebdomadaire cible
- 2 articles blog complets (1 500-2 500 mots)
- 1 fiche assureur ou page tarif détaillée (2 500-4 000 mots)
- 1 mise à jour mensuelle des tableaux comparatifs (tarifs assureurs évoluent)

---

## 11. KPIs à suivre

| KPI | Objectif M6 | Objectif M12 | Objectif M18 |
|---|---|---|---|
| Pages indexées | 60+ | 100+ | 130+ |
| Trafic SEO organique (sessions/mois) | 5 000 | 25 000 | 70 000 |
| Leads SantéVet/mois | 30 | 200 | 600 |
| Ventes Lassie/Acheel/mois | 5 | 40 | 120 |
| Revenue brute mensuelle (€) | 400 | 4 500 | 15 000 |
| Backlinks (référents) | 40 | 150 | 400 |
| Position moyenne top 20 keywords | < 30 | < 18 | < 12 |
| % articles révisés par vétérinaire | 100 % | 100 % | 100 % |

---

## 12. Méthodologie comparative — page dédiée obligatoire

Pour la crédibilité (E-E-A-T) **et la conformité**, créer une page `/methodologie-comparatif/` qui explique :

1. **Critères d'évaluation** : note attribuée à chaque assureur sur les axes (a) tarifs, (b) garanties, (c) plafond annuel, (d) franchise, (e) délai de carence, (f) services, (g) avis clients vérifiés Trustpilot/Google.
2. **Pondération** : préciser le poids de chaque critère dans la note finale.
3. **Sources de données** : Conditions Générales publiques 2026 + simulations sur 3 profils types (chien 1 an Labrador, chat 5 ans européen d'intérieur, chien 9 ans Cavalier).
4. **Indépendance** : préciser que les liens sont affiliés mais que la note n'est pas corrélée à la commission.
5. **Mise à jour** : date du dernier check de tarifs, fréquence des mises à jour (trimestriel minimum).
6. **Limites** : reconnaître ce qui n'est pas mesurable (vitesse de remboursement réelle, qualité du service client).

Cette page **ne génère pas de trafic SEO direct** mais est citée dans le footer de toutes les pages d'avis et de comparatif. Elle est la base juridique et déontologique du site.

---

## 13. Tone of voice & contraintes éditoriales

- **Ton** : expert empathique. Le lecteur est souvent inquiet pour son animal. Ne pas dramatiser, ne pas minimiser.
- **Personne** : "nous" (équipe rédactionnelle), "vous" (lecteur, propriétaire).
- **Chiffres** : toujours sourcés (SNVEL, FACCO/Kantar, écoles vétérinaires, observatoires assureurs).
- **Diagnostic** : **JAMAIS de diagnostic médical**. Toujours rediriger vers le vétérinaire. Formulation : "Ces symptômes nécessitent une consultation vétérinaire dans les 24-48h" et non "Votre chien souffre probablement de X."
- **Recommandations assurance** : **jamais nominatives**. Préférer "Pour les races à risque, plusieurs assureurs (SantéVet, Goodflair, Lassie) couvrent les maladies héréditaires" plutôt que "Souscrivez chez X".
- **Anglicismes** : limités. "Pet insurance" → "assurance santé animale". "Vet" → "vétérinaire" ou "véto" en titre court.
- **Photos** : éviter les visuels stéréotypés. Préférer des photos terrain (animaux français, vétérinaires en exercice). Pexels et Adobe Stock acceptables avec licence.
- **Conflits d'intérêts** : transparents en début d'article (encart "Cet article contient des liens d'affiliation").

---

## 14. Checklist Claude Code par article généré

Avant publication, vérifier :

- [ ] H1 contient le keyword principal exact
- [ ] Méta-title 50-60 caractères avec keyword
- [ ] Méta-description 140-160 caractères avec CTA
- [ ] URL en kebab-case
- [ ] 1 image hero avec alt descriptif
- [ ] H2/H3 structurés en pyramide logique
- [ ] **Au moins 3 sources externes liées** (priorité 1 obligatoire pour santé)
- [ ] **Si santé : signature et révision vétérinaire visible**
- [ ] Au moins 4 liens internes vers hubs/satellites
- [ ] Schema.org approprié (Article, FAQPage, Review, BreadcrumbList)
- [ ] Tableau comparatif avec ≥ 5 assureurs si page Hub 1
- [ ] CTA affiliation visible avant le 1er scroll mobile
- [ ] **Mention transparence affiliation** dans encart visible
- [ ] **Mention "site non immatriculé ORIAS"** sur pages assurance
- [ ] Pas de phrase de 40+ mots
- [ ] Date de publication ET date de mise à jour visibles
- [ ] Auteur ET réviseur vétérinaire identifiés (E-E-A-T)
- [ ] Pas de promesse de remboursement, de prix garanti, de comparaison "objective" sans méthodologie

---

## 15. Conseil final pour l'agent

Ce site **a un risque YMYL** (Your Money or Your Life) car il touche à la santé animale et aux finances familiales (assurance). Google applique des critères E-E-A-T particulièrement stricts sur ces thématiques.

**3 règles d'or non négociables** :

1. **Aucune affirmation médicale sans source vétérinaire signée**. Même les faits "évidents" doivent être référencés.
2. **Aucune comparaison d'assurance sans méthodologie publiée**. La page `/methodologie-comparatif/` doit exister avant la 1ère publication.
3. **Aucun lien affilié sans mention transparente**. La confiance > la conversion à court terme.

Pour chaque page, se poser : "Si un propriétaire vient de perdre son animal après avoir suivi un conseil de mon site, serais-je à l'aise d'expliquer pourquoi j'ai écrit ce que j'ai écrit ?"

La conversion business **suit la confiance**, jamais l'inverse.
