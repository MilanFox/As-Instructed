const BASE = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

export function IconPlay(): React.JSX.Element {
  return (
    <svg {...BASE} fill="currentColor" stroke="none">
      <path d="M5 3.5 12.5 8 5 12.5Z" />
    </svg>
  );
}

export function IconPause(): React.JSX.Element {
  return (
    <svg {...BASE} fill="currentColor" stroke="none">
      <rect x="4.5" y="3.5" width="2.6" height="9" rx="0.5" />
      <rect x="8.9" y="3.5" width="2.6" height="9" rx="0.5" />
    </svg>
  );
}

export function IconStepBack(): React.JSX.Element {
  return (
    <svg {...BASE}>
      <path d="M10 3.5 5.5 8l4.5 4.5" />
    </svg>
  );
}

export function IconStepForward(): React.JSX.Element {
  return (
    <svg {...BASE}>
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  );
}

export function IconSkipStart(): React.JSX.Element {
  return (
    <svg {...BASE}>
      <path d="M4 3.5v9M12 3.5 6.5 8 12 12.5" />
    </svg>
  );
}

export function IconSkipEnd(): React.JSX.Element {
  return (
    <svg {...BASE}>
      <path d="M12 3.5v9M4 3.5 9.5 8 4 12.5" />
    </svg>
  );
}

export function IconMap(): React.JSX.Element {
  return (
    <svg {...BASE}>
      <path d="M2 4.5 6 3l4 1.5L14 3v8.5L10 13l-4-1.5L2 13zM6 3v8.5M10 4.5V13" />
    </svg>
  );
}

export function IconBook(): React.JSX.Element {
  return (
    <svg {...BASE}>
      <path d="M2.5 3.5h4a2 2 0 0 1 2 2v7a1.6 1.6 0 0 0-1.6-1.4H2.5zM13.5 3.5h-4a2 2 0 0 0-2 2v7a1.6 1.6 0 0 1 1.6-1.4h4.4z" />
    </svg>
  );
}

export function IconClose(): React.JSX.Element {
  return (
    <svg {...BASE}>
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  );
}

export function IconClear(): React.JSX.Element {
  return (
    <svg {...BASE}>
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8h5.6l.7-8" />
    </svg>
  );
}

export function IconTarget(): React.JSX.Element {
  return (
    <svg {...BASE}>
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="1.8" />
    </svg>
  );
}

export function IconSliders(): React.JSX.Element {
  return (
    <svg {...BASE}>
      <path d="M2.5 4.5h7M12.5 4.5h1M2.5 11.5h1M6.5 11.5h7" />
      <circle cx="11" cy="4.5" r="1.6" />
      <circle cx="5" cy="11.5" r="1.6" />
    </svg>
  );
}

export function IconSound(): React.JSX.Element {
  return (
    <svg {...BASE}>
      <path d="M3 6h2.2L8.6 3.2v9.6L5.2 10H3Z" />
      <path d="M10.8 6.1a2.6 2.6 0 0 1 0 3.8" />
      <path d="M12.6 4.3a5.1 5.1 0 0 1 0 7.4" />
    </svg>
  );
}
