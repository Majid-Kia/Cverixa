import { expect, test, type Page } from "@playwright/test";
import { E2E_CRON_SECRET, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD } from "../../playwright.config";

/**
 * Job Scanner in the browser: preferences, a manual scan, sponsorship display,
 * tracking, the hand-off to resume tailoring, history, import and the
 * scheduled-scan endpoint. The server runs with the offline demo source
 * (JOB_SCAN_ENABLE_DEMO_SOURCE) and the real sources are switched off in the
 * first test, so nothing here contacts a job site. Runs after the other
 * projects (see playwright.config.ts), which leave a confirmed profile and a
 * default AI provider.
 */
test.describe.configure({ mode: "serial" });

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Password").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

const sourceCard = (page: Page, name: string) =>
  page.locator("form", { has: page.getByRole("heading", { name, exact: true }) });

/** The "Visa sponsorship" card of a listing page (the job description also contains those words). */
const visaCard = (page: Page) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: "Visa sponsorship", exact: true }) });

async function scanNow(page: Page) {
  await page.goto("/scanner");
  await page.getByRole("button", { name: "Scan Jobs Now" }).click();
  await expect(page.getByText("Scan completed", { exact: true })).toBeVisible({ timeout: 60_000 });
}

test("job scanner pages and APIs require the owner's session", async ({ page }) => {
  await page.goto("/scanner");
  await expect(page).toHaveURL(/\/login\?next=%2Fscanner$/);
  await page.goto("/settings/job-search");
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings%2Fjob-search$/);
  const progress = await page.request.get("/api/job-scanner/scans/anything", { maxRedirects: 0 });
  expect([302, 307]).toContain(progress.status());
  expect(progress.headers()["location"]).toContain("/login");
});

test("the scheduled-scan endpoint accepts only the bearer secret", async ({ page }) => {
  const url = "/api/cron/job-scan";
  expect((await page.request.post(url, { maxRedirects: 0 })).status()).toBe(401);
  expect((await page.request.get(url, { maxRedirects: 0 })).status()).toBe(401);
  const wrong = await page.request.post(url, { headers: { authorization: "Bearer not-the-secret-not-the-secret" } });
  expect(wrong.status()).toBe(401);
  const ok = await page.request.post(url, { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toEqual({ started: [], skipped: [] });
});

test("owner saves job search preferences and a daily schedule", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Job Scanner" }).click();
  await expect(page.getByRole("heading", { name: "Job Scanner", level: 1 })).toBeVisible();
  await expect(page.getByText("Using the suggested search preferences")).toBeVisible();

  await page.goto("/settings/job-search");
  await expect(page.getByRole("heading", { name: "Job Search Preferences" })).toBeVisible();
  // Suggested countries are preselected; any other country can be found by searching.
  await expect(page.getByRole("button", { name: "Remove Qatar" })).toBeVisible();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByText("No country selected")).toBeVisible();
  for (const country of ["Germany", "Netherlands", "Austria"]) {
    await page.getByLabel("Search countries").fill(country);
    await page.getByRole("checkbox", { name: country, exact: true }).check();
  }
  await page.getByLabel("Search countries").fill("Japan");
  await page.getByRole("checkbox", { name: "Japan", exact: true }).check();
  await page.getByRole("button", { name: "Remove Japan" }).click();
  await expect(page.getByRole("button", { name: "Remove Japan" })).toHaveCount(0);

  await page
    .getByLabel("One per line", { exact: true })
    .fill("Frontend Engineer\nSenior Frontend Engineer\nReact Developer\n-React Native");
  await page.getByLabel("Scan automatically every day").check();
  await page.getByLabel("Time", { exact: true }).fill("05:00");
  await page.getByLabel("Time zone").selectOption("Europe/Amsterdam");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Preferences saved. Daily scan at 05:00 (Europe/Amsterdam)." }),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(3);
  await expect(page.getByLabel("One per line", { exact: true })).toHaveValue(
    "Frontend Engineer\nSenior Frontend Engineer\nReact Developer\n-React Native",
  );
  await expect(page.getByLabel("Scan automatically every day")).toBeChecked();
  await expect(page.getByLabel("Time zone")).toHaveValue("Europe/Amsterdam");
  await expect(page.getByText(/Next run: .*\(Europe\/Amsterdam\)/)).toBeVisible();
});

