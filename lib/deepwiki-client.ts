/**
 * DeepWiki MCP client — Streamable HTTP transport (JSON-RPC 2.0).
 */

const MCP_URL =
  process.env.DEEPWIKI_MCP_URL?.trim() || "https://mcp.deepwiki.com/mcp";
const TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 300;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number;
  result?: unknown;
  error?: JsonRpcError;
}

interface McpToolResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

let seqId = 0;

/** Extract the last JSON-RPC response from an SSE text stream. */
function lastJsonRpcFromSSE(raw: string): JsonRpcResponse | null {
  let last: JsonRpcResponse | null = null;
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    try {
      const obj = JSON.parse(line.slice(6)) as JsonRpcResponse;
      if (obj.jsonrpc === "2.0") last = obj;
    } catch {
      /* skip malformed SSE lines */
    }
  }
  return last;
}

/** Send a JSON-RPC tool call and return the text response. */
async function callTool(
  tool: string,
  args: Record<string, unknown>
): Promise<string> {
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const body: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: ++seqId,
        method: "tools/call",
        params: { name: tool, arguments: args },
      };

      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

      let res: Response;
      try {
        res = await fetch(MCP_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          },
          body: JSON.stringify(body),
          signal: ac.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      const ct = res.headers.get("content-type") ?? "";
      const rpc = ct.includes("text/event-stream")
        ? lastJsonRpcFromSSE(await res.text())
        : ((await res.json()) as JsonRpcResponse);

      if (rpc?.error) throw new Error(rpc.error.message);

      const result = rpc?.result as McpToolResult | undefined;
      if (!result?.content) throw new Error("Empty tool response");

      if (result.isError) {
        const msg = result.content.map((c) => c.text ?? "").join("\n");
        throw new Error(msg || "Tool returned an error");
      }

      return result.content
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text!)
        .join("\n");
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
      }
    }
  }

  throw lastErr!;
}

/** Check if a DeepWiki response is actually an error disguised as success. */
function assertNotErrorText(text: string): void {
  const lower = text.toLowerCase();
  if (
    lower.includes("repository not found") ||
    lower.includes("to index it") ||
    lower.includes("error fetching wiki") ||
    lower.includes("error processing question")
  ) {
    throw new Error(text.split("\n")[0] ?? "DeepWiki returned an error");
  }
}

/** Fetch the wiki table of contents for a repository. */
export async function readWikiStructure(owner: string, repo: string): Promise<string> {
  const result = await callTool("read_wiki_structure", {
    repoName: `${owner}/${repo}`,
  });
  assertNotErrorText(result);
  return result;
}

/** Fetch the full wiki documentation and return all pages. */
export async function readWikiContents(owner: string, repo: string): Promise<string> {
  const result = await callTool("read_wiki_contents", {
    repoName: `${owner}/${repo}`,
  });
  assertNotErrorText(result);
  return result;
}

/** Extract specific pages from full wiki text by matching page titles. */
export function extractPages(
  fullWiki: string,
  pageTitles: string[]
): Array<{ title: string; content: string }> {
  const pages = fullWiki.split(/(?=# Page: )/);
  const results: Array<{ title: string; content: string }> = [];

  for (const requested of pageTitles) {
    const lower = requested.toLowerCase().trim();
    for (const page of pages) {
      const firstLine = page.split("\n")[0] ?? "";
      const pageTitle = firstLine.replace(/^# Page:\s*/, "").trim();
      if (pageTitle.toLowerCase().includes(lower) || lower.includes(pageTitle.toLowerCase())) {
        results.push({
          title: pageTitle,
          content: page.slice(firstLine.length).trim(),
        });
        break;
      }
    }
  }

  return results;
}
