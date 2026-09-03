# Pictogrammes des niveaux de progression

Chaque niveau attend un fichier SVG à ce chemin exact :

| Fichier              | Niveau                      | Seuil (% de la collection) |
|----------------------|------------------------------|-----------------------------|
| `level-0.svg`         | Œil Nu                       | 0 %                         |
| `level-1.svg`         | Éveillé aux Étoiles           | 1 %                          |
| `level-2.svg`         | Chercheur d'Échos             | 10 %                         |
| `level-3.svg`         | Cartographe du Ciel           | 25 %                         |
| `level-4.svg`         | Gardien des Constellations    | 45 %                         |
| `level-5.svg`         | Oracle Céleste                | 68 %                         |
| `level-6.svg`         | Souverain des Astres          | 87 %                         |
| `level-7.svg`         | Écho de l'Au-delà (niveau max)| 100 %                        |

## Comment ça marche

Il suffit de déposer un fichier au bon nom dans ce dossier : le site le
détecte et l'affiche automatiquement, sans aucune modification de code.
Tant qu'un fichier n'existe pas encore, `_fallback.svg` (le losange
générique déjà utilisé dans le header) s'affiche à sa place — rien n'est
jamais cassé ou vide en attendant les illustrations définitives.

Le mapping fichier ↔ niveau est défini dans `index.html`, dans la
constante `LEVELS` (recherchez `const LEVELS =`). Les noms et seuils
peuvent y être ajustés librement ; les noms de fichiers (`level-0.svg`
à `level-7.svg`) n'ont pas besoin de changer même si les libellés
évoluent, puisqu'ils sont indexés sur la position dans le tableau et non
sur le nom du niveau.

## Format recommandé

- SVG, viewBox carré (`0 0 100 100` par exemple) pour un rendu net à
  toutes les tailles.
- Pas de couleurs codées en dur si possible : `currentColor` permet à
  l'icône de suivre la couleur crème du thème, mais une illustration
  polychrome fonctionne tout aussi bien (elle est affichée telle quelle
  via une balise `<img>`, pas incluse en ligne dans la page).
- Poids léger (quelques Ko) : ces pictogrammes se chargent dans le
  header et le menu, visibles sur toutes les pages.

## Où ça s'affiche aujourd'hui

- Le bouton "Mon compte" du header (remplacé par le niveau courant).
- Le bloc "Ma progression" du menu déroulant associé.

Le jour où les comptes utilisateurs arriveront, ce même système
(fichiers + `LEVELS`) sera repris tel quel, simplement calculé par
utilisateur plutôt que globalement.
