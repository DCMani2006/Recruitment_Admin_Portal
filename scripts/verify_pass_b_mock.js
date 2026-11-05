const path = require("path");
const fs = require("fs");

// Use puppeteer-core
const puppeteer = require(path.resolve(__dirname, "../../tam-times/node_modules/puppeteer-core"));

const SCREEN_DIR = path.resolve(__dirname, "../../docs/audit/screens/round2_pass_b");
if (!fs.existsSync(SCREEN_DIR)) {
  fs.mkdirSync(SCREEN_DIR, { recursive: true });
}

async function runTest1() {
  console.log("=== STARTING TEST 1: MOCK VERIFICATION ===");
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("[BROWSER ERROR]:", msg.text());
  });

  // 1. Login as Root Admin
  console.log("1. Navigating to login page...");
  await page.goto("http://localhost:3001/login", { waitUntil: "networkidle0" });
  await page.screenshot({ path: path.join(SCREEN_DIR, "01_login_page.png"), fullPage: true });

  console.log("2. Signing in as Root Admin...");
  // Click ENTER AS SELECTED
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const enterBtn = btns.find((b) => b.innerText.includes("ENTER AS SELECTED"));
    if (enterBtn) enterBtn.click();
  });

  await page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));
  console.log("Current URL:", page.url());

  // 2. Overview / Nav check
  await page.screenshot({ path: path.join(SCREEN_DIR, "02_overview.png"), fullPage: false });

  // 3. Applicant Listings & Decision-aware chips
  console.log("3. Navigating to Applicant Listings...");
  await page.goto("http://localhost:3001/applicants", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(SCREEN_DIR, "03_applicant_listings_all.png"), fullPage: false });

  // Click 'Marked to shortlist' chip
  console.log("Clicking 'Marked to shortlist' chip...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const chip = btns.find((b) => b.innerText.includes("Marked to shortlist"));
    if (chip) chip.click();
  });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: path.join(SCREEN_DIR, "04_applicants_marked_shortlist.png"), fullPage: false });

  // Click 'Waiting for review' chip
  console.log("Clicking 'Waiting for review' chip...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const chip = btns.find((b) => b.innerText.includes("Waiting for review"));
    if (chip) chip.click();
  });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: path.join(SCREEN_DIR, "05_applicants_waiting_review.png"), fullPage: false });

  // Click on first waiting candidate to open Review Desk
  console.log("Opening first candidate in review desk...");
  await page.evaluate(() => {
    const firstRow = document.querySelector(".classified-row");
    if (firstRow) firstRow.click();
  });
  await page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));

  // 4. Review Desk Round 1 Decision flow
  console.log("4. Testing Review Desk decisions on:", page.url());
  await page.screenshot({ path: path.join(SCREEN_DIR, "06_review_desk_initial.png"), fullPage: false });

  // Test: Mark to reject WITHOUT comment (must fail with validation error)
  console.log("Testing Mark to reject without >= 10 char comment...");
  await page.evaluate(() => {
    const textarea = document.getElementById("r1Comments");
    if (textarea) {
      textarea.value = "";
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const btns = Array.from(document.querySelectorAll("button"));
    const rejectBtn = btns.find((b) => b.innerText.trim() === "Mark to reject");
    if (rejectBtn) rejectBtn.click();
  });
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: path.join(SCREEN_DIR, "07_review_desk_reject_error.png"), fullPage: false });

  // Test: Mark to reject WITH comment (passes)
  console.log("Testing Mark to reject with valid comment...");
  await page.evaluate(() => {
    const textarea = document.getElementById("r1Comments");
    if (textarea) {
      textarea.value = "Candidate responses do not satisfy required criteria for this cycle.";
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const btns = Array.from(document.querySelectorAll("button"));
    const rejectBtn = btns.find((b) => b.innerText.trim() === "Mark to reject");
    if (rejectBtn) rejectBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(SCREEN_DIR, "08_review_desk_marked_reject.png"), fullPage: false });

  // Test: Mark to shortlist
  console.log("Testing Mark to shortlist...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const shortlistBtn = btns.find((b) => b.innerText.trim() === "Mark to shortlist");
    if (shortlistBtn) shortlistBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(SCREEN_DIR, "09_review_desk_marked_shortlist.png"), fullPage: false });

  // Test: Clear decision
  console.log("Testing Clear decision...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const clearBtn = btns.find((b) => b.innerText.trim() === "Clear decision");
    if (clearBtn) clearBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(SCREEN_DIR, "10_review_desk_decision_cleared.png"), fullPage: false });

  // 5. Decision Desk
  console.log("5. Navigating to /decision-desk...");
  await page.goto("http://localhost:3001/decision-desk", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(SCREEN_DIR, "11_decision_desk_lists.png"), fullPage: false });

  // Move an applicant from Shortlist to Reject
  console.log("Testing Move to Reject in Decision Desk...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const moveBtn = btns.find((b) => b.innerText.includes("Move to Reject"));
    if (moveBtn) moveBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(SCREEN_DIR, "12_decision_desk_moved_to_reject.png"), fullPage: false });

  // Check SENT tab
  console.log("Testing SENT tab in Decision Desk...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const sentTabBtn = btns.find((b) => b.innerText.includes("SENT"));
    if (sentTabBtn) sentTabBtn.click();
  });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: path.join(SCREEN_DIR, "13_decision_desk_sent_tab.png"), fullPage: false });

  // Switch back to Pending
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const pendingTabBtn = btns.find((b) => b.innerText.includes("Decisions Pending"));
    if (pendingTabBtn) pendingTabBtn.click();
  });
  await new Promise((r) => setTimeout(r, 800));

  // Open Send Shortlist Emails Modal
  console.log("Opening Send Shortlist Emails popup...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const sendBtn = btns.find((b) => b.innerText.includes("Send shortlist emails"));
    if (sendBtn) sendBtn.click();
  });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: path.join(SCREEN_DIR, "14_send_popup_opened.png"), fullPage: false });

  // Check confirmation checkbox
  console.log("Checking confirmation checkbox and sending...");
  await page.evaluate(() => {
    const cb = document.getElementById("checkedConfirmCheckbox");
    if (cb) cb.click();
  });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: path.join(SCREEN_DIR, "15_send_popup_ready.png"), fullPage: false });

  // Click Send N emails button
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const sendBtn = btns.find((b) => b.innerText.includes("Send") && b.innerText.includes("emails"));
    if (sendBtn) sendBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(SCREEN_DIR, "16_after_dispatch.png"), fullPage: false });

  // 6. Interview Ledger
  console.log("6. Navigating to Interview Ledger...");
  await page.goto("http://localhost:3001/interviews", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(SCREEN_DIR, "17_interview_ledger_upcoming.png"), fullPage: false });

  // Switch to All or Past appointments
  console.log("Switching to All Appointments in Interview Ledger...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const allBtn = btns.find((b) => b.innerText.trim().toLowerCase().includes("all"));
    if (allBtn) allBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(SCREEN_DIR, "18_interview_ledger_all.png"), fullPage: false });

  // Click "Add marks" or "Edit marks" on an ended slot
  console.log("Testing Add marks / Edit marks panel...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const marksBtn = btns.find((b) => b.innerText.trim() === "Add marks" || b.innerText.trim() === "Edit marks");
    if (marksBtn) marksBtn.click();
  });
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: path.join(SCREEN_DIR, "19_interview_marks_panel_open.png"), fullPage: false });

  // Save marks
  console.log("Saving interview marks...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const saveBtn = btns.find((b) => b.innerText.trim() === "Save");
    if (saveBtn) saveBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(SCREEN_DIR, "20_interview_marks_saved.png"), fullPage: false });

  console.log("=== TEST 1 COMPLETED SUCCESSFULLY ===");
  await browser.close();
}

runTest1().catch((err) => {
  console.error("Test 1 error:", err);
  process.exit(1);
});
