import { z } from "zod";

/**
 * ScenePlan — the contract Claude (or any MCP client) fills in when it wants
 * a video rendered. Passed straight through to the Remotion composition as
 * `inputProps`.
 */

/**
 * Optional image: either an https URL or a data: URL (base64-encoded).
 * Data URLs let a client ship pixel-perfect mockups inline without any
 * upload dance — Remotion accepts them via <Img src=...>.
 */
const imageUrlSchema = z
  .string()
  .refine((s) => s.startsWith("http://") || s.startsWith("https://") || s.startsWith("data:image/"), {
    message: "image must be an http(s) URL or a data:image/... URL",
  });

export const sceneSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("title"),
    copy: z.string(),
    subtitle: z.string().optional(),
  }),
  z.object({
    type: z.literal("code"),
    language: z.string(),
    snippet: z.string(),
    caption: z.string().optional(),
    highlightLines: z.array(z.number()).optional(),
  }),
  z.object({
    type: z.literal("stat"),
    big: z.string().describe("Big number or phrase, e.g. '11ms'"),
    small: z.string().describe("Small caption under it"),
    image: imageUrlSchema
      .optional()
      .describe("Optional image shown next to the stat (e.g. a mockup or screenshot)"),
  }),
  z.object({
    type: z.literal("cta"),
    url: z.string(),
    copy: z.string(),
  }),
  z.object({
    type: z.literal("image"),
    src: imageUrlSchema.describe("The image to display full-frame (http(s) or data:image/...)"),
    caption: z.string().optional().describe("Overlay caption at the bottom"),
    kenBurns: z
      .boolean()
      .default(true)
      .describe("Slow zoom + drift while on screen (Ken Burns). Default true."),
  }),
]);

export const scenePlanSchema = z.object({
  title: z.string(),
  targetDurationSec: z.number().int().min(5).max(180).default(30),
  script: z.string().describe("Full narration text. Size it to ~150 wpm × duration."),
  voice: z
    .enum([
      // Free tier — Microsoft Edge neural voices. Good but "clearly AI".
      "male-uk",
      "female-uk",
      "male-us",
      "female-us",
      // Premium tier — ElevenLabs. Human-indistinguishable.  3x credit cost.
      "premium-male-uk",
      "premium-female-uk",
      "premium-male-us",
      "premium-female-us",
    ])
    .default("male-uk"),
  scenes: z.array(sceneSchema).min(1).max(12),
  music: z
    .enum(["upbeat", "chill", "tense", "none"])
    .default("none")
    .describe("Background music track (auto-ducked under narration)."),
  captions: z
    .boolean()
    .default(true)
    .describe("Burn in word-timed subtitles. Requires a premium voice — ignored on free voices."),
  accent: z
    .string()
    .default("#0D9488")
    .describe("Hex accent colour for titles/CTAs"),
});

export type ScenePlan = z.infer<typeof scenePlanSchema>;
export type Scene = z.infer<typeof sceneSchema>;

export function isPremiumVoice(v: ScenePlan["voice"]): boolean {
  return v.startsWith("premium-");
}

/**
 * Word-level timing pulled from ElevenLabs' timestamps response so the
 * Remotion caption component can highlight the word being spoken.
 */
export interface WordTiming {
  word: string;
  startSec: number;
  endSec: number;
}

/**
 * The full input passed to the Remotion composition — plan + resolved audio
 * (as a data URL) + per-scene time ranges. Index signature keeps Remotion's
 * `Record<string, unknown>` constraint happy.
 */
export interface RemotionInputProps {
  plan: ScenePlan;
  narrationDataUrl: string;
  musicUrl: string | null;
  totalDurationSec: number;
  sceneRanges: Array<{ startSec: number; endSec: number }>;
  words: WordTiming[];
  [key: string]: unknown;
}
