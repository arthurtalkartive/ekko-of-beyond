/**
 * constellation-view.js — Ekko of Beyond
 * ------------------------------------------------------------------
 * Rendu SVG d'une figure du skyculture `ekko`, pensé pour l'écran du player :
 * une seule constellation, aucun label, vue figée, opacité pilotable par étoile.
 *
 * Toute la logique astronomique vit dans sky-projection.js. Ce fichier ne fait
 * que peindre et animer. C'est lui, et lui seul, qui sera réécrit lors du
 * passage à React Native.
 *
 * API
 *   const view = new ConstellationView(container, { data, ...options });
 *   await view.ready;
 *   view.setFigure('Ori', { roll: -12 });
 *   view.focus([27989]);           // met en avant, éteint le reste
 *   view.clearFocus();
 *   view.getStarPoint(27989);      // { x, y, r } en px, pour ancrer l'info-bulle
 *   view.destroy();
 */

import { layoutFigure } from './sky-projection.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

const DEFAULTS = {
  padding: 64,
  roll: 0,
  projection: 'stereographic',
  mirror: true,
  maxScale: Infinity,
  lineColor: '#E3E3C4',
  lineWidth: 1,
  lineOpacity: 0.42,
  dim: 0.2,             // opacité des étoiles non focalisées
  dimLines: 0.45,       // opacité des tracés non focalisés (se multiplie à lineOpacity)
  focusScale: 1.35,     // grossissement de l'étoile mise en avant
  glowScale: 4.2,       // rayon du halo, en multiples du rayon de l'étoile
  transitionMs: 480,
  highlightSegments: false, // rallumer aussi les tracés touchant l'étoile visée
  star: {},             // → magnitudeToRadius
  color: {},            // → colorFromBV
};

let uid = 0;

export class ConstellationView {
  /**
   * @param {HTMLElement} container
   * @param {object} options  DEFAULTS + { data } ou { dataUrl }
   */
  constructor(container, options = {}) {
    if (!container) throw new Error('ConstellationView: conteneur manquant');

    this.container = container;
    this.opts = { ...DEFAULTS, ...options };
    this.id = `ekko-cv-${++uid}`;

    this.figureKey = null;
    this.layout = null;
    this.focused = new Set();
    this.starNodes = new Map();
    this.segmentNodes = [];
    this._size = { width: 0, height: 0 };

    this._buildSkeleton();

    this.ready = options.data
      ? Promise.resolve((this.data = options.data))
      : fetch(options.dataUrl ?? 'data/ekko-sky.json')
        .then((r) => {
          if (!r.ok) throw new Error(`ekko-sky.json: HTTP ${r.status}`);
          return r.json();
        })
        .then((json) => { this.data = json; return json; });

    this._observer = new ResizeObserver(() => this._measure());
    this._observer.observe(container);
    this._measure();
  }

  /* ------------------------------------------------------------- squelette */

