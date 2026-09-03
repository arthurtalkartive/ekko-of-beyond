/* ============================================================
   Musique de fond — splash + portail + pages d'authentification.

   Chaque page HTML est un chargement independant (pas d'app monopage),
   donc la piste ne peut pas litteralement "continuer" d'une page a
   l'autre : chaque page relance son propre <audio>. Pour que ça reste
   credible malgre tout, la position de lecture et l'etat muet sont
   memorises (localStorage) et repris sur la page suivante — la coupure
   entre deux pages est breve, pas un redemarrage complet du morceau.

   Le fade in (splash) et le fade out (arrivee sur la carte) restent
   des effets explicites, poses par la page qui en a besoin — ce
   module fournit juste les briques (rampVolume, fadeOut) plutot que
   de deviner tout seul quand les utiliser.
   ============================================================ */

const TRACK_SRC = '/assets/audio/theme.mp3';
export const TARGET_VOLUME = 0.25;

const MUTE_KEY = 'ekko-bgm-muted';
const POS_KEY = 'ekko-bgm-pos';

export function isMuted(){
  try{ return localStorage.getItem(MUTE_KEY) === '1'; }catch(e){ return false; }
}
function setMuted(v){
  try{ localStorage.setItem(MUTE_KEY, v ? '1' : '0'); }catch(e){}
}
function savedPosition(){
  try{ return parseFloat(localStorage.getItem(POS_KEY)) || 0; }catch(e){ return 0; }
}
function savePosition(t){
  try{ localStorage.setItem(POS_KEY, String(t)); }catch(e){}
}

export function rampVolume(audioEl, from, to, ms, done){
  const t0 = performance.now();
  audioEl.volume = Math.max(0, Math.min(1, from));
  function step(){
    const k = Math.min(1, (performance.now() - t0) / ms);
    audioEl.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if(k < 1) requestAnimationFrame(step);
    else if(done) done();
  }
  requestAnimationFrame(step);
}

/** Coupe la musique en douceur (utilise a l'arrivee sur la carte du ciel). */
export function fadeOutAndPause(audioEl, ms = 1200, done){
  rampVolume(audioEl, audioEl.volume, 0, ms, () => { audioEl.pause(); if(done) done(); });
}

/**
 * Démarre la musique de fond sur la page courante.
 * @param {boolean} fadeIn - true sur le splash, false partout ailleurs
 *   (les pages d'auth reprennent directement au volume cible : ce n'est
 *   pas un nouveau debut de scene, juste la suite).
 * @returns {HTMLAudioElement}
 */
export function startBgm({ fadeIn = false } = {}){
  const audio = new Audio(TRACK_SRC);
  audio.loop = true;
  audio.currentTime = savedPosition();
  const muted = isMuted();
  audio.volume = fadeIn ? 0 : (muted ? 0 : TARGET_VOLUME);

  const tryPlay = () => audio.play().catch(() => {});
  tryPlay();
  /* Autoplay bloque par le navigateur (frequent au tout premier chargement,
     avant toute interaction) : on retente au premier geste, ou que ce
     soit sur la page. */
  const resumeOnGesture = () => { tryPlay(); cleanup(); };
  function cleanup(){
    removeEventListener('pointerdown', resumeOnGesture);
    removeEventListener('keydown', resumeOnGesture);
  }
  addEventListener('pointerdown', resumeOnGesture, { once: true });
  addEventListener('keydown', resumeOnGesture, { once: true });

  if(fadeIn && !muted) rampVolume(audio, 0, TARGET_VOLUME, 1800);

  /* Position memorisee regulierement, pas seulement a la fermeture :
     une navigation directe (clic sur un lien) ne declenche pas toujours
     beforeunload a temps pour ecrire dans le storage. */
  const posTimer = setInterval(() => savePosition(audio.currentTime), 1500);
  addEventListener('beforeunload', () => savePosition(audio.currentTime));
  audio.addEventListener('pause', () => savePosition(audio.currentTime));

  audio._ekkoCleanup = () => { clearInterval(posTimer); cleanup(); };
  return audio;
}

/** Bouton rond en haut a droite, meme habillage que les autres boutons
    circulaires de l'app (voir .zbtn/.nav-btn) — pose ici sa propre
    petite feuille de style au premier appel plutot que d'exiger que
    chaque page l'ajoute a la main. */
const ICON_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v4h4l5 5V5L8 10H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
const ICON_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v4h4l5 5V5L8 10H4z"/><path d="M16 9l5 6M21 9l-5 6"/></svg>';

export function mountMuteButton(audioEl){
  if(!document.getElementById('bgm-btn-style')){
    const style = document.createElement('style');
    style.id = 'bgm-btn-style';
    style.textContent = `
      #bgm-btn{
        position:fixed;top:calc(18px + env(safe-area-inset-top,0px));right:18px;z-index:110;
        width:42px;height:42px;border-radius:50%;flex:none;
        border:1px solid rgba(227,227,196,.5);
        background:linear-gradient(180deg,rgba(227,227,196,.04) 0%,rgba(227,227,196,.16) 100%);
        display:flex;align-items:center;justify-content:center;color:#E3E3C4;
        transition:background .2s,border-color .2s;cursor:pointer;
      }
      #bgm-btn:hover{background:rgba(227,227,196,.16);border-color:#E3E3C4}
      #bgm-btn svg{width:20px;height:20px;display:block}
      @media (max-width:480px){ #bgm-btn{width:38px;height:38px;top:calc(14px + env(safe-area-inset-top,0px));right:14px} }
    `;
    document.head.appendChild(style);
  }
  const btn = document.createElement('button');
  btn.id = 'bgm-btn';
  btn.type = 'button';
  const muted0 = isMuted();
  btn.innerHTML = muted0 ? ICON_OFF : ICON_ON;
  btn.setAttribute('aria-label', muted0 ? 'Activer le son' : 'Couper le son');
  btn.addEventListener('click', () => {
    const nowMuted = !isMuted();
    setMuted(nowMuted);
    rampVolume(audioEl, audioEl.volume, nowMuted ? 0 : TARGET_VOLUME, 300);
    btn.innerHTML = nowMuted ? ICON_OFF : ICON_ON;
    btn.setAttribute('aria-label', nowMuted ? 'Activer le son' : 'Couper le son');
  });
  document.body.appendChild(btn);
  return btn;
}
