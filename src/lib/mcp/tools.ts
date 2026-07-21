import { z } from "zod";
import { scenePlanSchema } from "@/lib/scene-plan";

/**
 * MCP tools exposed by this server. We keep them intentionally small — one
 * happy-path tool (`render_video`) and one convenience-scaffolder
 * (`plan_video_scenes`) so an agent can iterate on a plan before rendering.
 *
 * JSON Schema is emitted from Zod at request time so `tools/list` stays in
 * lockstep with the actual validators used by `tools/call`.
 */

export const TOOL_DEFINITIONS = [
  {
    name: "plan_video_scenes",
    description:
      "Draft a ScenePlan for a Hyperplexed-style motion-graphics video. Fill title, targetDurationSec (5-180s), a script sized to ~150 wpm × duration, 1-12 scenes, voice, and accent. Returns the plan verbatim — call render_video with it when the user approves.",
    inputSchema: scenePlanSchema,
  },
  {
    name: "render_video",
    description:
      "Enqueue an async render of an MP4 from a ScenePlan. Returns immediately with { jobId, status: 'pending', statusUrl, videoUrl }. Poll statusUrl (GET, Bearer auth) until status='success', then fetch videoUrl (valid 7 days). Full renders take 60–300 seconds; the async shape sidesteps the Cloudflare Tunnel 100s HTTP cap. Narration uses msedge-tts (free) or ElevenLabs if the server has ELEVENLABS_API_KEY.",
    inputSchema: scenePlanSchema,
  },
] as const;

export type ToolName = (typeof TOOL_DEFINITIONS)[number]["name"];

export function findTool(name: string) {
  return TOOL_DEFINITIONS.find((t) => t.name === name);
}

/**
 * Zod-emitted JSON Schema for a given tool, in the shape MCP `tools/list`
 * expects (draft-07 subset). We inline a mini z→JSON walker rather than
 * pulling in `zod-to-json-schema` for one call site.
 */
export function jsonSchemaFor(name: ToolName) {
  const t = findTool(name);
  if (!t) throw new Error(`unknown tool: ${name}`);
  return zodToJsonSchema(t.inputSchema);
}

// Minimal Zod → JSON Schema walker good enough for our scenePlanSchema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function zodToJsonSchema(schema: z.ZodTypeAny): any {
  const def = (schema as unknown as { _def: any })._def;
  switch (def.typeName) {
    case "ZodString":
      return { type: "string" };
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodEnum":
      return { type: "string", enum: def.values };
    case "ZodArray":
      return { type: "array", items: zodToJsonSchema(def.type) };
    case "ZodOptional":
      return zodToJsonSchema(def.innerType);
    case "ZodDefault": {
      const inner = zodToJsonSchema(def.innerType);
      inner.default = def.defaultValue();
      return inner;
    }
    case "ZodObject": {
      const shape = def.shape();
      const props: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [k, v] of Object.entries(shape) as [string, z.ZodTypeAny][]) {
        props[k] = zodToJsonSchema(v);
        const vDef = (v as unknown as { _def: any })._def;
        if (vDef.typeName !== "ZodOptional" && vDef.typeName !== "ZodDefault") {
          required.push(k);
        }
      }
      return { type: "object", properties: props, required };
    }
    case "ZodDiscriminatedUnion":
      return {
        oneOf: def.options.map((o: z.ZodTypeAny) => zodToJsonSchema(o)),
      };
    case "ZodUnion":
      return {
        oneOf: def.options.map((o: z.ZodTypeAny) => zodToJsonSchema(o)),
      };
    case "ZodLiteral":
      return { const: def.value };
    default:
      return {};
  }
}
