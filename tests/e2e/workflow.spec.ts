import { expect, test, type Page } from "@playwright/test";
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD } from "../../playwright.config";

const JOB_TEXT = `Senior Frontend Engineer at Globex
We are hiring a Senior Frontend Engineer to own our React and TypeScript dashboard.
Required: 5+ years React, TypeScript and GraphQL. Required: Kubernetes deployment experience.
You will mentor junior engineers and lead code reviews.
Nice to have: Java.`;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Password").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe.configure({ mode: "serial" });

test("unauthenticated requests are redirected to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  const api = await page.request.get("/api/ai/models?provider=mock", { maxRedirects: 0 });
  expect([302, 307]).toContain(api.status());
  expect(api.headers()["location"]).toContain("/login");
});

test("login rejects wrong credentials and accepts the owner", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Incorrect email or password" })).toBeVisible();
  await login(page);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("owner configures the mock provider as default", async ({ page }) => {
  await login(page);
  await page.goto("/settings");
  const card = page.locator("form", { has: page.getByRole("heading", { name: "Mock (testing)" }) });
  await card.getByRole("button", { name: "Test connection" }).click();
  await expect(card.getByRole("status")).toContainText("always available");
  await card.getByRole("button", { name: "Save and use as default" }).click();
  await expect(card.getByRole("status").last()).toContainText("default provider");
  await page.goto("/dashboard");
  await expect(page.getByText("Mock (testing)")).toBeVisible();
});

test("owner creates and confirms a master profile manually", async ({ page }) => {
  await login(page);
  await page.goto("/profile");
  await page.getByLabel("Full name").fill("Alex Rivera");
  await page.getByLabel("Professional headline").fill("Senior Frontend Engineer");
  await page.getByLabel("Email").fill("alex@example.com");
  await page.getByRole("button", { name: "Add role" }).click();
  await page.getByLabel("Job title").fill("Senior Frontend Engineer");
  await page.getByLabel("Employer").fill("Acme Payments");
  await page.getByLabel("Start date").fill("Mar 2021");
  await page
    .getByLabel("Achievements")
    .fill(
      "Reduced dashboard load time by 40% by introducing route-based code splitting.\nMentored four junior engineers through weekly code reviews.",
    );
  await page.getByLabel("Achievements").blur();
  await page.getByLabel("Technologies").fill("React, TypeScript, GraphQL");
  await page.getByLabel("Technologies").blur();
  await page.getByRole("button", { name: "Add skill" }).click();
  await page.getByLabel("Skill", { exact: true }).fill("React");
  await page.getByRole("button", { name: "Add skill" }).click();
  await page.getByLabel("Skill", { exact: true }).last().fill("TypeScript");
  await page.getByRole("button", { name: "Confirm profile" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Profile saved as version 1" })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
});

test("owner adds a job description and sees its requirement analysis", async ({ page }) => {
  await login(page);
  await page.goto("/jobs/new");
  await page.getByLabel("Job title (optional)").fill("Senior Frontend Engineer");
  await page.getByLabel("Company (optional)").fill("Globex");
  await page.getByLabel("Job description text").fill(JOB_TEXT);
  await page.getByRole("button", { name: "Save job description" }).click();
  await expect(page).toHaveURL(/\/jobs\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: "Senior Frontend Engineer" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Experience with react/i })).toBeVisible();
  await expect(page.getByText("not evidenced").first()).toBeVisible();
});

test("quick generate produces a validated resume with a downloadable PDF", async ({ page }) => {
  await login(page);
  await page.goto("/generate");
  await page.getByLabel("Job description").selectOption({ index: 1 });
  await page.getByLabel("Quick Generate").check();
  await page.getByRole("button", { name: "Generate Resume" }).click();
  await expect(page).toHaveURL(/\/resumes\/[a-z0-9]+\?generated=1$/, { timeout: 60_000 });
  await expect(page.getByText("Resume generated and saved")).toBeVisible();
  await expect(page.getByText(/Job requirements without full evidence/)).toBeVisible();
  const url = page.url();
  const resumeId = url.match(/\/resumes\/([a-z0-9]+)/)![1];
  const pdf = await page.request.get(`/api/resumes/${resumeId}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect(Number(pdf.headers()["x-resume-pages"])).toBeGreaterThanOrEqual(1);
  const body = await pdf.body();
  expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
});

test("template switching keeps content and saves a new version; history restores", async ({ page }) => {
  await login(page);
  await page.goto("/resumes");
  await page
    .getByRole("link", { name: /Senior Frontend Engineer @ Globex/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: /Senior Frontend Engineer @ Globex/ })).toBeVisible();
  await page.getByLabel("Template").selectOption("engineering-modern");
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await page.getByRole("button", { name: "Save as new version" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved as version 2" })).toBeVisible();
  await expect(page.getByText("Engineering Modern · ").first()).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).last().click();
  await expect(page).toHaveURL(/restored=3$/);
  await expect(page.getByText("Restored as version 3")).toBeVisible();
  await expect(page.getByRole("link", { name: "Version 3" })).toBeVisible();
});

test("review mode shows proposals and creates a resume from accepted changes", async ({ page }) => {
  await login(page);
  await page.goto("/generate?mode=review");
  await page.getByLabel("Job description").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Generate Resume" }).click();
  await expect(page).toHaveURL(/\/review\/[a-z0-9]+$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Review proposed changes" })).toBeVisible();
  await page
    .getByRole("button", { name: /Accept all|Create resume from original content/ })
    .first()
    .click();
  if (await page.getByRole("button", { name: "Create tailored resume" }).isVisible()) {
    await page.getByRole("button", { name: "Create tailored resume" }).click();
  }
  await expect(page).toHaveURL(/\/resumes\/[a-z0-9]+\?generated=1$/, { timeout: 60_000 });
  await page.goto("/resumes");
  await expect(page.getByRole("listitem").filter({ hasText: "Senior Frontend Engineer @ Globex" })).toHaveCount(2);
});

test("sign out ends the session", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Sign out", exact: true }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login\?next=%2Fprofile$/);
});
