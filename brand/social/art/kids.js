// Hand-drawn picture-book artwork shared by the Children's Day post (childrens-day-template.html) and the
// picture-book reel frames (reel-template.html, themes "childrens" and "diwalibook"). Every helper returns an SVG string
// in 1080-wide page coordinates; wrap the result in <g filter="url(#rough)"> for the slight crayon wobble.
const K = { red: "#E8505B", orange: "#F29E38", yellow: "#F5C53A", green: "#3DB57E", blue: "#3A8FE0", purple: "#9566E0", pink: "#EE6FAE" };
const LET = [K.red, K.orange, K.green, K.blue, K.purple, K.pink];
// warm festival letters for Diwali: marigold, vermilion, magenta, gold
const LET_DIWALI = ["#E8505B", "#F29E38", "#C2417E", "#D99A1E", "#E2643A", "#9566E0"];
const kid = (s, pal = LET) => { let i = 0; // letters tilt and bob; each word stays on one line
  return s.split(" ").map((w) => `<span style="white-space:nowrap">${[...w].map((ch) => { const k = i++;
    return `<span style="color:${pal[k % pal.length]};transform:rotate(${[-6, 4, -3, 6, -4, 3][k % 6]}deg) translateY(${[0, -6, 3, -3, 5, -2][k % 6]}px)">${ch}</span>`; }).join("")}</span>`).join(" "); };
