import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * Stat scene: a big word/number with a caption below. If `image` is set the
 * layout switches to two-column — image on the left, stat + caption on the
 * right — so the visual carries the moment.
 */
export function StatScene({
  big,
  small,
  image,
  accent,
}: {
  big: string;
  small: string;
  image?: string;
  accent: string;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({ frame, fps, config: { damping: 12, mass: 0.6 } });
  const smallOpacity = interpolate(frame, [fps * 0.35, fps * 0.7], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const imageFade = interpolate(frame, [0, fps * 0.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const imageSlide = interpolate(frame, [0, fps * 0.5], [-40, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const hasImage = Boolean(image);

  return (
    <AbsoluteFill
      style={{
        background: "#0f172a",
        display: "flex",
        flexDirection: hasImage ? "row" : "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Inter, system-ui, sans-serif",
        padding: hasImage ? "60px 80px" : 0,
        gap: 80,
      }}
    >
      {hasImage ? (
        <div
          style={{
            flex: "0 0 45%",
            height: "80%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: imageFade,
            transform: `translateX(${imageSlide}px)`,
          }}
        >
          <Img
            src={image as string}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              borderRadius: 24,
              boxShadow: `0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px ${accent}22`,
            }}
          />
        </div>
      ) : null}

      <div
        style={{
          flex: hasImage ? "1 1 55%" : "0 1 auto",
          textAlign: hasImage ? "left" : "center",
        }}
      >
        <div
          style={{
            color: accent,
            fontSize: hasImage ? 140 : 220,
            fontWeight: 900,
            letterSpacing: hasImage ? -4 : -6,
            transform: `scale(${scale})`,
            transformOrigin: hasImage ? "left center" : "center",
            lineHeight: 1,
          }}
        >
          {big}
        </div>
        <div
          style={{
            color: "rgba(255,255,255,0.85)",
            fontSize: hasImage ? 34 : 42,
            marginTop: 24,
            fontWeight: 500,
            opacity: smallOpacity,
            maxWidth: hasImage ? "100%" : "70%",
            marginLeft: hasImage ? 0 : "auto",
            marginRight: hasImage ? 0 : "auto",
            lineHeight: 1.3,
          }}
        >
          {small}
        </div>
      </div>
    </AbsoluteFill>
  );
}
