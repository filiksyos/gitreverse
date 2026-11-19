import { expect, test, type Page } from "@playwright/test";

const project = {
  name: "sample-app",
  description: "Synthetic test project",
  files: [
    { path: "README.md", content: "Review before running." },
    {
      path: "app/page.tsx",
      content: "export default function Page(){return <h1>Hello</h1>}",
    },
  ],
};
const prompt = "Build a small notes application with a simple clean UI.";
const user = {
  id: "browser-test-user",
  aud: "authenticated",
  role: "authenticated",
  email: "test@example.invalid",
  app_metadata: { provider: "github" },
  user_metadata: { user_name: "tester" },
  created_at: "2026-01-01",
  identities: [],
};
const accessToken = `e30.${Buffer.from(JSON.stringify({ sub: user.id, exp: 4102444800 })).toString("base64url")}.synthetic`;

async function setup(page: Page, signedIn = true, providerToken = true) {
  if (signedIn)
    await page.addInitScript(
      ({ user, accessToken, providerToken }) => {
        localStorage.setItem(
          "sb-build-test-auth-token",
          JSON.stringify({
            access_token: accessToken,
            refresh_token: "synthetic-refresh",
            token_type: "bearer",
            expires_in: 3600,
            expires_at: 4102444800,
            user,
            ...(providerToken
              ? { provider_token: "synthetic-github-token" }
              : {}),
          }),
        );
      },
      { user, accessToken, providerToken },
    );
  // Any real network except the local app is refused, including auth, analytics, and GitHub.
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      if (
        url.hostname === "build-test.supabase.co" &&
        url.pathname.endsWith("/logout")
      )
        return route.fulfill({ json: {} });
      return route.abort();
    }
    if (url.pathname === "/api/reverse-prompt")
      return route.fulfill({ json: { prompt } });
    if (url.pathname === "/api/build-project")
      return route.fulfill({ json: { project } });
    if (url.pathname === "/api/build-project/github")
      return route.fulfill({
        json: {
          repositoryUrl: "https://github.com/tester/sample-app",
          commit: "synthetic-commit",
        },
      });
    if (url.pathname.startsWith("/api/"))
      return route.fulfill({
        json: { entries: [], history: [], isPremium: false },
      });
    return route.continue();
  });
  await page.goto("/");
  await page
    .getByPlaceholder("https://github.com/?")
    .fill("https://github.com/tester/example");
  await page.getByRole("button", { name: "Get Prompt" }).first().click();
  await expect(page.getByText(prompt, { exact: true })).toBeVisible();
}

test("build stays in the existing prompt card, ZIP downloads and private export is explicit", async ({
  page,
}) => {
  await setup(page);
  const bodies: unknown[] = [];
  await page.route("**/api/build-project/github", (route) => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        repositoryUrl: "https://github.com/tester/sample-app",
        commit: "synthetic",
      },
    });
  });
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await expect(
    page.getByText("2 generated files · not run or tested"),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download ZIP" }).click();
  expect((await download).suggestedFilename()).toBe("sample-app.zip");
  expect(bodies).toHaveLength(0);
  page.on("dialog", (dialog) =>
    dialog.accept(dialog.type() === "prompt" ? "sample-app" : undefined),
  );
  await page
    .getByRole("button", { name: "Create private GitHub repo" })
    .click();
  await expect(
    page.getByRole("link", { name: "Open repository" }),
  ).toHaveAttribute("href", "https://github.com/tester/sample-app");
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toMatchObject({
    name: "sample-app",
    confirmPrivateRepository: true,
    project,
  });
});

test("cancel stops an in-flight build and repeated clicks do not duplicate it", async ({
  page,
}) => {
  await setup(page);
  let requests = 0;
  await page.route("**/api/build-project", async (route) => {
    requests++;
    await new Promise((r) => setTimeout(r, 1200));
    await route.fulfill({ json: { project } }).catch(() => {});
  });
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await expect(page.getByRole("button", { name: "Building…" })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Build", exact: true }),
  ).toBeEnabled();
  await page.waitForTimeout(1500);
  expect(requests).toBe(1);
  await expect(page.getByRole("button", { name: "Download ZIP" })).toHaveCount(
    0,
  );
});

test("server error surfaces without replacing the prompt", async ({ page }) => {
  await setup(page);
  await page.route("**/api/build-project", (route) =>
    route.fulfill({
      status: 403,
      json: { error: "Build preview is restricted." },
    }),
  );
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Build preview is restricted." }),
  ).toHaveText("Build preview is restricted.");
  await expect(page.getByText(prompt, { exact: true })).toBeVisible();
});

test("missing provider token asks for separate permission without attempting export", async ({
  page,
}) => {
  await setup(page, true, false);
  let exports = 0;
  await page.route("**/api/build-project/github", (route) => {
    exports++;
    return route.abort();
  });
  await page.getByRole("button", { name: "Build", exact: true }).click();
  page.on("dialog", (dialog) =>
    dialog.accept(dialog.type() === "prompt" ? "sample-app" : undefined),
  );
  await page
    .getByRole("button", { name: "Create private GitHub repo" })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Connect GitHub for private repo export",
    }),
  ).toBeVisible();
  expect(exports).toBe(0);
});

test("uncertain export offers recovery link, never an automatic retry", async ({
  page,
}) => {
  await setup(page);
  let exports = 0;
  await page.route("**/api/build-project/github", (route) => {
    exports++;
    return route.fulfill({
      status: 502,
      json: {
        code: "github_uncertain",
        error: "Export uncertain. Check GitHub before retrying.",
        repositoryUrl: "https://github.com/tester/sample-app",
      },
    });
  });
  await page.getByRole("button", { name: "Build", exact: true }).click();
  page.on("dialog", (dialog) =>
    dialog.accept(dialog.type() === "prompt" ? "sample-app" : undefined),
  );
  await page
    .getByRole("button", { name: "Create private GitHub repo" })
    .click();
  await expect(
    page.getByRole("link", { name: "Open repository" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create private GitHub repo" }),
  ).toHaveCount(0);
  expect(exports).toBe(1);
});

test("sign-out clears the built project", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Download ZIP" }),
  ).toBeVisible();
  // Supabase auth uses BroadcastChannel to propagate account changes between tabs.
  await page.evaluate(() => {
    localStorage.removeItem("sb-build-test-auth-token");
    const channel = new BroadcastChannel("sb-build-test-auth-token");
    channel.postMessage({ event: "SIGNED_OUT", session: null });
    channel.close();
  });
  await expect(page.getByRole("button", { name: "Download ZIP" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Sign in to build" }),
  ).toBeVisible();
});

test("small screens keep build actions inside the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Download ZIP" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create private GitHub repo" }),
  ).toBeVisible();
  const overflow = await page.evaluate(() =>
    Array.from(document.querySelectorAll("body *"))
      .filter((el) => {
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.right > window.innerWidth + 1;
      })
      .map((el) => ({
        tag: el.tagName,
        className: el.className,
        text: el.textContent?.slice(0, 60),
      }))
      .slice(0, 8),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    JSON.stringify(overflow),
  ).toBe(true);
});
