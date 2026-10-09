import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { theme } from "../../theme/theme";
import { Stage, appear, Footer } from "../components/ui";
import { OBS_BLOCKS, OBS_SIZE, LOOKAHEAD_M } from "../data/obs_blocks";

const LEFT = 90, WIDTH = 1740, CELL = WIDTH / OBS_SIZE, TOP = 300, H = 90;

export const ObsLayoutBar: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const colors = Object.values(theme.blocks);
  return (
    <Stage title="Observation v2: the 60 numbers the policy sees" subtitle="Fixed contract. Every entry is divided by a constant so it is O(1); a checkpoint trained against a different version is rejected.">
      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0 }}>
        {OBS_BLOCKS.map((b, bi) => {
          const start = 15 + bi * 22;
          return [...Array(b.end - b.start)].map((_, k) => {
            const i = b.start + k;
            const p = interpolate(frame, [start + k * (18 / (b.end - b.start)), start + k * (18 / (b.end - b.start)) + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (
              <rect key={i} x={LEFT + i * CELL + 1.5} y={TOP + (1 - p) * H / 2} width={CELL - 3} height={H * p} rx={4} fill={colors[bi]} opacity={0.55 + 0.45 * p} />
            );
          });
        })}
        {OBS_BLOCKS.map((b, bi) => {
          const p = interpolate(frame, [15 + bi * 22, 25 + bi * 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <g key={b.name} opacity={p}>
              <text x={LEFT + b.start * CELL + 3} y={TOP - 12} fontSize={20} fill={theme.textMuted} fontFamily={theme.mono}>{b.start}</text>
              <line x1={LEFT + b.start * CELL} y1={TOP - 4} x2={LEFT + b.start * CELL} y2={TOP + H + 6} stroke={theme.text} strokeWidth={2} opacity={0.5} />
            </g>
          );
        })}
        <text x={LEFT + WIDTH - 3} y={TOP - 12} fontSize={20} fill={theme.textMuted} fontFamily={theme.mono} textAnchor="end">60</text>
      </svg>

      <div style={{ position: "absolute", left: LEFT, top: 430, width: WIDTH, display: "grid", gridTemplateColumns: "1fr", gap: "10px 0" }}>
        {OBS_BLOCKS.map((b, bi) => (
          <div key={b.name} style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 26, whiteSpace: "nowrap", ...appear(frame, fps, 20 + bi * 22, 14) }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: colors[bi], flex: "0 0 auto" }} />
            <div style={{ fontFamily: theme.mono, color: colors[bi], width: 120 }}>[{b.start}:{b.end}]</div>
            <div style={{ fontWeight: 700, width: 360 }}>{b.name}</div>
            <div style={{ color: theme.textMuted, flex: 1 }}>{b.what}</div>
            <div style={{ fontFamily: theme.mono, color: theme.textMuted, fontSize: 22 }}>{b.divisor}</div>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: LEFT, top: 905, fontSize: 25, color: theme.textMuted, whiteSpace: "nowrap", ...appear(frame, fps, 200) }}>
        Lookahead distances along the centerline: <span style={{ fontFamily: theme.mono, color: theme.text }}>{LOOKAHEAD_M.join(", ")} m</span>. Opponent slots are zero when you drive alone.
      </div>
      <Footer>Policy contract: act(params, obs[60]) → action[2] in [-1, 1], pure JAX.</Footer>
    </Stage>
  );
};
