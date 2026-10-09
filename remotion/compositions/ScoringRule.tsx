import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { theme } from "../../theme/theme";
import { Stage, Card, Chip, appear, Footer } from "../components/ui";

const TRACKS = [
  { name: "oval", len: "449 m", lap: 41.8, dnf: false },
  { name: "loop", len: "285 m", lap: 28.6, dnf: false },
  { name: "serpent", len: "382 m", lap: null as number | null, dnf: true },
];

export const ScoringRule: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vals = TRACKS.map((t, i) => {
    const start = 25 + i * 10;
    if (t.dnf) return null;
    const p = interpolate(frame, [start, start + 55], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
    return 120 - (120 - (t.lap as number)) * p;
  });
  const dnfFlash = interpolate(frame, [95, 105], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const total = 41.8 + 28.6 + 999;
  return (
    <Stage title="How a submission is scored" subtitle="Solo judging: one car per track, start on the line, 180 s of simulated time, best lap counts.">
      <div style={{ position: "absolute", left: 150, top: 230, display: "flex", gap: 14 }}>
        <Chip color={theme.accent2}>deterministic start</Chip>
        <Chip color={theme.accent2}>180 s per track</Chip>
        <Chip color={theme.accent2}>score = best lap</Chip>
        <Chip color={theme.bad}>no lap = 999 s</Chip>
      </div>
      {TRACKS.map((t, i) => (
        <Card key={t.name} x={150 + i * 560} y={320} w={500} h={330} color={t.dnf ? theme.bad : theme.good} delay={10 + i * 10}>
          <div style={{ fontSize: 40, fontWeight: 800, textTransform: "capitalize" }}>{t.name}</div>
          <div style={{ fontSize: 24, color: theme.textMuted }}>lap length {t.len}</div>
          <div style={{ marginTop: 28, fontFamily: theme.mono, fontSize: 92, fontWeight: 700, color: t.dnf ? (dnfFlash > 0.5 ? theme.bad : theme.textMuted) : theme.good }}>
            {t.dnf ? (dnfFlash > 0.5 ? "999 s" : "— —") : `${(vals[i] as number).toFixed(1)} s`}
          </div>
          <div style={{ fontSize: 24, color: theme.textMuted }}>{t.dnf ? (dnfFlash > 0.5 ? "no completed lap in 180 s (DNF)" : "crashed on lap 1 ...") : "best of the laps completed"}</div>
        </Card>
      ))}
      <div style={{ position: "absolute", left: 150, right: 150, top: 700, ...appear(frame, fps, 125) }}>
        <div style={{ background: theme.panel, border: `2px solid ${theme.panelBorder}`, borderRadius: 18, padding: "26px 40px", display: "flex", alignItems: "center", gap: 36 }}>
          <div style={{ fontSize: 34, fontWeight: 700 }}>Leaderboard total</div>
          <div style={{ fontFamily: theme.mono, fontSize: 40 }}>
            41.8 + 28.6 + <span style={{ color: theme.bad }}>999</span> = <b>{total.toFixed(1)} s</b>
          </div>
          <div style={{ marginLeft: "auto", fontSize: 28, color: theme.textMuted }}>lower is better</div>
        </div>
      </div>
      <Footer>Sum of best laps over all tracks. A DQ freezes your stats but keeps the laps you finished. The best submission per team is kept.</Footer>
    </Stage>
  );
};