  _buildSkeleton() {
    this.svg = el('svg', {
      class: 'ekko-constellation',
      xmlns: NS,
      preserveAspectRatio: 'xMidYMid meet',
      'aria-hidden': 'true',   // décoratif : le contenu utile est dans l'info-bulle
      focusable: 'false',
    });
    // Vue figée : aucune interaction pointeur ne doit atteindre le SVG.
    this.svg.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none;overflow:visible';

    // Tout est piloté par variables CSS : changer une durée ou une opacité
    // ne demande jamais de repeindre la géométrie.
    const style = el('style');
    style.textContent = `
      .ekko-constellation {
        --ekko-ease: cubic-bezier(.4, 0, .2, 1);
        --ekko-ease-pop: cubic-bezier(.34, 1.2, .64, 1);
      }
      .ekko-seg, .ekko-star, .ekko-halo, .ekko-core {
        transform-box: fill-box;
        transform-origin: center;
      }
      .ekko-seg { transition: opacity var(--ekko-dur) var(--ekko-ease); }
      .ekko-star { transition: opacity var(--ekko-dur) var(--ekko-ease); }
      .ekko-core {
        transform: scale(1);
        transition: transform var(--ekko-dur) var(--ekko-ease-pop);
      }
      .ekko-halo {
        opacity: 0;
        transform: scale(.55);
        transition: opacity var(--ekko-dur) var(--ekko-ease),
                    transform var(--ekko-dur) var(--ekko-ease-pop);
      }
      /* Les tracés ont leur propre palier : sans ça leur opacité de base se
         multiplie par le dim et la figure disparaît complètement. */
      [data-focus="on"] .ekko-seg { opacity: var(--ekko-dim-line); }
      [data-focus="on"] .ekko-star { opacity: var(--ekko-dim); }
      [data-focus="on"] .ekko-seg[data-lit],
      [data-focus="on"] .ekko-star[data-lit] { opacity: 1; }
      .ekko-star[data-lit] .ekko-halo { opacity: .85; transform: scale(1); }
      .ekko-star[data-lit] .ekko-core { transform: scale(var(--ekko-pop)); }
      @media (prefers-reduced-motion: reduce) {
        .ekko-seg, .ekko-star, .ekko-halo, .ekko-core { transition-duration: 1ms; }
      }
    `;
    this.svg.append(style);

    this.defs = el('defs');
    const grad = el('radialGradient', { id: `${this.id}-glow` });
    grad.append(
      el('stop', { offset: '0%', 'stop-color': '#FFFFFF', 'stop-opacity': '.95' }),
      el('stop', { offset: '28%', 'stop-color': '#FFF6D8', 'stop-opacity': '.55' }),
      el('stop', { offset: '62%', 'stop-color': '#E3E3C4', 'stop-opacity': '.16' }),
      el('stop', { offset: '100%', 'stop-color': '#E3E3C4', 'stop-opacity': '0' }),
    );
    this.defs.append(grad);
    this.svg.append(this.defs);

    this.gSegments = el('g', { class: 'ekko-segments' });
    this.gStars = el('g', { class: 'ekko-stars' });
    this.svg.append(this.gSegments, this.gStars);

    this._syncVars();
    this.container.append(this.svg);
  }

  _syncVars() {
    const s = this.svg.style;
    s.setProperty('--ekko-dim', String(this.opts.dim));
    s.setProperty('--ekko-dim-line', String(this.opts.dimLines));
    s.setProperty('--ekko-dur', `${this.opts.transitionMs}ms`);
    s.setProperty('--ekko-pop', String(this.opts.focusScale));
  }

  /* ----------------------------------------------------------- dimensions */

  _measure() {
    const rect = this.container.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    if (width === this._size.width && height === this._size.height) return;
    this._size = { width, height };
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    // viewBox calé 1:1 sur les pixels CSS : les coordonnées SVG sont
    // directement des px conteneur, donc getStarPoint() n'a rien à convertir.
    if (this.figureKey) this._render();
  }

  /* --------------------------------------------------------------- public */

  /**
   * Affiche une figure. Le roulis permet de reprendre l'orientation qu'avait
   * la constellation sur la carte Stellarium au moment du clic, pour que le
   * fondu enchaîné lise comme une continuité.
   */
  setFigure(iau, { roll } = {}) {
    if (!this.data) throw new Error('ConstellationView: attendre `view.ready`');
    const figure = this.data.figures[iau];
    if (!figure) throw new Error(`Figure inconnue : ${iau}`);
    this.figureKey = iau;
    this.figure = figure;
    if (roll !== undefined) this.opts.roll = roll;
    this.clearFocus({ silent: true });
    this._render();
    return this;
  }

  /**
   * Met à jour des options d'affichage.
   * Les réglages purement visuels (opacités, durées) passent par variables CSS
   * et ne déclenchent aucun recalcul de géométrie.
   */
  setOptions(patch = {}) {
    const GEOMETRY = ['padding', 'roll', 'projection', 'mirror', 'maxScale', 'star', 'color',
      'lineColor', 'lineWidth', 'lineOpacity', 'glowScale'];
    const needsRepaint = Object.keys(patch).some((k) => GEOMETRY.includes(k));

    Object.assign(this.opts, patch);
    this._syncVars();
    if (needsRepaint && this.figureKey) this._render();
    return this;
  }

