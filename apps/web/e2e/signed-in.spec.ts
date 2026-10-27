import { expect, test, type BrowserContext } from "@playwright/test";
import { createSignedInUser } from "./fixtures";

const DATABASE_URL = process.env.E2E_DATABASE_URL;
test.skip(!DATABASE_URL, "Set E2E_DATABASE_URL (Postgres) to run the signed-in suite");

async function useSession(context: BrowserContext, token: string) {
  await context.addCookies([
    {
      name: "af_session",
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

test.describe("signed in", () => {
  test("workspace shows the seeded demo project and its items", async ({ page, context }) => {
    const u = await createSignedInUser(DATABASE_URL!, "Ada");
    await useSession(context, u.token);
    await page.goto("/workspace");
    await expect(page.getByRole("heading", { name: "Ada's workspace" })).toBeVisible();
    await page.getByRole("link", { name: /Demo project/ }).click();
    await expect(page).toHaveURL(
      new RegExp(`/workspace/${u.workspaceId}/projects/${u.projectId}$`),
    );
    await expect(page.getByText("Northwind-Supply-Agreement.pdf").first()).toBeVisible();
    await expect(page.getByText("Synthetic data · no local file access")).toBeVisible();
    await page.getByRole("button", { name: "Plan workflow" }).click();
    await expect(page.getByText("Proposed plan")).toBeVisible();
  });

  test("another user's project is not found", async ({ page, context }) => {
    const owner = await createSignedInUser(DATABASE_URL!, "Owner");
    const intruder = await createSignedInUser(DATABASE_URL!, "Intruder");
    await useSession(context, intruder.token);
    const res = await page.goto(`/workspace/${owner.workspaceId}/projects/${owner.projectId}`);
    expect(res!.status()).toBe(404);
    await expect(page.getByText("Northwind-Supply-Agreement.pdf")).toHaveCount(0);
    const api = await page.request.get(`/api/v1/workspaces/${owner.workspaceId}`);
    expect(api.status()).toBe(404);
  });

  test("account lists sessions; revoking another session works; sign out ends this one", async ({
    page,
    context,
    browser,
  }) => {
    const u = await createSignedInUser(DATABASE_URL!, "Grace");
    await useSession(context, u.token);
    await page.goto("/account");
    await expect(page.getByText(u.email)).toBeVisible();
    await expect(page.getByText("This browser")).toBeVisible();
    await expect(page.getByRole("button", { name: "Revoke" })).toHaveCount(1);
    await page.getByRole("button", { name: "Revoke" }).click();
    await expect(page.getByRole("button", { name: "Revoke" })).toHaveCount(0);

    const other = await browser.newContext();
    await useSession(other, u.otherToken);
    expect((await other.request.get("http://localhost:3200/api/v1/me")).status()).toBe(401);
    await other.close();

    await expect(page.getByText("session.revoked")).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).first().click();
    await expect(page).toHaveURL("http://localhost:3200/");
    await page.goto("/workspace");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
