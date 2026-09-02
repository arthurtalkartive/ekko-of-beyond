# Player Ekko — brique 1 : la constellation

Première pierre du player audio : le rendu de la constellation centrale, en SVG,
indépendant de Stellarium. C'est la brique dont dépendent toutes les suivantes
(moteur de cues, info-bulles, transition), donc elle est livrée seule et testable
seule.

## Contenu

| Fichier | Rôle |
|---|---|
| `tools/build-sky-data.mjs` | Génère le jeu de données astronomique. À relancer après toute modification du skyculture. |
| `data/ekko-sky.json` | **Déjà généré.** 52 figures, 507 étoiles. 93 Ko brut, 20 Ko gzip. |
| `js/sky-projection.js` | Projection, magnitudes, couleurs. Aucun DOM. C'est ce module qui partira tel quel vers React Native. |
| `js/constellation-view.js` | Rendu SVG, focus, info-bulle. La seule couche à réécrire pour Expo. |
| `constellation-lab.html` | Banc d'essai. Sert à figer les réglages avant de câbler le player. |

## Démarrer

```bash
npx serve .          # puis ouvrir /constellation-lab.html
```

En `file://` le navigateur bloque le `fetch` du JSON : le banc d'essai affiche
alors un sélecteur de fichier, choisis `data/ekko-sky.json` à la main.

## Régénérer les données

```bash
node tools/build-sky-data.mjs \
  --skyculture skyculture/ekko/index.json \
  --hyg vendor/hygdata_v41.csv \
  --out data/ekko-sky.json
```

Le script échoue bruyamment (code de sortie 1) si un HIP référencé par une figure
est introuvable dans le catalogue. Sur le skyculture actuel : zéro manquant.

`CON ekko LMC` est ignorée, elle n'a pas de tracé — uniquement une illustration.
Elle ne pourra donc pas être jouée dans le player en l'état.

## API

```js
import { ConstellationView } from './js/constellation-view.js';

const view = new ConstellationView(document.querySelector('#sky'), {
  dataUrl: 'data/ekko-sky.json',   // ou data: <objet déjà chargé>
});
await view.ready;

view.setFigure('Ori', { roll: -12 });  // roll = orientation reprise de la carte
view.focus(27989);                     // ou focus([27989, 26311, 25930])
view.clearFocus();

view.getStarPoint(27989);  // { x, y, r } en px conteneur → ancrage de l'info-bulle
view.listStars();          // étoiles de la figure, triées par magnitude
view.setOptions({ dim: 0.15 });
view.destroy();
```

Le `viewBox` du SVG est calé 1:1 sur les pixels CSS du conteneur. `getStarPoint`
renvoie donc directement des coordonnées utilisables pour positionner un élément
HTML par-dessus, sans conversion de repère.

Le composant se redimensionne seul (`ResizeObserver`) et ne reçoit aucun
événement pointeur : la vue est figée par construction.

## Réglages

Les opacités, durées et grossissements passent par variables CSS et ne
déclenchent aucun recalcul de géométrie. Les valeurs par défaut sont un point de
départ, pas une proposition finale — le banc d'essai est là pour les arrêter.

| Option | Défaut | Effet |
|---|---|---|
| `dim` | `0.2` | Opacité des étoiles éteintes pendant un focus |
| `dimLines` | `0.45` | Opacité des tracés éteints. Se **multiplie** à `lineOpacity`, d'où un palier distinct : sans lui la figure disparaît complètement. |
| `focusScale` | `1.35` | Grossissement de l'étoile visée |
| `glowScale` | `4.2` | Rayon du halo, en multiples du rayon de l'étoile |
| `transitionMs` | `480` | Durée des transitions |
| `star.rMin/rMax/gamma` | `1.1 / 6 / 2.2` | Courbe magnitude → rayon. Le gamma est ce qui fait ressortir Rigel et Bételgeuse plutôt que d'écraser tout le monde. |
| `color.saturation` | `0.35` | Mélange entre teinte parchemin uniforme (0) et vraie palette stellaire B-V (1) |
| `projection` | `stereographic` | `gnomonic` disponible, mais elle explose au-delà de ~60° de rayon (Hydre, Éridan) |
| `mirror` | `true` | Vue depuis l'intérieur de la sphère céleste. À `false` Orion apparaît inversée. |

## Deux points en attente

**Le roulis.** `setFigure(iau, { roll })` attend l'orientation en degrés. C'est
l'entrée qui doit recevoir le roulis déjà calculé sur la carte (inversion
d'homographie des ancres). Tant que ce câblage n'est pas fait, la figure est
affichée à l'endroit canonique, ce qui est correct mais casse la continuité
visuelle du fondu.

**La licence du catalogue.** J'ai utilisé la base HYG v4.1, qui est en
**CC BY-SA 4.0**. Le partage à l'identique est contaminant : `ekko-sky.json` en
est un dérivé. Pour un produit propriétaire, mieux vaut repartir du catalogue
Hipparcos brut de l'ESA (VizieR I/239), utilisable avec simple attribution.
Le script prend déjà le CSV en argument, il n'y a que le mappage de colonnes à
adapter (`ra` en heures, `dec` en degrés, `mag`, `ci`). Dis-moi si je le bascule.

## Suite

1. Moteur de cues (état dérivé de `currentTime`, résistant au seek) + chime programmatique
2. Chrome du player : header à défonce adaptative, barre de progression et ses glyphes, contrôles
3. Info-bulle branchée sur `getStarPoint`, avec bascule automatique aux bords
4. Transition V1 depuis la carte
5. Outil d'annotation du Studio
