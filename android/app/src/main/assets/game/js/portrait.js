/* ------------------------------------------------------------------
 * portrait.js — procedural champion art.
 *
 * No image files ship in the package, so every champion is drawn from
 * its `art` parameters: a helmet type, a body build, a weapon and an
 * accent colour. Figures are built from real anatomy blocks — boots,
 * legs, waist, chest, pauldrons, arms, helm — rather than a head and a
 * couple of sticks, which is what makes them read as armoured units at
 * thumbnail size.
 * ------------------------------------------------------------------ */

const Portrait = (() => {

  let uid = 0;

  function defs(id, accent) {
    return `
      <defs>
        <linearGradient id="pl${id}" x1=".2" y1="0" x2=".8" y2="1">
          <stop offset="0%" stop-color="#3a4864"/>
          <stop offset="45%" stop-color="#1e2840"/>
          <stop offset="100%" stop-color="#0a0f1c"/>
        </linearGradient>
        <linearGradient id="dk${id}" x1=".3" y1="0" x2=".7" y2="1">
          <stop offset="0%" stop-color="#222d45"/>
          <stop offset="100%" stop-color="#070c16"/>
        </linearGradient>
        <linearGradient id="ac${id}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${accent}"/>
          <stop offset="100%" stop-color="${accent}" stop-opacity=".25"/>
        </linearGradient>
        <radialGradient id="gl${id}" cx="50%" cy="45%">
          <stop offset="0%" stop-color="${accent}" stop-opacity=".55"/>
          <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
        </radialGradient>
      </defs>`;
  }

  /* ---------------- helmets ----------------
     Drawn into a 26 x 30 box centred on (60, 33) in figure space. */

  const HELMS = {
    visor: (a, id) => `
      <path d="M47 26 Q60 14 73 26 L73 44 Q60 52 47 44 Z" fill="url(#pl${id})" stroke="${a}" stroke-opacity=".55"/>
      <path d="M49 31 Q60 26 71 31 L71 36 Q60 41 49 36 Z" fill="url(#ac${id})"/>
      <path d="M49 31 L71 31" stroke="${a}" stroke-width="1.2" stroke-opacity=".9"/>
      <path d="M47 26 Q60 14 73 26" fill="none" stroke="${a}" stroke-width="1.6"/>`,

    helm: (a, id) => `
      <path d="M46 28 Q60 12 74 28 L74 46 Q60 54 46 46 Z" fill="url(#pl${id})" stroke="${a}" stroke-opacity=".5"/>
      <path d="M58 11 L62 11 L63 27 L57 27 Z" fill="${a}" opacity=".85"/>
      <rect x="50" y="32" width="20" height="4.5" rx="2" fill="${a}"/>
      <path d="M46 40 L74 40" stroke="${a}" stroke-opacity=".35"/>`,

    hood: (a, id) => `
      <path d="M44 48 Q42 20 60 15 Q78 20 76 48 Q68 54 60 54 Q52 54 44 48 Z"
            fill="url(#dk${id})" stroke="${a}" stroke-opacity=".45"/>
      <path d="M51 30 Q60 24 69 30 Q68 44 60 47 Q52 44 51 30 Z" fill="#04060d"/>
      <path d="M53 35 L58 36" stroke="${a}" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M62 36 L67 35" stroke="${a}" stroke-width="2.4" stroke-linecap="round"/>`,

    mask: (a, id) => `
      <path d="M47 27 Q60 16 73 27 L73 40 Q66 50 60 50 Q54 50 47 40 Z"
            fill="url(#pl${id})" stroke="${a}" stroke-opacity=".5"/>
      <path d="M50 30 L58 32.5 L58 36 L50 34 Z" fill="${a}"/>
      <path d="M70 30 L62 32.5 L62 36 L70 34 Z" fill="${a}"/>
      <path d="M55 41 L55 47 M60 42 L60 48 M65 41 L65 47"
            stroke="${a}" stroke-opacity=".75" stroke-width="1.6" stroke-linecap="round"/>
      <rect x="43" y="30" width="4" height="10" rx="2" fill="${a}" opacity=".55"/>
      <rect x="73" y="30" width="4" height="10" rx="2" fill="${a}" opacity=".55"/>`,

    crown: (a, id) => `
      <path d="M48 28 Q60 18 72 28 L72 45 Q60 53 48 45 Z" fill="url(#pl${id})" stroke="${a}" stroke-opacity=".45"/>
      <path d="M45 24 L51 12 L57 21 L60 8 L63 21 L69 12 L75 24" fill="none" stroke="${a}"
            stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M52 33 L57 34 M63 34 L68 33" stroke="${a}" stroke-width="2.2" stroke-linecap="round"/>`,

    core: (a, id) => `
      <path d="M60 14 L76 24 L76 42 L60 52 L44 42 L44 24 Z" fill="url(#pl${id})" stroke="${a}" stroke-opacity=".5"/>
      <circle cx="60" cy="33" r="7.5" fill="none" stroke="${a}" stroke-width="2"/>
      <circle cx="60" cy="33" r="3.2" fill="${a}"/>
      <path d="M60 14 L76 24" fill="none" stroke="${a}" stroke-width="1.6"/>`
  };

  /* ---------------- weapons, held rather than floating ---------------- */

  const WEAPONS = {
    rifle: (a, id) => `
      <g>
        <rect x="76" y="72" width="30" height="6" rx="2" transform="rotate(-24 86 76)"
              fill="url(#dk${id})" stroke="${a}" stroke-opacity=".6"/>
        <rect x="99" y="61" width="10" height="3" rx="1.5" transform="rotate(-24 104 62)" fill="${a}" opacity=".8"/>
        <rect x="79" y="78" width="6" height="9" rx="2" fill="url(#dk${id})" stroke="${a}" stroke-opacity=".5"/>
      </g>`,
    blade: (a, id) => `
      <g>
        <path d="M86 62 L92 66 L84 112 L78 108 Z" fill="url(#dk${id})" stroke="${a}" stroke-opacity=".75"/>
        <path d="M86 62 L92 66" stroke="${a}" stroke-width="2.2"/>
        <rect x="76" y="104" width="12" height="5" rx="2" transform="rotate(10 82 106)" fill="${a}" opacity=".6"/>
      </g>`,
    staff: (a, id) => `
      <g>
        <rect x="84" y="34" width="4.5" height="104" rx="2" fill="url(#dk${id})" stroke="${a}" stroke-opacity=".5"/>
        <circle cx="86" cy="32" r="9" fill="none" stroke="${a}" stroke-width="2.2"/>
        <circle cx="86" cy="32" r="4" fill="${a}"/>
      </g>`,
    cannon: (a, id) => `
      <g>
        <path d="M74 70 L104 78 L104 96 L74 100 Z" fill="url(#dk${id})" stroke="${a}" stroke-opacity=".6"/>
        <rect x="100" y="82" width="12" height="11" rx="3" fill="${a}" opacity=".55"/>
        <path d="M78 74 L78 96" stroke="${a}" stroke-opacity=".5"/>
      </g>`,
    claws: a => `
      <g stroke="${a}" stroke-width="3" stroke-linecap="round" fill="none">
        <path d="M82 86 L100 70"/><path d="M84 94 L104 84"/><path d="M84 102 L100 98"/>
      </g>`,
    none: () => ''
  };

  /* ---------------- the figure ---------------- */

  const BUILD = {
    lean:  { shoulder: 26, waist: 15, hip: 17, pauldron: 8,  legTop: 104, foot: 158 },
    heavy: { shoulder: 34, waist: 21, hip: 22, pauldron: 13, legTop: 100, foot: 156 },
    tall:  { shoulder: 27, waist: 15, hip: 18, pauldron: 9,  legTop: 108, foot: 162 }
  };

  /**
   * Standing figure for the arena and reveal cards. Feet sit on the
   * baseline so it can be planted on the ground plane.
   */
  function figure(hero, opts) {
    const o = opts || {};
    const id = 'f' + (uid++);
    const art = hero.art || {};
    const accent = art.accent || '#2af5ff';
    const helm = HELMS[art.frame] || HELMS.visor;
    const weapon = WEAPONS[art.weapon] || WEAPONS.none;
    const b = BUILD[art.build] || BUILD.lean;

    const cx = 60;
    const shoulderY = 56;
    const waistY = 96;
    const hipY = b.legTop;

    const cape = (art.frame === 'hood' || art.frame === 'crown') ? `
      <path d="M${cx - b.shoulder} ${shoulderY} Q${cx - b.shoulder - 9} ${hipY + 24} ${cx - b.hip - 5} ${b.foot - 6}
               L${cx + b.hip + 5} ${b.foot - 6} Q${cx + b.shoulder + 9} ${hipY + 24} ${cx + b.shoulder} ${shoulderY} Z"
            fill="url(#dk${id})" opacity=".85" stroke="${accent}" stroke-opacity=".3"/>` : '';

    return `
      <svg class="figure ${o.className || ''}" viewBox="0 0 120 170" preserveAspectRatio="xMidYMax meet">
        ${defs(id, accent)}
        <ellipse cx="${cx}" cy="${b.foot + 4}" rx="${b.shoulder + 6}" ry="5.5" fill="#000" opacity=".5"/>
        <circle cx="${cx}" cy="70" r="52" fill="url(#gl${id})" opacity=".3"/>
        ${cape}
        ${weapon(accent, id)}

        <!-- legs -->
        <path d="M${cx - b.hip} ${hipY} L${cx - b.hip - 2} ${b.foot} L${cx - 3} ${b.foot} L${cx - 4} ${hipY} Z"
              fill="url(#pl${id})" stroke="${accent}" stroke-opacity=".35"/>
        <path d="M${cx + b.hip} ${hipY} L${cx + b.hip + 2} ${b.foot} L${cx + 3} ${b.foot} L${cx + 4} ${hipY} Z"
              fill="url(#pl${id})" stroke="${accent}" stroke-opacity=".35"/>
        <rect x="${cx - b.hip - 4}" y="${b.foot - 7}" width="${b.hip + 3}" height="8" rx="2"
              fill="url(#dk${id})" stroke="${accent}" stroke-opacity=".4"/>
        <rect x="${cx + 1}" y="${b.foot - 7}" width="${b.hip + 3}" height="8" rx="2"
              fill="url(#dk${id})" stroke="${accent}" stroke-opacity=".4"/>

        <!-- torso -->
        <path d="M${cx - b.shoulder} ${shoulderY} L${cx + b.shoulder} ${shoulderY}
                 L${cx + b.waist} ${waistY} L${cx + b.hip} ${hipY}
                 L${cx - b.hip} ${hipY} L${cx - b.waist} ${waistY} Z"
              fill="url(#pl${id})" stroke="${accent}" stroke-opacity=".5"/>
        <path d="M${cx - b.waist + 2} ${waistY} L${cx + b.waist - 2} ${waistY}"
              stroke="${accent}" stroke-opacity=".45" stroke-width="2"/>
        <circle cx="${cx}" cy="${shoulderY + 18}" r="4.5" fill="${accent}" opacity=".9"/>
        <circle cx="${cx}" cy="${shoulderY + 18}" r="8" fill="none" stroke="${accent}" stroke-opacity=".4"/>

        <!-- arms -->
        <path d="M${cx - b.shoulder + 1} ${shoulderY + 4} L${cx - b.shoulder - 4} ${waistY + 4}
                 L${cx - b.shoulder + 4} ${waistY + 6} L${cx - b.shoulder + 8} ${shoulderY + 6} Z"
              fill="url(#dk${id})" stroke="${accent}" stroke-opacity=".35"/>
        <path d="M${cx + b.shoulder - 1} ${shoulderY + 4} L${cx + b.shoulder + 4} ${waistY + 4}
                 L${cx + b.shoulder - 4} ${waistY + 6} L${cx + b.shoulder - 8} ${shoulderY + 6} Z"
              fill="url(#dk${id})" stroke="${accent}" stroke-opacity=".35"/>

        <!-- pauldrons -->
        <path d="M${cx - b.shoulder - b.pauldron} ${shoulderY + 6}
                 Q${cx - b.shoulder - 2} ${shoulderY - 12} ${cx - b.shoulder + 8} ${shoulderY + 4} Z"
              fill="url(#pl${id})" stroke="${accent}" stroke-opacity=".6"/>
        <path d="M${cx + b.shoulder + b.pauldron} ${shoulderY + 6}
                 Q${cx + b.shoulder + 2} ${shoulderY - 12} ${cx + b.shoulder - 8} ${shoulderY + 4} Z"
              fill="url(#pl${id})" stroke="${accent}" stroke-opacity=".6"/>

        <!-- neck + helm -->
        <rect x="${cx - 5}" y="48" width="10" height="10" fill="url(#dk${id})"/>
        ${helm(accent, id)}
      </svg>`;
  }

  /**
   * Bust for cards and sheets: the same helm and pauldrons, framed close.
   */
  function bust(hero, opts) {
    const o = opts || {};
    const id = 'b' + (uid++);
    const art = hero.art || {};
    const accent = art.accent || '#2af5ff';
    const helm = HELMS[art.frame] || HELMS.visor;
    const b = BUILD[art.build] || BUILD.lean;

    return `
      <svg class="portrait ${o.className || ''}" viewBox="22 8 76 76" preserveAspectRatio="xMidYMid slice">
        ${defs(id, accent)}
        <rect x="0" y="0" width="120" height="120" fill="url(#gl${id})" opacity=".5"/>
        <path d="M${60 - b.shoulder - 6} 92 Q${60 - b.shoulder} 62 60 58 Q${60 + b.shoulder} 62 ${60 + b.shoulder + 6} 92 Z"
              fill="url(#pl${id})" stroke="${accent}" stroke-opacity=".45"/>
        <path d="M${60 - b.shoulder - b.pauldron} 70 Q${60 - b.shoulder - 2} 52 ${60 - b.shoulder + 8} 64 Z"
              fill="url(#pl${id})" stroke="${accent}" stroke-opacity=".6"/>
        <path d="M${60 + b.shoulder + b.pauldron} 70 Q${60 + b.shoulder + 2} 52 ${60 + b.shoulder - 8} 64 Z"
              fill="url(#pl${id})" stroke="${accent}" stroke-opacity=".6"/>
        <rect x="55" y="48" width="10" height="12" fill="url(#dk${id})"/>
        ${helm(accent, id)}
      </svg>`;
  }

  const accentOf = hero => (hero.art && hero.art.accent) || '#2af5ff';

  return { bust, figure, accentOf };
})();
