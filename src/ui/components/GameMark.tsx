import type { JSX } from 'react';

export const GAME_TITLE = 'AS INSTRUCTED';

// Every part is separated from the one under it by a keyline in the page colour. The keyline is a
// stroke painted beneath its own fill, so it is invisible against the background and only bites
// into whatever the part overlaps — which is why drawing order here is back to front.
const KEY = {
  stroke: 'var(--bg-void)',
  strokeWidth: 6.25,
  paintOrder: 'stroke',
} as const;


// The wordmark is outlined from Saira Condensed Black rather than set in a webfont, so a display
// face can never leak into UI text. The viewBox is the font em grid at 10x, which is what keeps
// the curve coordinates on clean half units at the size it actually renders.
const WORDMARK_LEAD = 'M154 460L146.5 406L89 406L82 460L0.5 460L58.5 143.5L179.5 143.5L237.5 460L154 460ZM119.5 216.5L116.5 216.5L99.5 340.5L136.5 340.5L119.5 216.5ZM347 463.5Q325.5 463.5 301.5 461Q277 458.5 260 455L260 392.5Q302.5 395.5 323 395.5Q337 395.5 343.5 394.5Q350 394 353 390.5Q355.5 388 356.5 382.5Q357.5 377.5 357.5 368.5Q357.5 354.5 355.5 349Q353.5 343 348 340.5Q342.5 337.5 328.5 335.5L289.5 328Q270 324.5 262 301.5Q254 279 254 237.5Q254 197 266 175.5Q278.5 154 299 147Q320 140 352 140Q376 140 396 142.5Q416.5 145.5 428 148L428 211Q400 208 371 208Q358 208 351.5 208.5Q345.5 209.5 342 212Q339 215 338 220Q336.5 225 336.5 234.5Q336.5 245.5 338 250.5Q339 256 342.5 258Q346.5 260.5 355 262L388.5 268.5Q404.5 272 415 279Q426 285.5 433 303Q440 323.5 440 357.5Q440 404 428.5 427Q416.5 450 397.5 457Q378 463.5 347 463.5Z';

