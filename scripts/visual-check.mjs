import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.URL ?? 'http://127.0.0.1:5173/';
const OUT = process.env.OUT ?? '/tmp/ff';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--hide-scrollbars'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
});

const page = await browser.newPage();
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}-${name}.png` });
  console.log(`saved ${OUT}-${name}.png`);
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 60_000 });
  await wait(2600);
  await shot('01-initial');

  await page.$eval('#explode', (element) => {
    element.value = '100';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await wait(1800);
  await shot('02-exploded');

  await page.click('#btn-reset');
  await wait(1500);

  await page.mouse.click(720, 650);
  await wait(1200);
  await shot('03-selected');

  await page.click('#btn-spin');
  await wait(1200);
  await shot('04-spin');

  await page.click('#btn-flow');
  await wait(1800);
  await shot('05-flow');

  await page.click('#btn-cut');
  await wait(1400);
  await shot('06-cut');

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: 'networkidle0', timeout: 60_000 });
  await wait(2800);
  await shot('07-mobile');

  await page.$eval('#explode', (element) => {
    element.value = '100';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await wait(1900);
  await shot('08-mobile-exploded');

  await page.reload({ waitUntil: 'networkidle0', timeout: 60_000 });
  await wait(2600);
  await page.mouse.click(195, 560);
  await wait(1400);
  await shot('09-mobile-selected');

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: 'networkidle0', timeout: 60_000 });
  await wait(2600);
  await page.select('#part-select', 'FF_Nozzle');
  await wait(1300);
  await shot('10-keyboard-select');
} catch (error) {
  errors.push(`script: ${error.message}`);
} finally {
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
}
