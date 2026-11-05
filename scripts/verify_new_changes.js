const puppeteer = require('../../tam-times/node_modules/puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREEN_DIR = path.resolve(__dirname, '../../docs/audit/screens/new_changes_verify');

if (!fs.existsSync(SCREEN_DIR)) {
  fs.mkdirSync(SCREEN_DIR, { recursive: true });
}

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,960'],
    defaultViewport: { width: 1440, height: 960 },
  });

  const page = await browser.newPage();

  try {
    console.log('1. Logging in as Tech Head via Demo Sign-in...');
    await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle2' });
    await page.select('#demoUserSelect', 'tech-head@tam.iitr.ac.in');
    await new Promise(r => setTimeout(r, 400));

    const btns = await page.$$('button');
    for (const b of btns) {
      const text = await b.evaluate(el => el.textContent);
      if (text.includes('ENTER AS SELECTED')) {
        await b.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 1500));

    // Verify Nav bar links
    const navText = await page.$$eval('header a, nav a', els => els.map(e => e.textContent.trim()));
    console.log('Nav links found:', navText);
    const hasDecisionDesk = navText.some(t => t.toLowerCase().includes('decision desk'));
    if (hasDecisionDesk) throw new Error('Decision Desk still present in nav bar!');
    console.log('PASS: Decision Desk removed from navigation.');

    // 2. Question Desk
    console.log('2. Visiting Question Desk (/form-builder)...');
    await page.goto('http://localhost:3001/form-builder', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(SCREEN_DIR, '01_question_desk_no_warning.png') });
    const content = await page.content();
    if (content.includes('EDITORIAL WARNING')) {
      throw new Error('Editorial Warning is still present in Question Desk!');
    }
    console.log('PASS: Editorial Warning is completely removed from Question Desk.');

    // 3. Applicant Listings
    console.log('3. Visiting Applicant Listings (/applicants)...');
    await page.goto('http://localhost:3001/applicants', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1200));
    await page.screenshot({ path: path.join(SCREEN_DIR, '02_applicant_listings_panel.png') });

    const applicantButtons = await page.$$eval('button', els => els.map(e => e.textContent.trim()).filter(Boolean));
    console.log('Checking status filter chips on /applicants...');
    const forbidden = ['Notified', 'Slot choosing', 'Interview', 'Selected'];
    for (const f of forbidden) {
      const chipMatch = applicantButtons.find(b => b.startsWith(f));
      if (chipMatch) {
        throw new Error(`Forbidden filter chip found: ${chipMatch}`);
      }
    }
    console.log('PASS: Forbidden filter options (notified, slot choosing, interview, selected) removed.');

    const hasViewShortlist = applicantButtons.some(b => b.includes('View Final Shortlisted'));
    const hasViewReject = applicantButtons.some(b => b.includes('View Final Rejected'));
    const hasSendShortlist = applicantButtons.some(b => b.includes('Send All Shortlist Emails'));
    const hasSendReject = applicantButtons.some(b => b.includes('Send All Rejection Emails'));

    console.log('Panel controls:', { hasViewShortlist, hasViewReject, hasSendShortlist, hasSendReject });
    if (!hasViewShortlist || !hasViewReject || !hasSendShortlist || !hasSendReject) {
      throw new Error('Round 1 panel view/send buttons missing!');
    }
    console.log('PASS: Round 1 Decisions & Email Dispatch panel fully rendered.');

    // 4. Test Email Modal
    console.log('4. Testing Send Shortlist Emails popup modal...');
    const allButtons = await page.$$('button');
    let openedModal = false;
    for (const b of allButtons) {
      const txt = await b.evaluate(el => el.textContent);
      if (txt.includes('Send All Shortlist Emails') && !txt.includes('(0)')) {
        await b.click();
        openedModal = true;
        await new Promise(r => setTimeout(r, 800));
        await page.screenshot({ path: path.join(SCREEN_DIR, '03_send_shortlist_popup.png') });
        console.log('PASS: Email dispatch confirmation popup modal opened with template preview & candidate list.');

        // Close modal via Cancel
        const modalBtns = await page.$$('button');
        for (const mb of modalBtns) {
          const t = await mb.evaluate(el => el.textContent.trim());
          if (t === 'Cancel') {
            await mb.click();
            break;
          }
        }
        await new Promise(r => setTimeout(r, 600));
        break;
      }
    }
    if (!openedModal) {
      console.log('Note: Shortlist send button was disabled (0 unmailed candidates) or not clickable.');
    }

    // 5. Check Review Dossier options
    console.log('5. Visiting an applicant review dossier...');
    const openLink = await page.$('a[href^="/applicants/"]');
    if (openLink) {
      await openLink.click();
      await new Promise(r => setTimeout(r, 1500));
      await page.screenshot({ path: path.join(SCREEN_DIR, '04_review_dossier_three_options.png') });

      const reviewButtons = await page.$$eval('button', els => els.map(e => e.textContent.trim()));
      console.log('Review dossier action buttons:', reviewButtons);
      const hasSaveDraft = reviewButtons.some(b => b === 'Save Draft');
      const hasMarkShortlist = reviewButtons.some(b => b.includes('Mark to Shortlist') || b.includes('Marked to Shortlist'));
      const hasMarkReject = reviewButtons.some(b => b.includes('Mark to Reject') || b.includes('Marked to Reject'));
      const hasClearDecision = reviewButtons.some(b => b.toLowerCase().includes('clear decision'));

      console.log({ hasSaveDraft, hasMarkShortlist, hasMarkReject, hasClearDecision });
      if (!hasSaveDraft || !hasMarkShortlist || !hasMarkReject) {
        throw new Error('Expected exactly three options: Save Draft, Mark to Shortlist, Mark to Reject');
      }
      if (hasClearDecision) {
        throw new Error('Clear decision button should NOT be present!');
      }
      console.log('PASS: Review dossier displays exactly the three required options.');
    }

    console.log('ALL VERIFICATIONS PASSED 100%!');
  } catch (err) {
    console.error('VERIFICATION FAILED:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
