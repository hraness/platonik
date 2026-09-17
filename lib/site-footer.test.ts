import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { hranessAttribution, renderHranessSiteFooter } from "@hraness/site-footer";
import { HranessSiteFooter } from "@hraness/site-footer/react";
import { siteFooterProps } from "./site-footer";

const decodeEntities = (html: string) => html.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const textOf = (html: string) => decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

describe("shared site footer", () => {
  test("the layout renders the React adapter with the shared Built by Hraness attribution", () => {
    const html = renderToStaticMarkup(createElement(HranessSiteFooter, siteFooterProps));
    expect(html).toContain('id="hraness-site-footer"');
    expect(html).toContain('data-slot="hraness-attribution"');
    expect(hranessAttribution.title).toBe("Built by Hraness");
    const text = textOf(html);
    expect(text).toContain(hranessAttribution.title);
    expect(text).toContain(hranessAttribution.subtitle);
    expect(html).toContain('href="https://hraness.com/"');
  });

  test("the React adapter and the framework-neutral renderer agree on the same contract", () => {
    const react = renderToStaticMarkup(createElement(HranessSiteFooter, siteFooterProps));
    const neutral = renderHranessSiteFooter(siteFooterProps);
    expect(textOf(react)).toBe(textOf(neutral));
    for (const html of [react, neutral]) {
      expect(html).toContain('data-mailing-list="none"');
      expect(html).not.toContain("<form");
      expect(html).toContain("https://github.com/hraness");
    }
  });

  test("attribution belongs to the organization, never to a person", () => {
    const text = textOf(renderToStaticMarkup(createElement(HranessSiteFooter, siteFooterProps)));
    expect(text).not.toMatch(/Ben(jamin)? Guo|A project by|Made by|Maker/i);
    expect(text.match(/Built by Hraness/g)).toHaveLength(1);
  });

  test("Platonik keeps signup off and support explicit", () => {
    expect(siteFooterProps.mailingList).toEqual({ kind: "none" });
    expect(siteFooterProps.support.id).toBe("platonik");
    expect(siteFooterProps.support.updates).toBe(false);
    const html = renderHranessSiteFooter(siteFooterProps);
    expect(html).toContain("account.hraness.com");
    expect(decodeEntities(html)).toContain(siteFooterProps.support.valueProposition);
  });
});
