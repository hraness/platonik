/**
 * The observatory's recorded Rust studies. One registry keeps the lab index,
 * sitemap, and llms.txt pointing at the same real pages.
 */
export const labPages = [
  { path: "/lab/challenges", name: "Challenges", description: "One program against worlds it never saw" },
  { path: "/lab/bloom", name: "Bloom", description: "Watch creations begin creating" },
  { path: "/lab/ports", name: "Ports", description: "Keep a promise when the reply goes missing" },
  { path: "/lab/ark", name: "Ark control", description: "Give home a plan it can carry out" },
  { path: "/lab/answer", name: "First Answer", description: "Bring a signal home with your crew" },
  { path: "/lab/construction", name: "Construction", description: "Build the crewmate the habitat needs" },
  { path: "/lab/navigation", name: "Navigation", description: "Investigate a courier's navigation" },
  { path: "/lab/habitat", name: "Continuous habitat", description: "Follow a continuous habitat" },
  { path: "/lab/bridge", name: "Shared habitat", description: "Replay the first shared Rust habitat" },
] as const;
