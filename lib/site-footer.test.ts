import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HRANESS_ACCOUNT_URL, HRANESS_HOME_URL, renderHranessSiteFooter } from "@hraness/site-footer";
import { HranessSiteFooter } from "@hraness/site-footer/react";
import { siteFooterProps } from "./site-footer";

const decodeEntities = (html: string) => html.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const textOf = (html: string) => decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const renderReactFooter = () => renderToStaticMarkup(createElement(HranessSiteFooter, siteFooterProps));

describe("shared site footer", () => {
  test("the React adapter renders the shared Hraness mark attribution", () => {
    const html = renderReactFooter();
    expect(html).toContain('id="hraness-site-footer"');
    expect(html).toContain('data-slot="hraness-mark"');
    const attribution = html.match(
      /<a aria-label="Hraness home"[^>]*>[\s\S]*?<\/a>/u,
    )?.[0];
    expect(attribution).toBeDefined();
    expect(attribution).toContain("<svg");
    expect(attribution).toContain(">by Hraness<");
    expect(html).toContain(`href="${HRANESS_HOME_URL}"`);
  });

  test("the root layout renders exactly one shared footer and no hand-written footer bar", async () => {
    const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
    expect(layout).toContain('from "@hraness/site-footer/react"');
    expect(layout).toContain('import "@hraness/site-footer/styles.css"');
    expect(layout.match(/<HranessSiteFooter\b/g)).toHaveLength(1);
    expect(layout).toContain("{...siteFooterProps}");
    expect(layout).not.toMatch(/<footer\b|renderHranessSiteFooter|dangerouslySetInnerHTML=\{\{ __html: render/);
  });

  test("attribution belongs to the organization, never to a person", () => {
    for (const html of [renderReactFooter(), renderHranessSiteFooter(siteFooterProps)]) {
      const text = textOf(html);
      expect(text).not.toMatch(/Ben(jamin)? Guo|A project by|Made by|Maker/i);
      expect(text.match(/by Hraness/g)).toHaveLength(1);
    }
  });

  test("Platonik keeps signup off and support explicit", () => {
    expect(siteFooterProps.mailingList).toEqual({ kind: "none" });
    expect(siteFooterProps.support.id).toBe("platonik");
    expect(siteFooterProps.support.updates).toBe(false);
    const html = renderReactFooter();
    expect(html).toContain('data-mailing-list="none"');
    expect(html).not.toContain("<form");
    expect(html).toContain(new URL(HRANESS_ACCOUNT_URL).host);
    expect(decodeEntities(html)).toContain(siteFooterProps.support.valueProposition);
  });
});
