import { suiteOidcSurfaceServerAccountSession } from "@hraness/suite-accounts/oidc-surface-server";
import { NextResponse } from "next/server";
import {
  MAX_BODY_BYTES,
  answer,
  parseVoiceRequest,
  voiceConfig,
  voiceError,
  voiceRateLimit,
} from "@/lib/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /voice — the serving contract documented in docs/voices.md. The route
// is inert unless VOICE_GATEWAY_BASE, VOICE_GATEWAY_KEY (or the deployment's
// own VERCEL_OIDC_TOKEN), and VOICE_MODEL are set server-side; nothing
// model-facing reaches the browser. Every call also requires a signed-in
// Hraness account — free tier is enough — checked from the sealed
// suite-auth session cookie before any paid upstream work.
export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) {
    return NextResponse.json(voiceError("body_too_large"), { status: 413 });
  }
  const session = await suiteOidcSurfaceServerAccountSession("platonik", request);
  if (session === null) {
    return NextResponse.json(
      {
        ...voiceError("voice_sign_in_required"),
        signIn: "/api/suite-auth/start?return_to=/",
      },
      { status: 401 },
    );
  }
  if (!voiceRateLimit(session.suiteAccountId)) {
    return NextResponse.json(voiceError("voice_rate_limited"), { status: 429 });
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return NextResponse.json(voiceError("body_too_large"), { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json(voiceError("invalid_json"), { status: 400 });
  }
  const parsed = parseVoiceRequest(body);
  if (typeof parsed === "string") {
    return NextResponse.json(voiceError(parsed), { status: 400 });
  }
  const config = voiceConfig();
  if (!config) {
    return NextResponse.json(voiceError("voice_not_configured"), { status: 503 });
  }
  const response = await answer(config, parsed);
  const status = "error" in response ? 502 : 200;
  return NextResponse.json(response, { status });
}
