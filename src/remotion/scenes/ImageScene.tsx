import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * Full-frame image scene with optional slow zoom + drift ("Ken Burns"), a
 * bottom caption overlay, and a soft dark vignette so caption text stays
 * legible over any image. The image is `object-fit: cover` centred so it
 * always fills the frame.
 */
export function ImageScene({
  src,
  caption,
  kenBurns = true,
  accent,
}: {
  src: string;
  caption?: string;
  kenBurns?: boolean;
  accent: string;
}) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const enter = interpolate(frame, [0, fps * 0.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Ken Burns: slow zoom from 1.00 -> 1.10 across the scene, with a mild
  // horizontal drift.
  const t = durationInFrames > 0 ? frame / durationInFrames : 0;
  const scale = kenBurns ? 1 + t * 0.1 : 1;
  const translateX = kenBurns ? interpolate(t, [0, 1], [-20, 20]) : 0;

  const captionSlide = interpolate(frame, [fps * 0.3, fps * 0.8], [30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const captionFade = interpolate(frame, [fps * 0.3, fps * 0.8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: "#0f172a", overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          transform: `scale(${scale}) translateX(${translateX}px)`,
          opacity: enter,
        }}
      >
        <Img
          src={src}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
          }}
        />
      </AbsoluteFill>

      {caption ? (
        <>
          {/* bottom gradient vignette for caption legibility */}
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(to bottom, rgba(0,0,0,0) 55%, rgba(0,0,0,0.7) 100%)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 80,
              right: 80,
              bottom: 80,
              color: "white",
              fontSize: 52,
              fontWeight: 700,
              fontFamily: "Inter, system-ui, sans-serif",
              textShadow: "0 2px 20px rgba(0,0,0,0.7)",
              transform: `translateY(${captionSlide}px)`,
              opacity: captionFade,
              lineHeight: 1.15,
            }}
          >
            <span
              style={{
                borderLeft: `6px solid ${accent}`,
                paddingLeft: 24,
                display: "inline-block",
              }}
            >
              {caption}
            </span>
          </div>
        </>
      ) : null}
    </AbsoluteFill>
  );
}
