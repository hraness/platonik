import type { Metadata } from "next";
import { Observatory } from "@/components/observatory";
import "./lab.css";

export const metadata: Metadata = {
  title: "The observatory",
  description: "Explore executable organisms, fuzzy truth landscapes, world budgets, and an Autoverse signal workbench. Four local browser prototypes for Platonik.",
  alternates: { canonical: "/lab" },
};

export default function LabPage() {
  return <main id="main" className="lab"><header className="lab-header"><h1>A small window into possible life.</h1><p>You are a frontier engineer. Grow a program, examine what it does, and find out what a larger world would cost.</p><p className="lab-note">Four working browser experiments. The Rust game and shared world remain in design. Everything here runs locally; no AI calls or paid compute.</p></header><Observatory /></main>;
}
