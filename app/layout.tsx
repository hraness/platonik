import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";
import "@fontsource/newsreader/latin-400.css";
import "@hraness/design-kit/fonts.css";
import "../vendor/hraness-marketing/product-marketing-preset.css";
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
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <header className="site-header hraness-marketing-header-surface" data-hraness-marketing-preset="minimal">
          <Link href="/" className="wordmark" aria-label="Platonik home">platonik<span aria-hidden="true">.</span></Link>
          <nav aria-label="Main navigation">
            <Link href="/lab">Observatory</Link>
            <Link href="/docs">Documentation</Link>
            <a href={site.repository}>GitHub</a>
          </nav>
        </header>
        {children}
        <footer className="site-footer">
          <p>Platonik <span className="footer-divider" aria-hidden="true">/</span> A project by <a href="https://hraness.com">Hraness</a></p>
          <p>Game in design. Ideas open to exploration.</p>
        </footer>
      </body>
    </html>
  );
}
