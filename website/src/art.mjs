// Original artwork for the website, drawn as inline SVG (DECISIONS #128). Inline SVG needs no image
// request and no CSP change, follows the colour scheme through CSS variables, and its words come
// from the page language's strings.json ("art"), so a diagram is translated with the page.
//
// Content files insert a piece with {{art:<name>}}. Decorative pieces are aria-hidden; the anatomy
// diagram is an image with a label and real text labels.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r = (n) => Math.round(n * 10) / 10;

/** A ring of petals around (cx, cy), used for the halo behind the drum and the ornaments. */
function petals(cx, cy, count, inner, length, width, cls) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const a = (360 / count) * i;
    out += `<ellipse class="${cls}" cx="${cx}" cy="${r(cy - inner - length / 2)}" rx="${width}" ry="${r(length / 2)}" transform="rotate(${r(a)} ${cx} ${cy})"/>`;
  }
  return out;
}

/** Side view of a khol: clay body, laced straps, two heads. Used in the home hero. */
function drumBody(id) {
  // Body outline: large bass head left (x 96), small treble head right (x 548), widest a little left of centre.
  const body =
    'M96,84 C176,40 330,36 424,66 C486,86 532,104 548,118 L548,242 C532,256 486,274 424,294 C330,324 176,320 96,276 Z';
  // Straps (tasma) are laced from rim to rim in a zigzag, so from the side they cross in a lattice.
  let straps = '';
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const yl = 88 + (184 / n) * i; // along the bass rim
    const yr1 = 120 + (120 / n) * Math.min(n, i + 3); // along the treble rim, shifted down
    const yr2 = 120 + (120 / n) * Math.max(0, i - 3); // and up
    straps += `<path d="M96,${r(yl)} L548,${r(yr1)} M96,${r(yl)} L548,${r(yr2)}"/>`;
  }
  return `
  <defs>
    <linearGradient id="${id}-clay" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#C8743F"/><stop offset=".45" stop-color="#A4501F"/><stop offset="1" stop-color="#6A2A10"/>
    </linearGradient>
    <linearGradient id="${id}-shine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFE3B8" stop-opacity=".55"/><stop offset=".35" stop-color="#FFE3B8" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="${id}-head" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#F6E7CC"/><stop offset="1" stop-color="#D9BE92"/>
    </radialGradient>
    <clipPath id="${id}-clip"><path d="${body}"/></clipPath>
  </defs>
  <path d="${body}" fill="url(#${id}-clay)"/>
  <g clip-path="url(#${id}-clip)" stroke="#F1D6A6" stroke-opacity=".55" stroke-width="2.2" fill="none">${straps}</g>
  <path d="${body}" fill="url(#${id}-shine)"/>
  <path d="M150,62 C150,62 150,300 150,300 M486,84 L486,276" stroke="#5A220C" stroke-opacity=".35" stroke-width="5" fill="none"/>
  <ellipse cx="96" cy="180" rx="24" ry="98" fill="#4A1C0A"/>
  <ellipse cx="96" cy="180" rx="19" ry="90" fill="url(#${id}-head)"/>
  <ellipse cx="96" cy="180" rx="9" ry="40" fill="#2B1A12"/>
  <ellipse cx="548" cy="180" rx="15" ry="64" fill="#4A1C0A"/>
  <ellipse cx="548" cy="180" rx="11" ry="57" fill="url(#${id}-head)"/>
  <ellipse cx="548" cy="180" rx="5" ry="22" fill="#2B1A12"/>`;
}

