import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { theme } from "../../theme/theme";
import { Stage, Card, Chip, Arrow, Footer } from "../components/ui";

const W = 1920;

/** Agent <-> environment loop. One pulse cycle every 2 s, so the clip loops seamlessly. */
export const RLLoop: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const phase = ((frame / fps) % 2) / 2; // 0..1 every 2 s
  const t = frame / fps;

  // tiny car orbiting the mini track inside the environment card
  const a = (t / 4) * Math.PI * 2;
  const cx = 1460 + 150 * Math.cos(a), cy = 560 + 80 * Math.sin(a);

  const step = Math.floor(frame / (fps * 2));
  return (
    <Stage title="The reinforcement learning loop" subtitle="At 50 Hz the driver sees an observation, picks an action, and the simulator answers with the next observation and a reward.">
      <Card x={210} y={330} w={560} h={470} color={theme.accent}>
        <div style={{ fontSize: 40, fontWeight: 800 }}>Agent</div>
        <div style={{ fontSize: 26, color: theme.textMuted, marginBottom: 18 }}>policy π(action | observation), a small neural network</div>
        <svg width={500} height={210} viewBox="0 0 500 210">
          {[0, 1, 2, 3].map((layer) => {
            const n = [6, 5, 5, 2][layer];
            const x = 40 + layer * 140;
            return [...Array(n)].map((_, i) => {
              const y = 105 + (i - (n - 1) / 2) * 32;
              const glow = interpolate(Math.sin((t * 3 - layer * 0.8 + i * 0.3) * 2), [-1, 1], [0.25, 1]);
              return (
                <g key={`${layer}-${i}`}>
                  {layer < 3
                    ? [...Array([6, 5, 5, 2][layer + 1])].map((__, j) => {
                        const y2 = 105 + (j - ([6, 5, 5, 2][layer + 1] - 1) / 2) * 32;
                        return <line key={j} x1={x} y1={y} x2={x + 140} y2={y2} stroke={theme.panelBorder} strokeWidth={1.5} />;
                      })
                    : null}
                  <circle cx={x} cy={y} r={11} fill={layer === 3 ? theme.accent : theme.accent2} opacity={glow} />
                </g>
              );
            });
          })}
        </svg>
        <div style={{ marginTop: 10 }}>
          <Chip color={theme.accent} mono style={{ fontSize: 22 }}>60 → [256, 256, 128] → 2</Chip>
        </div>
      </Card>

      <Card x={1150} y={330} w={560} h={470} color={theme.accent2}>
        <div style={{ fontSize: 40, fontWeight: 800 }}>Environment</div>
        <div style={{ fontSize: 26, color: theme.textMuted, marginBottom: 10 }}>MuJoCo car on a procedurally generated track, simulated in MJX</div>
        <svg width={500} height={260} viewBox="1210 420 500 260">
          <ellipse cx={1460} cy={560} rx={190} ry={115} fill="none" stroke="#dddddd" strokeWidth={4} />
          <ellipse cx={1460} cy={560} rx={110} ry={45} fill="none" stroke="#dddddd" strokeWidth={4} />
          <ellipse cx={1460} cy={560} rx={150} ry={80} fill="none" stroke="#6b7786" strokeWidth={2} strokeDasharray="10 10" />
          <g transform={`translate(${cx} ${cy}) rotate(${(a * 180) / Math.PI + 90})`}>
            <rect x={-14} y={-9} width={28} height={18} rx={4} fill={theme.accent} />
          </g>
        </svg>
        <div style={{ marginTop: 6 }}>
          <Chip color={theme.accent2} mono style={{ fontSize: 22 }}>200 Hz physics, 4 substeps</Chip>
        </div>
      </Card>

      <svg width={W} height={1080} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
        <Arrow x1={790} y1={500} x2={1130} y2={500} color={theme.warn} phase={phase} label="action aₜ = [steer, throttle]" labelOffset={-30} />
        <Arrow x1={1130} y1={660} x2={790} y2={660} color={theme.good} phase={phase} label="observation oₜ₊₁, reward rₜ₊₁" labelOffset={-42} />
      </svg>

      <div style={{ position: "absolute", left: 790, width: 340, top: 565, textAlign: "center", fontFamily: theme.mono, fontSize: 30, color: theme.textMuted }}>
        step t = {step * 2 + Math.floor(phase * 2)}
      </div>
      <Footer>One episode = up to 60 s of driving (3000 steps). The goal is to maximise the sum of rewards; the league scores lap time.</Footer>
    </Stage>
  );
};
