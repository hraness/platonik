// The /voice serving contract from docs/voices.md: a caller brings a checked
// platonik-voice-digest-v1 and one line to say; the service holds the persona
// and model reference and returns labeled fiction that names the exact wire
// it was rendered from. This module is the transport only — the persona,
// gateway base, key, and model are server-side env configuration, and the
// endpoint answers disabled without them. No browser credential exists.

export const VOICE_RESPONSE_SCHEMA = "platonik-voice-response-v1";
export const VOICE_DIGEST_SCHEMA = "platonik-voice-digest-v1";
export const DISCLAIMER = "authored fiction — does not demonstrate a mind";

export const MAX_SAY_CHARS = 2_000;
export const MAX_BODY_BYTES = 65_536;
export const MAX_REPLY_TOKENS = 512;
export const UPSTREAM_TIMEOUT_MS = 30_000;

export interface VoiceConfig {
  base: string;
  key: string;
  model: string;
  voice: string;
  persona: string;
  projection: "facts" | "full";
}

export interface VoiceRequest {
  digest: { digest_hash: string; [key: string]: unknown };
  say: string;
}

export interface VoiceResponse {
  schema: typeof VOICE_RESPONSE_SCHEMA;
  voice: string;
  fiction: true;
  digest_hash: string;
  disclaimer: typeof DISCLAIMER;
  model: string;
  text: string;
  cost_usd: number | null;
}

export interface VoiceError {
  schema: typeof VOICE_RESPONSE_SCHEMA;
  error: string;
  fiction: true;
  disclaimer: typeof DISCLAIMER;
}

const DEFAULT_PERSONA = [
  "You are the voice answering at the Far Beacon. You speak only of what the",
  "wire carried — the checked digest below is the whole of what you know.",
  "Where it is silent you say so; you never invent the sender's world. You",
  "are a character in a documented fiction; you never claim a mind.",
].join(" ");

export function voiceConfig(env: Record<string, string | undefined> = process.env): VoiceConfig | null {
  const base = env.VOICE_GATEWAY_BASE?.replace(/\/+$/, "");
  const key = env.VOICE_GATEWAY_KEY;
  const model = env.VOICE_MODEL;
  if (!base || !key || !model) return null;
  return {
    base,
    key,
    model,
    voice: env.VOICE_NAME ?? "far-beacon",
    persona: env.VOICE_PERSONA ?? DEFAULT_PERSONA,
    // The wire sent upstream is a projection of the checked digest, not the
    // digest itself: the response still binds digest_hash either way. "facts"
    // sends only the citeable propositions plus the declared boundary (~4x
    // smaller); "full" sends the digest verbatim including the report prose.
    projection: env.VOICE_DIGEST_PROJECTION === "full" ? "full" : "facts",
  };
}

export function parseVoiceRequest(body: unknown): VoiceRequest | string {
  if (typeof body !== "object" || body === null) return "Body must be a JSON object.";
  const { digest, say } = body as { digest?: unknown; say?: unknown };
  if (typeof digest !== "object" || digest === null) return "Missing digest.";
  const d = digest as Record<string, unknown>;
  if (d.schema !== VOICE_DIGEST_SCHEMA) return `digest.schema must be ${VOICE_DIGEST_SCHEMA}.`;
  if (typeof d.digest_hash !== "string" || !/^sha256:[0-9a-f]{64}$/.test(d.digest_hash)) {
    return "digest.digest_hash must be a sha256:<64-hex> string.";
  }
  if (typeof say !== "string" || say.trim().length === 0) return "Missing say.";
  if (say.length > MAX_SAY_CHARS) return `say exceeds ${MAX_SAY_CHARS} characters.`;
  return { digest: d as VoiceRequest["digest"], say: say.trim() };
}

export function voiceError(error: string): VoiceError {
  return { schema: VOICE_RESPONSE_SCHEMA, error, fiction: true, disclaimer: DISCLAIMER };
}

export function projectDigest(digest: VoiceRequest["digest"]): unknown {
  return {
    schema: digest.schema,
    digest_hash: digest.digest_hash,
    facts: digest.facts,
    boundary: digest.boundary,
  };
}

export function upstreamBody(config: VoiceConfig, request: VoiceRequest): string {
  const wire =
    config.projection === "full" ? request.digest : projectDigest(request.digest);
  return JSON.stringify({
    model: config.model,
    max_tokens: MAX_REPLY_TOKENS,
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content: `${config.persona}\n\nWire digest ${request.digest.digest_hash}:\n${JSON.stringify(wire)}`,
      },
      { role: "user", content: request.say },
    ],
  });
}

interface UpstreamChoice {
  message?: { content?: string };
}
interface UpstreamUsage {
  cost?: number;
  total_cost?: number;
}
interface UpstreamResponse {
  choices?: UpstreamChoice[];
  usage?: UpstreamUsage;
}

export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<Response>;

export async function answer(
  config: VoiceConfig,
  request: VoiceRequest,
  fetchFn: FetchLike = fetch,
): Promise<VoiceResponse | VoiceError> {
  const upstream = await fetchFn(`${config.base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.key}`,
    },
    body: upstreamBody(config, request),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  }).catch(() => null);
  if (!upstream) return voiceError("voice_gateway_unreachable");
  if (!upstream.ok) return voiceError(`voice_gateway_${upstream.status}`);
  const parsed = (await upstream.json().catch(() => null)) as UpstreamResponse | null;
  const text = parsed?.choices?.[0]?.message?.content?.trim();
  if (!text) return voiceError("voice_gateway_empty");
  const cost = parsed?.usage?.cost ?? parsed?.usage?.total_cost ?? null;
  return {
    schema: VOICE_RESPONSE_SCHEMA,
    voice: config.voice,
    fiction: true,
    digest_hash: request.digest.digest_hash,
    disclaimer: DISCLAIMER,
    model: config.model,
    text,
    cost_usd: typeof cost === "number" ? cost : null,
  };
}
