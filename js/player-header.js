/**
 * player-header.js — Ekko of Beyond
 * ------------------------------------------------------------------
 * Le header du player et sa défonce centrale.
 *
 * La découpe doit s'élargir pour laisser passer le nom de la constellation,
 * quelle que soit sa longueur, sans jamais rien laisser dépasser. Deux raisons
 * de la générer en SVG plutôt qu'en `clip-path` CSS :
 *
 *   1. le contour doré suit exactement la découpe — trivial avec un `<path>`
 *      tracé, pénible en CSS ;
 *   2. le remplissage et le trait partagent la même géométrie, donc un seul
 *      calcul.
 *
 * Géométrie relevée dans Figma : rule à y=91, fond de défonce à y=132,
 * panneau de référence 141 px de large, header 89 px de haut.
 */

import { GLYPH_BELOW_TITLE } from './ekko-icons.js';

const NS = 'http://www.w3.org/2000/svg';

const GEO = {
  ruleY: 91,        // hauteur du filet horizontal
  dipY: 132,        // fond de la défonce
  chamfer: 34,      // course horizontale des diagonales
  padX: 26,         // air de chaque côté du texte
  minHalf: 70.5,    // demi-largeur du panneau de référence (141 / 2)
  // Demi-largeur maximale, en fraction de la largeur d'écran. Sur grand écran
  // il faut laisser la place au bouton de retour et à « Mon compte » ; sous
  // 720 px ces éléments se replient et la défonce peut prendre presque tout.
  maxRatio: 0.34,
  maxRatioNarrow: 0.82,
  narrowAt: 720,
  minTitle: 13,     // plancher absolu de la taille du titre
  edge: 8,          // marge conservée entre la fin du chanfrein et le bord
  stroke: 2,        // épaisseur du filet (nœud Figma 215:1441)
  overhang: 8,      // le filet dépasse de 8 px de chaque côté du cadre
  glyphW: 68,       // cadre du glyphe suspendu (nœud 215:1442)
  glyphH: 53,
  glyphY: 133,
};

/** Paliers de taille du titre. On descend d'un cran plutôt que d'élargir sans fin. */
const TITLE_STEPS = [38, 34, 30, 26, 22];

const el = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

export class PlayerHeader {
  /**
   * @param {HTMLElement} root  conteneur pleine largeur, en haut de l'écran
   */
  constructor(root) {
    this.root = root;
    this.width = 0;
    this._build();

    this._ro = new ResizeObserver(() => this.layout());
    this._ro.observe(root);
    if (document.fonts?.ready) document.fonts.ready.then(() => this.layout());
  }

  _build() {
    this.panel = this.root.querySelector('[data-header-panel]');
    this.badge = this.root.querySelector('[data-header-badge]');
    this.title = this.root.querySelector('[data-header-title]');
    this.status = this.root.querySelector('[data-header-status]');

    this.svg = el('svg', { class: 'ph-svg', 'aria-hidden': 'true', preserveAspectRatio: 'none' });
    this.svg.style.cssText = 'position:absolute;left:0;top:0;width:100%;'
      + 'height:190px;pointer-events:none;overflow:visible';

    /* Remplissage : dégradé crème relevé sur le nœud Figma 215:1439.
       Deux arrêts, #E3E3C4 à 20 % puis à 50 % d'alpha, le tout sur un calque
       à 30 % d'opacité — d'où les 6 % et 15 % effectifs. La matrice de dégradé
       place t=0 à 12,1 % de la hauteur et t=1 à 75,8 %. C'est ce voile chaud
       qui manquait : je l'avais rendu en noir. */
    const defs = el('defs');
    const grad = el('linearGradient', { id: 'ph-fill', x1: '0', y1: '0', x2: '0', y2: '1' });
    grad.append(
      el('stop', { offset: '0%', 'stop-color': '#E3E3C4', 'stop-opacity': '.06' }),
      el('stop', { offset: '12.1%', 'stop-color': '#E3E3C4', 'stop-opacity': '.06' }),
      el('stop', { offset: '75.8%', 'stop-color': '#E3E3C4', 'stop-opacity': '.15' }),
      el('stop', { offset: '100%', 'stop-color': '#E3E3C4', 'stop-opacity': '.15' }),
    );
    defs.append(grad);

    this.fill = el('path', { fill: 'url(#ph-fill)', stroke: 'none' });
    this.line = el('path', {
      fill: 'none', stroke: '#E3E3C4', 'stroke-width': String(GEO.stroke),
      'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke',
    });

    this.svg.append(defs, this.fill, this.line);
    this.root.prepend(this.svg);

    /* Le glyphe suspendu est un asset de taille fixe : rien à générer, et le
       garder en HTML évite de le déformer avec le viewBox du filet. */
    this.glyph = document.createElement('div');
    this.glyph.className = 'ph-glyph';
    this.glyph.setAttribute('aria-hidden', 'true');
    this.glyph.style.cssText = `position:absolute;left:50%;top:${GEO.glyphY}px;`
      + `width:${GEO.glyphW}px;height:${GEO.glyphH}px;`
      + 'margin-left:' + (-GEO.glyphW / 2) + 'px;pointer-events:none';
    this.glyph.innerHTML = GLYPH_BELOW_TITLE;
    this.root.prepend(this.glyph);
  }

