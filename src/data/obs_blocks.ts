// Hand-copied from rlracing/env/obs.py (OBS_VERSION 2). Must match public/data/obs_contract.json.
export const OBS_VERSION = 2;
export const OBS_SIZE = 60;
export const LOOKAHEAD_M = [1, 2, 3, 5, 8, 12, 16, 20, 25, 30];
export const OBS_BLOCKS = [
  { name: "lookahead_xy", start: 0, end: 20, divisor: "÷ 30 m", what: "10 centerline points ahead, x and y in the car frame" },
  { name: "lookahead_half_width", start: 20, end: 30, divisor: "÷ 14 m", what: "track half-width at those points" },
  { name: "lateral_heading", start: 30, end: 32, divisor: "÷ 14 m, ÷ π", what: "offset from centerline, heading error" },
  { name: "lin_vel", start: 32, end: 35, divisor: "÷ 30 m/s", what: "body velocity fwd / left / up" },
  { name: "ang_vel", start: 35, end: 38, divisor: "÷ 5 rad/s", what: "roll, pitch, yaw rates" },
  { name: "wheels_steer", start: 38, end: 43, divisor: "÷ 100, ÷ 0.7", what: "4 wheel spins + steer angle" },
  { name: "prev_action", start: 43, end: 45, divisor: "× 1", what: "last [steer, throttle]" },
  { name: "opponents", start: 45, end: 60, divisor: "÷ 30, ÷ 3", what: "3 nearest cars × [x, y, vx, vy, size]" },
] as const;
