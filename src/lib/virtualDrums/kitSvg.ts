// Ported verbatim (geometry unchanged) from the user's Claude Design project
// "Batería Virtual Interactiva" (Virtual Drums.dc.html) — the concert-stage
// SVG kit. Rendered via dangerouslySetInnerHTML so the original markup (and
// its data-hit delegation model) stays byte-for-byte faithful; only the
// {{ x }} template placeholders became real interpolation.

export type SceneDef = { name: string; wall: string; floor: string; spot: boolean }

export const SCENES: SceneDef[] = [
  { name: 'Dark Stage', wall: '#111426', floor: '#241a2e', spot: true },
  { name: 'Garage Room', wall: '#5a534d', floor: '#6e5138', spot: false },
  { name: 'Daylight Studio', wall: '#e7e3db', floor: '#b6ad9f', spot: false },
]

const CROWD = `
        <g transform="translate(60,0)"><g class="aud-fig" style="animation: crowdSway 3.1s ease-in-out infinite;"><line x1="-16" y1="664" x2="-32" y2="620" stroke="#454055" stroke-width="8" stroke-linecap="round"></line><circle cx="-32" cy="617" r="4.5" fill="#c69271"></circle><path d="M -23 700 Q -23 652 0 648 Q 23 652 23 700 Z" fill="#454055"></path><circle cx="0" cy="628" r="15" fill="#c69271"></circle><path d="M -15 628 A 15 15 0 0 1 15 628 Z" fill="#241f21"></path><circle cx="-5" cy="632" r="1.7" fill="rgba(20,16,18,0.75)"></circle><circle cx="5" cy="632" r="1.7" fill="rgba(20,16,18,0.75)"></circle></g></g>
        <g transform="translate(150,0)"><g class="aud-fig" style="animation: crowdSway 2.7s ease-in-out infinite; animation-delay: -1.1s;"><path d="M -20 700 Q -20 660 0 656 Q 20 660 20 700 Z" fill="#35424f"></path><circle cx="0" cy="638" r="13" fill="#a97c5e"></circle><path d="M -13 638 A 13 13 0 0 1 13 638 Z" fill="#4a332a"></path><circle cx="-4.5" cy="641" r="1.6" fill="rgba(20,16,18,0.75)"></circle><circle cx="4.5" cy="641" r="1.6" fill="rgba(20,16,18,0.75)"></circle></g></g>
        <g transform="translate(238,0)"><g class="aud-fig" style="animation: crowdSway 3.4s ease-in-out infinite; animation-delay: -0.6s;"><line x1="17" y1="662" x2="34" y2="612" stroke="#5c4038" stroke-width="8" stroke-linecap="round"></line><circle cx="34" cy="610" r="4.5" fill="#dcae8a"></circle><path d="M -24 700 Q -24 650 0 645 Q 24 650 24 700 Z" fill="#5c4038"></path><circle cx="0" cy="624" r="16" fill="#dcae8a"></circle><path d="M -16 624 A 16 16 0 0 1 16 624 Z" fill="#a3814f"></path><circle cx="-5.5" cy="628" r="1.8" fill="rgba(20,16,18,0.75)"></circle><circle cx="5.5" cy="628" r="1.8" fill="rgba(20,16,18,0.75)"></circle><circle class="aud-light" cx="36" cy="604" r="6" fill="#ffd98a" opacity="0.25"></circle></g></g>
        <g transform="translate(330,0)"><g class="aud-fig" style="animation: crowdSway 2.9s ease-in-out infinite; animation-delay: -1.8s;"><path d="M -21 700 Q -21 658 0 654 Q 21 658 21 700 Z" fill="#3d4a3f"></path><circle cx="0" cy="634" r="14" fill="#8d5f43"></circle><path d="M -14 634 A 14 14 0 0 1 14 634 Z" fill="#1d1a1c"></path><circle cx="-4.5" cy="637" r="1.6" fill="rgba(20,16,18,0.8)"></circle><circle cx="4.5" cy="637" r="1.6" fill="rgba(20,16,18,0.8)"></circle></g></g>
        <g transform="translate(425,0)"><g class="aud-fig" style="animation: crowdSway 3.3s ease-in-out infinite; animation-delay: -0.3s;"><line x1="-17" y1="664" x2="-35" y2="616" stroke="#564a36" stroke-width="8" stroke-linecap="round"></line><circle cx="-35" cy="614" r="4.5" fill="#c69271"></circle><path d="M -22 700 Q -22 654 0 650 Q 22 654 22 700 Z" fill="#564a36"></path><circle cx="0" cy="630" r="15" fill="#c69271"></circle><path d="M -15 630 A 15 15 0 0 1 15 630 Z" fill="#6e3a3a"></path><circle cx="0" cy="615" r="3.5" fill="#6e3a3a"></circle><circle cx="-5" cy="634" r="1.7" fill="rgba(20,16,18,0.75)"></circle><circle cx="5" cy="634" r="1.7" fill="rgba(20,16,18,0.75)"></circle></g></g>
        <g transform="translate(530,0)"><g class="aud-fig" style="animation: crowdSway 2.8s ease-in-out infinite; animation-delay: -2.2s;"><path d="M -19 700 Q -19 662 0 658 Q 19 662 19 700 Z" fill="#45364f"></path><circle cx="0" cy="640" r="13" fill="#b5875f"></circle><path d="M -13 640 A 13 13 0 0 1 13 640 Z" fill="#8e8d95"></path><circle cx="-4.5" cy="643" r="1.6" fill="rgba(20,16,18,0.75)"></circle><circle cx="4.5" cy="643" r="1.6" fill="rgba(20,16,18,0.75)"></circle></g></g>
        <g transform="translate(650,0)"><g class="aud-fig" style="animation: crowdSway 3.6s ease-in-out infinite; animation-delay: -1.4s;"><line x1="16" y1="662" x2="33" y2="614" stroke="#503a44" stroke-width="8" stroke-linecap="round"></line><circle cx="33" cy="612" r="4.5" fill="#dcae8a"></circle><path d="M -23 700 Q -23 651 0 647 Q 23 651 23 700 Z" fill="#503a44"></path><circle cx="0" cy="626" r="15" fill="#dcae8a"></circle><path d="M -15 626 A 15 15 0 0 1 15 626 Z" fill="#241f21"></path><circle cx="-5" cy="630" r="1.7" fill="rgba(20,16,18,0.75)"></circle><circle cx="5" cy="630" r="1.7" fill="rgba(20,16,18,0.75)"></circle></g></g>
        <g transform="translate(775,0)"><g class="aud-fig" style="animation: crowdSway 3.0s ease-in-out infinite; animation-delay: -0.9s;"><line x1="-14" y1="666" x2="-26" y2="632" stroke="#3a4456" stroke-width="8" stroke-linecap="round"></line><circle cx="-26" cy="630" r="4.5" fill="#a97c5e"></circle><path d="M -20 700 Q -20 659 0 655 Q 20 659 20 700 Z" fill="#3a4456"></path><circle cx="0" cy="636" r="14" fill="#a97c5e"></circle><path d="M -14 636 A 14 14 0 0 1 14 636 Z" fill="#4a332a"></path><circle cx="-4.5" cy="639" r="1.6" fill="rgba(20,16,18,0.75)"></circle><circle cx="4.5" cy="639" r="1.6" fill="rgba(20,16,18,0.75)"></circle><circle class="aud-light" cx="-26" cy="624" r="6" fill="#ffd98a" opacity="0.25"></circle></g></g>
        <g transform="translate(895,0)"><g class="aud-fig" style="animation: crowdSway 2.6s ease-in-out infinite; animation-delay: -1.7s;"><path d="M -22 700 Q -22 654 0 650 Q 22 654 22 700 Z" fill="#454055"></path><circle cx="0" cy="630" r="15" fill="#c69271"></circle><path d="M -15 630 A 15 15 0 0 1 15 630 Z" fill="#1d1a1c"></path><circle cx="-5" cy="634" r="1.7" fill="rgba(20,16,18,0.75)"></circle><circle cx="5" cy="634" r="1.7" fill="rgba(20,16,18,0.75)"></circle></g></g>
        <g transform="translate(1015,0)"><g class="aud-fig" style="animation: crowdSway 3.2s ease-in-out infinite; animation-delay: -0.4s;"><line x1="-17" y1="662" x2="-35" y2="612" stroke="#35424f" stroke-width="8" stroke-linecap="round"></line><circle cx="-35" cy="610" r="4.5" fill="#8d5f43"></circle><path d="M -24 700 Q -24 650 0 645 Q 24 650 24 700 Z" fill="#35424f"></path><circle cx="0" cy="625" r="16" fill="#8d5f43"></circle><path d="M -16 625 A 16 16 0 0 1 16 625 Z" fill="#241f21"></path><circle cx="-5.5" cy="629" r="1.8" fill="rgba(20,16,18,0.8)"></circle><circle cx="5.5" cy="629" r="1.8" fill="rgba(20,16,18,0.8)"></circle></g></g>
        <g transform="translate(1130,0)"><g class="aud-fig" style="animation: crowdSway 2.9s ease-in-out infinite; animation-delay: -2.0s;"><path d="M -19 700 Q -19 661 0 657 Q 19 661 19 700 Z" fill="#5c4038"></path><circle cx="0" cy="639" r="13" fill="#dcae8a"></circle><path d="M -13 639 A 13 13 0 0 1 13 639 Z" fill="#a3814f"></path><circle cx="-4.5" cy="642" r="1.6" fill="rgba(20,16,18,0.75)"></circle><circle cx="4.5" cy="642" r="1.6" fill="rgba(20,16,18,0.75)"></circle></g></g>
        <g transform="translate(1240,0)"><g class="aud-fig" style="animation: crowdSway 3.5s ease-in-out infinite; animation-delay: -1.2s;"><line x1="16" y1="663" x2="34" y2="615" stroke="#3d4a3f" stroke-width="8" stroke-linecap="round"></line><circle cx="34" cy="613" r="4.5" fill="#b5875f"></circle><path d="M -22 700 Q -22 653 0 649 Q 22 653 22 700 Z" fill="#3d4a3f"></path><circle cx="0" cy="628" r="15" fill="#b5875f"></circle><path d="M -15 628 A 15 15 0 0 1 15 628 Z" fill="#4a332a"></path><circle cx="-5" cy="632" r="1.7" fill="rgba(20,16,18,0.75)"></circle><circle cx="5" cy="632" r="1.7" fill="rgba(20,16,18,0.75)"></circle><circle class="aud-light" cx="36" cy="607" r="6" fill="#ffd98a" opacity="0.25"></circle></g></g>
        <g transform="translate(1350,0)"><g class="aud-fig" style="animation: crowdSway 2.8s ease-in-out infinite; animation-delay: -0.7s;"><path d="M -21 700 Q -21 658 0 654 Q 21 658 21 700 Z" fill="#564a36"></path><circle cx="0" cy="634" r="14" fill="#a97c5e"></circle><path d="M -14 634 A 14 14 0 0 1 14 634 Z" fill="#3b5a7a"></path><circle cx="0" cy="620" r="3.5" fill="#3b5a7a"></circle><circle cx="-4.5" cy="637" r="1.6" fill="rgba(20,16,18,0.75)"></circle><circle cx="4.5" cy="637" r="1.6" fill="rgba(20,16,18,0.75)"></circle></g></g>
        <g transform="translate(1455,0)"><g class="aud-fig" style="animation: crowdSway 3.1s ease-in-out infinite; animation-delay: -1.6s;"><line x1="-16" y1="664" x2="-33" y2="618" stroke="#45364f" stroke-width="8" stroke-linecap="round"></line><circle cx="-33" cy="616" r="4.5" fill="#c69271"></circle><path d="M -22 700 Q -22 654 0 650 Q 22 654 22 700 Z" fill="#45364f"></path><circle cx="0" cy="629" r="15" fill="#c69271"></circle><path d="M -15 629 A 15 15 0 0 1 15 629 Z" fill="#8e8d95"></path><circle cx="-5" cy="633" r="1.7" fill="rgba(20,16,18,0.75)"></circle><circle cx="5" cy="633" r="1.7" fill="rgba(20,16,18,0.75)"></circle></g></g>
        <g transform="translate(1548,0)"><g class="aud-fig" style="animation: crowdSway 2.7s ease-in-out infinite; animation-delay: -2.3s;"><path d="M -19 700 Q -19 660 0 656 Q 19 660 19 700 Z" fill="#503a44"></path><circle cx="0" cy="637" r="13" fill="#dcae8a"></circle><path d="M -13 637 A 13 13 0 0 1 13 637 Z" fill="#241f21"></path><circle cx="-4.5" cy="640" r="1.6" fill="rgba(20,16,18,0.75)"></circle><circle cx="4.5" cy="640" r="1.6" fill="rgba(20,16,18,0.75)"></circle></g></g>`