const fmt = (s) => (s || "").replace(/\*(.+?)\*/g, (_, w) => `<span class="kid">${kid(w)}</span>`).replace(/_(.+?)_/g, "<em>$1</em>");
const dark = (hex, k = .78) => { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.round(v * k);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
const INK = "#2B2238";

// ---------- a child, feet at (0,0), about 310 tall ----------
// o: skin, hair (short | braids | bun | patka), top, bottom, dress, ribbon, patka, bag, eyes (dot | happy), mouth (smile | open),
//    l / r: hand positions [x, y] relative to the feet.
const child = (x, y, s, o) => {
  const { skin, top } = o, hair = o.hairColor || "#2A1A14";
  const L = o.l || [-40, -112], R = o.r || [40, -112];
  let b = "";
  // braids hang behind the body
  if (o.hair === "braids") for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) b += `<ellipse cx="${sx * (44 + i * 2)}" cy="${-222 + i * 22}" rx="11" ry="13" fill="${hair}"/>`;
    b += `<path d="M${sx * 52} -146 l${sx * 16} -10 l0 22 Z M${sx * 52} -146 l${-sx * 14} -12 l2 22 Z" fill="${o.ribbon}"/><circle cx="${sx * 52}" cy="-146" r="5" fill="${dark(o.ribbon)}"/>`;
  }
  if (o.bag) b += `<rect x="-44" y="-188" width="88" height="86" rx="16" fill="${o.bag}"/>`;
  // legs and shoes
  const legTop = o.dress ? -78 : -100;
  b += `<rect x="-21" y="${legTop}" width="15" height="${-legTop - 8}" rx="7" fill="${o.trousers ? o.bottom : skin}"/>`
     + `<rect x="6" y="${legTop}" width="15" height="${-legTop - 8}" rx="7" fill="${o.trousers ? o.bottom : skin}"/>`;
  if (!o.dress && !o.trousers) b += `<path d="M-34 -104 L34 -104 L36 -66 L4 -66 L0 -80 L-4 -66 L-36 -66 Z" fill="${o.bottom}"/>`;
  if (o.socks) b += `<rect x="-21" y="-30" width="15" height="18" fill="#fff"/><rect x="6" y="-30" width="15" height="18" fill="#fff"/>`;
  b += `<path d="M-30 -2 Q-30 -16 -14 -16 Q-4 -16 -4 -6 L-4 0 L-30 0 Z" fill="${o.shoes || INK}"/><path d="M30 -2 Q30 -16 14 -16 Q4 -16 4 -6 L4 0 L30 0 Z" fill="${o.shoes || INK}"/>`;
  // body
  b += o.dress
    ? `<path d="M-30 -190 Q0 -198 30 -190 L58 -78 Q0 -66 -58 -78 Z" fill="${top}"/><path d="M-44 -100 Q0 -92 44 -100" stroke="#fff" stroke-opacity=".55" stroke-width="5" fill="none" stroke-dasharray="2 9" stroke-linecap="round"/>`
    : `<path d="M-31 -190 Q0 -198 31 -190 L37 -98 Q0 -92 -37 -98 Z" fill="${top}"/>`;
  b += `<path d="M-12 -192 L0 -176 L12 -192 Z" fill="#fff" opacity=".85"/>`;
  if (o.bag) b += `<path d="M-22 -190 L-26 -120 M22 -190 L26 -120" stroke="${dark(o.bag, .8)}" stroke-width="7" stroke-linecap="round"/>`;
  if (o.badge) b += `<circle cx="-16" cy="-156" r="7" fill="${o.badge}"/>`;
  // arms: sleeve then forearm, then the hand
  for (const [sx, H] of [[-1, L], [1, R]]) {
    const S = [sx * 28, -182], E = [(S[0] + H[0]) / 2 + sx * 12, (S[1] + H[1]) / 2 + 6];
    b += `<path d="M${S[0]} ${S[1]} Q${E[0]} ${E[1]} ${H[0]} ${H[1]}" stroke="${skin}" stroke-width="14" stroke-linecap="round" fill="none"/>`
       + `<path d="M${S[0]} ${S[1]} L${S[0] + (E[0] - S[0]) * .7} ${S[1] + (E[1] - S[1]) * .7}" stroke="${top}" stroke-width="21" stroke-linecap="round"/>`
       + `<circle cx="${H[0]}" cy="${H[1]}" r="9.5" fill="${skin}"/>`;
  }
  // head
  b += `<rect x="-8" y="-204" width="16" height="16" fill="${dark(skin, .9)}"/>`
     + `<circle cx="-45" cy="-240" r="9" fill="${skin}"/><circle cx="45" cy="-240" r="9" fill="${skin}"/>`
     + `<circle cx="0" cy="-244" r="46" fill="${skin}"/>`;
  // face
  b += o.eyes === "happy"
    ? `<path d="M-24 -244 q8 -9 15 0 M9 -244 q8 -9 15 0" stroke="${INK}" stroke-width="4" stroke-linecap="round" fill="none"/>`
    : `<ellipse cx="-16" cy="-245" rx="5" ry="6.5" fill="${INK}"/><ellipse cx="16" cy="-245" rx="5" ry="6.5" fill="${INK}"/><circle cx="-14" cy="-248" r="1.8" fill="#fff"/><circle cx="18" cy="-248" r="1.8" fill="#fff"/>`;
  b += `<circle cx="-28" cy="-226" r="8" fill="#F27A7A" opacity=".45"/><circle cx="28" cy="-226" r="8" fill="#F27A7A" opacity=".45"/>`;
  b += o.mouth === "open"
    ? `<path d="M-12 -227 Q0 -208 12 -227 Z" fill="#8E2F36"/><path d="M-6 -215 Q0 -212 6 -215" stroke="#F08C8C" stroke-width="3" fill="none"/>`
    : `<path d="M-10 -226 Q0 -216 10 -226" stroke="${INK}" stroke-width="3.6" stroke-linecap="round" fill="none"/>`;
  // hair
  const cap = `M-47 -236 C-52 -290 -22 -300 0 -299 C22 -300 52 -290 47 -236 Q42 -262 24 -267 Q12 -256 0 -269 Q-12 -256 -26 -267 Q-42 -262 -47 -236 Z`;
  if (o.hair === "patka") {
    b += `<path d="M-49 -232 C-56 -300 56 -300 49 -232 Q30 -256 0 -258 Q-30 -256 -49 -232 Z" fill="${o.patka}"/>`
       + `<circle cx="0" cy="-292" r="21" fill="${dark(o.patka, .88)}"/>`
       + `<path d="M-34 -262 Q0 -282 34 -262 M-40 -246 Q0 -270 40 -246" stroke="${dark(o.patka, .8)}" stroke-width="3" fill="none" opacity=".6"/>`;
  } else {
    if (o.hair === "bun") b += `<circle cx="0" cy="-300" r="20" fill="${hair}"/><rect x="-14" y="-286" width="28" height="7" rx="3.5" fill="${o.ribbon}"/>`;
    b += `<path d="${cap}" fill="${hair}"/>`;
    if (o.hair === "braids") b += `<path d="M0 -298 L0 -272" stroke="${dark(hair, 1.6)}" stroke-width="2"/>`;
    if (o.clip) b += `<path d="M24 -276 l12 -6 l0 12 Z M24 -276 l-10 -8 l0 14 Z" fill="${o.clip}"/>`;
  }
  const flip = o.flip ? " scale(-1 1)" : "";
  return `<g transform="translate(${x} ${y}) scale(${s})${flip}">${b}</g>`;
};
// world position of a hand, for strings
const hand = (x, y, s, h, flip) => [x + (flip ? -h[0] : h[0]) * s, y + h[1] * s];

