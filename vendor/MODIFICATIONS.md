# Modifications apportées au binaire de Stellarium Web Engine

Le fichier `stellarium-web-engine.wasm` livré ici **n'est pas** le binaire
d'origine. Il a été modifié. L'AGPL-3.0 impose de documenter et de rendre
disponibles les modifications : c'est l'objet de ce fichier.

## Binaire de départ

Fork `QHYCCD-QUARCS/QUARCS_stellarium-web-engine`, commit
`e3ddb048e66e7b9bd49343b1ca59155927709e1c`, fichier
`apps/web-frontend/src/assets/js/stellarium-web-engine.wasm`
(1 213 399 octets).

## Modification équivalente au niveau des sources

Un seul fichier est concerné : `src/modules/constellations.c`.

**Couleur des tracés de constellations**, fonction de rendu des lignes :

```c
- vec4_set(lines_color, 0.65, 1.0, 1.0, 0.4);
+ vec4_set(lines_color, 0.890, 0.890, 0.769, 0.4);
```

`(0.890, 0.890, 0.769)` correspond à `#E3E3C4`, la teinte crème de la
charte Ekko. Le cyan d'origine ne pouvait pas être corrigé par un filtre
CSS : préserver les gris impose qu'une matrice de couleur ait ses lignes
sommant à 1, et sous cette contrainte décyaniser les tracés revient à
vider le canal rouge, donc à détruire les couleurs des planètes.

**Couleur des noms de constellations**, fonction de rendu des labels :

```c
- vec4_set(names_color, 0.65, 1.0, 1.0, 0.6 * painter.color[3]);
+ vec4_set(names_color, 1.0,  1.0, 1.0, 0.6 * painter.color[3]);
```

Soit du blanc pur au lieu du même cyan.

## Comment la modification a été appliquée

Faute de chaîne emscripten disponible, le binaire a été édité
directement. Le détail est consigné ici pour que l'opération soit
reproductible et vérifiable.

Le compilateur avait traduit `vec4_set` suivi de `vec4_emul` en une suite
de multiplications, et **supprimé celles par 1.0** puisqu'elles sont
neutres. Ne subsistaient donc dans le binaire que deux constantes pour
les tracés : le rouge `0.65` et l'alpha `0.4`. Il a fallu :

1. remplacer la constante `f64.const 0.65` du rouge par `0.890` ;
2. **réinjecter** les deux multiplications absentes, pour le vert et le
   bleu, sous la forme de 44 octets d'instructions insérés juste après le
   stockage de la composante rouge :

   ```
   local.get 2 ; local.get 2 ; f64.load  offset=2312 ; f64.const 0.890
               ; f64.mul     ; f64.store offset=2312
   local.get 2 ; local.get 2 ; f64.load  offset=2320 ; f64.const 0.769
               ; f64.mul     ; f64.store offset=2320
   ```

   Les décalages 2304 / 2312 / 2320 / 2328 sont les quatre composantes du
   tableau de couleur du painter, déduites des instructions existantes
   (2304 pour le rouge, 2328 pour l'alpha) ;
3. réécrire en LEB128 la taille du corps de fonction et celle de la
   section `code`, augmentées de 44 octets ;
4. remplacer la constante `0.65` des noms par `1.0`.

Binaire obtenu : 1 213 443 octets, soit 44 de plus que l'original.

**Vérification effectuée.** `WebAssembly.validate()` et une compilation
complète par V8 passent toutes deux : le flux d'instructions est
équilibré en pile et correct en types. La structure des 44 octets
injectés a été redécodée instruction par instruction pour confirmer les
décalages mémoire et les constantes.

## Recompilation propre, recommandée

L'édition binaire est un contournement. Dès que vous disposez
d'emscripten et de scons, recompilez depuis les sources avec les deux
changements ci-dessus :

```bash
git clone https://github.com/Stellarium/stellarium-web-engine
cd stellarium-web-engine
# appliquer les deux modifications de src/modules/constellations.c
make js
# le binaire est produit dans build/
```

Vous obtiendrez le même résultat par un chemin propre et maintenable, et
vous pourrez au passage ajuster librement l'opacité des tracés, la
couleur des frontières et celle des labels.
