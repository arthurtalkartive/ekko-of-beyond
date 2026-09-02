/**
 * ekko-icons.js — Ekko of Beyond
 * ------------------------------------------------------------------
 * ATTENTION — ces tracés sont des RECONSTRUCTIONS d'après la maquette, pas
 * les exports Figma. Mon environnement n'a pas accès à figma.com, je n'ai
 * donc pas pu récupérer les SVG d'origine.
 *
 * Tout est réuni ici exprès : remplacer une icône par ton vrai export est une
 * seule édition dans ce fichier, sans toucher au player ni à l'outil de
 * calibration. Garde les `viewBox` telles quelles, les dimensions viennent de
 * Figma et le reste du code s'appuie dessus.
 *
 *   chevronLeft  8.97 × 12.817   « Retour à la carte »
 *   account      29.333 × 30     « Mon compte »
 *   rewind10     24 × 24         recul de 10 s
 *   forward10    24 × 24         avance de 10 s
 *   play         24 × 28         lecture
 *   pause        24 × 26         pause
 */

const GOLD = '#E3E3C4';

export const ICONS = {
  chevronLeft: `<svg viewBox="0 0 9 13" width="9" height="13" fill="none" aria-hidden="true">
    <path d="M7.7 1.2 2.1 6.4l5.6 5.2" stroke="${GOLD}" stroke-width="1.6"
          stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  account: `<svg viewBox="0 0 30 30" width="29.333" height="30" fill="none" aria-hidden="true">
    <path d="M15 1.6 27.2 6.1v9.2c0 5.9-4.7 11.2-12.2 13.9C7.5 26.5 2.8 21.2 2.8 15.3V6.1L15 1.6Z"
          stroke="${GOLD}" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M15 8.8 20.6 12.9 18.5 19.6h-7L9.4 12.9 15 8.8Z"
          stroke="${GOLD}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M15 8.8v10.8M9.4 12.9h11.2" stroke="${GOLD}" stroke-width="1.1"/>
  </svg>`,

  rewind10: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
    <path d="M12 5.4V2L7.2 5.4 12 8.8V5.4a7.2 7.2 0 1 1-7.1 8.4"
          stroke="${GOLD}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="12.4" y="16.6" font-family="Afacad, system-ui, sans-serif" font-size="8.2"
          font-weight="700" fill="${GOLD}" text-anchor="middle">10</text>
  </svg>`,

  forward10: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
    <path d="M12 5.4V2l4.8 3.4L12 8.8V5.4a7.2 7.2 0 1 0 7.1 8.4"
          stroke="${GOLD}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="11.6" y="16.6" font-family="Afacad, system-ui, sans-serif" font-size="8.2"
          font-weight="700" fill="${GOLD}" text-anchor="middle">10</text>
  </svg>`,

  play: `<svg viewBox="0 0 24 28" width="24" height="28" aria-hidden="true">
    <path d="M1.4 1.6a1 1 0 0 1 1.5-.9l19 12.4a1 1 0 0 1 0 1.7l-19 12.4a1 1 0 0 1-1.5-.9V1.6Z"
          fill="${GOLD}"/>
  </svg>`,

  pause: `<svg viewBox="0 0 24 26" width="24" height="26" aria-hidden="true">
    <rect x="1.5" y="0" width="7.5" height="26" rx="1" fill="${GOLD}"/>
    <rect x="15" y="0" width="7.5" height="26" rx="1" fill="${GOLD}"/>
  </svg>`,
};

/**
 * Losange des moments interactifs : carré de 11.939 px tourné à 45° (encombrement
 * 16.884 px), avec un cœur plein de 5 px lui aussi tourné. Chiffres relevés dans
 * Figma, contrairement aux icônes ci-dessus.
 */
export const CUE_GLYPH = `<svg viewBox="0 0 17 17" width="17" height="17" aria-hidden="true">
  <g transform="rotate(45 8.5 8.5)">
    <rect x="2.53" y="2.53" width="11.939" height="11.939" fill="none"
          stroke="${GOLD}" stroke-width="1"/>
    <rect x="6" y="6" width="5" height="5" fill="${GOLD}"/>
  </g>
</svg>`;

export function icon(name) {
  const svg = ICONS[name];
  if (!svg) throw new Error(`Icône inconnue : ${name}`);
  return svg;
}