const balloon = (x, y, r, c, [hx, hy]) => `<path d="M${x} ${y + r * 1.2 + 10} C ${x - 18} ${y + r * 2.4}, ${hx + 22} ${hy - 90}, ${hx} ${hy}" stroke="${INK}" stroke-opacity=".7" stroke-width="2" fill="none"/>
  <ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 1.2}" fill="${c}"/><path d="M${x - 8} ${y + r * 1.2 - 2} L${x + 8} ${y + r * 1.2 - 2} L${x} ${y + r * 1.2 + 11} Z" fill="${dark(c)}"/>
  <path d="M${x - r * .55} ${y - r * .45} Q${x - r * .5} ${y - r * .85} ${x - r * .15} ${y - r * .95}" stroke="#fff" stroke-opacity=".7" stroke-width="${r * .14}" stroke-linecap="round" fill="none"/>`;
const kite = (x, y, s, c1, c2, [hx, hy]) => `<path d="M${hx} ${hy} Q ${(hx + x) / 2 + 60} ${(hy + y) / 2 + 40} ${x} ${y + 70 * s}" stroke="${INK}" stroke-opacity=".6" stroke-width="2" fill="none"/>
  <g transform="translate(${x} ${y}) rotate(-12) scale(${s})">
    <path d="M0 -70 L52 0 L0 70 L-52 0 Z" fill="${c1}"/><path d="M0 -70 L52 0 L0 0 Z M0 70 L-52 0 L0 0 Z" fill="${c2}"/>
    <path d="M0 -70 L0 70 M-52 0 L52 0" stroke="${INK}" stroke-opacity=".35" stroke-width="2.5"/>
    <path d="M0 70 q-20 30 4 52 q22 22 -6 50 q-24 26 2 48" stroke="${INK}" stroke-opacity=".5" stroke-width="2" fill="none"/>
    <path d="M-4 118 l-14 -8 l2 16 Z M4 118 l14 -8 l-2 16 Z" fill="${K.red}"/><path d="M-2 166 l-14 -8 l2 16 Z M6 166 l14 -8 l-2 16 Z" fill="${K.yellow}"/>
  </g>`;