export const art = {
  /** Hero: the drum on a halo of petals. Decorative. */
  drum() {
    return `<svg class="art-drum" viewBox="0 0 640 420" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
  <g class="halo">
    <circle cx="322" cy="190" r="186" class="halo-ring"/>
    <circle cx="322" cy="190" r="150" class="halo-ring thin"/>
    ${petals(322, 190, 24, 150, 44, 9, 'halo-petal')}
    ${petals(322, 190, 12, 196, 22, 5, 'halo-petal small')}
  </g>
  <g transform="translate(0,10)">${drumBody('hd')}</g>
  <ellipse cx="322" cy="388" rx="220" ry="14" class="art-shadow"/>
</svg>`;
  },

  /** Labelled diagram: the two heads face on, with the rings named, and the body from the side. */
  anatomy(t) {
    const head = (cx, cy, rad, sy) => `
    <circle cx="${cx}" cy="${cy}" r="${rad}" class="a-rim"/>
    <circle cx="${cx}" cy="${cy}" r="${r(rad * 0.86)}" class="a-kinar"/>
    <circle cx="${cx}" cy="${cy}" r="${r(rad * 0.7)}" class="a-maidan"/>
    <circle cx="${cx}" cy="${cy}" r="${r(rad * sy)}" class="a-syahi"/>`;
    const label = (x, y, text, anchor = 'start') =>
      `<text x="${x}" y="${y}" text-anchor="${anchor}" class="a-label">${esc(text)}</text>`;
    const line = (x1, y1, x2, y2) => `<path d="M${x1},${y1} L${x2},${y2}" class="a-line"/>`;
    return `<svg class="art-anatomy" viewBox="0 0 720 560" role="img" aria-label="${esc(t.anatomyAlt)}" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(0,0)">
    ${head(170, 150, 112, 0.34)}
    ${head(500, 165, 74, 0.3)}
    ${line(170, 38, 300, 22)}${label(306, 27, t.gajara)}
    ${line(262, 108, 330, 72)}${label(336, 77, t.kinar)}
    ${line(232, 200, 330, 238)}${label(336, 243, t.maidan)}
    ${line(160, 142, 52, 64)}${label(14, 54, t.syahi)}
    ${label(170, 352, t.baya, 'middle')}
    ${label(500, 278, t.daya, 'middle')}
  </g>
  <g transform="translate(200,372) scale(.5)">
    ${drumBody('an')}
  </g>
  ${label(361, 548, t.anga, 'middle')}
</svg>`;
  },

  /** A flourish with a lotus in the middle, between sections. Decorative. */
  ornament() {
    return `<svg class="art-ornament" viewBox="0 0 240 28" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
  <path d="M8,14 C40,14 52,4 76,8 C92,11 96,18 106,14 M232,14 C200,14 188,4 164,8 C148,11 144,18 134,14" class="orn-line"/>
  <path d="M120,3 C127,9 127,19 120,25 C113,19 113,9 120,3 Z" class="orn-fill"/>
  <path d="M120,25 C110,23 104,15 105,8 C112,10 118,17 120,25 Z M120,25 C130,23 136,15 135,8 C128,10 122,17 120,25 Z" class="orn-fill soft"/>
  <circle cx="60" cy="14" r="2" class="orn-fill"/><circle cx="180" cy="14" r="2" class="orn-fill"/>
</svg>`;
  },

  /** The soft wave where a dark band meets a light one. `down` = the dark band is above. */
  wave() {
    return `<svg class="art-wave" viewBox="0 0 1440 64" preserveAspectRatio="none" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
  <path d="M0,0 L1440,0 L1440,22 C1200,64 960,64 720,40 C480,16 240,14 0,40 Z"/>
</svg>`;
  },

  /** Small emblem for the header: a drum on a lotus disc. Not a logo (the team has none yet). */
  emblem() {
    return `<svg class="art-emblem" viewBox="0 0 64 64" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
  ${petals(32, 32, 12, 18, 12, 4, 'emb-petal')}
  <circle cx="32" cy="32" r="18" class="emb-disc"/>
  <path d="M17,25 C24,21 38,21 46,25 L46,39 C38,43 24,43 17,39 Z" class="emb-drum"/>
  <ellipse cx="17" cy="32" rx="3" ry="7.5" class="emb-head"/><ellipse cx="46" cy="32" rx="2.2" ry="6" class="emb-head"/>
</svg>`;
  },
};
