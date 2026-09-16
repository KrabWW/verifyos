import React from "react";
import { Composition, Series, Audio, staticFile } from "remotion";
import { HeroScene, InputScene, CrawlScene } from "./scenes1";
import { LoginScene, Crawl2Scene, SuggestScene, RunScene, OutroScene } from "./scenes2";
import { MobileScene } from "./scenes3";
import ttsDurations from "./durations.json";

// 场景时长（帧 @30fps）= TTS 音频时长换算；无音频时使用默认。
const DEFAULTS: Record<string, number> = {
  hero: 190,
  input: 150,
  crawl: 225,
  login: 260,
  crawl2: 200,
  suggest: 230,
  run: 245,
  mobile: 185,
  outro: 215,
};
const durations: Record<string, number> = {};
for (const k of Object.keys(DEFAULTS)) {
  const t = (ttsDurations as Record<string, unknown>)[k];
  durations[k] = typeof t === "number" && t > 0 ? Math.ceil(t * 30) + 26 : DEFAULTS[k];
}

const SCENES: [string, React.FC][] = [
  ["hero", HeroScene],
  ["input", InputScene],
  ["crawl", CrawlScene],
  ["login", LoginScene],
  ["crawl2", Crawl2Scene],
  ["suggest", SuggestScene],
  ["run", RunScene],
  ["mobile", MobileScene],
  ["outro", OutroScene],
];

const hasAudio = (name: string) => {
  try {
    staticFile(`audio/${name}.mp3`);
    return true;
  } catch {
    return false;
  }
};

export const Promo: React.FC = () => (
  <Series>
    {SCENES.map(([name, Comp]) => (
      <Series.Sequence key={name} durationInFrames={durations[name]}>
        <>
          <Comp />
          {hasAudio(name) ? <Audio src={staticFile(`audio/${name}.mp3`)} /> : null}
        </>
      </Series.Sequence>
    ))}
  </Series>
);

const total = Object.values(durations).reduce((a, b) => a + b, 0);

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Promo"
    component={Promo}
    durationInFrames={total}
    fps={30}
    width={1920}
    height={1080}
  />
);