const cloud = (x, y, s) => `<path transform="translate(${x} ${y}) scale(${s})" d="M-70 20 Q-80 -8 -50 -12 Q-44 -44 -10 -38 Q10 -60 38 -38 Q72 -40 70 -6 Q92 4 76 22 Z" fill="#fff" stroke="#9BB7D6" stroke-width="2.5" stroke-linejoin="round"/>`;
const heart = (x, y, s, c, rot = 0) => `<path transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" d="M0 8 C -14 -2 -12 -14 -4 -14 C 0 -14 0 -10 0 -9 C 0 -10 0 -14 4 -14 C 12 -14 14 -2 0 8 Z" fill="${c}"/>`;
const doodleStar = (x, y, s, c, rot = 0) => `<path transform="translate(${x} ${y}) rotate(${rot}) scale(${s / 20})" d="M0 -20 L5.9 -8.1 L19 -6.2 L9.5 3.1 L11.8 16.2 L0 10 L-11.8 16.2 L-9.5 3.1 L-19 -6.2 L-5.9 -8.1 Z" fill="none" stroke="${c}" stroke-width="${3 * 20 / s}" stroke-linejoin="round"/>`;
const swirl = (x, y, c) => `<path transform="translate(${x} ${y})" d="M0 0 q10 -16 22 -4 q8 10 -4 14 q-10 2 -6 -8 q6 -14 26 -10 q14 4 26 -6" stroke="${c}" stroke-width="4" stroke-linecap="round" fill="none"/>`;
const bunting = (y0, sag) => {
  let s = `<path d="M-20 ${y0} Q 540 ${y0 + sag * 2} 1100 ${y0}" stroke="${INK}" stroke-opacity=".55" stroke-width="2.5" fill="none"/>`;
  const cols = [K.red, K.orange, K.yellow, K.green, K.blue, K.purple, K.pink];
  for (let i = 0; i < 13; i++) {
    const t = (i + .5) / 13, x = -20 + 1120 * t, y = y0 + 2 * t * (1 - t) * sag * 2;
    const t2 = (i + 1.3) / 13, x2 = -20 + 1120 * t2, y2 = y0 + 2 * t2 * (1 - t2) * sag * 2;
    const ang = Math.atan2(y2 - y, x2 - x) * 180 / Math.PI;
    s += `<g transform="translate(${x} ${y}) rotate(${ang})"><path d="M-30 0 L30 0 L0 64 Z" fill="${cols[i % cols.length]}"/><path d="M-20 6 L20 6 L0 48 Z" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2" stroke-dasharray="3 5"/></g>`;
  }
  return s;
};
const hill = (top, bottom = 1400) => `<path d="M-40 ${top + 40} Q 200 ${top - 30} 520 ${top + 6} Q 820 ${top + 40} 1120 ${top - 10} L1120 ${bottom} L-40 ${bottom} Z" fill="#7CC67A"/>
  <path d="M-40 ${top + 80} Q 260 ${top + 30} 560 ${top + 60} Q 860 ${top + 90} 1120 ${top + 50} L1120 ${bottom} L-40 ${bottom} Z" fill="#5DB16B"/>`;
const tufts = (pts) => pts.map(([x, y]) => `<path d="M${x - 10} ${y} q4 -14 6 -2 q3 -18 6 0 q3 -12 6 2" stroke="#3E9555" stroke-width="3" fill="none" stroke-linecap="round"/>`).join("");
const flower = (x, y, c) => `<g transform="translate(${x} ${y})"><path d="M0 0 L0 26" stroke="#3E9555" stroke-width="3"/>${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-8" rx="6" ry="9" fill="${c}" transform="rotate(${a})"/>`).join("")}<circle r="5" fill="${K.yellow}"/></g>`;
const sun = (x, y, r) => {
  let s = `<g transform="translate(${x} ${y})" stroke="${K.orange}" stroke-width="7" stroke-linecap="round" fill="none"><circle r="${r}" fill="${K.yellow}" stroke="${K.orange}"/>`;
  for (let i = 0; i < 11; i++) { const a = (i * 360 / 11 + 8) * Math.PI / 180, l = i % 2 ? 30 : 46;
    s += `<line x1="${Math.cos(a) * (r + 14)}" y1="${Math.sin(a) * (r + 14)}" x2="${Math.cos(a) * (r + l)}" y2="${Math.sin(a) * (r + l)}"/>`; }
  return s + `<path d="M${-r * .38} ${r * .18} Q 0 ${r * .6} ${r * .38} ${r * .18}" stroke="${INK}" stroke-width="5"/><path d="M${-r * .45} ${-r * .15} q8 -10 16 0 M${r * .45 - 16} ${-r * .15} q8 -10 16 0" stroke="${INK}" stroke-width="5"/>
    <circle cx="${-r * .55}" cy="${r * .2}" r="7" fill="#F27A7A" stroke="none" opacity=".6"/><circle cx="${r * .55}" cy="${r * .2}" r="7" fill="#F27A7A" stroke="none" opacity=".6"/></g>`;
};
const plane = (x, y, s, rot, trail) => `<path d="${trail}" stroke="${INK}" stroke-opacity=".45" stroke-width="3" stroke-dasharray="3 12" stroke-linecap="round" fill="none"/>
  <g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M0 0 L120 40 L30 52 Z" fill="#fff" stroke="${INK}" stroke-opacity=".5" stroke-width="2" stroke-linejoin="round"/><path d="M30 52 L120 40 L44 82 Z" fill="#E4E9F2" stroke="${INK}" stroke-opacity=".5" stroke-width="2" stroke-linejoin="round"/></g>`;