test("sources say whether they are scanned or only linked, and can be switched off", async ({ page }) => {
  await login(page);
  await page.goto("/settings/job-search");
  // LinkedIn is never presented as scanned.
  const linked = page.locator("section", { hasText: "Sites that are linked, not scanned" });
  await expect(linked.getByText("LinkedIn Jobs")).toBeVisible();
  await expect(linked.getByText("Linked externally, not scanned").first()).toBeVisible();
  await expect(linked).toContainText("Cverixa therefore does not read LinkedIn");
  await expect(sourceCard(page, "Lever boards").getByText("Not verified live")).toBeVisible();
  await expect(sourceCard(page, "Lever boards").getByLabel("Enabled")).not.toBeChecked();

  // Switch the real sources off so the scans below use only the offline demo source.
  for (const name of ["Arbeitnow", "Greenhouse boards", "Ashby boards", "Remotive"]) {
    const card = sourceCard(page, name);
    await card.getByLabel("Enabled").uncheck();
    await card.getByRole("button", { name: `Save ${name}` }).click();
    await expect(card.getByRole("status").filter({ hasText: "Source settings saved." })).toBeVisible();
  }
  await page.reload();
  await expect(sourceCard(page, "Arbeitnow").getByLabel("Enabled")).not.toBeChecked();
  await expect(sourceCard(page, "Demo jobs").getByLabel("Enabled")).toBeChecked();
});

