import { expect, test, type Page } from "@playwright/test";
import { extractText, getDocumentProxy } from "unpdf";
import { E2E_DATABASE_URL, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD } from "../../playwright.config";
import { PARTLY, POLARSTEPS, SEAMFLOW, type ApplicationCase } from "../fixtures/application-cases";
import { seedCandidateProfile } from "../helpers/embedded-db";

/**
 * The three reviewed applications, driven through the normal flow: add the job
 * description, generate in Review Mode, read the brief, decide, create the
 * resume and download the PDF. Runs after workflow.spec.ts (see
 * playwright.config.ts), which sets up the owner and the default provider.
 */
const PORTAL = "Built the fraud-detection portal that analysts use to review flagged transactions";
const TOURS = "Built the tour-booking system with search and filtering";

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  seedCandidateProfile(E2E_DATABASE_URL, E2E_OWNER_EMAIL);
});

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Password").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** Add the posting and generate in Review Mode; ends on the review page. */
async function startReview(page: Page, posting: ApplicationCase) {
  await login(page);
  await page.goto("/jobs/new");
  await page.getByLabel("Job title (optional)").fill(posting.title);
  await page.getByLabel("Company (optional)").fill(posting.company);
  await page.getByLabel("Job description text").fill(posting.text);
  await page.getByRole("button", { name: "Save job description" }).click();
  // "/jobs/new" itself matches a bare id pattern, so wait for the saved job's own page.
  await expect(page).toHaveURL(/\/jobs\/(?!new$)[a-z0-9]+$/);
  const jobId = page.url().split("/").pop();
  await page.goto(`/generate?mode=review&job=${jobId}`);
  await page.getByRole("button", { name: "Generate Resume" }).click();
  await expect(page).toHaveURL(/\/review\/[a-z0-9]+$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Screening criteria and evidence" })).toBeVisible();
}

/** Accept every proposal, create the resume and return the text of each PDF page. */
async function createResumeAndReadPdf(page: Page): Promise<string[]> {
  await page.getByRole("button", { name: "Accept all" }).click();
  await page.getByRole("button", { name: "Create tailored resume" }).click();
  await expect(page).toHaveURL(/\/resumes\/[a-z0-9]+\?generated=1$/, { timeout: 60_000 });
  const resumeId = page.url().match(/\/resumes\/([a-z0-9]+)/)![1];
  const response = await page.request.get(`/api/resumes/${resumeId}/pdf`);
  expect(response.status()).toBe(200);
  const document = await getDocumentProxy(new Uint8Array(await response.body()));
  const { text } = await extractText(document, { mergePages: false });
  return (text as string[]).map((pageText) => pageText.replace(/\s+/g, " "));
}

const occurrences = (pages: string[], needle: string) => pages.join(" ").split(needle).length - 1;

test("Partly: surfaces the fraud portal and flags the missing customer evidence", async ({ page }) => {
  await startReview(page, PARTLY);

  const workflows = page.getByRole("listitem").filter({ hasText: "Build for complex operational workflows" });
  await expect(workflows.first()).toContainText("Supported");
  await expect(workflows.first()).toContainText("Frontend Engineer at Ledgerline (Feb 2018 - Dec 2019)");

  const customers = page.getByRole("listitem").filter({ hasText: "Work directly with customers" });
  await expect(customers.first()).toContainText("No evidence");
  await expect(customers.first()).toContainText(
    "Still missing: No confirmed statement shows direct contact with customers or users",
  );
  await expect(
    page.getByRole("listitem").filter({ hasText: "Measure how the features you ship perform" }).first(),
  ).toContainText("No confirmed statement shows how usage, adoption or feature performance was measured");

  await expect(page.getByText("Brought onto page one: Fraud-detection portal")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Selected project on page one: Fraud-detection portal" }),
  ).toBeVisible();
  await expect(
    page.getByText("Did you watch or talk to the people who used the fraud-detection portal?"),
  ).toBeVisible();
  await expect(page.getByText("The posting says nothing about visa sponsorship or work eligibility")).toBeVisible();
  await expect(page.getByText("No office-attendance or relocation requirement is stated.")).toBeVisible();

  // Proceed without answering the question.
  const pages = await createResumeAndReadPdf(page);
  expect(pages[0]).toContain(PORTAL);
  expect(pages[0].toLowerCase()).toContain("selected project");
  expect(pages[0]).toContain("Frontend Engineer, Ledgerline");
  expect(occurrences(pages, PORTAL)).toBe(1);
  expect(pages.join(" ")).not.toMatch(/interview|adoption|feedback/i);

  await expect(page.getByText("Resume generated and saved")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open question" })).toBeVisible();
  await expect(page.getByTestId("pdf-check-ok")).toBeVisible({ timeout: 60_000 });
});

test("Polarsteps: surfaces the tour-booking project and keeps the engineering evidence on page one", async ({
  page,
}) => {
  await startReview(page, POLARSTEPS);

  const travel = page.getByRole("listitem").filter({ hasText: "Build features for a consumer travel product" });
  await expect(travel.first()).toContainText("Supported");
  await expect(travel.first()).toContainText("Frontend Developer at Zoomit (Sep 2015 - Jan 2018)");
  const tested = page.getByRole("listitem").filter({ hasText: "Keep the product fast and well tested" });
  await expect(tested.first()).toContainText("Senior Frontend Engineer at Northwind Commerce (Mar 2022 - Present)");
  await expect(page.getByText("Brought onto page one: Tour-booking system")).toBeVisible();
  await expect(page.getByText("One question that could strengthen this application")).toHaveCount(0);

  const pages = await createResumeAndReadPdf(page);
  expect(pages[0]).toContain(TOURS);
  expect(pages[0]).toContain("Frontend Developer, Zoomit");
  expect(pages[0]).toContain("Cut largest contentful paint on product pages from 4.1s to 2.3s");
  expect(pages[0]).toContain("Raised end-to-end test coverage of the purchase flow from 35% to 80% with Playwright");
  expect(occurrences(pages, TOURS)).toBe(1);
});

test("Seamflow: keeps the fraud portal prominent, asks for design evidence and flags the project note", async ({
  page,
}) => {
  await startReview(page, SEAMFLOW);

  const decisions = page.getByRole("listitem").filter({ hasText: "Make interface design decisions" });
  await expect(decisions.first()).toContainText(
    "Still missing: No confirmed statement says which interface or design decisions you personally owned",
  );
  await expect(
    page.getByText(
      "Which interface or design decisions in the fraud-detection portal were yours, and why did you make them?",
    ),
  ).toBeVisible();
  const requested = page.getByRole("listitem").filter({ hasText: "Project note" });
  await expect(requested).toContainText("Send your CV with a short note about the hardest thing you have built.");
  await expect(page.getByText("Brought onto page one: Fraud-detection portal")).toBeVisible();

  // Answer the question this time; it is added to the project as written.
  const answer = "Chose a single dense table over tabs so analysts could compare flagged transactions side by side.";
  await page.getByLabel("Your answer (optional)").fill(answer);
  const pages = await createResumeAndReadPdf(page);
  expect(pages[0]).toContain(PORTAL);
  expect(pages[0]).toContain(answer);
  expect(occurrences(pages, PORTAL)).toBe(1);

  await expect(page.getByRole("heading", { name: "What the application asks for" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Project note" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open question" })).toHaveCount(0);
});
