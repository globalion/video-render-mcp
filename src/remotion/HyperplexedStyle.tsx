import { AbsoluteFill, Audio, Sequence, useVideoConfig } from "remotion";
import { TitleScene } from "./scenes/TitleScene";
import { CodeScene } from "./scenes/CodeScene";
import { StatScene } from "./scenes/StatScene";
import { CtaScene } from "./scenes/CtaScene";
import { ImageScene } from "./scenes/ImageScene";
import { Captions } from "./Captions";
import type { RemotionInputProps, Scene, WordTiming } from "../lib/scene-plan";

export function HyperplexedStyle(props: RemotionInputProps) {
  const { fps } = useVideoConfig();
  const { plan, narrationDataUrl, musicUrl, sceneRanges, words } = props;
  const showCaptions =
    plan.captions !== false && words.length > 0 && plan.voice.startsWith("premium-");

  return (
    <AbsoluteFill style={{ background: "#0f172a" }}>
      {plan.scenes.map((scene, i) => {
        const range = sceneRanges[i];
        if (!range) return null;
        const from = Math.round(range.startSec * fps);
        const durationInFrames = Math.max(
          1,
          Math.round((range.endSec - range.startSec) * fps)
        );
        return (
          <Sequence key={i} from={from} durationInFrames={durationInFrames}>
            <SceneRouter scene={scene} plan={plan} />
          </Sequence>
        );
      })}
      {showCaptions ? <Captions words={words as WordTiming[]} /> : null}
      {/* Background music at 15% volume — auto-ducks under narration by ear */}
      {musicUrl ? <Audio src={musicUrl} volume={0.15} loop /> : null}
      <Audio src={narrationDataUrl} />
    </AbsoluteFill>
  );
}

function SceneRouter({
  scene,
  plan,
}: {
  scene: Scene;
  plan: RemotionInputProps["plan"];
}) {
  switch (scene.type) {
    case "title":
      return (
        <TitleScene
          copy={scene.copy}
          subtitle={scene.subtitle}
          accent={plan.accent}
        />
      );
    case "code":
      return (
        <CodeScene
          language={scene.language}
          snippet={scene.snippet}
          caption={scene.caption}
          highlightLines={scene.highlightLines}
          accent={plan.accent}
        />
      );
    case "stat":
      return (
        <StatScene
          big={scene.big}
          small={scene.small}
          image={scene.image}
          accent={plan.accent}
        />
      );
    case "cta":
      return <CtaScene url={scene.url} copy={scene.copy} accent={plan.accent} />;
    case "image":
      return (
        <ImageScene
          src={scene.src}
          caption={scene.caption}
          kenBurns={scene.kenBurns}
          accent={plan.accent}
        />
      );
  }
}
