import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Styles for the Markdown the report model writes (headings, lists, tables).
const components: Components = {
  // The report's own H1 duplicates the card title, so skip it.
  h1: () => null,
  h2: ({ children }) => <h3 className="mt-6 mb-2 text-base font-semibold first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-4 mb-1.5 text-sm font-semibold">{children}</h4>,
  p: ({ children }) => <p className="mb-3 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1.5 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  code: ({ children }) => (
    <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[0.85em] dark:bg-neutral-900">{children}</code>
  ),
  table: ({ children }) => (
    <div className="mb-4 overflow-x-auto">
      <table className="w-full min-w-[560px] text-left">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-neutral-200 py-1.5 pr-3 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-neutral-100 py-1.5 pr-3 align-top dark:border-neutral-900">{children}</td>
  ),
};

export function ReportView({ markdown }: { markdown: string }) {
  return (
    <div className="text-sm text-neutral-800 dark:text-neutral-200">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
