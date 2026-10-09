import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { theme } from "../../theme/theme";
import { Stage, Card, appear, Footer } from "../components/ui";

const Icon: React.FC<{ kind: string; t: number }> = ({ kind, t }) => {
  const c = theme.bad;
  if (kind === "off") {
    const x = interpolate(Math.sin(t * 2), [-1, 1], [0, 46]);
    return (
      <svg width={300} height={150} viewBox="0 0 300 150">
        <rect x={0} y={20} width={300} height={90} fill="#2b2f35" />
        <line x1={0} y1={20} x2={300} y2={20} stroke="#ddd" strokeWidth={4} />
        <line x1={0} y1={110} x2={300} y2={110} stroke="#ddd" strokeWidth={4} />
        <line x1={0} y1={128} x2={300} y2={128} stroke={c} strokeWidth={3} strokeDasharray="8 8" />
        <text x={296} y={147} fontSize={15} fill={c} textAnchor="end" fontFamily={theme.mono}>half-width + 0.5 m</text>
        <rect x={110} y={62 + x} width={70} height={34} rx={6} fill={theme.accent} />
        <rect x={125} y={70 + x} width={36} height={18} rx={4} fill="#262a30" />
      </svg>
    );
  }
  if (kind === "flip") {
    const r = interpolate(Math.sin(t * 1.5), [-1, 1], [0, 180]);
    return (
      <svg width={300} height={150} viewBox="0 0 300 150">
        <line x1={0} y1={130} x2={300} y2={130} stroke="#ddd" strokeWidth={4} />
        <g transform={`translate(150 95) rotate(${r})`}>
          <rect x={-45} y={-18} width={90} height={36} rx={6} fill={theme.accent} />
          <rect x={-28} y={-34} width={48} height={18} rx={4} fill="#262a30" />
        </g>
        <line x1={150} y1={95} x2={150 + 40 * Math.sin((r * Math.PI) / 180) * -1} y2={95 - 40 * Math.cos((r * Math.PI) / 180)} stroke={theme.good} strokeWidth={5} />
        <text x={150} y={22} fontSize={16} fill={theme.textMuted} textAnchor="middle" fontFamily={theme.mono}>flipped when up·z &lt; 0.3</text>
      </svg>
    );
  }
  if (kind === "fast") {
    const ang = interpolate(Math.sin(t * 1.2), [-1, 1], [-120, 110]);
    return (
      <svg width={300} height={150} viewBox="0 0 300 150">
        <path d="M 40 130 A 110 110 0 0 1 260 130" fill="none" stroke="#3a4350" strokeWidth={14} />
        <path d="M 212 44 A 110 110 0 0 1 260 130" fill="none" stroke={c} strokeWidth={14} />
        <line x1={150} y1={130} x2={150 + 95 * Math.sin((ang * Math.PI) / 180)} y2={130 - 95 * Math.cos((ang * Math.PI) / 180)} stroke="#fff" strokeWidth={6} strokeLinecap="round" />
        <text x={150} y={110} fontSize={22} fill={theme.text} textAnchor="middle" fontFamily={theme.mono}>60 m/s</text>
      </svg>
    );
  }
  const blink = Math.sin(t * 6) > 0;
  return (
    <svg width={300} height={150} viewBox="0 0 300 150">
      <text x={150} y={95} fontSize={64} fontWeight={800} fill={blink ? c : theme.textMuted} textAnchor="middle" fontFamily={theme.mono}>NaN</text>
      <text x={150} y={130} fontSize={18} fill={theme.textMuted} textAnchor="middle" fontFamily={theme.mono}>qpos / qvel not finite</text>
    </svg>
  );
};

const RULES = [
  { kind: "off", title: "Off the track", text: "|lateral offset| > half-width + 0.5 m. Walls normally prevent this." },
  { kind: "flip", title: "Rolled over", text: "The car's up axis has z < 0.3: it is on its side or roof." },
  { kind: "fast", title: "Too fast", text: "Speed above 60 m/s. Guards against solver blow-ups." },
  { kind: "nan", title: "Non-finite state", text: "Any NaN or inf in position or velocity ends the run." },
];

export const DQRules: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  return (
    <Stage title="What ends an episode (and disqualifies a judged run)" subtitle="Fixed by the platform. The same four checks apply in training, evaluation and judging.">
      {RULES.map((r, i) => (
        <Card key={r.kind} x={120 + i * 430} y={290} w={400} h={420} color={theme.bad} delay={10 + i * 15}>
          <Icon kind={r.kind} t={t} />
          <div style={{ fontSize: 34, fontWeight: 800, marginTop: 16 }}>{r.title}</div>
          <div style={{ fontSize: 24, color: theme.textMuted, marginTop: 8, lineHeight: 1.3 }}>{r.text}</div>
        </Card>
      ))}
      <div style={{ position: "absolute", left: 120, right: 120, top: 760, ...appear(frame, fps, 95) }}>
        <div style={{ background: theme.panel, border: `2px solid ${theme.panelBorder}`, borderLeft: `8px solid ${theme.warn}`, borderRadius: 18, padding: "22px 34px", fontSize: 28, lineHeight: 1.4 }}>
          <b>Lap validity.</b> A lap counts only when you cross the line forwards after a valid start. Crossing it backwards voids the lap.
          Random training starts wait for the first crossing before timing. In judging you start on the line, so lap 1 counts.
        </div>
      </div>
      <Footer>In multi-car races a DQ'd car coasts to a stop with zero throttle and keeps the laps it had.</Footer>
    </Stage>
  );
};
