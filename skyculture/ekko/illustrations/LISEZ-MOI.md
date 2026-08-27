# Vos illustrations de constellations

Déposez ici vos dessins, **au format WebP**, nommés d'après l'identifiant
Ekko de la figure :

```
uma.webp     Grande Ourse
ori.webp     Orion
cyg.webp     Cygne
crb.webp     Couronne boréale
...
```

La liste complète des identifiants se trouve dans `../index.json`, champ
`iau` en minuscules — ou plus simplement dans le manifeste de l'outil de
vérification.

## Deux contraintes techniques

**Trait clair sur fond noir.** Le moteur compose les illustrations en
mélange additif — `PAINTER_ADD` dans son code source. Le noir pur devient
donc totalement transparent de lui-même, sans qu'il soit besoin d'un canal
alpha, et seuls les pixels clairs apparaissent. Un dessin sombre sur fond
blanc remplirait l'écran de blanc. Dessinez en `#E3E3C4` sur noir, et
n'essayez pas de détourer : c'est inutile et ça dégrade l'image.

**Résolution : 1024 ou 2048 pixels, carré.** Les illustrations d'origine
de Stellarium ne font que 512 px, d'où leur aspect pixelisé en zoom. Vous
pouvez déposer bien plus grand sans rien changer d'autre : les ancres sont
normalisées en coordonnées relatives par le moteur, donc elles restent
valables quelle que soit la taille du fichier. Laissez `size` tel quel
dans `index.json`.

Ne montez pas au-delà de 2048. Deux raisons. Le moteur charge la texture
sans mipmap, et il masque l'illustration dès que le champ de vision
descend sous la moitié du diamètre de la figure : celle-ci n'est donc
jamais affichée à plus de deux fois la taille de l'écran, ce qui plafonne
la résolution utile. Et une texture de 2048 px pèse 16 Mo en mémoire
vidéo une fois décodée.

## Déclarer une illustration

Déposer le fichier ne suffit pas : il faut dire au moteur comment le
plaquer sur le ciel. Ouvrez `ancres-de-reference.json`, repérez votre
figure, et collez son bloc `image` dans l'entrée correspondante de
`../index.json` :

```json
{
  "id": "CON ekko UMa",
  "iau": "UMa",
  "common_name": { "english": "Grande Ourse" },
  "lines": [ ... ],
  "image": {
    "file": "illustrations/uma.webp",
    "size": [512, 512],
    "anchors": [
      { "pos": [26, 75],   "hip": 67301 },
      { "pos": [452, 272], "hip": 41704 },
      { "pos": [258, 394], "hip": 50372 }
    ]
  }
}
```

Une ancre associe une position en pixels dans votre image au numéro HIP
de l'étoile sur laquelle ce pixel doit tomber. Trois ancres suffisent :
le moteur en déduit la déformation, et le dessin suit ensuite
automatiquement la rotation du ciel, la latitude et la projection.

**Les ancres de référence ne restent valables que si votre dessin
respecte le cadrage de l'illustration d'origine.** Servez-vous de l'outil
`/verification` pour le contrôler : il projette le tracé réel dans le
repère de votre image. Si ça ne colle pas, relevez vous-même trois
positions en pixels sur trois étoiles identifiables et remplacez les
`pos` — les numéros HIP se lisent dans le même outil.

## Les six figures sans ancres de référence

Les Chiens de chasse et le Serpent n'ont pas d'illustration d'origine
dans Stellarium. Le Grand Nuage de Magellan et les trois astérismes — le
Triangle d'été, le Triangle d'hiver, l'Hexagone d'hiver — n'existent dans
aucun catalogue. Pour ces six-là, les trois ancres sont à définir
entièrement.