const WORDMARK_REST = 'M562.5 460L562.5 143.5L645 143.5L645 460L562.5 460ZM819.5 460L768.5 317.5L766 317.5L766 460L687.5 460L687.5 143.5L767 143.5L811 266.5L814 266.5L814 143.5L892.5 143.5L892.5 460L819.5 460ZM1020 463.5Q999 463.5 974.5 461Q950 458.5 933 455L933 392.5Q976 395.5 996 395.5Q1010.5 395.5 1017 394.5Q1023.5 394 1026 390.5Q1029 388 1029.5 382.5Q1030.5 377.5 1030.5 368.5Q1030.5 354.5 1029 349Q1027 343 1021.5 340.5Q1016 337.5 1001.5 335.5L962.5 328Q943 324.5 935 301.5Q927 279 927 237.5Q927 197 939.5 175.5Q951.5 154 972.5 147Q993.5 140 1025 140Q1049 140 1069.5 142.5Q1089.5 145.5 1101 148L1101 211Q1073.5 208 1044.5 208Q1031 208 1025 208.5Q1018.5 209.5 1015.5 212Q1012 215 1011 220Q1010 225 1010 234.5Q1010 245.5 1011 250.5Q1012 256 1016 258Q1019.5 260.5 1028.5 262L1062 268.5Q1077.5 272 1088.5 279Q1099 285.5 1106 303Q1113.5 323.5 1113.5 357.5Q1113.5 404 1101.5 427Q1090 450 1070.5 457Q1051.5 463.5 1020 463.5ZM1186.5 460L1186.5 214L1132 214L1132 143.5L1324.5 143.5L1324.5 214L1270 214L1270 460L1186.5 460ZM1473.5 460L1448.5 356L1434.5 356L1434.5 460L1351.5 460L1351.5 143.5L1468 143.5Q1503 143.5 1521 155Q1539 166 1545 188.5Q1551.5 210.5 1551.5 250Q1551.5 285 1546 307Q1540.5 329 1523.5 341.5L1558.5 460L1473.5 460ZM1434.5 290.5L1447 290.5Q1457 290.5 1461 288.5Q1465.5 286.5 1466.5 279Q1468 271 1468 250.5Q1468 230.5 1467 223Q1466 215.5 1461.5 213Q1457.5 211 1447 211L1434.5 211L1434.5 290.5ZM1785 143.5L1785 318Q1785 382 1780 409.5Q1775.5 437.5 1754.5 450.5Q1734 463.5 1685.5 463.5Q1637.5 463.5 1616.5 450.5Q1596 437.5 1591 410Q1586.5 382.5 1586.5 318L1586.5 143.5L1669 143.5L1669 340Q1669 370 1670 379.5Q1670.5 389.5 1673.5 392.5Q1676.5 395 1685.5 395Q1694.5 395 1697.5 392.5Q1700.5 389.5 1701.5 379.5Q1702 369.5 1702 340L1702 143.5L1785 143.5ZM1981.5 455.5Q1971 459 1954 461.5Q1937.5 463.5 1923 463.5Q1878 463.5 1856.5 448.5Q1835 434 1828 401Q1821.5 368 1821.5 302Q1821.5 236 1828.5 203Q1835.5 169.5 1857 155Q1878.5 140 1923 140Q1939 140 1955.5 142Q1971.5 144.5 1980.5 147.5L1980.5 210.5Q1951.5 208 1940 208Q1921 208 1914.5 213.5Q1908 219 1906 236Q1904.5 252.5 1904.5 302Q1904.5 351 1906 368Q1908 385 1914.5 390.5Q1921 395.5 1940 395.5Q1964.5 395.5 1981.5 393L1981.5 455.5ZM2056.5 460L2056.5 214L2001.5 214L2001.5 143.5L2194.5 143.5L2194.5 214L2139.5 214L2139.5 460L2056.5 460ZM2221.5 460L2221.5 143.5L2384 143.5L2384 211.5L2304.5 211.5L2304.5 266.5L2372 266.5L2372 334L2304.5 334L2304.5 392L2384 392L2384 460L2221.5 460ZM2423 143.5L2515 143.5Q2567 143.5 2589 157.5Q2610.5 171.5 2615.5 201.5Q2620.5 231 2620.5 302Q2620.5 372.5 2615.5 402.5Q2610.5 432 2589 446Q2567 460 2515 460L2423 460L2423 143.5ZM2515.5 392Q2528 392 2532 387.5Q2536 383 2537 367.5Q2538 351.5 2538 302Q2538 252 2537 236Q2536 220 2532 215.5Q2528 211.5 2515.5 211.5L2505.5 211.5L2505.5 392L2515.5 392Z';

export function GameWordmark({ height = 46 }: { height?: number }): JSX.Element {
  return (
    <svg
      className="game-wordmark"
      width={(height * 2635) / 460}
      height={height}
      viewBox="0 0 2635 460"
      aria-hidden="true"
      focusable="false"
    >
      <path d={WORDMARK_LEAD} fill="var(--accent)" />
      <path d={WORDMARK_REST} fill="var(--ink)" />
    </svg>
  );
}

interface MarkProps {
  size?: number;
}

