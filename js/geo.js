/* ============================================================
   Position de l'utilisateur, demandee une seule fois.

   Chaque page (carte du ciel, fiche constellation) appelait sa propre
   navigator.geolocation.getCurrentPosition() independamment — sur
   certains navigateurs mobiles (Safari iOS notamment, avec "Autoriser
   une fois"), ça redemandait la permission a chaque nouvelle page.
   La position est desormais gardee en memoire (localStorage) apres le
   premier succes, et reutilisee partout sans repasser par le
   navigateur — jusqu'a ce qu'elle soit explicitement effacee.
   ============================================================ */

const CACHE_KEY = 'ekko-geo-pos';

function readCache(){
  try{
    const raw = localStorage.getItem(CACHE_KEY);
    if(!raw) return null;
    const v = JSON.parse(raw);
    if(v && typeof v.lat === 'number' && typeof v.lon === 'number') return { lat: v.lat, lon: v.lon };
  }catch(e){}
  return null;
}
function writeCache(pos){
  try{ localStorage.setItem(CACHE_KEY, JSON.stringify(pos)); }catch(e){}
}

/**
 * Résout avec {lat, lon}. Ne sollicite le navigateur que s'il n'y a
 * encore rien en cache ; sinon renvoie la valeur mémorisée directement,
 * sans nouvelle demande de permission.
 * @param {{lat:number, lon:number}} fallback - utilisé si la geoloc
 *   échoue ou est indisponible (n'est pas mis en cache : on retentera
 *   la vraie position la prochaine fois).
 */
export function getCachedPosition(fallback){
  return new Promise(function(resolve){
    const cached = readCache();
    if(cached){ resolve(cached); return; }

    if(!navigator.geolocation){ resolve(fallback); return; }
    navigator.geolocation.getCurrentPosition(
      function(p){
        const pos = { lat: p.coords.latitude, lon: p.coords.longitude };
        writeCache(pos);
        resolve(pos);
      },
      function(){ resolve(fallback); },
      { enableHighAccuracy: false, timeout: 6000 }
    );
  });
}

/** Efface la position mémorisée (utile si on ajoute un jour un moyen de
    la rafraîchir depuis les paramètres). */
export function clearCachedPosition(){
  try{ localStorage.removeItem(CACHE_KEY); }catch(e){}
}
