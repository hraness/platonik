import Link from "next/link";

export default function NotFound() {
  return <main id="main" tabIndex={-1} className="not-found"><h1>This part of the world is unmapped.</h1><p>That page doesn’t exist. The field guide is a good place to start.</p><Link className="primary-link" href="/docs">Open the documentation <span aria-hidden="true">↗</span></Link></main>;
}
