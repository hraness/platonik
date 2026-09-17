import { describe, expect, test } from "bun:test";

import { POST } from "./route";

const body = JSON.stringify({
  digest: {
    schema: "platonik-voice-digest-v1",
    digest_hash: `sha256:${"ab".repeat(32)}`,
    facts: [],
    boundary: { present: [], absent: [] },
  },
  say: "who answers?",
});

// Without SUITE_OIDC_COOKIE_SECRET / NEXT_PUBLIC_SITE_URL the relying party
// cannot exist, so every request must fail closed at the account gate — the
// upstream gateway is never touched.
describe("POST /voice", () => {
  test("rejects an unsigned request with a sign-in pointer", async () => {
    const response = await POST(
      new Request("https://platonik.space/voice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
    );
    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error).toBe("voice_sign_in_required");
    expect(json.fiction).toBe(true);
    expect(json.signIn).toBe("/api/suite-auth/start?return_to=/");
  });

  test("rejects an oversized body before any session work", async () => {
    const response = await POST(
      new Request("https://platonik.space/voice", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": "999999",
        },
        body: "{}",
      }),
    );
    expect(response.status).toBe(413);
    const json = await response.json();
    expect(json.error).toBe("body_too_large");
  });
});