const KEY_LABELS = `
        <g pointer-events="none" font-family="Helvetica, sans-serif">
          <g><rect x="758" y="636" width="84" height="30" rx="8" fill="rgba(10,12,16,0.78)"></rect><text x="800" y="656" text-anchor="middle" font-size="16" font-weight="600" fill="#ffffff">Z / V</text></g>
          <g><rect x="465" y="538" width="160" height="30" rx="8" fill="rgba(10,12,16,0.78)"></rect><text x="545" y="558" text-anchor="middle" font-size="15" font-weight="600" fill="#ffffff">X / C · G rim</text></g>
          <g><rect x="202" y="428" width="180" height="30" rx="8" fill="rgba(10,12,16,0.78)"></rect><text x="292" y="448" text-anchor="middle" font-size="15" font-weight="600" fill="#ffffff">S closed · D open</text></g>
          <g><rect x="234" y="608" width="116" height="30" rx="8" fill="rgba(10,12,16,0.78)"></rect><text x="292" y="628" text-anchor="middle" font-size="15" font-weight="600" fill="#ffffff">Alt / Caps</text></g>
          <g><rect x="664" y="268" width="48" height="30" rx="8" fill="rgba(10,12,16,0.78)"></rect><text x="688" y="288" text-anchor="middle" font-size="16" font-weight="600" fill="#ffffff">Q</text></g>
          <g><rect x="884" y="268" width="48" height="30" rx="8" fill="rgba(10,12,16,0.78)"></rect><text x="908" y="288" text-anchor="middle" font-size="16" font-weight="600" fill="#ffffff">W</text></g>
          <g><rect x="1106" y="446" width="48" height="30" rx="8" fill="rgba(10,12,16,0.78)"></rect><text x="1130" y="466" text-anchor="middle" font-size="16" font-weight="600" fill="#ffffff">E</text></g>
          <g><rect x="416" y="244" width="72" height="30" rx="8" fill="rgba(10,12,16,0.78)"></rect><text x="452" y="264" text-anchor="middle" font-size="15" font-weight="600" fill="#ffffff">1 / R</text></g>
          <g><rect x="1135" y="282" width="160" height="30" rx="8" fill="rgba(10,12,16,0.78)"></rect><text x="1215" y="302" text-anchor="middle" font-size="15" font-weight="600" fill="#ffffff">2 / T · 3 bell</text></g>
        </g>`

