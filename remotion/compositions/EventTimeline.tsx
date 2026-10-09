import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { theme } from "../../theme/theme";
import { Stage, Card, Chip, appear, Footer } from "../components/ui";

const STAGES = [
  {
    title: "Stage 1", when: "2 hours", color: theme.accent2,
    bullets: ["Train a driver with the baseline car", "Score: fastest lap on the 3 public tracks (oval, loop, serpent)", "Then: ghost-mode grid race on serpent"],
  },
  {
    title: "Overnight", when: "tune and retrain", color: theme.warn,
    bullets: ["Tune the 13 clamped car parameters", "Train on more and harder generated tracks", "Optional: self-play against frozen opponents"],
  },
  {
    title: "Stage 2", when: "hidden tracks", color: theme.accent,
    bullets: ["Tracks you have never seen (easy, medium, hard)", "Ghost mode is the primary score", "Collision race is the finale: grid start, first to 3 laps"],
  },
];

export const EventTimeline: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lineW = interpolate(frame, [5, 130], [0, 1620], { extrapolateRight: "clamp" });
  return (
    <Stage title="How the league runs" subtitle="Three phases, one engine: the same MJX simulator trains, judges and replays every submission.">
      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0 }}>
        <line x1={150} y1={330} x2={150 + lineW} y2={330} stroke={theme.panelBorder} strokeWidth={10} strokeLinecap="round" />
        {STAGES.map((s, i) => {
          const x = 150 + 270 + i * 540;
          const vis = interpolate(frame, [15 + i * 45, 25 + i * 45], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return <circle key={s.title} cx={x} cy={330} r={22 * vis} fill={s.color} stroke={theme.bg} strokeWidth={6} />;
        })}
      </svg>
      {STAGES.map((s, i) => (
        <Card key={s.title} x={150 + i * 540} y={400} w={540 - 40} h={520} color={s.color} delay={20 + i * 45}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
            <div style={{ fontSize: 44, fontWeight: 800 }}>{s.title}</div>
            <Chip color={s.color} style={{ fontSize: 22 }}>{s.when}</Chip>
          </div>
          <ul style={{ margin: "22px 0 0", paddingLeft: 28, fontSize: 28, lineHeight: 1.35 }}>
            {s.bullets.map((b, j) => (
              <li key={b} style={{ marginBottom: 16, ...appear(frame, fps, 40 + i * 45 + j * 12) }}>{b}</li>
            ))}
          </ul>
        </Card>
      ))}
      <Footer>Submit early and often: the leaderboard keeps each team's best submission in every stage.</Footer>
    </Stage>
  );
};
