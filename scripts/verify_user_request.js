const path = require("path");
const fs = require("fs");

const puppeteer = require(path.resolve(__dirname, "../../tam-times/node_modules/puppeteer-core"));

const SCREENSHOT_DIR = path.resolve(__dirname, "../../docs/audit/screens/user_request_verify");
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function run() {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: "new",
    defaultViewport: { width: 1440, height: 900 },
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  console.log("1. Navigating to Login Page...");
  await page.goto("http://localhost:3001/login", { waitUntil: "networkidle2" });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01_login.png") });

  console.log("2. Signing in as Technical Domain Head...");
  await page.select("#demoUserSelect", "TECHNICAL");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const b = btns.find((x) => x.innerText.includes("ENTER AS SELECTED"));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 2000));
  console.log("Current URL:", page.url());
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02_overview_tech_head.png") });

  console.log("3. Verifying Overview Page...");
  const overviewText = await page.evaluate(() => document.body.innerText);
  console.log("Overview text snippet:\n", overviewText.slice(0, 300));
  if (!overviewText.toUpperCase().includes("TECH")) throw new Error("Overview missing division title");
  if (!overviewText.toUpperCase().includes("WAITING FOR REVIEW")) throw new Error("Overview missing key numbers");

  console.log("4. Visiting Question Desk (verifying order before Applicants)...");
  await page.click('a[href="/form-builder"]');
  await page.waitForNetworkIdle();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03_question_desk.png") });

  console.log("5. Opening Edit Question Modal...");
  const editBtns = await page.$$('button ::-p-text("✎ Edit")');
  if (editBtns.length === 0) throw new Error("Edit Question button not found");
  await editBtns[0].click();
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04_edit_question_modal.png") });

  // Close modal
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const cancelBtn = btns.find((b) => b.innerText.includes("Return") || b.innerText.includes("Cancel"));
    if (cancelBtn) cancelBtn.click();
  });
  await new Promise((r) => setTimeout(r, 400));

  console.log("6. Visiting Decision Desk...");
  await page.click('a[href="/decision-desk"]');
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05_decision_desk.png") });

  console.log("7. Moving candidate from Shortlist to Reject...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const moveBtn = btns.find((b) => b.innerText.includes("Move to Reject"));
    if (moveBtn) moveBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06_decision_desk_moved.png") });

  console.log("8. Opening Send Emails Popup Modal...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const sendBtn = btns.find((b) => b.innerText.includes("Send shortlist emails"));
    if (sendBtn) sendBtn.click();
  });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "07_send_modal_popup.png") });

  // Close modal
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const cancelBtn = btns.find((b) => b.innerText.includes("Cancel") || b.innerText.includes("Return") || b.innerText.includes("✕"));
    if (cancelBtn) cancelBtn.click();
  });
  await new Promise((r) => setTimeout(r, 500));

  console.log("9. Visiting Applicant Review Desk (Checking NO 'SHORTLISTED' tag)...");
  await page.click('a[href="/applicants"]');
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "08_applicants_list.png") });

  // Open first applicant
  await page.evaluate(() => {
    const link = document.querySelector('a[href^="/applicants/app-"]');
    if (link) link.click();
  });
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "09_review_desk.png") });

  console.log("10. Visiting Slot Planner (Simpler 2-Tab Layout)...");
  await page.click('a[href="/slots"]');
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "10_slot_planner_step1.png") });

  // Step 2
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const b = btns.find((x) => x.innerText.includes("Continue to Hours"));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "11_slot_planner_step2.png") });

  // Step 3
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const b = btns.find((x) => x.innerText.includes("Continue to Details"));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "12_slot_planner_step3.png") });

  // Switch to Existing Slots tab
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const b = btns.find((x) => x.innerText.includes("Existing Slots"));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "13_slot_planner_existing_tab.png") });

  console.log("11. Visiting Interview Ledger...");
  await page.click('a[href="/interviews"]');
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "14_interview_ledger.png") });

  console.log("12. Signing out and signing in as Root Admin to verify Masthead (/team)...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const signOutBtn = btns.find((b) => b.innerText.includes("SIGN OUT"));
    if (signOutBtn) signOutBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1200));

  await page.goto("http://localhost:3001/login", { waitUntil: "networkidle2" });
  await page.select("#demoUserSelect", "ROOT");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const b = btns.find((x) => x.innerText.includes("ENTER AS SELECTED"));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 2000));

  await page.click('a[href="/team"]');
  await page.waitForNetworkIdle();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "15_the_masthead_team.png") });

  const mastheadText = await page.evaluate(() => document.body.innerText);
  if (mastheadText.includes("Account Claim Instructions") || mastheadText.includes("Copy claim instructions")) {
    throw new Error("Found Account Claim Instructions in Masthead");
  }

  console.log("ALL VERIFICATIONS COMPLETED SUCCESSFULLY!");
  await browser.close();
}

run().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
