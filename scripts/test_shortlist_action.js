const puppeteer = require('../../tam-times/node_modules/puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
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

  await page.goto('http://localhost:3001/applicants', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1200));

  // Find an applicant with "Waiting for review"
  const rows = await page.$$('tr.classified-row');
  console.log(`Found ${rows.length} rows.`);

  let targetId = null;
  for (const row of rows) {
    const text = await row.evaluate(el => el.innerText);
    if (text.includes('WAITING FOR REVIEW')) {
      const link = await row.$('a[href^="/applicants/"]');
      if (link) {
        targetId = await link.evaluate(el => el.getAttribute('href'));
        console.log('Target unreviewed applicant link:', targetId);
        break;
      }
    }
  }

  if (targetId) {
    await page.goto(`http://localhost:3001${targetId}`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));

    console.log('BEFORE clicking Mark to Shortlist:');
    const stampBefore = await page.$$eval('.stage-stamp', els => els.map(e => e.textContent.trim()));
    console.log('Stamps before:', stampBefore);

    // Click "Mark to Shortlist"
    const dossierBtns = await page.$$('button');
    for (const b of dossierBtns) {
      const text = await b.evaluate(el => el.textContent.trim());
      if (text === 'Mark to Shortlist') {
        console.log('Clicking "Mark to Shortlist"...');
        await b.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 2000));

    console.log('AFTER clicking Mark to Shortlist:');
    const stampAfter = await page.$$eval('.stage-stamp', els => els.map(e => e.textContent.trim()));
    console.log('Stamps after:', stampAfter);

    const buttonTexts = await page.$$eval('button', els => els.map(e => e.textContent.trim()));
    console.log('Buttons after:', buttonTexts.filter(b => b.includes('Shortlist')));

    // Now go back to /applicants
    await page.goto('http://localhost:3001/applicants', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1200));

    const panelMetrics = await page.$$eval('.paper', els => els.map(e => e.innerText));
    console.log('Panel on /applicants after:', panelMetrics[0]);
  }

  await browser.close();
})();
