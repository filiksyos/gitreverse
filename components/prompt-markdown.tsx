import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Hoisted to module scope so the plugin list and component map keep a stable
 * identity between renders (no re-creation on every render).
 */
const REMARK_PLUGINS = [remarkGfm];

const MARKDOWN_COMPONENTS: Components = {
  h1: ({ children }) => (
    <h1 className="mb-2 mt-4 text-base font-bold first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-4 text-sm font-bold first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 mt-3 text-sm font-semibold first:mt-0">{children}</h3>
  ),
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="mb-2 ml-4 list-disc space-y-0.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 ml-4 list-decimal space-y-0.5">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children }) => (
    <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs">
      {children}
    </code>
  ),
  // Reset the inline-code chip styling for <code> nested in a block <pre>.
  pre: ({ children }) => (
    <pre className="mb-2 overflow-auto rounded bg-zinc-100 p-3 font-mono text-xs [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
  hr: () => <hr className="my-3 border-zinc-200" />,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-zinc-300 pl-3 text-zinc-600">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-zinc-900 underline decoration-zinc-400 underline-offset-2"
    >
      {children}
    </a>
  ),

  // GFM tables: the wrapper scrolls horizontally. The table sizes to its
  // content (w-max) but never shrinks below the card (min-w-full), and cells
  // have a min/max width so columns stay readable instead of being squeezed.
  table: ({ children }) => (
    <div className="mb-3 overflow-x-auto rounded-md border border-zinc-200 last:mb-0">
      <table className="w-max min-w-full border-collapse text-left text-xs">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-700">
      {children}
    </thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-zinc-200 last:border-b-0 even:bg-zinc-50/60">
      {children}
    </tr>
  ),
  th: ({ children, style }) => (
    <th
      style={style}
      className="min-w-28 whitespace-nowrap px-3 py-2 font-semibold"
    >
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td
      style={style}
      className="min-w-28 max-w-xs wrap-break-word px-3 py-2 align-top text-zinc-800"
    >
      {children}
    </td>
  ),
};

export function PromptMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      components={MARKDOWN_COMPONENTS}
    >
      {children}
    </ReactMarkdown>
  );
}
