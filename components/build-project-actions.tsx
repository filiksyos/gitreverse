"use client";
import { useRef, useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { projectZip, type BuiltProject } from "@/lib/build-project/manifest";

const style =
  "rounded border-[3px] border-zinc-900 bg-[#ffc480] px-3 py-1.5 text-xs font-medium text-zinc-900 disabled:opacity-50";
/** A small action inside the existing prompt card, not a new editor or page. */
export function BuildProjectActions({ prompt }: { prompt: string }) {
  const { user } = useAuth();
  if (process.env.NEXT_PUBLIC_GITREVERSE_BUILD_ENABLED !== "true") return null;
  // Remount when prompt changes so older results can never attach to a newer prompt.
  return (
    <BuildProjectFlow
      key={`${user?.id ?? "signed-out"}:${prompt}`}
      prompt={prompt}
    />
  );
}
function BuildProjectFlow({ prompt }: { prompt: string }) {
  const { session, signInWithGitHub, signInWithGitHubForExport } = useAuth();
  const [project, setProject] = useState<BuiltProject | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [needsPermission, setNeedsPermission] = useState(false);
  const controller = useRef<AbortController | null>(null),
    inFlight = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);
  async function build() {
    if (inFlight.current) return;
    if (!session?.access_token) {
      await signInWithGitHub().catch(() => setError("Could not open sign-in."));
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    setRepositoryUrl("");
    const abort = new AbortController();
    controller.current = abort;
    try {
      const response = await fetch("/api/build-project", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ prompt }),
        signal: abort.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Build failed.");
      if (alive.current) setProject(data.project);
    } catch (e) {
      if (alive.current && !abort.signal.aborted)
        setError(e instanceof Error ? e.message : "Build failed.");
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function download() {
    if (!project) return;
    const bytes = projectZip(project),
      url = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: "application/zip" }),
      );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function publish() {
    if (inFlight.current || !project || !session?.access_token) return;
    const name = window.prompt(
      "New private GitHub repository name (existing repositories will never be overwritten):",
      project.name,
    );
    if (!name) return;
    if (
      !window.confirm(
        `Create private repository “${name}” in your signed-in GitHub account and upload these ${project.files.length} generated files? Review the ZIP before running it. No code is run or deployed by GitReverse.`,
      )
    )
      return;
    if (!session.provider_token) {
      setNeedsPermission(true);
      setError(
        "Connect GitHub below, then click Create private GitHub repo again.",
      );
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    // Export is not aborted/retried automatically: the repo creation may already have happened.
    try {
      const response = await fetch("/api/build-project/github", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          project,
          githubToken: session.provider_token,
          name,
          confirmPrivateRepository: true,
        }),
      });
      const data = await response.json();
      if (!alive.current) return;
      if (
        typeof data.repositoryUrl === "string" &&
        /^https:\/\/github\.com\/[a-zA-Z0-9-]+\/[a-zA-Z0-9_-]+$/.test(
          data.repositoryUrl,
        )
      )
        setRepositoryUrl(data.repositoryUrl);
      if (data.code === "github_permission") setNeedsPermission(true);
      if (!response.ok)
        throw new Error(
          data.error || "Export failed. Check GitHub before retrying.",
        );
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : "Export uncertain. Check GitHub before retrying.",
        );
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <div
      className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2"
      aria-busy={busy}
    >
      {!project ? (
        <button
          className={style}
          disabled={busy || !prompt.trim()}
          onClick={() => void build()}
        >
          {busy ? "Building…" : session ? "Build" : "Sign in to build"}
        </button>
      ) : (
        <>
          <button className={style} onClick={download} disabled={busy}>
            Download ZIP
          </button>
          {!repositoryUrl && (
            <button
              className={style}
              onClick={() => void publish()}
              disabled={busy}
            >
              {busy ? "Publishing…" : "Create private GitHub repo"}
            </button>
          )}
          {repositoryUrl && (
            <a
              href={repositoryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs underline"
            >
              Open repository
            </a>
          )}
          <details className="w-full min-w-0 break-words text-xs text-zinc-600">
            <summary className="cursor-pointer">
              {project.files.length} generated files · not run or tested
            </summary>
            <p className="mt-2">
              Review the code before installing dependencies or deploying.
              Generated code can contain mistakes or unsafe behavior.
            </p>
            <ul className="mt-2 max-h-24 overflow-auto font-mono">
              {project.files.map((f) => (
                <li key={f.path}>{f.path}</li>
              ))}
            </ul>
          </details>
        </>
      )}
      {busy && !project && (
        <button
          className="text-xs underline"
          onClick={() => {
            controller.current?.abort();
            setBusy(false);
          }}
        >
          Cancel
        </button>
      )}
      {needsPermission && (
        <div className="w-full min-w-0 break-words text-xs text-zinc-600">
          <p>
            GitHub’s repo permission can access your repositories. Connect only
            if you accept that scope. GitReverse uses it here to create a new
            private repository; ZIP download needs no repository access.
          </p>
          <button
            className="mt-1 underline"
            onClick={() =>
              void signInWithGitHubForExport().catch(() =>
                setError("Could not open GitHub authorization."),
              )
            }
          >
            Connect GitHub for private repo export
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="w-full text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
