// Single source of visual constants shared by the Remotion compositions and (by hand) theme.css.
export const theme = {
  bg: "#0b0f14",
  bgSoft: "#121820",
  panel: "#161d27",
  panelBorder: "#263142",
  text: "#e6edf3",
  textMuted: "#9aa7b6",
  accent: "#ff4d3d", // car red
  accent2: "#36c3ff",
  good: "#3ddc97",
  warn: "#ffc857",
  bad: "#ff6b6b",
  font: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  mono: "'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace",
  // one colour per observation block, in obs.py order
  blocks: {
    lookahead_xy: "#4f9cf5",
    lookahead_half_width: "#8cc4ff",
    lateral_heading: "#ff8a4c",
    lin_vel: "#3ddc97",
    ang_vel: "#7fe3b8",
    wheels_steer: "#f2b134",
    prev_action: "#f06292",
    opponents: "#a78bfa",
  },
} as const;

export const BLOCK_ORDER = [
  "lookahead_xy",
  "lookahead_half_width",
  "lateral_heading",
  "lin_vel",
  "ang_vel",
  "wheels_steer",
  "prev_action",
  "opponents",
] as const;

export type BlockName = (typeof BLOCK_ORDER)[number];
