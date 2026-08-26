# Attributions et licences des composants tiers

Ce projet assemble plusieurs briques externes. Chacune a sa licence.

## 1. Stellarium Web Engine — AGPL-3.0 · **point d'attention majeur**

Fichiers concernés :

- `vendor/stellarium-web-engine.js`
- `vendor/stellarium-web-engine.wasm`

Source : https://github.com/Stellarium/stellarium-web-engine
Copyright : Stellarium Labs SRL et contributeurs.
Licence : GNU Affero General Public License v3.0 (voir `LICENSE-AGPL-3.0.txt`).

Le binaire embarqué provient d'un build compilé publié dans le fork
`QHYCCD-QUARCS/QUARCS_stellarium-web-engine`, commit
`e3ddb048e66e7b9bd49343b1ca59155927709e1c`.

**Il a été modifié.** La couleur des tracés de constellations est passée
du cyan d'origine à `#E3E3C4`, et celle des labels au blanc. L'AGPL
impose de documenter et de rendre disponibles ces modifications :
`vendor/MODIFICATIONS.md` en donne le détail exact, avec le diff
équivalent au niveau des sources et la procédure de recompilation.

**Ce que l'AGPL implique pour un déploiement Vercel.** L'article 13 de
l'AGPL porte sur l'usage *via un réseau* : dès lors que des utilisateurs
interagissent avec le logiciel à distance, vous devez leur offrir l'accès
au code source correspondant de l'ensemble de l'application. Publier ce
dépôt en public satisfait cette obligation. Le garder privé tout en
exposant le site en ligne ne la satisfait pas.

Trois options, à trancher avant toute mise en production :

1. Dépôt public et application sous licence compatible AGPL.
2. Licence commerciale négociée auprès de Stellarium Labs (c'est leur
   modèle économique, les contributeurs signent un CLA à leur profit).
3. Remplacer le moteur par une solution maison, comme le prototype
   Three.js réalisé en amont du projet.

## 2. Données du ciel — chargées depuis un CDN

Le catalogue d'étoiles, le survey de la Voie lactée et les textures de la
Lune et du Soleil sont chargés à l'exécution depuis jsDelivr, qui sert le
miroir `liudonghua123/stellarium-web-engine` (branche `gh-pages`, commit
`453e155185a6060711e533f9bf8d0334b2ae862f`). Licence CC BY-SA.

Le skyculture occidental n'est **plus** utilisé par la carte : il est
remplacé par `skyculture/ekko/`, qui ne contient que nos 53 figures. Les
illustrations de **Johan Meuris**, sous Licence Art Libre, ne sont donc
plus chargées par la page d'accueil. L'outil `/verification` continue de
les afficher, à la demande, comme calque de comparaison — elles restent
servies par le CDN et ne sont pas redistribuées dans ce dépôt.

## 2 bis. Skyculture Ekko

`skyculture/ekko/index.json` est un fichier de données que nous
produisons. Il en va autrement de son contenu :

- les **tracés** (segments entre étoiles) sont repris du skyculture
  occidental de Stellarium, donc **CC BY-SA** — attribution au projet
  Stellarium requise ;
- les **noms français** de constellations et d'étoiles, ainsi que les
  trois astérismes Ekko, sont nos apports ;
- les **coordonnées** viennent de la base HYG (section 3).

## 3. Coordonnées stellaires — base HYG

Les 519 étoiles utilisées par l'outil de vérification proviennent de la
base HYG (`astronexus/HYG-Database`), qui compile Hipparcos, Yale Bright
Star et Gliese. Les coordonnées sont embarquées dans
`verification.html`. Licence CC BY-SA 2.5, attribution : David Nash.

## 4. Police Afacad

`vendor/Afacad-variable.ttf`, SIL Open Font License 1.1, via Google
Fonts. Redistribution autorisée, y compris commerciale.

## 5. Ce qui vous appartient

Le design, les textes français, la structure des écrans, la table des 53
constellations et astérismes d'Ekko, le dictionnaire de traduction et la
logique de vérification par inversion de l'homographie.