test("Scan Jobs Now runs a scan and shows results for the selected countries only", async ({ page }) => {
  await login(page);
  await page.goto("/scanner");
  await expect(page.getByText("No jobs discovered yet")).toBeVisible();
  await expect(page.getByText(/daily at 05:00, Europe\/Amsterdam/)).toBeVisible();
  await page.getByRole("button", { name: "Scan Jobs Now" }).click();
  await expect(page.getByText("Scan completed", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("3 matching listings found: 3 new, 0 already known.")).toBeVisible();

  // Germany, the Netherlands and Austria were selected; the London posting is left out.
  await expect(page.getByRole("link", { name: "Senior Frontend Engineer", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "React Developer", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Frontend Engineer", exact: true })).toBeVisible();
  await expect(page.getByText("Thames Works")).toHaveCount(0);
  await expect(page.getByText("Account Manager")).toHaveCount(0);
  await expect(page.getByText("Showing 3 of 3")).toBeVisible();

  // Each sponsorship status is stated, and missing information is not presented as sponsorship.
  const card = (company: string) => page.locator("li", { hasText: company });
  await expect(card("Lindenhof Software").getByText("Confirmed sponsorship")).toBeVisible();
  await expect(card("Lindenhof Software").getByText("Relocation support stated")).toBeVisible();
  await expect(card("Grachten Labs").getByText("Possible sponsorship")).toBeVisible();
  await expect(card("Donau Digital").getByText("Sponsorship unknown")).toBeVisible();
  await expect(card("Lindenhof Software").getByLabel(/Job Match Score \d+ out of 100/)).toBeVisible();
  await expect(card("Lindenhof Software").getByText("Demo jobs")).toBeVisible();

  await page.getByLabel("Sponsorship", { exact: true }).selectOption("confirmed");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/sponsorship=confirmed/);
  await expect(page.getByText("Showing 1 of 1")).toBeVisible();
  await expect(page.getByRole("link", { name: "React Developer", exact: true })).toHaveCount(0);
});

test("a listing shows its sponsorship evidence and match explanation", async ({ page }) => {
  await login(page);
  await page.goto("/scanner");
  await page.getByRole("link", { name: "Senior Frontend Engineer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Senior Frontend Engineer", level: 1 })).toBeVisible();
  const visa = visaCard(page);
  await expect(visa.getByText("Confirmed sponsorship")).toBeVisible();
  await expect(visa).toContainText(
    "We offer visa sponsorship and a relocation package for candidates moving to Germany.",
  );
  await expect(visa.getByText("States an offer")).toBeVisible();
  await expect(visa.getByRole("link", { name: "Source" }).first()).toHaveAttribute(
    "href",
    "https://jobs.example.com/demo/senior-frontend-engineer-berlin",
  );
  await expect(page.getByText("Relevance to your confirmed profile, on a documented rubric.")).toBeVisible();
  await expect(page.getByRole("cell", { name: /Mandatory requirements/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Job requirements" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Job description" })).toBeVisible();
  await expect(page.getByText("Own our React and TypeScript web application").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Apply on Demo jobs" })).toHaveAttribute(
    "href",
    "https://jobs.example.com/demo/senior-frontend-engineer-berlin",
  );
});

test("Tailor Resume for This Job opens the existing workflow with the job selected", async ({ page }) => {
  await login(page);
  await page.goto("/scanner");
  await page.getByRole("link", { name: "Senior Frontend Engineer", exact: true }).click();
  await expect(page).toHaveURL(/\/scanner\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: "Senior Frontend Engineer", level: 1 })).toBeVisible();
  const listingUrl = page.url();
  await page.getByRole("button", { name: "Tailor Resume for This Job" }).click();
  await expect(page).toHaveURL(/\/generate\?job=[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: "Generate Resume" })).toBeVisible();
  const select = page.getByLabel("Job description");
  const jobId = new URL(page.url()).searchParams.get("job")!;
  await expect(select).toHaveValue(jobId);
  // Already analysed by the scanner, so the option does not say it will be analysed first.
  await expect(select.locator("option:checked")).toHaveText("Senior Frontend Engineer @ Lindenhof Software");
  await expect(page.getByLabel("Quick Generate")).toBeChecked();
  await expect(page.getByLabel("Review Mode")).toBeVisible();

  // The job description holds the posting text and links back to the posting.
  await page.goto(`/jobs/${jobId}`);
  await expect(page.getByLabel("Job description text")).toHaveValue(
    /We offer visa sponsorship and a relocation package/,
  );
  await expect(page.getByLabel("Posting URL (optional)")).toHaveValue(
    "https://jobs.example.com/demo/senior-frontend-engineer-berlin",
  );

  await page.goto(`/generate?job=${jobId}`);
  await page.getByRole("button", { name: "Generate Resume" }).click();
  await expect(page).toHaveURL(/\/resumes\/[a-z0-9]+\?generated=1$/, { timeout: 60_000 });
  const resumeId = page.url().match(/\/resumes\/([a-z0-9]+)/)![1];

  // The resume is associated with the listing.
  await page.goto(listingUrl);
  const resumes = page.locator("section", { hasText: "Resumes for this job" });
  await expect(resumes.getByRole("link", { name: /Senior Frontend Engineer @ Lindenhof Software/ })).toHaveAttribute(
    "href",
    `/resumes/${resumeId}`,
  );
  await expect(page.getByText("Resume tailoring started")).toBeVisible();

  // Review Mode goes to the same workflow.
  await resumes.getByRole("button", { name: "Review Mode" }).click();
  await expect(page).toHaveURL(new RegExp(`/generate\\?job=${jobId}&mode=review$`));
  await expect(page.getByLabel("Review Mode")).toBeChecked();
});

test("tracking status is saved and survives another scan without duplicates", async ({ page }) => {
  await login(page);
  await page.goto("/scanner");
  await page.getByLabel("Status of Senior Frontend Engineer").selectOption("applied");
  await expect(page.getByLabel("Status of Senior Frontend Engineer")).toHaveValue("applied");
  await page.reload();
  await expect(page.getByLabel("Status of Senior Frontend Engineer")).toHaveValue("applied");

  await scanNow(page);
  await expect(page.getByText("3 matching listings found: 0 new, 3 already known.")).toBeVisible();
  await expect(page.getByText("Showing 3 of 3")).toBeVisible();
  await expect(page.getByLabel("Status of Senior Frontend Engineer")).toHaveValue("applied");

  await page.getByLabel("Status", { exact: true }).selectOption("applied");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText("Showing 1 of 1")).toBeVisible();
  await page.getByRole("link", { name: "Senior Frontend Engineer", exact: true }).click();
  await expect(page.getByText("Status changed: New to Applied")).toBeVisible();

  // A dismissed listing leaves the default view and is kept.
  await page.goto("/scanner");
  await page.getByLabel("Status of React Developer").selectOption("dismissed");
  await expect(page.getByRole("link", { name: "React Developer", exact: true })).toHaveCount(0);
  await page.getByLabel("Status", { exact: true }).selectOption("dismissed");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("link", { name: "React Developer", exact: true })).toBeVisible();
});

