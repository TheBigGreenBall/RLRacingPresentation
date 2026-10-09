import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../../theme/theme";

export const Stage: React.FC<{ children: React.ReactNode; title?: string; subtitle?: string }> = ({ children, title, subtitle }) => (
  <AbsoluteFill style={{ background: `radial-gradient(1200px 700px at 30% 20%, ${theme.bgSoft}, ${theme.bg})`, fontFamily: theme.font, color: theme.text }}>
    {title ? (
      <div style={{ position: "absolute", top: 54, left: 90, right: 90 }}>
        <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: -1 }}>{title}</div>
        {subtitle ? <div style={{ fontSize: 28, color: theme.textMuted, marginTop: 8 }}>{subtitle}</div> : null}
      </div>
    ) : null}
    {children}
  </AbsoluteFill>
);

export const Card: React.FC<{
  x: number; y: number; w: number; h: number; color?: string; children?: React.ReactNode; delay?: number; style?: React.CSSProperties;
}> = ({ x, y, w, h, color = theme.accent2, children, delay = 0, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 16, stiffness: 120, mass: 0.8 } });
  return (
    <div
      style={{
        position: "absolute", left: x, top: y, width: w, height: h, boxSizing: "border-box",
        background: theme.panel, border: `2px solid ${theme.panelBorder}`, borderTop: `6px solid ${color}`, borderRadius: 18,
        transform: `translateY(${(1 - s) * 40}px) scale(${0.9 + 0.1 * s})`, opacity: s,
        padding: "22px 28px", boxShadow: "0 20px 60px -30px rgba(0,0,0,.8)", ...style,
      }}
    >
      {children}
    </div>
  );
};

export const Chip: React.FC<{ color?: string; children: React.ReactNode; style?: React.CSSProperties; mono?: boolean }> = ({ color = theme.accent2, children, style, mono }) => (
  <span
    style={{
      display: "inline-block", padding: "6px 16px", borderRadius: 999, fontSize: 24, fontWeight: 600, whiteSpace: "nowrap",
      background: `${color}22`, border: `2px solid ${color}`, color, fontFamily: mono ? theme.mono : theme.font, ...style,
    }}
  >
    {children}
  </span>
);

/** Fade+slide helper: returns opacity/transform CSS for an element appearing at `delay` frames. */
export function appear(frame: number, fps: number, delay: number, dy = 24): React.CSSProperties {
  const s = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 110 } });
  return { opacity: s, transform: `translateY(${(1 - s) * dy}px)` };
}

/** Straight SVG arrow with a moving pulse. */
export const Arrow: React.FC<{
  x1: number; y1: number; x2: number; y2: number; color: string; phase?: number; label?: string; labelOffset?: number; width?: number;
}> = ({ x1, y1, x2, y2, color, phase, label, labelOffset = -18, width = 6 }) => {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  const headL = 26, hx = x2 - ux * headL, hy = y2 - uy * headL;
  const nx = -uy, ny = ux;
  const mx = (x1 + x2) / 2 + nx * labelOffset, my = (y1 + y2) / 2 + ny * labelOffset;
  return (
    <g>
      <line x1={x1} y1={y1} x2={hx} y2={hy} stroke={color} strokeWidth={width} strokeLinecap="round" opacity={0.85} />
      <polygon points={`${x2},${y2} ${hx + nx * 14},${hy + ny * 14} ${hx - nx * 14},${hy - ny * 14}`} fill={color} />
      {phase !== undefined ? (
        <circle cx={x1 + dx * phase} cy={y1 + dy * phase} r={13} fill="#fff" opacity={interpolate(phase, [0, 0.1, 0.9, 1], [0, 1, 1, 0])} />
      ) : null}
      {label ? (
        <text x={mx} y={my} fill={color} fontSize={24} fontWeight={700} textAnchor="middle" fontFamily={theme.font}>
          {label}
        </text>
      ) : null}
    </g>
  );
};

export const Footer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ position: "absolute", left: 90, right: 90, bottom: 44, fontSize: 26, color: theme.textMuted, textAlign: "center" }}>{children}</div>
);
