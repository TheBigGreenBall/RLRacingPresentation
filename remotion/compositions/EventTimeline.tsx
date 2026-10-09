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
  // Full-frame layout (the slide shows this clip edge to edge, with no title of its own).
  const M = 90, GAP = 40, COL = (1920 - 2 * M - 2 * GAP) / 3, LINE_Y = 120, CARD_Y = 200, CARD_H = 780;
  const lineW = interpolate(frame, [5, 130], [0, 1920 - 2 * M], { extrapolateRight: "clamp" });
  return (
    <Stage>
      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0 }}>
        <line x1={M} y1={LINE_Y} x2={M + lineW} y2={LINE_Y} stroke={theme.panelBorder} strokeWidth={10} strokeLinecap="round" />
        {STAGES.map((s, i) => {
          const x = M + COL / 2 + i * (COL + GAP);
          const vis = interpolate(frame, [15 + i * 45, 25 + i * 45], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return <circle key={s.title} cx={x} cy={LINE_Y} r={26 * vis} fill={s.color} stroke={theme.bg} strokeWidth={6} />;
        })}
      </svg>
      {STAGES.map((s, i) => (
        <Card key={s.title} x={M + i * (COL + GAP)} y={CARD_Y} w={COL} h={CARD_H} color={s.color} delay={20 + i * 45} style={{ padding: "34px 40px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
            <div style={{ fontSize: 60, fontWeight: 800 }}>{s.title}</div>
            <Chip color={s.color} style={{ fontSize: 28 }}>{s.when}</Chip>
          </div>
          <ul style={{ margin: "34px 0 0", paddingLeft: 34, fontSize: 42, lineHeight: 1.35 }}>
            {s.bullets.map((b, j) => (
              <li key={b} style={{ marginBottom: 26, ...appear(frame, fps, 40 + i * 45 + j * 12) }}>{b}</li>
            ))}
          </ul>
        </Card>
      ))}
      <Footer>Submit early and often: the leaderboard keeps each team's best submission in every stage.</Footer>
    </Stage>
  );
};