const jump = (x, y) => `<path d="M${x - 26} ${y + 10} l-10 8 M${x} ${y + 14} l0 12 M${x + 26} ${y + 10} l10 8" stroke="${INK}" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"/>`;

const SKIN = ["#C98B5E", "#A86A43", "#E2AE84", "#8E5634"];

// ---------- Diwali, in the same picture-book hand ----------
const MARIGOLD = ["#F29E38", "#F5C53A", "#E8703A"];
// a marigold flower, seen from the front
const marigold = (x, y, r, c) => {
  let s = `<g transform="translate(${x} ${y})">`;
  for (let i = 0; i < 10; i++) s += `<ellipse cx="0" cy="${-r * .55}" rx="${r * .32}" ry="${r * .5}" fill="${c}" transform="rotate(${i * 36})"/>`;
  return s + `<circle r="${r * .5}" fill="${dark(c, .88)}"/><circle r="${r * .22}" fill="${dark(c, .7)}"/></g>`;
};
const leaf = (x, y, s, rot) => `<path transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" d="M0 0 Q14 10 0 46 Q-14 10 0 0 Z" fill="#4E9C4A"/><path transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" d="M0 4 L0 40" stroke="#3B7D39" stroke-width="2"/>`;
// toran: a sagging string of marigolds across the top, with mango leaves and short hanging strands
const toran = (y0, sag) => {
  let s = `<path d="M-20 ${y0} Q 540 ${y0 + sag * 2} 1100 ${y0}" stroke="#7A4A2A" stroke-width="3" fill="none"/>`;
  const at = (t) => [-20 + 1120 * t, y0 + 2 * t * (1 - t) * sag * 2];
  for (let i = 0; i <= 26; i++) { const [x, y] = at(i / 26); s += marigold(x, y, 15, MARIGOLD[i % 3]); }
  for (let i = 0; i < 12; i++) {
    const [x, y] = at((i + .5) / 12);
    s += leaf(x, y + 8, 1, i % 2 ? 12 : -12);
    const n = 2 + (i % 2);
    for (let k = 1; k <= n; k++) s += marigold(x + (i % 2 ? 16 : -16), y + k * 24, 10, MARIGOLD[(i + k) % 3]);
  }
  return s;
};
// akash kandil: a paper star lantern on a string from the top, with tassels
const kandil = (x, y, s, c1, c2, top = 0) => `<path d="M${x} ${top} L${x} ${y - 64 * s}" stroke="#7A4A2A" stroke-width="2.5"/>
  <g transform="translate(${x} ${y}) scale(${s})">
    <path d="M0 -64 L22 -22 L64 0 L22 22 L0 64 L-22 22 L-64 0 L-22 -22 Z" fill="${c1}"/>
    <path d="M0 -64 L22 -22 L0 0 Z M64 0 L22 22 L0 0 Z M0 64 L-22 22 L0 0 Z M-64 0 L-22 -22 L0 0 Z" fill="${c2}"/>
    <circle r="16" fill="#FFE7A8"/><circle r="8" fill="#FFF6D8"/>
    <path d="M-22 22 L-30 96 M0 64 L0 112 M22 22 L30 96" stroke="${c1}" stroke-width="4" stroke-linecap="round"/>
    <path d="M-34 96 l8 22 l8 -22 Z M-6 112 l6 22 l6 -22 Z M26 96 l8 22 l8 -22 Z" fill="${c2}"/>
  </g>`;
