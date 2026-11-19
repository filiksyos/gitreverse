import "server-only";
import type { User } from "@supabase/supabase-js";
import { validateProject } from "./manifest";
import { BuildError, readJsonLimited } from "./server";

/** Creates only a new private repo owned by the signed-in GitHub identity. Never updates an existing repo. */
export async function exportProject(
  user: User,
  input: unknown,
  token: unknown,
  name: unknown,
  fetcher: typeof fetch = fetch,
) {
  if (
    typeof token !== "string" ||
    token.length < 20 ||
    token.length > 1000 ||
    /\s/.test(token)
  )
    throw new BuildError(
      "Connect GitHub to publish.",
      403,
      "github_permission",
    );
  if (
    typeof name !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(name)
  )
    throw new BuildError(
      "Choose a repository name using letters, numbers, underscores or hyphens.",
    );
  const project = validateProject(input);
  let repositoryUrl: string | undefined = undefined;
  let repositoryCreated = false;
  async function github(path: string, method = "GET", body?: unknown) {
    let response: Response;
    try {
      response = await fetcher(`https://api.github.com${path}`, {
        method,
        redirect: "error",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new BuildError(
        repositoryUrl
          ? "GitHub export was interrupted. Check the repository before trying again."
          : "GitHub did not confirm the request. Check your repositories before retrying.",
        502,
        "github_uncertain",
        repositoryUrl,
      );
    }
    if (!response.ok) {
      if (
        (response.status === 401 || response.status === 403) &&
        !repositoryCreated
      )
        throw new BuildError(
          "GitHub needs permission to create a private repository.",
          403,
          "github_permission",
        );
      if (response.status === 422 && !repositoryCreated)
        throw new BuildError(
          "That repository name may already exist. Nothing was overwritten; choose another name.",
          409,
        );
      throw new BuildError(
        repositoryCreated
          ? "The private repository was created, but file upload is incomplete. Download the ZIP and inspect the repository."
          : "GitHub did not confirm repository creation. Check the linked repository before retrying.",
        502,
        repositoryCreated ? "github_failed" : "github_uncertain",
        repositoryUrl,
      );
    }
    try {
      return (await readJsonLimited(response, 800000)) as Record<
        string,
        unknown
      >;
    } catch {
      throw new BuildError(
        repositoryUrl
          ? "GitHub did not confirm the response. Check the repository before trying again."
          : "GitHub returned an unreadable response.",
        502,
        "github_uncertain",
        repositoryUrl,
      );
    }
  }
  const account = await github("/user");
  const identity = user.identities?.find((i) => i.provider === "github");
  const accountId =
    identity?.identity_data?.sub ?? identity?.identity_data?.provider_id;
  if (
    !accountId ||
    String(account.id) !== String(accountId) ||
    typeof account.login !== "string" ||
    !/^[a-zA-Z0-9-]+$/.test(account.login)
  )
    throw new BuildError(
      "GitHub account does not match your signed-in account.",
      403,
    );
  repositoryUrl = `https://github.com/${account.login}/${name}`;
  const repo = await github("/user/repos", "POST", {
    name,
    private: true,
    auto_init: true,
    description: project.description,
  });
  repositoryCreated = true;
  if (
    repo.private !== true ||
    repo.full_name !== `${account.login}/${name}` ||
    typeof repo.default_branch !== "string"
  )
    throw new BuildError(
      "GitHub repository state could not be verified. Inspect it before continuing.",
      502,
      "github_uncertain",
      repositoryUrl,
    );
  const base = `/repos/${encodeURIComponent(account.login)}/${encodeURIComponent(name)}`;
  const branch = encodeURIComponent(repo.default_branch);
  const ref = await github(`${base}/git/ref/heads/${branch}`);
  const parent = (ref.object as { sha?: string })?.sha;
  if (!parent)
    throw new BuildError(
      "Cannot verify the new repository commit.",
      502,
      "github_failed",
      repositoryUrl,
    );
  const tree = await github(`${base}/git/trees`, "POST", {
    tree: project.files.map((f) => ({
      path: f.path,
      mode: "100644",
      type: "blob",
      content: f.content,
    })),
  });
  if (typeof tree.sha !== "string" || !tree.sha) {
    throw new BuildError(
      "GitHub did not confirm the file tree. Inspect the repository before retrying.",
      502,
      "github_uncertain",
      repositoryUrl,
    );
  }
  const commit = await github(`${base}/git/commits`, "POST", {
    message: "Add GitReverse generated starter (review before running)",
    tree: tree.sha,
    parents: [parent],
  });
  if (typeof commit.sha !== "string" || !commit.sha) {
    throw new BuildError(
      "GitHub did not confirm the generated commit. Inspect the repository before retrying.",
      502,
      "github_uncertain",
      repositoryUrl,
    );
  }
  await github(`${base}/git/refs/heads/${branch}`, "PATCH", {
    sha: commit.sha,
    force: false,
  });
  const verified = await github(`${base}/git/ref/heads/${branch}`);
  if ((verified.object as { sha?: string })?.sha !== commit.sha)
    throw new BuildError(
      "Files were sent but the final commit could not be verified. Inspect the repository.",
      502,
      "github_uncertain",
      repositoryUrl,
    );
  return { repositoryUrl, commit: commit.sha };
}