  /** @param {{ name:string, group:string, status:string }} info */
  setConstellation({ name, group, status }) {
    if (this.badge) this.badge.textContent = group ?? '';
    if (this.badge) this.badge.hidden = !group;
    if (this.title) this.title.textContent = name ?? '';
    if (this.status) this.status.textContent = status ?? '';
    this.layout();
    return this;
  }

  setStatus(status) {
    if (this.status) this.status.textContent = status;
    return this;
  }

  /**
   * Recalcule la découpe. Appelé au redimensionnement, au changement de
   * constellation, et une fois les polices chargées — sans ce dernier point la
   * mesure se fait sur la police de repli et la défonce est trop étroite.
   */
  layout() {
    const width = this.root.clientWidth;
    if (!width) return this;
    this.width = width;
    this.svg.setAttribute('viewBox', `0 0 ${width} 190`);

    const ratio = width < GEO.narrowAt ? GEO.maxRatioNarrow : GEO.maxRatio;

    // Contrainte dure : les diagonales doivent tenir dans l'écran. La défonce
    // occupe `half`, plus un chanfrein de chaque côté, plus une marge de bord.
    // Sans cette borne, une figure au nom long fait sortir le tracé du cadre
    // sur téléphone.
    const hardHalf = Math.max(24, width / 2 - GEO.chamfer - GEO.edge);
    const maxHalf = Math.min(hardHalf, Math.max(GEO.minHalf, width * ratio));
    const maxText = Math.max(40, (maxHalf - GEO.padX) * 2);

    // Le titre descend d'un palier tant qu'il ne tient pas dans la largeur
    // maximale autorisée. Élargir indéfiniment mangerait le reste du header.
    let size = TITLE_STEPS[0];
    let measured = 0;
    for (const candidate of TITLE_STEPS) {
      size = candidate;
      this.title.style.fontSize = `${size}px`;
      measured = this._measure(this.title);
      if (measured <= maxText) break;
    }

    // Aucun palier ne suffit : on calcule la taille exacte qui rentre, avec un
    // plancher. Sans ce rattrapage, « Chevelure de Bérénice » dépasse de la
    // découpe sur un écran de 360 px — c'est précisément ce qu'on ne veut pas.
    if (measured > maxText && measured > 0) {
      size = Math.max(GEO.minTitle, Math.floor((size * maxText) / measured * 10) / 10);
      this.title.style.fontSize = `${size}px`;
    }

    const textWidth = Math.max(
      this._measure(this.title),
      this._measure(this.status),
      this.badge && !this.badge.hidden ? this._measure(this.badge) : 0,
    );

    const half = Math.min(
      maxHalf,
      Math.max(Math.min(GEO.minHalf, maxHalf), textWidth / 2 + GEO.padX),
    );
    const cx = width / 2;
    const { ruleY, dipY, chamfer } = GEO;

    const l1 = cx - half - chamfer;
    const l2 = cx - half;
    const r2 = cx + half;
    const r1 = cx + half + chamfer;

    // Le filet part de -8 et va jusqu'à width + 8 : dans Figma le vecteur
    // mesure 1448,5 pour un cadre de 1440, il mord donc les deux bords.
    const x0 = -GEO.overhang;
    const x1 = width + GEO.overhang;

    const outline = `M${x0} ${ruleY} H${l1.toFixed(2)} L${l2.toFixed(2)} ${dipY} `
      + `H${r2.toFixed(2)} L${r1.toFixed(2)} ${ruleY} H${x1}`;

    this.line.setAttribute('d', outline);
    this.fill.setAttribute('d', `${outline} V0 H${x0} Z`);

    // Le panneau de texte suit la découpe : il ne peut pas déborder.
    this.panel.style.width = `${half * 2}px`;
    this.panel.style.height = `${dipY}px`;

    return this;
  }

  /**
   * Largeur réelle du texte. `scrollWidth` sur un conteneur en largeur
   * contrainte renverrait la largeur du conteneur ; on mesure donc un Range
   * sur le contenu lui-même.
   */
  _measure(node) {
    if (!node || !node.firstChild) return 0;
    const range = document.createRange();
    range.selectNodeContents(node);
    return range.getBoundingClientRect().width;
  }

  destroy() {
    this._ro?.disconnect();
    this.svg?.remove();
    this.glyph?.remove();
  }
}

export { GEO as HEADER_GEO };
export default PlayerHeader;
