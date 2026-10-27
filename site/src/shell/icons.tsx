// One drawn icon set, 24 px grid, 1.5 px stroke, no fill. Decorative: aria-hidden always.
import type { Area } from "../router";

interface Props {
  size?: number;
}

function Svg({ size = 20, children }: Props & { children: preact.ComponentChildren }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function StormsIcon(p: Props) {
  return (
    <Svg {...p}>
      <path d="M7 15a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17.2 8.5 3.5 3.5 0 0 1 17 15H7Z" />
      <circle cx="9" cy="19" r="0.9" />
      <circle cx="13" cy="20.5" r="0.9" />
      <circle cx="16" cy="18.5" r="0.9" />
    </Svg>
  );
}

export function ScorecardIcon(p: Props) {
  return (
    <Svg {...p}>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <path d="M12 4v16M4 12h16" />
    </Svg>
  );
}

export function TryIcon(p: Props) {
  return (
    <Svg {...p}>
      <path d="M4 12h16" />
      <circle cx="10" cy="12" r="3" />
      <path d="M4 6h5M15 6h5M4 18h8M16 18h4" />
    </Svg>
  );
}

export function MethodIcon(p: Props) {
  return (
    <Svg {...p}>
      <path d="M6 3.5h10.5a1.5 1.5 0 0 1 1.5 1.5v15.5H7.5A1.5 1.5 0 0 1 6 19V3.5Z" />
      <path d="M6 17.5h12M9 8h6M9 11.5h6" />
    </Svg>
  );
}

export function PipelineIcon(p: Props) {
  return (
    <Svg {...p}>
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="6" r="2" />
      <circle cx="19" cy="12" r="2" />
      <circle cx="12" cy="18" r="2" />
      <path d="M6.7 11 10.3 7M13.7 7l3.6 4M6.7 13l3.6 4M13.7 17l3.6-4" />
    </Svg>
  );
}

export const AREA_ICONS: Record<Area, (p: Props) => preact.JSX.Element> = {
  storms: StormsIcon,
  scorecard: ScorecardIcon,
  try: TryIcon,
  method: MethodIcon,
  pipeline: PipelineIcon,
};

export function MoonIcon(p: Props) {
  return (
    <Svg {...p}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
    </Svg>
  );
}

export function SunIcon(p: Props) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
    </Svg>
  );
}

export function CodeIcon(p: Props) {
  return (
    <Svg {...p}>
      <path d="m8.5 7.5-5 4.5 5 4.5M15.5 7.5l5 4.5-5 4.5M13.5 5l-3 14" />
    </Svg>
  );
}

/** The empty-state glyph: one hailstone outline with a dotted core. */
export function GlyphIcon(p: Props) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" stroke-dasharray="1.5 2.2" />
    </Svg>
  );
}