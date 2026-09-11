import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { documentHref } from "@/lib/docs";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={{
          a: ({ href = "", children }) => {
            const target = documentHref(href);
            return target.startsWith("/") ? <Link href={target}>{children}</Link> : <a href={target}>{children}</a>;
          },
          table: ({ children }) => <div className="table-scroll" tabIndex={0} role="region" aria-label="Scrollable comparison table"><table>{children}</table></div>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
