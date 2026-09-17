import { describe, expect, test } from "bun:test";
import {
  type FetchLike,
  DISCLAIMER,
  MAX_SAY_CHARS,
  VOICE_RESPONSE_SCHEMA,
  answer,
  parseVoiceRequest,
  upstreamBody,
  voiceConfig,
  type VoiceConfig,
} from "./voice";

const digest = {
  schema: "platonik-voice-digest-v1",
  digest_hash: `sha256:${"ab".repeat(32)}`,
  report: {},
  facts: [],
  boundary: { present: [], absent: [] },
};

const config: VoiceConfig = {
  base: "https://gateway.example/v1",
  key: "test-key",
  model: "test-model",
  voice: "far-beacon",
  persona: "Test persona.",
  projection: "facts",
};

describe("voiceConfig", () => {
  test("disabled without the gateway env trio", () => {
    expect(voiceConfig({})).toBeNull();
    expect(voiceConfig({ VOICE_GATEWAY_BASE: "https://x" })).toBeNull();
  });

  test("enabled with base, key, model and defaults", () => {
    const env = {
      VOICE_GATEWAY_BASE: "https://gw.example/v1/",
      VOICE_GATEWAY_KEY: "k",
      VOICE_MODEL: "m",
    };
    const cfg = voiceConfig(env);
    expect(cfg?.base).toBe("https://gw.example/v1");
    expect(cfg?.voice).toBe("far-beacon");
    expect(cfg?.persona).toContain("Far Beacon");
  });
});

describe("parseVoiceRequest", () => {
  test("accepts the documented request shape", () => {
    const parsed = parseVoiceRequest({ digest, say: "who answers?" });
    expect(typeof parsed).not.toBe("string");
  });

  test("rejects non-object bodies, wrong digest schema, bad hash", () => {
    expect(parseVoiceRequest(null)).toBeString();
    expect(parseVoiceRequest({ digest: { schema: "x" }, say: "hi" })).toBeString();
    expect(
      parseVoiceRequest({ digest: { ...digest, digest_hash: "nope" }, say: "hi" }),
    ).toBeString();
    expect(parseVoiceRequest({ digest, say: "" })).toBeString();
    expect(parseVoiceRequest({ digest, say: "x".repeat(MAX_SAY_CHARS + 1) })).toBeString();
  });
});

describe("upstreamBody", () => {
  test("embeds persona, digest json, and the caller's line", () => {
    const body = JSON.parse(upstreamBody(config, { digest, say: "hello" }));
    expect(body.model).toBe("test-model");
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("Test persona.");
    expect(body.messages[0].content).toContain(digest.digest_hash);
    expect(body.messages[1]).toEqual({ role: "user", content: "hello" });
  });

  test("projects the digest to facts + boundary by default", () => {
    const full = {
      ...digest,
      report: { journey: { horizon: 128 } },
      facts: [{ proposition: "spark 6 returned" }],
    };
    const body = JSON.parse(upstreamBody(config, { digest: full, say: "hi" }));
    const wire = body.messages[0].content;
    expect(wire).toContain("spark 6 returned");
    expect(wire).not.toContain("journey");
    const fullBody = JSON.parse(
      upstreamBody({ ...config, projection: "full" }, { digest: full, say: "hi" }),
    );
    expect(fullBody.messages[0].content).toContain("journey");
  });
});

describe("answer", () => {
  const okFetch = async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: "  the wire carried rain  " } }],
        usage: { cost: 0.007 },
      }),
      { status: 200 },
    );

  test("returns the labeled contract shape", async () => {
    const res = await answer(config, { digest, say: "hi" }, okFetch);
    expect("error" in res).toBe(false);
    if (!("error" in res)) {
      expect(res.schema).toBe(VOICE_RESPONSE_SCHEMA);
      expect(res.fiction).toBe(true);
      expect(res.digest_hash).toBe(digest.digest_hash);
      expect(res.disclaimer).toBe(DISCLAIMER);
      expect(res.text).toBe("the wire carried rain");
      expect(res.cost_usd).toBe(0.007);
    }
  });

  test("caches a reply per (model, digest, normalized say)", async () => {
    let calls = 0;
    const counting: FetchLike = async () => {
      calls += 1;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "counted reply" } }],
          usage: { cost: 0.001 },
        }),
        { status: 200 },
      );
    };
    const c = { ...config, model: `cache-test-${Math.random()}` };
    const req = { digest, say: "Cache check question?" };
    const first = await answer(c, req, counting);
    const second = await answer(c, { digest, say: "  cache   CHECK question? " }, counting);
    expect(calls).toBe(1);
    expect(second).toEqual(first);
  });

  test("maps upstream failure and empty replies to contract errors", async () => {
    const down: FetchLike = () => Promise.reject(new Error("down"));
    expect(await answer(config, { digest, say: "down-probe" }, down)).toMatchObject({
      error: "voice_gateway_unreachable",
    });
    const bad: FetchLike = () => Promise.resolve(new Response("x", { status: 500 }));
    expect(await answer(config, { digest, say: "bad-probe" }, bad)).toMatchObject({
      error: "voice_gateway_500",
    });
    const empty: FetchLike = () =>
      Promise.resolve(
        new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), {
          status: 200,
        }),
      );
    expect(await answer(config, { digest, say: "empty-probe" }, empty)).toMatchObject({
      error: "voice_gateway_empty",
    });
  });
});
