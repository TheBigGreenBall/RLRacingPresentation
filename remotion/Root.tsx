import React from "react";
import { Composition } from "remotion";
import { RLLoop } from "./compositions/RLLoop";
import { EventTimeline } from "./compositions/EventTimeline";
import { PPOPipeline } from "./compositions/PPOPipeline";

const FPS = 30;
const base = { width: 1920, height: 1080, fps: FPS };

export const COMPOSITIONS = [
  { id: "RLLoop", component: RLLoop, seconds: 8 },
  { id: "EventTimeline", component: EventTimeline, seconds: 10 },
  { id: "PPOPipeline", component: PPOPipeline, seconds: 10 },
] as const;

export const Root: React.FC = () => (
  <>
    {COMPOSITIONS.map((c) => (
      <Composition key={c.id} id={c.id} component={c.component as React.FC} durationInFrames={c.seconds * FPS} {...base} />
    ))}
  </>
);
