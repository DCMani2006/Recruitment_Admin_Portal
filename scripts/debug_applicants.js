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

  // Click "ENTER AS SELECTED"
  const buttons = await page.$$('button');
  for (const b of buttons) {
    const text = await b.evaluate(el => el.textContent);
    if (text.includes('ENTER AS SELECTED')) {
      await b.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 1500));

  await page.goto('http://localhost:3001/applicants', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));
  const btns = await page.$$eval('button', els => els.map(e => e.textContent.trim()));
  console.log('ALL BUTTONS ON /applicants AFTER DEMO SIGN IN:', btns);
  await browser.close();
})();
