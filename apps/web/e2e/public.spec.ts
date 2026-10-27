import { expect, test } from "@playwright/test";

test.describe("without credentials or sign-in", () => {
  test("public demo runs end to end on mock data", async ({ page }) => {
    const apiCalls: string[] = [];
    page.on("request", (r) => {
      if (new URL(r.url()).pathname.startsWith("/api/") && !r.url().endsWith("/api/v1/me"))
        apiCalls.push(r.url());
    });
    await page.goto("/demo");
    await page.getByRole("button", { name: "Plan workflow" }).click();
    await page.getByRole("button", { name: /Approve plan/ }).click();
    await page.getByRole("button", { name: "Save report…" }).click({ timeout: 10_000 });
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("sha256:");
    await dialog.getByRole("button", { name: "Approve save" }).click();
    await expect(page.getByText("action.approved")).toBeVisible();
    await expect(page.getByText("Approved · demo, nothing written")).toBeVisible();
    expect(apiCalls).toEqual([]);
  });

  test("sign-in page shows providers as not configured", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("button", { name: "Google · not configured" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "GitHub · not configured" })).toBeDisabled();
    await expect(page.getByText("No sign-in providers are configured")).toBeVisible();
  });

  test("starting OAuth without credentials returns to sign-in with an error, not a session", async ({
    page,
    context,
  }) => {
    await page.goto("/api/auth/google/start");
    await expect(page).toHaveURL(/\/sign-in\?error=provider_not_configured$/);
    await expect(page.getByText("That sign-in provider isn't configured")).toBeVisible();
    expect((await context.cookies()).some((c) => c.name.includes("af_session"))).toBe(false);
  });

  for (const path of ["/workspace", "/account"]) {
    test(`${path} redirects to sign-in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/sign-in\?error=signin_required$/);
    });
  }

  test("API rejects unauthenticated and cross-origin requests through the proxy", async ({
    request,
    baseURL,
  }) => {
    const me = await request.get("/api/v1/me");
    expect(me.status()).toBe(401);
    const forged = await request.post("/api/auth/sign-out", {
      headers: { origin: "https://evil.example" },
      maxRedirects: 0,
    });
    expect(forged.status()).toBe(403);
    const ok = await request.post("/api/auth/sign-out", {
      headers: { origin: baseURL! },
      maxRedirects: 0,
    });
    expect(ok.status()).toBe(303);
  });

  test("landing page has no horizontal overflow", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
