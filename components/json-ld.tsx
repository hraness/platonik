/**
 * Renders a JSON-LD script block. `<` is escaped so a description can never
 * close the script element early.
 */
export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