export function buildKitSvg(opts: {
  kit: 'acoustic' | 'electronic'
  scene: SceneDef
  showLabels: boolean
  fit?: 'meet' | 'slice'
  /**
   * Drop the set dressing — truss, spotlights, crowd, backline amps — and keep
   * the kit on a plain backdrop. For the Drum Tab Player's stage band, which is
   * a few hundred pixels tall: at that size the crowd is a row of smudges and
   * the light beams cross the whole strip.
   */
  bare?: boolean
  /**
   * SVG user-unit crop, default the full `0 0 1600 900` scene. A wide, short
   * band wants something like `-620 140 2840 650`, so the kit stays its natural
   * size and the backdrop fills the extra width instead of letterboxing.
   * Only meaningful together with `bare`, which is what widens the backdrop.
   */
  viewBox?: string
}): string {
  const ac = opts.kit === 'acoustic'
  const shellFill = ac ? 'url(#shellAc)' : 'url(#shellEl)'
  const headFill = ac ? 'url(#headAc)' : 'url(#headEl)'
  const cymFill = ac ? 'url(#cymAc)' : 'url(#cymEl)'
  const bellFill = ac ? 'url(#bellAc)' : 'url(#bellEl)'
  const rim = ac ? 'url(#chrome)' : '#3fd8df'
  const logoColor = ac ? 'rgba(60,40,20,0.22)' : 'rgba(63,216,223,0.3)'
  const { wall: wallColor, floor: floorColor, spot } = opts.scene

  const fit = opts.fit === 'slice' ? 'slice' : 'meet'
  const viewBox = opts.viewBox ?? '0 0 1600 900'
  const bare = opts.bare === true

  // The bare backdrop runs well past the scene's own 1600 units so a widened
  // `viewBox` still lands on painted ground instead of transparent gutters.
  const backdrop = bare
    ? `<rect x="-2400" y="-600" width="6400" height="1300" fill="${wallColor}"></rect>
      <rect x="-2400" y="700" width="6400" height="800" fill="${floorColor}"></rect>
      <rect x="-2400" y="-600" width="6400" height="1300" fill="url(#wallShade)"></rect>
      <rect x="-2400" y="700" width="6400" height="800" fill="url(#floorShade)"></rect>`
    : `<rect x="0" y="0" width="1600" height="700" fill="${wallColor}"></rect>
      <rect x="0" y="700" width="1600" height="200" fill="${floorColor}"></rect>
      <rect x="0" y="0" width="1600" height="700" fill="url(#wallShade)"></rect>
      <rect x="0" y="700" width="1600" height="200" fill="url(#floorShade)"></rect>`

  return `<svg viewBox="${viewBox}" preserveAspectRatio="xMidYMid ${fit}" style="width: 100%; height: 100%; cursor: pointer; touch-action: none; display: block;">
      <defs>
        <linearGradient id="shellAc" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#2e1206"></stop>
          <stop offset="0.16" stop-color="#7a3a12"></stop>
          <stop offset="0.5" stop-color="#d08c38"></stop>
          <stop offset="0.84" stop-color="#7a3a12"></stop>
          <stop offset="1" stop-color="#2e1206"></stop>
        </linearGradient>
        <linearGradient id="shellEl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#3d434f"></stop>
          <stop offset="0.45" stop-color="#23262e"></stop>
          <stop offset="1" stop-color="#14161c"></stop>
        </linearGradient>
        <radialGradient id="headAc" cx="0.4" cy="0.35" r="0.85">
          <stop offset="0" stop-color="#f9f2e4"></stop>
          <stop offset="0.7" stop-color="#ecdfc6"></stop>
          <stop offset="1" stop-color="#d7c5a4"></stop>
        </radialGradient>
        <radialGradient id="headEl" cx="0.4" cy="0.35" r="0.85">
          <stop offset="0" stop-color="#3b4049"></stop>
          <stop offset="0.7" stop-color="#282c33"></stop>
          <stop offset="1" stop-color="#1a1d22"></stop>
        </radialGradient>
        <radialGradient id="cymAc" cx="0.42" cy="0.38" r="0.9">
          <stop offset="0" stop-color="#f8e3a0"></stop>
          <stop offset="0.35" stop-color="#e6b955"></stop>
          <stop offset="0.72" stop-color="#c68f35"></stop>
          <stop offset="1" stop-color="#8a6120"></stop>
        </radialGradient>
        <radialGradient id="bellAc" cx="0.45" cy="0.4" r="0.9">
          <stop offset="0" stop-color="#ffeeb8"></stop>
          <stop offset="1" stop-color="#c8993c"></stop>
        </radialGradient>
        <radialGradient id="cymEl" cx="0.42" cy="0.38" r="0.9">
          <stop offset="0" stop-color="#7b8492"></stop>
          <stop offset="0.55" stop-color="#4b515c"></stop>
          <stop offset="1" stop-color="#31353d"></stop>
        </radialGradient>
        <radialGradient id="bellEl" cx="0.45" cy="0.4" r="0.9">
          <stop offset="0" stop-color="#8fe8ee"></stop>
          <stop offset="1" stop-color="#2a9aa3"></stop>
        </radialGradient>
        <linearGradient id="chrome" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#f0f2f6"></stop>
          <stop offset="0.35" stop-color="#b7bcc6"></stop>
          <stop offset="0.65" stop-color="#878d99"></stop>
          <stop offset="1" stop-color="#d5d9e0"></stop>
        </linearGradient>
        <linearGradient id="chromeH" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#f0f2f6"></stop>
          <stop offset="0.35" stop-color="#b7bcc6"></stop>
          <stop offset="0.65" stop-color="#878d99"></stop>
          <stop offset="1" stop-color="#d5d9e0"></stop>
        </linearGradient>
        <linearGradient id="wallShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="rgba(0,0,0,0.4)"></stop>
          <stop offset="0.55" stop-color="rgba(0,0,0,0)"></stop>
          <stop offset="1" stop-color="rgba(0,0,0,0.25)"></stop>
        </linearGradient>
        <linearGradient id="floorShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="rgba(255,255,255,0.08)"></stop>
          <stop offset="1" stop-color="rgba(0,0,0,0.45)"></stop>
        </linearGradient>
        <radialGradient id="spot" cx="0.5" cy="0.15" r="0.75">
          <stop offset="0" stop-color="rgba(255,244,214,0.22)"></stop>
          <stop offset="1" stop-color="rgba(255,244,214,0)"></stop>
        </radialGradient>
        <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="8"></feGaussianBlur>
        </filter>
        <filter id="soft2" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3"></feGaussianBlur>
        </filter>
        <linearGradient id="nickel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#767b88"></stop>
          <stop offset="0.4" stop-color="#3a3e48"></stop>
          <stop offset="0.75" stop-color="#22252d"></stop>
          <stop offset="1" stop-color="#4a4f5a"></stop>
        </linearGradient>
        <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="rgba(255,236,190,0.30)"></stop>
          <stop offset="1" stop-color="rgba(255,236,190,0)"></stop>
        </linearGradient>
        <radialGradient id="lampGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stop-color="rgba(255,220,150,0.9)"></stop>
          <stop offset="1" stop-color="rgba(255,220,150,0)"></stop>
        </radialGradient>
        <linearGradient id="crowdGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="rgba(130,145,200,0)"></stop>
          <stop offset="1" stop-color="rgba(130,145,200,0.16)"></stop>
        </linearGradient>
      </defs>

      ${backdrop}
      ${bare ? '' : `<g pointer-events="none" opacity="0.5">
        <rect x="0" y="24" width="1600" height="9" fill="#0a0b0f"></rect>
        <rect x="0" y="76" width="1600" height="9" fill="#0a0b0f"></rect>
        <path d="M 0 33 L 60 76 L 120 33 L 180 76 L 240 33 L 300 76 L 360 33 L 420 76 L 480 33 L 540 76 L 600 33 L 660 76 L 720 33 L 780 76 L 840 33 L 900 76 L 960 33 L 1020 76 L 1080 33 L 1140 76 L 1200 33 L 1260 76 L 1320 33 L 1380 76 L 1440 33 L 1500 76 L 1560 33 L 1600 62" stroke="#0a0b0f" stroke-width="6" fill="none"></path>
      </g>
      ${spot ? `<g pointer-events="none">
          <polygon points="472,100 528,100 920,760 400,760" fill="url(#beam)"></polygon>
          <polygon points="1072,100 1128,100 1200,760 690,760" fill="url(#beam)"></polygon>
          <rect x="478" y="66" width="44" height="34" rx="7" fill="#15161c" stroke="#25272f" stroke-width="2"></rect>
          <rect x="1078" y="66" width="44" height="34" rx="7" fill="#15161c" stroke="#25272f" stroke-width="2"></rect>
          <ellipse cx="500" cy="102" rx="42" ry="22" fill="url(#lampGlow)"></ellipse>
          <ellipse cx="1100" cy="102" rx="42" ry="22" fill="url(#lampGlow)"></ellipse>
          <polygon points="560,0 1040,0 1320,760 280,760" fill="url(#spot)"></polygon>
        </g>` : ''}
      <g id="crowd" pointer-events="none">
        <rect x="0" y="560" width="1600" height="140" fill="url(#crowdGlow)"></rect>${CROWD}
      </g>
      <g pointer-events="none" opacity="0.9">
        <rect x="28" y="462" width="176" height="238" rx="10" fill="#101116" stroke="#1e2028" stroke-width="2"></rect>
        <rect x="46" y="482" width="140" height="126" rx="8" fill="#07080b"></rect>
        <circle cx="116" cy="545" r="44" fill="#0d0e13" stroke="#23252f" stroke-width="3"></circle>
        <circle cx="116" cy="545" r="15" fill="#1a1c24"></circle>
        <rect x="46" y="622" width="140" height="56" rx="6" fill="#07080b"></rect>
        <rect x="1396" y="462" width="176" height="238" rx="10" fill="#101116" stroke="#1e2028" stroke-width="2"></rect>
        <rect x="1414" y="482" width="140" height="126" rx="8" fill="#07080b"></rect>
        <circle cx="1484" cy="545" r="44" fill="#0d0e13" stroke="#23252f" stroke-width="3"></circle>
        <circle cx="1484" cy="545" r="15" fill="#1a1c24"></circle>
        <rect x="1414" y="622" width="140" height="56" rx="6" fill="#07080b"></rect>
      </g>`}

      <ellipse cx="800" cy="748" rx="195" ry="20" fill="rgba(0,0,0,0.35)" filter="url(#soft)" pointer-events="none"></ellipse>
      <ellipse cx="545" cy="750" rx="105" ry="14" fill="rgba(0,0,0,0.3)" filter="url(#soft)" pointer-events="none"></ellipse>
      <ellipse cx="1130" cy="730" rx="130" ry="16" fill="rgba(0,0,0,0.3)" filter="url(#soft)" pointer-events="none"></ellipse>
      <ellipse cx="292" cy="758" rx="80" ry="11" fill="rgba(0,0,0,0.3)" filter="url(#soft)" pointer-events="none"></ellipse>

      <line x1="452" y1="225" x2="424" y2="740" stroke="url(#chrome)" stroke-width="6"></line>
      <line x1="424" y1="740" x2="388" y2="756" stroke="url(#chrome)" stroke-width="5"></line>
      <line x1="424" y1="740" x2="460" y2="756" stroke="url(#chrome)" stroke-width="5"></line>
      <line x1="1215" y1="248" x2="1254" y2="740" stroke="url(#chrome)" stroke-width="6"></line>
      <line x1="1254" y1="740" x2="1218" y2="756" stroke="url(#chrome)" stroke-width="5"></line>
      <line x1="1254" y1="740" x2="1290" y2="756" stroke="url(#chrome)" stroke-width="5"></line>
      <rect x="288" y="348" width="8" height="394" fill="url(#chromeH)" stroke="rgba(0,0,0,0.25)" stroke-width="0.8"></rect>
      <rect x="284" y="356" width="16" height="18" rx="4" fill="url(#chromeH)" stroke="rgba(0,0,0,0.25)" stroke-width="0.8"></rect>
      <circle cx="292" cy="352" r="6" fill="url(#chromeH)"></circle>
      <rect x="285" y="440" width="14" height="10" rx="3" fill="url(#chromeH)"></rect>
      <line x1="292" y1="672" x2="250" y2="750" stroke="url(#chrome)" stroke-width="4"></line>
      <line x1="292" y1="672" x2="334" y2="750" stroke="url(#chrome)" stroke-width="4"></line>
      <rect x="542" y="522" width="7" height="90" fill="url(#chromeH)" stroke="rgba(0,0,0,0.25)" stroke-width="0.8"></rect>
      <line x1="545" y1="612" x2="499" y2="748" stroke="url(#chrome)" stroke-width="4"></line>
      <line x1="545" y1="612" x2="591" y2="748" stroke="url(#chrome)" stroke-width="4"></line>

      <g id="an-kick" style="transform-box: fill-box; transform-origin: center;" data-hit="kick">
        <line x1="662" y1="660" x2="606" y2="742" stroke="url(#chrome)" stroke-width="8"></line>
        <line x1="938" y1="660" x2="994" y2="742" stroke="url(#chrome)" stroke-width="8"></line>
        <circle cx="800" cy="575" r="170" fill="${shellFill}"></circle>
        <circle cx="800" cy="575" r="170" fill="none" stroke="rgba(0,0,0,0.4)" stroke-width="3"></circle>
        <circle cx="800" cy="575" r="157" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2" pointer-events="none"></circle>
        <circle cx="800" cy="575" r="146" fill="${headFill}"></circle>
        <circle cx="800" cy="575" r="127" fill="none" stroke="rgba(0,0,0,0.07)" stroke-width="3" pointer-events="none"></circle>
        <ellipse cx="742" cy="498" rx="62" ry="36" fill="rgba(255,255,255,0.3)" filter="url(#soft)" pointer-events="none"></ellipse>
        <circle cx="800" cy="575" r="146" fill="none" stroke="${rim}" stroke-width="5"></circle>
        <circle cx="958" cy="575" r="7" fill="url(#chrome)"></circle>
        <circle cx="912" cy="463" r="7" fill="url(#chrome)"></circle>
        <circle cx="800" cy="417" r="7" fill="url(#chrome)"></circle>
        <circle cx="688" cy="463" r="7" fill="url(#chrome)"></circle>
        <circle cx="642" cy="575" r="7" fill="url(#chrome)"></circle>
        <circle cx="688" cy="687" r="7" fill="url(#chrome)"></circle>
        <circle cx="800" cy="733" r="7" fill="url(#chrome)"></circle>
        <circle cx="912" cy="687" r="7" fill="url(#chrome)"></circle>
        <text x="800" y="590" text-anchor="middle" font-size="44" font-weight="700" font-family="Helvetica, sans-serif" fill="${logoColor}" pointer-events="none">VD</text>
        <circle id="fl-kick" cx="800" cy="575" r="146" fill="#ffffff" opacity="0" pointer-events="none"></circle>
      </g>
      <g data-hit="kick">
        <polygon points="786,700 814,700 826,756 774,756" fill="#2c2f36" stroke="#4a4e58" stroke-width="2"></polygon>
        <rect x="770" y="752" width="60" height="10" rx="4" fill="#191b21"></rect>
        <line x1="800" y1="700" x2="800" y2="672" stroke="url(#chromeH)" stroke-width="4"></line>
        <circle cx="800" cy="668" r="9" fill="#d8d4c8" stroke="rgba(0,0,0,0.3)" stroke-width="1.5"></circle>
      </g>

      <line x1="700" y1="390" x2="752" y2="462" stroke="url(#chrome)" stroke-width="6"></line>
      <line x1="896" y1="392" x2="850" y2="462" stroke="url(#chrome)" stroke-width="6"></line>

      <g id="an-tomhi" style="transform-box: fill-box; transform-origin: center;" data-hit="tom-hi">
        <path d="M 606 330 A 82 26 0 0 0 770 330 L 770 388 A 82 26 0 0 1 606 388 Z" fill="${shellFill}"></path>
        <rect x="614" y="348" width="10" height="22" rx="3" fill="url(#chrome)"></rect>
        <rect x="683" y="356" width="10" height="22" rx="3" fill="url(#chrome)"></rect>
        <rect x="752" y="348" width="10" height="22" rx="3" fill="url(#chrome)"></rect>
        <path d="M 612 344 Q 688 370 764 344 L 764 351 Q 688 378 612 351 Z" fill="rgba(255,255,255,0.14)" pointer-events="none"></path>
        <ellipse cx="688" cy="330" rx="82" ry="26" fill="${headFill}"></ellipse>
        <ellipse cx="688" cy="330" rx="68" ry="20" fill="none" stroke="rgba(0,0,0,0.07)" stroke-width="2.5" pointer-events="none"></ellipse>
        <ellipse cx="664" cy="322" rx="30" ry="9" fill="rgba(255,255,255,0.35)" filter="url(#soft2)" pointer-events="none"></ellipse>
        <ellipse cx="688" cy="330" rx="82" ry="26" fill="none" stroke="${rim}" stroke-width="5"></ellipse>
        <ellipse id="fl-tomhi" cx="688" cy="330" rx="82" ry="26" fill="#ffffff" opacity="0" pointer-events="none"></ellipse>
      </g>

      <g id="an-tomlo" style="transform-box: fill-box; transform-origin: center;" data-hit="tom-lo">
        <path d="M 820 330 A 88 28 0 0 0 996 330 L 996 394 A 88 28 0 0 1 820 394 Z" fill="${shellFill}"></path>
        <rect x="828" y="350" width="10" height="24" rx="3" fill="url(#chrome)"></rect>
        <rect x="903" y="358" width="10" height="24" rx="3" fill="url(#chrome)"></rect>
        <rect x="978" y="350" width="10" height="24" rx="3" fill="url(#chrome)"></rect>
        <path d="M 826 345 Q 908 373 990 345 L 990 352 Q 908 381 826 352 Z" fill="rgba(255,255,255,0.14)" pointer-events="none"></path>
        <ellipse cx="908" cy="330" rx="88" ry="28" fill="${headFill}"></ellipse>
        <ellipse cx="908" cy="330" rx="73" ry="22" fill="none" stroke="rgba(0,0,0,0.07)" stroke-width="2.5" pointer-events="none"></ellipse>
        <ellipse cx="882" cy="321" rx="32" ry="10" fill="rgba(255,255,255,0.35)" filter="url(#soft2)" pointer-events="none"></ellipse>
        <ellipse cx="908" cy="330" rx="88" ry="28" fill="none" stroke="${rim}" stroke-width="5"></ellipse>
        <ellipse id="fl-tomlo" cx="908" cy="330" rx="88" ry="28" fill="#ffffff" opacity="0" pointer-events="none"></ellipse>
      </g>

      <g id="an-tomfloor" style="transform-box: fill-box; transform-origin: center;" data-hit="tom-floor">
        <line x1="1042" y1="596" x2="1028" y2="726" stroke="url(#chrome)" stroke-width="6"></line>
        <line x1="1218" y1="596" x2="1232" y2="726" stroke="url(#chrome)" stroke-width="6"></line>
        <path d="M 1025 505 A 105 32 0 0 0 1235 505 L 1235 610 A 105 32 0 0 1 1025 610 Z" fill="${shellFill}"></path>
        <rect x="1038" y="535" width="11" height="42" rx="3" fill="url(#chrome)"></rect>
        <rect x="1124" y="548" width="11" height="42" rx="3" fill="url(#chrome)"></rect>
        <rect x="1210" y="535" width="11" height="42" rx="3" fill="url(#chrome)"></rect>
        <path d="M 1032 523 Q 1130 556 1228 523 L 1228 532 Q 1130 566 1032 532 Z" fill="rgba(255,255,255,0.14)" pointer-events="none"></path>
        <ellipse cx="1130" cy="505" rx="105" ry="32" fill="${headFill}"></ellipse>
        <ellipse cx="1130" cy="505" rx="88" ry="25" fill="none" stroke="rgba(0,0,0,0.07)" stroke-width="3" pointer-events="none"></ellipse>
        <ellipse cx="1098" cy="494" rx="38" ry="12" fill="rgba(255,255,255,0.35)" filter="url(#soft2)" pointer-events="none"></ellipse>
        <ellipse cx="1130" cy="505" rx="105" ry="32" fill="none" stroke="${rim}" stroke-width="5"></ellipse>
        <ellipse id="fl-tomfloor" cx="1130" cy="505" rx="105" ry="32" fill="#ffffff" opacity="0" pointer-events="none"></ellipse>
      </g>

      <g id="an-snare" style="transform-box: fill-box; transform-origin: center;">
        <path d="M 445 470 A 100 30 0 0 0 645 470 L 645 520 A 100 30 0 0 1 445 520 Z" fill="url(#nickel)" data-hit="stick"></path>
        <path d="M 452 486 Q 545 518 638 486 L 638 492 Q 545 525 452 492 Z" fill="rgba(255,255,255,0.12)" pointer-events="none"></path>
        <rect x="456" y="480" width="9" height="30" rx="3" fill="#5c626e" data-hit="stick"></rect>
        <rect x="540" y="492" width="9" height="30" rx="3" fill="#5c626e" data-hit="stick"></rect>
        <rect x="624" y="480" width="9" height="30" rx="3" fill="#5c626e" data-hit="stick"></rect>
        <ellipse cx="545" cy="470" rx="100" ry="30" fill="${headFill}" data-hit="snare"></ellipse>
        <ellipse cx="545" cy="470" rx="84" ry="23.5" fill="none" stroke="rgba(0,0,0,0.07)" stroke-width="2.5" pointer-events="none"></ellipse>
        <ellipse cx="514" cy="460" rx="36" ry="11" fill="rgba(255,255,255,0.4)" filter="url(#soft2)" pointer-events="none"></ellipse>
        <ellipse cx="545" cy="470" rx="100" ry="30" fill="none" stroke="${rim}" stroke-width="7" data-hit="stick"></ellipse>
        <ellipse cx="545" cy="470" rx="100" ry="30" fill="none" stroke="transparent" stroke-width="28" data-hit="stick"></ellipse>
        <ellipse id="fl-snare" cx="545" cy="470" rx="100" ry="30" fill="#ffffff" opacity="0" pointer-events="none"></ellipse>
      </g>

      <ellipse cx="292" cy="404" rx="92" ry="20" fill="${cymFill}" stroke="rgba(0,0,0,0.3)" stroke-width="1.5" data-hit="hh-closed"></ellipse>
      <g id="an-hhtop" style="transform-box: fill-box; transform-origin: center;">
        <ellipse cx="292" cy="388" rx="92" ry="20" fill="${cymFill}" stroke="rgba(0,0,0,0.25)" stroke-width="1.5" data-hit="hh-open"></ellipse>
        <ellipse cx="292" cy="388" rx="60" ry="13" fill="${cymFill}" data-hit="hh-closed"></ellipse>
        <g pointer-events="none">
          <ellipse cx="292" cy="388" rx="82" ry="17.5" fill="none" stroke="rgba(0,0,0,0.10)" stroke-width="1"></ellipse>
          <ellipse cx="292" cy="388" rx="72" ry="15.5" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="1"></ellipse>
          <ellipse cx="292" cy="388" rx="58" ry="12.5" fill="none" stroke="rgba(0,0,0,0.10)" stroke-width="1"></ellipse>
          <ellipse cx="292" cy="388" rx="44" ry="9.5" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1"></ellipse>
          <ellipse cx="292" cy="388" rx="30" ry="6.5" fill="none" stroke="rgba(0,0,0,0.10)" stroke-width="1"></ellipse>
          <path d="M 218 380 A 92 20 0 0 1 300 368" stroke="rgba(255,255,255,0.4)" stroke-width="4" fill="none" filter="url(#soft2)"></path>
        </g>
        <ellipse cx="292" cy="386" rx="14" ry="5" fill="${bellFill}" data-hit="hh-closed"></ellipse>
        <ellipse id="fl-hhtop" cx="292" cy="388" rx="92" ry="20" fill="#ffffff" opacity="0" pointer-events="none"></ellipse>
      </g>
      <polygon points="268,748 316,748 308,712 276,712" fill="#2c2f36" stroke="#4a4e58" stroke-width="2" data-hit="hh-foot"></polygon>
      <rect x="256" y="702" width="72" height="54" fill="rgba(0,0,0,0)" data-hit="hh-foot"></rect>

      <g id="an-crash" style="transform-box: fill-box; transform-origin: center;">
        <ellipse cx="452" cy="205" rx="128" ry="30" fill="${cymFill}" stroke="rgba(0,0,0,0.3)" stroke-width="2" data-hit="crash-edge"></ellipse>
        <ellipse cx="452" cy="205" rx="86" ry="20" fill="${cymFill}" data-hit="crash-body"></ellipse>
        <g pointer-events="none">
          <ellipse cx="452" cy="205" rx="120" ry="28" fill="none" stroke="rgba(0,0,0,0.10)" stroke-width="1.2"></ellipse>
          <ellipse cx="452" cy="205" rx="112" ry="26" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="1"></ellipse>
          <ellipse cx="452" cy="205" rx="102" ry="24" fill="none" stroke="rgba(0,0,0,0.10)" stroke-width="1.2"></ellipse>
          <ellipse cx="452" cy="205" rx="92" ry="21.5" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1"></ellipse>
          <ellipse cx="452" cy="205" rx="78" ry="18" fill="none" stroke="rgba(0,0,0,0.10)" stroke-width="1.2"></ellipse>
          <ellipse cx="452" cy="205" rx="66" ry="15.5" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1"></ellipse>
          <ellipse cx="452" cy="205" rx="52" ry="12" fill="none" stroke="rgba(0,0,0,0.10)" stroke-width="1.2"></ellipse>
          <ellipse cx="452" cy="205" rx="40" ry="9.5" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1"></ellipse>
          <path d="M 348 194 A 128 30 0 0 1 470 176" stroke="rgba(255,255,255,0.45)" stroke-width="5" fill="none" filter="url(#soft2)"></path>
          <text x="486" y="222" font-size="11" font-family="Helvetica, sans-serif" font-weight="700" fill="rgba(60,40,10,0.4)" transform="rotate(-4 486 222)">VD custom</text>
        </g>
        <ellipse cx="452" cy="202" rx="24" ry="8" fill="${bellFill}" data-hit="crash-bell"></ellipse>
        <ellipse cx="446" cy="199" rx="10" ry="3.2" fill="rgba(255,255,255,0.5)" filter="url(#soft2)" pointer-events="none"></ellipse>
        <circle cx="452" cy="200" r="4.5" fill="url(#chromeH)" pointer-events="none"></circle>
        <ellipse id="fl-crash" cx="452" cy="205" rx="128" ry="30" fill="#ffffff" opacity="0" pointer-events="none"></ellipse>
      </g>

      <g id="an-ride" style="transform-box: fill-box; transform-origin: center;">
        <ellipse cx="1215" cy="235" rx="148" ry="36" fill="${cymFill}" stroke="rgba(0,0,0,0.3)" stroke-width="2" data-hit="ride-edge"></ellipse>
        <ellipse cx="1215" cy="235" rx="100" ry="24" fill="${cymFill}" data-hit="ride-body"></ellipse>
        <g pointer-events="none">
          <ellipse cx="1215" cy="235" rx="139" ry="33.5" fill="none" stroke="rgba(0,0,0,0.10)" stroke-width="1.2"></ellipse>
          <ellipse cx="1215" cy="235" rx="130" ry="31.5" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="1"></ellipse>
          <ellipse cx="1215" cy="235" rx="118" ry="28.5" fill="none" stroke="rgba(0,0,0,0.10)" stroke-width="1.2"></ellipse>
          <ellipse cx="1215" cy="235" rx="106" ry="25.5" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1"></ellipse>
          <ellipse cx="1215" cy="235" rx="92" ry="22" fill="none" stroke="rgba(0,0,0,0.10)" stroke-width="1.2"></ellipse>
          <ellipse cx="1215" cy="235" rx="78" ry="18.5" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1"></ellipse>
          <ellipse cx="1215" cy="235" rx="62" ry="14.5" fill="none" stroke="rgba(0,0,0,0.10)" stroke-width="1.2"></ellipse>
          <ellipse cx="1215" cy="235" rx="46" ry="10.5" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1"></ellipse>
          <path d="M 1092 222 A 148 36 0 0 1 1230 200" stroke="rgba(255,255,255,0.45)" stroke-width="5" fill="none" filter="url(#soft2)"></path>
          <text x="1252" y="256" font-size="11" font-family="Helvetica, sans-serif" font-weight="700" fill="rgba(60,40,10,0.4)" transform="rotate(-4 1252 256)">VD custom</text>
        </g>
        <ellipse cx="1215" cy="231" rx="27" ry="9" fill="${bellFill}" data-hit="ride-bell"></ellipse>
        <ellipse cx="1208" cy="228" rx="11" ry="3.6" fill="rgba(255,255,255,0.5)" filter="url(#soft2)" pointer-events="none"></ellipse>
        <circle cx="1215" cy="229" r="5" fill="url(#chromeH)" pointer-events="none"></circle>
        <ellipse id="fl-ride" cx="1215" cy="235" rx="148" ry="36" fill="#ffffff" opacity="0" pointer-events="none"></ellipse>
      </g>

      <g pointer-events="none">
        <line x1="60" y1="120" x2="238" y2="252" stroke="#23252d" stroke-width="7"></line>
        <line x1="60" y1="120" x2="60" y2="76" stroke="#23252d" stroke-width="8"></line>
        <g transform="rotate(37 238 252)">
          <rect x="222" y="246" width="34" height="13" rx="6" fill="url(#nickel)" stroke="rgba(0,0,0,0.4)" stroke-width="1"></rect>
          <rect x="252" y="244.5" width="16" height="16" rx="7" fill="#14161b" stroke="#3a3e48" stroke-width="1.5"></rect>
          <line x1="256" y1="248" x2="266" y2="248" stroke="#3a3e48" stroke-width="1"></line>
          <line x1="255" y1="252" x2="267" y2="252" stroke="#3a3e48" stroke-width="1"></line>
          <line x1="256" y1="256" x2="266" y2="256" stroke="#3a3e48" stroke-width="1"></line>
        </g>
        <line x1="1544" y1="118" x2="1372" y2="268" stroke="#23252d" stroke-width="7"></line>
        <line x1="1544" y1="118" x2="1544" y2="76" stroke="#23252d" stroke-width="8"></line>
        <g transform="rotate(-40 1372 268)">
          <rect x="1372" y="262" width="34" height="13" rx="6" fill="url(#nickel)" stroke="rgba(0,0,0,0.4)" stroke-width="1"></rect>
          <rect x="1358" y="260.5" width="16" height="16" rx="7" fill="#14161b" stroke="#3a3e48" stroke-width="1.5"></rect>
          <line x1="1362" y1="264" x2="1372" y2="264" stroke="#3a3e48" stroke-width="1"></line>
          <line x1="1361" y1="268" x2="1373" y2="268" stroke="#3a3e48" stroke-width="1"></line>
          <line x1="1362" y1="272" x2="1372" y2="272" stroke="#3a3e48" stroke-width="1"></line>
        </g>
        <line x1="620" y1="742" x2="600" y2="762" stroke="#23252d" stroke-width="5"></line>
        <line x1="580" y1="762" x2="620" y2="762" stroke="#23252d" stroke-width="6"></line>
        <line x1="620" y1="742" x2="648" y2="716" stroke="#23252d" stroke-width="5"></line>
        <g transform="rotate(-24 656 712)">
          <rect x="642" y="702" width="40" height="20" rx="9" fill="#14161b" stroke="#3a3e48" stroke-width="1.5"></rect>
          <ellipse cx="683" cy="712" rx="9" ry="11" fill="#22252d" stroke="#3a3e48" stroke-width="1.5"></ellipse>
          <line x1="648" y1="708" x2="672" y2="708" stroke="#3a3e48" stroke-width="1"></line>
          <line x1="648" y1="716" x2="672" y2="716" stroke="#3a3e48" stroke-width="1"></line>
        </g>
        <line x1="452" y1="452" x2="428" y2="430" stroke="#23252d" stroke-width="4"></line>
        <g transform="rotate(38 424 424)">
          <rect x="406" y="418" width="30" height="12" rx="5" fill="url(#nickel)" stroke="rgba(0,0,0,0.4)" stroke-width="1"></rect>
          <rect x="432" y="416.5" width="13" height="15" rx="6" fill="#14161b" stroke="#3a3e48" stroke-width="1.5"></rect>
        </g>
      </g>
      ${opts.showLabels ? KEY_LABELS : ''}
    </svg>`
}
