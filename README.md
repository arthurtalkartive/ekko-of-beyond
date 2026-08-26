# Ekko of Beyond — carte du ciel

Site statique : une carte du ciel temps réel propulsée par Stellarium Web
Engine, et un outil interne de vérification des illustrations de
constellations.

Aucune étape de build. Deux fichiers HTML autonomes, plus un dossier
`vendor/`.

## Pages

| URL | Fichier | Rôle |
|---|---|---|
| `/` | `index.html` | Vue du ciel : 53 constellations, Voie lactée, planètes en couleur, noms en français, navigation par flèches avec recentrage caméra |
| `/verification` | `verification.html` | Outil interne : superpose le tracé réel de Stellarium sur vos illustrations |

Le bouton **Mon compte** de l'en-tête mène pour l'instant à
`/verification`. Le lien **Retour à la carte du ciel** fait l'inverse.
C'est provisoire, le temps de construire le vrai espace compte.

## Déploiement

### 1. Dépôt GitHub

```bash
git init
git add .
git commit -m "Ekko of Beyond — carte du ciel et outil de vérification"
git branch -M main
git remote add origin git@github.com:VOTRE-COMPTE/ekko-of-beyond.git
git push -u origin main
```

Lisez `NOTICE.md` avant de choisir entre dépôt public et privé : la
licence du moteur pèse sur cette décision.

### 2. Vercel

Sur vercel.com, **Add New → Project**, importez le dépôt, puis :

- Framework Preset : **Other**
- Build Command : *laisser vide*
- Output Directory : *laisser vide* (la racine est servie telle quelle)
- Install Command : *laisser vide*

Déployez. Rien d'autre à configurer : `vercel.json` s'occupe du reste.

En ligne de commande, si vous préférez :

```bash
npm i -g vercel
vercel        # préversion
vercel --prod # production
```

### Ce que fait `vercel.json`

- `cleanUrls` : `/verification` fonctionne sans le `.html`
- type MIME `application/wasm` sur le binaire du moteur, et cache
  immuable d'un an sur tout `vendor/` (les fichiers sont épinglés)
- `Permissions-Policy` autorisant géolocalisation, gyroscope et
  accéléromètre pour votre propre origine

## Contraintes d'exécution à connaître

**HTTPS obligatoire.** La géolocalisation ne fonctionne que sur origine
sécurisée. Vercel fournit HTTPS d'office ; en local, utilisez
`localhost`, qui bénéficie de la même exemption.

**Ne pas ouvrir les fichiers en `file://`.** Le moteur charge un module
WebAssembly par requête réseau, ce qui échoue sur le protocole fichier.
En local :

```bash
python3 -m http.server 8080
# puis http://localhost:8080
```

**Poids du premier chargement.** Environ 1,4 Mo pour `vendor/`, plus les
tuiles d'étoiles récupérées à la demande. Le cache immuable fait que ce
coût n'est payé qu'une fois.

**Position par défaut.** Si l'utilisateur refuse la géolocalisation, le
ciel est calculé pour Grenade (37,18° N — 3,60° O).

## Avant la production

Trois chantiers, par ordre d'urgence.

**1. La licence du moteur.** L'AGPL et son article 13 sur l'usage en
réseau. C'est une décision de fond, détaillée dans `NOTICE.md`. À
trancher avant toute ouverture au public.

**2. Internaliser les données du ciel.** Cinq sources sont chargées depuis
jsDelivr, qui sert un miroir GitHub tiers : le catalogue d'étoiles, le
skyculture occidental et ses illustrations, le survey de la Voie lactée,
et les textures de la Lune et du Soleil. Ça convient parfaitement à une
préversion, mais fait dépendre le site d'un dépôt que vous ne contrôlez
pas. Copiez le dossier `skydata/` dans ce projet et remplacez la
constante `SKYDATA` dans les deux pages.

**3. Écrire le skyculture Ekko.** Le moteur affiche aujourd'hui les 88
figures de la skyculture occidentale, pas seulement vos 53 : on ne peut
pas filtrer figure par figure depuis JavaScript. Il faut un skyculture
propre, qui portera aussi vos noms français, vos illustrations et vos
trois astérismes — absents de tout catalogue.

## Structure

```
.
├── index.html                  vue du ciel
├── verification.html           outil de vérification des figures
├── vendor/
│   ├── stellarium-web-engine.js    moteur, AGPL-3.0
│   ├── stellarium-web-engine.wasm  binaire, AGPL-3.0
│   └── Afacad-variable.ttf         police, OFL 1.1
├── vercel.json
├── NOTICE.md                   attributions et licences — à lire
├── LICENSE-AGPL-3.0.txt
└── LICENSE-OFL-Afacad.txt
```
