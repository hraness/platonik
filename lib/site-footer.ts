import type { HranessSiteFooterProps } from "@hraness/site-footer/react";

/**
 * One footer contract for every public route. The root layout renders it with
 * the React adapter; tests render the same props to check the shared
 * "Built by Hraness" attribution and the absence of any personal maker credit.
 * Platonik has no public mailing list, so signup stays off and support carries
 * `updates: false`.
 */
export const siteFooterProps = {
  mailingList: { kind: "none" },
  placement: "flow",
  support: {
    id: "platonik",
    name: "Platonik",
    updates: false,
    valueProposition: "Support development of the simulation and its open documentation.",
  },
} as const satisfies HranessSiteFooterProps;