test("scan history records each run with its sources and counts", async ({ page }) => {
  await login(page);
  await page.goto("/scanner");
  await page.getByRole("link", { name: "Scan history" }).click();
  await expect(page.getByRole("heading", { name: "Scan History" })).toBeVisible();
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Manual");
  await expect(rows.first()).toContainText("Completed");
  await expect(rows.first()).toContainText("Demo jobs");
  await rows.last().getByRole("link").click();
  await expect(page.getByText(/^Scan ID c[a-z0-9]+$/)).toBeVisible();
  await expect(page.getByText("Countries searched: Germany, Netherlands, Austria")).toBeVisible();
  const run = page.locator("section", { hasText: "New jobs saved" });
  await expect(run).toContainText("Matching jobs discovered3");
  await expect(run).toContainText("New jobs saved3");
  const sources = page.locator("section", { hasText: "Sources queried" });
  await expect(sources).toContainText("Demo jobs");
  await expect(sources).toContainText("5 read · 3 matched your preferences · 3 new");
  await expect(page.getByText("Located in a country you did not select", { exact: true })).toBeVisible();
  await expect(page.getByText("Title did not match your job titles", { exact: true })).toBeVisible();
});

test("a LinkedIn posting can be imported and is labelled as imported, not scanned", async ({ page }) => {
  await login(page);
  await page.goto("/scanner");
  const shortcuts = page.locator("section", { hasText: "Search sites that cannot be scanned" });
  // LinkedIn has no sponsorship filter, so the search asks for postings that mention it.
  const linkedIn = shortcuts.getByRole("link", { name: "Open LinkedIn Jobs search" });
  const narrowed = shortcuts.getByLabel("Only postings that mention visa sponsorship or relocation");
  await expect(narrowed).toBeChecked();
  await expect(linkedIn).toHaveAttribute(
    "href",
    /^https:\/\/www\.linkedin\.com\/jobs\/search\/\?keywords=Frontend\+Engineer\+%28%22visa\+sponsorship%22\+OR\+.*%29&location=Germany$/,
  );
  await narrowed.uncheck();
  await expect(linkedIn).toHaveAttribute(
    "href",
    "https://www.linkedin.com/jobs/search/?keywords=Frontend+Engineer&location=Germany",
  );
  // An exclusion line is not offered as something to search for.
  await expect(shortcuts.getByLabel("Job title").locator("option")).toHaveText([
    "Frontend Engineer",
    "Senior Frontend Engineer",
    "React Developer",
  ]);

  await page.getByRole("link", { name: "Import a posting" }).first().click();
  await expect(page.getByRole("heading", { name: "Import a Job Posting" })).toBeVisible();
  await page.getByLabel("Link to the posting").fill("https://www.linkedin.com/jobs/view/3912345678/?trk=public_jobs");
  await page.getByLabel("Job title").fill("Staff Frontend Engineer");
  await page.getByLabel("Company").fill("Polder Labs");
  await page.getByLabel("Location").fill("Utrecht, Netherlands");
  await page
    .getByLabel("Job description")
    .fill(
      "Polder Labs is hiring a Staff Frontend Engineer.\nRequired: 5+ years of React and TypeScript.\nWe sponsor work permits for international hires.",
    );
  await page.getByRole("button", { name: "Import posting" }).click();
  await expect(page).toHaveURL(/\/scanner\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: "Staff Frontend Engineer", level: 1 })).toBeVisible();
  await expect(page.getByText("Imported by you", { exact: true })).toBeVisible();
  await expect(page.getByText("LinkedIn Jobs").first()).toBeVisible();
  await expect(visaCard(page)).toContainText("We sponsor work permits for international hires.");

  await page.goto("/scanner/import");
  await page.getByLabel("Link to the posting").fill("https://www.linkedin.com/jobs/view/1");
  await page.getByLabel("Job title").fill("Frontend Engineer");
  await page.getByLabel("Company").fill("Acme");
  await page.getByLabel("Job description").fill("x".repeat(60));
  await page.getByLabel("Link to the posting").fill("https://localhost/jobs/1");
  await page.getByRole("button", { name: "Import posting" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Enter the full link to the posting" })).toBeVisible();
});
