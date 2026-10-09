import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { theme } from "../../theme/theme";
import { Stage, Card, Chip, Arrow, Footer } from "../components/ui";

const GRID = 48; // 48 x 48 = 2304 dots standing in for 4096 environments

export const PPOPipeline: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const phase = ((t % 2.5) / 2.5); // one rollout -> update cycle every 2.5 s
  const cell = 340 / GRID;
  return (
    <Stage title="How PPO trains the driver" subtitle="Collect experience from thousands of simulated cars at once, then take a few careful gradient steps. Repeat.">
      <Card x={100} y={300} w={480} h={520} color={theme.accent2} delay={5}>
        <div style={{ fontSize: 34, fontWeight: 800 }}>4096 parallel envs</div>
        <div style={{ fontSize: 23, color: theme.textMuted, marginBottom: 12 }}>one compiled MJX model, 256 tracks, vmapped on the GPU</div>
        <svg width={340} height={340} viewBox="0 0 340 340" style={{ marginTop: 10 }}>
          {[...Array(GRID * GRID)].map((_, i) => {
            const r = Math.floor(i / GRID), c = i % GRID;
            const wave = (Math.sin((c + r) * 0.25 - t * 6) + 1) / 2;
            const active = phase < 0.65 ? interpolate(wave, [0, 1], [0.25, 1]) : 0.2;
            return <rect key={i} x={c * cell} y={r * cell} width={cell - 1} height={cell - 1} fill={theme.accent2} opacity={active} />;
          })}
        </svg>
      </Card>

      <Card x={700} y={300} w={520} h={230} color={theme.warn} delay={15}>
        <div style={{ fontSize: 34, fontWeight: 800 }}>Rollout buffer</div>
        <div style={{ fontSize: 24, color: theme.textMuted, lineHeight: 1.35, marginTop: 6 }}>
          20 steps × 4096 envs = <b style={{ color: theme.text }}>81 920</b> transitions per iteration: (obs, action, reward, value)
        </div>
        <div style={{ marginTop: 10 }}><Chip color={theme.warn} mono>GAE: γ = 0.99, λ = 0.95</Chip></div>
      </Card>

      <Card x={700} y={590} w={520} h={230} color={theme.accent} delay={25}>
        <div style={{ fontSize: 34, fontWeight: 800 }}>Clipped policy update</div>
        <div style={{ fontSize: 24, color: theme.textMuted, lineHeight: 1.35, marginTop: 6 }}>
          4 epochs × 4 minibatches of 1024. The ratio π<sub>new</sub>/π<sub>old</sub> is clipped to 1 ± 0.2 so no single update wrecks the driver.
        </div>
        <div style={{ marginTop: 10 }}><Chip color={theme.accent} mono>lr 3e-4, entropy 1e-3</Chip></div>
      </Card>

      <Card x={1340} y={300} w={480} h={520} color={theme.good} delay={35}>
        <div style={{ fontSize: 34, fontWeight: 800 }}>Checkpoints</div>
        <div style={{ fontSize: 23, color: theme.textMuted, marginBottom: 14 }}>12 evaluations over 60 M steps; each one saves params.pkl + meta.json</div>
        <svg width={400} height={300} viewBox="0 0 400 300">
          <line x1={20} y1={270} x2={390} y2={270} stroke={theme.panelBorder} strokeWidth={3} />
          <line x1={20} y1={270} x2={20} y2={20} stroke={theme.panelBorder} strokeWidth={3} />
          {(() => {
            const pts = [...Array(13)].map((_, i) => {
              const x = 20 + (i / 12) * 360;
              const prog = Math.min(1, Math.max(0, (t * 1.2 - i * 0.25) / 1.0));
              const y = 270 - (1 - Math.exp(-i / 3.5)) * 230;
              return { x, y, prog };
            });
            return (
              <g>
                <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={theme.good} strokeWidth={5} strokeDasharray="800" strokeDashoffset={800 - interpolate(frame, [40, 200], [0, 800], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
                {pts.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={7} fill={theme.bg} stroke={theme.good} strokeWidth={4} opacity={interpolate(frame, [40 + i * 13, 48 + i * 13], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
                ))}
              </g>
            );
          })()}
          <text x={200} y={298} fontSize={18} fill={theme.textMuted} textAnchor="middle" fontFamily={theme.mono}>env steps → 60 M (~13 min on 4× T4)</text>
          <text x={32} y={40} fontSize={18} fill={theme.textMuted} fontFamily={theme.mono}>episode reward</text>
        </svg>
        <div><Chip color={theme.good} mono>rlr evaluate runs/run1/final</Chip></div>
      </Card>

      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
        <Arrow x1={590} y1={420} x2={690} y2={420} color={theme.warn} phase={Math.min(1, phase / 0.65)} />
        <Arrow x1={960} y1={540} x2={960} y2={580} color={theme.accent} phase={Math.min(1, Math.max(0, (phase - 0.65) / 0.2))} width={5} />
        <Arrow x1={1230} y1={700} x2={1330} y2={700} color={theme.good} phase={Math.min(1, Math.max(0, (phase - 0.85) / 0.15))} />
        <path d="M 960 830 C 960 900, 340 900, 340 830" fill="none" stroke={theme.textMuted} strokeWidth={4} strokeDasharray="10 10" />
        <text x={650} y={920} fontSize={24} fill={theme.textMuted} textAnchor="middle" fontFamily={theme.font}>new policy drives the next rollout</text>
      </svg>
      <Footer>
        <span style={{ fontFamily: theme.mono }}>reward = progress − 0.05·Δaction² − 0.5·wall − 20·off_track − 20·flip</span> &nbsp; (team/reward.py, training only)
      </Footer>
    </Stage>
  );
};
