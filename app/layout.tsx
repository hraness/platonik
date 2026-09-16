import type { Metadata } from "next";
import { renderHranessSiteFooter } from "@hraness/site-footer";
import "@hraness/site-footer/styles.css";
import Link from "next/link";
import Image from "next/image";
import { site } from "@/lib/site";
import { appearanceFallback } from "@/lib/appearance";
import { AppearanceControl, AppearanceProvider } from "@/components/appearance";
import "@fontsource/newsreader/latin-400.css";
import "@hraness/design-kit/fonts.css";
import "@hraness/ui/stylex.css";
import "@hraness/design-kit/palettes.css";
import "../vendor/hraness-marketing/product-marketing-preset.css";
import "../vendor/hraness-lantern/lantern-material.css";
import "./globals.css";
import "./marketing.css";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: "Platonik — a world of algorithmic organisms", template: "%s · Platonik" },
  description: site.description,
  openGraph: { type: "website", siteName: site.name, title: site.name, description: site.description },
  twitter: { card: "summary_large_image", title: site.name, description: site.description },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><style dangerouslySetInnerHTML={{ __html: appearanceFallback }} /></head>
      <body data-hraness-material="lantern">
        <AppearanceProvider>
          <a href="#main" className="skip-link">Skip to content</a>
          <header className="site-header hraness-material-chrome" data-hraness-marketing-preset="minimal">
            <Link href="/" className="wordmark" aria-label="Platonik home"><Image className="brand-icon" src="/brand.png" width={48} height={48} alt="" aria-hidden="true" />platonik<span aria-hidden="true">.</span></Link>
            <nav aria-label="Main navigation">
              <Link href="/lab">Observatory</Link>
              <Link href="/docs">Documentation</Link>
              <a href={site.repository}>GitHub</a>
            </nav>
            <AppearanceControl />
          </header>
          {children}
          <footer className="site-footer">
            <p>Platonik <span className="footer-divider" aria-hidden="true">/</span> A project by <a href="https://hraness.com">Hraness</a></p>
            <p>Game in design. Ideas open to exploration.</p>
          </footer>
          <div dangerouslySetInnerHTML={{ __html: renderHranessSiteFooter({
            mailingList: { kind: "none" },
            placement: "flow",
            support: { id: "platonik", name: "Platonik", updates: false, valueProposition: "Support development of the simulation and its open documentation." },
          }) }} />
        </AppearanceProvider>
      </body>
    </html>
  );
}
