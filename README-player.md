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
| `constellation-lab.html` | Banc d'essai. Règle, valide et écrit dans le dépôt. |
| `js/view-settings.js` | Schéma des réglages. Source unique pour l'interface, la validation serveur et le player. |
| `data/player-view.json` | Les réglages validés. Écrit par l'interface, lu par le player. |
| `api/save-view.js` | Fonction serverless qui commite les réglages sur GitHub. |

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

## Les réglages et leur écriture

Deux niveaux, volontairement séparés.

**Communs aux 52 figures** — apparence des étoiles, des tracés et de la mise en
avant. Un seul jeu de valeurs pour tout le player : les modifier change
l'apparence de toutes les constellations d'un coup.

**Propres à une constellation** — `rotation` et `padding` seulement. Le cadrage
d'Orion n'a rien à voir avec celui de la Croix du Sud.

Les deux s'enregistrent séparément dans `data/player-view.json`, via deux
boutons distincts et deux commits distincts. La fonction serveur fait une
lecture-fusion-écriture : enregistrer une figure ne peut pas écraser les
communs, ni l'inverse.

Une figure jamais réglée retombe sur les valeurs communes puis sur les défauts
du schéma. Rien n'est jamais vide, et rien n'oblige à passer sur les 52 figures
avant de pouvoir tester.

### Ajouter un réglage

Uniquement dans `js/view-settings.js`, dans l'objet `PARAMS`. L'interface
construit ses curseurs à partir de là, la fonction serveur y prend ses bornes de
validation, et le player y lit la traduction vers les options du composant.
Aucun autre fichier à toucher.

### Configuration

Aucune. La fonction réutilise les quatre variables d'environnement de
`api/save.js` — `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BRANCH`,
`EKKO_ADMIN_KEY` — et le même en-tête `x-ekko-key`. La clé saisie dans le banc
d'essai est celle de `/verification`, partagée via le même `sessionStorage`.

À ajouter dans `vercel.json`, en tête du tableau `headers`, à côté de la règle
qui existe déjà pour `roll-adjust.json` :

```json
{
  "source": "/data/player-view.json",
  "headers": [{ "key": "Cache-Control", "value": "no-store, must-revalidate" }]
}
```

Sans ça, l'interface continue de lire l'ancienne version après le
redéploiement, et la confirmation de mise en ligne ne tombe jamais.

## Réglages disponibles

Les valeurs par défaut sont un point de départ, pas une proposition finale — le
banc d'essai est là pour les arrêter. Les opacités, durées et grossissements
passent par variables CSS et ne déclenchent aucun recalcul de géométrie.

### Propres à une constellation

| Réglage | Défaut | Effet |
|---|---|---|
| `rotation` | `0°` | Orientation de la figure. Curseur + saisie exacte au clavier. |
| `padding` | `64 px` | Marge intérieure. Le cadrage tient compte du rayon des disques, rien n'est jamais rogné. |

### Communs aux 52 figures

| Réglage | Défaut | Effet |
|---|---|---|
| `projection` | `stereographic` | `gnomonic` disponible, mais elle explose au-delà de ~60° de rayon (Hydre, Éridan) |
| `starRadiusMin` / `Max` | `1.1` / `6` | Bornes du rayon des étoiles, en px |
| `starGamma` | `2.2` | Contraste de la courbe magnitude → rayon. C'est ce qui fait ressortir Rigel et Bételgeuse plutôt que d'écraser tout le monde. |
| `colorSaturation` | `0.35` | Mélange entre teinte parchemin uniforme (0) et vraie palette stellaire B-V (1) |
| `glowScale` | `4.2×` | Rayon du halo, en multiples du rayon de l'étoile |
| `lineOpacity` | `0.42` | Opacité des tracés au repos |
| `lineWidth` | `1` | Épaisseur des tracés |
| `dim` | `0.2` | Opacité des étoiles éteintes pendant un focus |
| `dimLines` | `0.45` | Opacité des tracés éteints. Se **multiplie** à `lineOpacity`, d'où un palier distinct : sans lui la figure disparaît complètement. |
| `focusScale` | `1.35×` | Grossissement de l'étoile visée |
| `transitionMs` | `480 ms` | Durée des transitions |

## Un point de vigilance : deux sources d'angle

`skyculture/ekko/roll-adjust.json` contient déjà un angle par figure, validé
dans `/verification` par inversion d'homographie des ancres. Il sert à orienter
la vue de la carte pour que l'illustration tombe droite.

`data/player-view.json` en contient un second, la `rotation` du player. Ce n'est
pas une duplication accidentelle : le player n'affiche aucune illustration et
n'a donc pas la même contrainte de cadrage. Mais partir de l'angle de la carte
est presque toujours le bon point de départ, ne serait-ce que pour la continuité
du fondu.

D'où le bouton **Angle de la carte** dans le banc d'essai : il lit
`roll-adjust.json`, reporte l'angle dans le curseur, et laisse la main pour
l'ajuster avant d'enregistrer. Son lecteur tolère plusieurs formes de fichier
(`{ "ori": -17.5 }`, `{ "ori": { "angle": -17.5 } }`, sous-clé `angles`) parce
que je n'ai pas le fichier sous les yeux. S'il ne trouve rien, il le dit
clairement plutôt que d'écrire zéro.

## Deux points en attente

**L'import croisé.** `api/save-view.js` importe `../js/view-settings.js` pour ne
pas dupliquer le schéma de validation. Vercel trace normalement cet import lors
du bundling de la fonction, mais c'est la seule chose à vérifier au premier
déploiement : ouvre `/api/save-view` dans le navigateur, tu dois obtenir un
objet JSON avec `configured` et la liste des clés. Une 500 signifierait que
l'import n'a pas été résolu, et je basculerais alors le schéma dans un fichier
`api/_view-schema.js`.

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