// a clay diya with its flame and a soft warm glow
const diya = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})">
    <circle cx="0" cy="-26" r="46" fill="#FFC95C" opacity=".22"/><circle cx="0" cy="-26" r="26" fill="#FFD77A" opacity=".35"/>
    <path d="M0 -52 C 10 -36 12 -26 0 -14 C -12 -26 -10 -36 0 -52 Z" fill="#F29E38"/><path d="M0 -40 C 5 -32 5 -26 0 -18 C -5 -26 -5 -32 0 -40 Z" fill="#FFF1B8"/>
    <path d="M-36 -12 Q 0 -16 36 -12 Q 30 16 0 18 Q -30 16 -36 -12 Z" fill="#C8693A"/><path d="M-36 -12 Q 0 -16 36 -12 Q 0 -2 -36 -12 Z" fill="#F5C53A"/>
    <path d="M-22 4 Q 0 10 22 4" stroke="#F5C53A" stroke-width="2.5" fill="none"/>
  </g>`;
// a sparkler held at (hx, hy): the stick, then a burst of short sparks
const sparkler = (hx, hy, len = 70) => {
  const tx = hx + len * .35, ty = hy - len;
  let s = `<path d="M${hx} ${hy} L${tx} ${ty}" stroke="#7A6A60" stroke-width="3" stroke-linecap="round"/>`;
  for (let i = 0; i < 14; i++) { const a = i * 360 / 14 * Math.PI / 180, r1 = 8, r2 = i % 2 ? 26 : 38;
    s += `<path d="M${tx + Math.cos(a) * r1} ${ty + Math.sin(a) * r1} L${tx + Math.cos(a) * r2} ${ty + Math.sin(a) * r2}" stroke="${i % 3 ? "#F5C53A" : "#F29E38"}" stroke-width="3" stroke-linecap="round"/>`; }
  return s + `<circle cx="${tx}" cy="${ty}" r="7" fill="#FFF1B8"/>`;
};
// a hand-drawn firework: rays of dashes with a dot at each end
const burst = (x, y, r, c) => {
  let s = `<g transform="translate(${x} ${y})" stroke="${c}" stroke-width="4" stroke-linecap="round" fill="${c}">`;
  for (let i = 0; i < 12; i++) { const a = i * 30 * Math.PI / 180;
    s += `<path d="M${Math.cos(a) * r * .25} ${Math.sin(a) * r * .25} L${Math.cos(a) * r * .8} ${Math.sin(a) * r * .8}" stroke-dasharray="6 7"/><circle cx="${Math.cos(a) * r}" cy="${Math.sin(a) * r}" r="4" stroke="none"/>`; }
  return s + `</g>`;
};
// a rangoli on the floor, seen at an angle (squashed rings of petals)
const rangoli = (x, y, s) => {
  let g = `<g transform="translate(${x} ${y}) scale(${s} ${s * .42})">`;
  for (const [n, r, len, c] of [[12, 92, 22, "#C2417E"], [10, 66, 18, "#F29E38"], [8, 42, 14, "#3DB57E"], [6, 20, 10, "#F5C53A"]]) {
    for (let i = 0; i < n; i++) g += `<ellipse cx="0" cy="${-r}" rx="${len / 2.2}" ry="${len}" fill="${c}" transform="rotate(${(360 / n) * i})"/>`;
  }
  g += `<circle r="10" fill="#FFF9EC"/><circle r="112" fill="none" stroke="#FFF9EC" stroke-width="4" stroke-dasharray="4 10"/>`;
  return g + `</g>`;
};
// the courtyard floor: warm terracotta in two bands
const floor = (top, bottom = 1960) => `<path d="M-40 ${top + 20} Q 540 ${top - 26} 1120 ${top + 20} L1120 ${bottom} L-40 ${bottom} Z" fill="#E3A05B"/>
  <path d="M-40 ${top + 70} Q 540 ${top + 30} 1120 ${top + 70} L1120 ${bottom} L-40 ${bottom} Z" fill="#C9703F"/>
  <path d="M-40 ${top + 70} Q 540 ${top + 30} 1120 ${top + 70}" stroke="#F5C53A" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round" fill="none"/>`;