export function GameMark({ size = 56 }: MarkProps): JSX.Element {
  return (
    <svg
      className="game-mark"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M47 200.5H170.5L189 221.5V232H12V221.5Z" fill="var(--accent)" />
      <path d="M48 203.5H169L184.5 221.5H18Z" fill="var(--bg-void)" />
      <path
        d="M78 203.5L59.5 221.5M108.5 203.5L101.5 221.5M138.5 203.5L143 221.5M33 212.5H177"
        fill="none"
        stroke="var(--ink)"
        strokeWidth={2.75}
      />

      <g fill="var(--accent)" {...KEY}>
        <rect
          x={148.5}
          y={136.5}
          width={18.5}
          height={31}
          rx={6}
          transform="rotate(16 157.5 152)"
        />
        <rect
          x={132.5}
          y={163}
          width={18.5}
          height={38.5}
          rx={6}
          transform="rotate(38 141.5 182.5)"
        />
        <rect x={171} y={132.5} width={18.5} height={43} rx={6} transform="rotate(-34 180 154)" />
        <rect
          x={194}
          y={168.5}
          width={18.5}
          height={41.5}
          rx={6}
          transform="rotate(-32 203 189.5)"
        />
      </g>

      <rect x={121} y={194.5} width={37.5} height={13.5} rx={2.5} fill="var(--ink)" {...KEY} />
      <path
        d="M121 203V197.5a2.5 2.5 0 0 1 2.5-2.5h32.5a2.5 2.5 0 0 1 2.5 2.5v5.5Z"
        fill="var(--accent)"
      />
      <g transform="rotate(-28 224 211.5)">
        <rect x={203.5} y={203} width={40.5} height={17.5} rx={2.5} fill="var(--ink)" {...KEY} />
        <path
          d="M203.5 212V205.5a2.5 2.5 0 0 1 2.5-2.5h35a2.5 2.5 0 0 1 2.5 2.5v6.5Z"
          fill="var(--accent)"
        />
      </g>

      <circle cx={153.5} cy={167} r={10.5} fill="var(--bg-void)" />
      <circle cx={153.5} cy={167} r={5.5} fill="none" stroke="var(--ink)" strokeWidth={3.75} />
      <circle cx={192.5} cy={172} r={12} fill="var(--bg-void)" />
      <circle cx={192.5} cy={172} r={6.5} fill="none" stroke="var(--ink)" strokeWidth={4.75} />

      <g {...KEY}>
        <rect
          x={127.5}
          y={89.5}
          width={16.5}
          height={57}
          rx={5.5}
          fill="var(--accent)"
          transform="rotate(42 135.5 118)"
        />
        <rect
          x={189}
          y={99.5}
          width={16.5}
          height={46.5}
          rx={5.5}
          fill="var(--accent)"
          transform="rotate(-45 197.5 122.5)"
        />
        <rect
          x={114.5}
          y={126.5}
          width={10}
          height={22}
          rx={3.5}
          fill="var(--ink)"
          transform="rotate(131 119.5 137)"
        />
        <rect
          x={209}
          y={129.5}
          width={9.5}
          height={20}
          rx={3.5}
          fill="var(--ink)"
          transform="rotate(45 213.5 139.5)"
        />
        <rect x={146.5} y={88} width={45} height={53.5} rx={9.5} fill="var(--accent)" />
      </g>

      <circle cx={153} cy={100} r={13.5} fill="var(--bg-void)" />
      <circle cx={153} cy={100} r={8} fill="none" stroke="var(--ink)" strokeWidth={4.75} />

      <path
        d="M147.5 85Q141.5 85 141.5 79L141.5 51Q141.5 45 147.5 44L173.5 40Q179.5 39 185.5 41L206 47Q212 49 212 55L212 79Q212 85 206 85Z"
        fill="var(--accent)"
        {...KEY}
      />
      <circle cx={162.5} cy={62} r={10} fill="var(--ink)" {...KEY} />
      <path
        d="M189.5 53Q189.5 48.5 194.5 49.5L204 51.5Q208.5 53 208.5 57.5L208.5 75Q208.5 80 203.5 80L194.5 80Q189.5 80 189.5 75Z"
        fill="var(--bg-void)"
      />
      <circle cx={200} cy={64} r={4} fill="var(--accent-2)" />

      <path d="M163 49V24" fill="none" stroke="var(--bg-void)" strokeWidth={11.5} />
      <circle cx={162.5} cy={22.5} r={9} fill="var(--bg-void)" />
      <path d="M163 49V24" fill="none" stroke="var(--ink)" strokeWidth={5.25} />
      <circle cx={162.5} cy={22.5} r={6} fill="var(--ink)" />
    </svg>
  );
}