  /**
   * Allume une ou plusieurs étoiles et éteint le reste.
   * @param {number|number[]} hips
   */
  focus(hips) {
    const list = (Array.isArray(hips) ? hips : [hips]).map(Number).filter((h) => this.starNodes.has(h));
    this.focused = new Set(list);
    this._applyFocus();
    return this;
  }

  clearFocus({ silent = false } = {}) {
    this.focused = new Set();
    if (!silent) this._applyFocus();
    else this.svg.removeAttribute('data-focus');
    return this;
  }

  /** Position en px, relative au conteneur. Sert à ancrer l'info-bulle. */
  getStarPoint(hip) {
    const s = this.layout?.stars.find((p) => p.hip === Number(hip));
    return s ? { x: s.x, y: s.y, r: s.r } : null;
  }

  /** Liste des étoiles de la figure courante, triée par magnitude. */
  listStars() {
    return [...(this.layout?.stars ?? [])].sort((a, b) => a.mag - b.mag);
  }

  destroy() {
    this._observer?.disconnect();
    this.svg?.remove();
    this.starNodes.clear();
    this.segmentNodes = [];
  }

  /* ---------------------------------------------------------------- rendu */

  _render() {
    const { width, height } = this._size;
    if (!width || !height) return;

    this.layout = layoutFigure({
      figure: this.figure,
      stars: this.data.stars,
      width,
      height,
      padding: this.opts.padding,
      roll: this.opts.roll,
      projection: this.opts.projection,
      mirror: this.opts.mirror,
      maxScale: this.opts.maxScale,
      star: this.opts.star,
      color: this.opts.color,
    });

    this._paintSegments();
    this._paintStars();
    this._applyFocus();
  }

  _paintSegments() {
    const { lineColor, lineWidth, lineOpacity } = this.opts;
    this.gSegments.replaceChildren();
    this.segmentNodes = this.layout.segments.map((s) => {
      const node = el('line', {
        class: 'ekko-seg',
        x1: s.x1.toFixed(2),
        y1: s.y1.toFixed(2),
        x2: s.x2.toFixed(2),
        y2: s.y2.toFixed(2),
        stroke: lineColor,
        'stroke-width': lineWidth,
        'stroke-linecap': 'round',
        'stroke-opacity': lineOpacity,
      });
      node.__ends = [s.a, s.b];
      this.gSegments.append(node);
      return node;
    });
  }

  _paintStars() {
    const { glowScale } = this.opts;
    this.gStars.replaceChildren();
    this.starNodes.clear();

    for (const s of this.layout.stars) {
      const g = el('g', { class: 'ekko-star', 'data-hip': s.hip });

      const halo = el('circle', {
        class: 'ekko-halo',
        cx: s.x.toFixed(2),
        cy: s.y.toFixed(2),
        r: (s.r * glowScale).toFixed(2),
        fill: `url(#${this.id}-glow)`,
      });

      const core = el('circle', {
        class: 'ekko-core',
        cx: s.x.toFixed(2),
        cy: s.y.toFixed(2),
        r: s.r.toFixed(2),
        fill: s.color,
      });

      g.append(halo, core);
      this.gStars.append(g);
      this.starNodes.set(s.hip, { g, halo, core, base: s });
    }
  }

  _applyFocus() {
    const on = this.focused.size > 0;
    this.svg.setAttribute('data-focus', on ? 'on' : 'off');

    // Le grossissement de l'étoile visée passe par un `transform: scale` en CSS
    // plutôt que par l'attribut `r` : la transition de `r` reste inégalement
    // supportée, alors que `transform` est composité par le GPU partout.
    for (const [hip, node] of this.starNodes) {
      node.g.toggleAttribute('data-lit', this.focused.has(hip));
    }

    for (const node of this.segmentNodes) {
      const lit = this.opts.highlightSegments
        && on
        && node.__ends.some((h) => this.focused.has(h));
      node.toggleAttribute('data-lit', lit);
    }
  }
}

export default ConstellationView;
