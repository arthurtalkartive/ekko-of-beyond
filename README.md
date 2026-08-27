# Ekko of Beyond — carte du ciel

Site statique : une carte du ciel temps réel propulsée par Stellarium Web
Engine, et un outil interne de vérification des illustrations de
constellations.

Aucune étape de build. Deux fichiers HTML autonomes, plus un dossier
`vendor/`.

## Pages

| URL | Fichier | Rôle |
|---|---|---|
| `/` | `index.html` | Vue du ciel : les 53 figures Ekko et elles seules, tracés en `#E3E3C4`, Voie lactée, planètes en couleur, noms en français, navigation par flèches avec recentrage caméra |
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

## Écriture depuis l'outil de vérification

L'outil `/verification` peut écrire directement dans ce dépôt : valider un
angle ou une illustration déclenche un commit, et Vercel redéploie derrière.
C'est la fonction `api/save.js` qui s'en charge, via l'API Contents de
GitHub.

Sans configuration, cette écriture est simplement désactivée : l'outil
retombe sur le téléchargement du fichier et l'affichage du bloc à reporter
à la main. Rien ne casse.

### Les quatre variables d'environnement

Dans Vercel, **Settings → Environment Variables** :

| Variable | Valeur |
|---|---|
| `GITHUB_TOKEN` | jeton d'accès fin, permission **Contents: read and write** sur ce dépôt uniquement |
| `GITHUB_REPO` | `votre-compte/ekko-of-beyond` |
| `GITHUB_BRANCH` | `main` |
| `EKKO_ADMIN_KEY` | un mot de passe que vous choisissez |

Le jeton se crée sur github.com dans **Settings → Developer settings →
Personal access tokens → Fine-grained tokens**. Limitez-le à ce seul dépôt
et à la permission Contents en écriture : il n'a besoin de rien d'autre.

Redéployez après avoir ajouté les variables — Vercel ne les injecte pas
dans un déploiement déjà construit.

### À l'usage

Ouvrez `/verification`, saisissez votre `EKKO_ADMIN_KEY` dans le champ en
haut du panneau. Elle reste dans l'onglet, n'est jamais écrite sur le
disque, et ne part que vers votre propre fonction.

Ce qui est écrit :

- un angle validé va dans `skyculture/ekko/roll-adjust.json` ;
- une illustration validée remplace `skyculture/ekko/illustrations/<id>.webp`.

Comptez une minute entre le commit et la mise en ligne, le temps du
redéploiement. Chaque validation produit un commit distinct : l'historique
Git vous sert de journal, et un retour en arrière reste toujours possible.

Deux garde-fous côté serveur : l'identifiant de figure doit être un code de
trois lettres minuscules, et une illustration est refusée au-delà de 3,5 Mo.

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

**3. Déposer vos illustrations.** Le skyculture Ekko est en place, mais
sans dessins pour l'instant. Voir `skyculture/ekko/illustrations/LISEZ-MOI.md`.

**4. Recompiler le moteur proprement.** Le binaire de `vendor/` a été
édité directement pour obtenir des tracés couleur crème, faute de chaîne
emscripten. La modification est validée et documentée dans
`vendor/MODIFICATIONS.md`, mais une vraie recompilation reste préférable
à terme.

## Structure

```
.
├── index.html                  vue du ciel
├── verification.html           outil de vérification des figures
├── api/
│   └── save.js                     écrit angles et illustrations dans le dépôt
├── skyculture/ekko/
│   ├── index.json                  les 53 figures, tracés et noms français
│   ├── description.md              requis par le moteur pour activer la culture
│   ├── roll-adjust.json            corrections d'angle, écrites par l'outil
│   └── illustrations/              vos dessins WebP — voir son LISEZ-MOI
├── vendor/
│   ├── stellarium-web-engine.js    moteur, AGPL-3.0
│   ├── stellarium-web-engine.wasm  binaire modifié, AGPL-3.0
│   ├── MODIFICATIONS.md            ce qui a été changé dans le binaire
│   └── Afacad-variable.ttf         police, OFL 1.1
├── vercel.json
├── NOTICE.md                   attributions et licences — à lire
├── LICENSE-AGPL-3.0.txt
└── LICENSE-OFL-Afacad.txt
```
