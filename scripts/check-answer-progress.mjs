import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.EVAL_BASE_URL ?? 'http://localhost:3000';
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
try {
 const page = await browser.newPage();
 const errors = [];
 page.on('pageerror', error => errors.push(error.message));
 const document = { id: 'd137d2b3-7eeb-4aeb-b0ea-17f4c887f4a0', name: 'handbook.md', chunkCount: 1 };
 await page.route('**/api/documents', route => route.fulfill({ json: { documents: [document] } }));
 let pendingRoute;
 await page.route('**/api/ask', route => { pendingRoute = route; });
 await page.goto(base);
 await page.getByRole('checkbox').waitFor();
 await page.clock.install();
 await page.clock.pauseAt(new Date());
 const question = page.getByLabel('What would you like to know?');
 const progress = page.locator('.answer-card--pending');
 async function checkLabel(label) {
  await page.waitForFunction(expected => document.querySelector('.answer-card--pending [role="status"]')?.textContent === expected, label);
 }
 async function complete() {
  assert.ok(pendingRoute, 'The mocked answer request must be pending');
  await pendingRoute.fulfill({ json: { status: 'insufficient_evidence', answer: 'No matching evidence.', citations: [], requestId: 'progress-check' } });
  pendingRoute = undefined;
  await progress.waitFor({ state: 'detached' });
 }
 await question.press('Enter');
 assert.equal(await question.inputValue(), '');
 assert.equal(pendingRoute, undefined);
 await question.fill('What does the handbook say?');
 await question.press('Shift+Enter');
 assert.equal(await question.inputValue(), 'What does the handbook say?\n');
 assert.equal(pendingRoute, undefined);
 const submitted = page.waitForRequest('**/api/ask');
 await question.press('Enter');
 assert.equal((await submitted).postDataJSON().question, 'What does the handbook say?');
 await page.clock.runFor(1);
 await checkLabel('Thinking through your question…');
 await page.clock.runFor(2500);
 await checkLabel('Fetching relevant sources…');
 await page.clock.runFor(4000);
 await checkLabel('Preparing your answer…');
 await page.clock.runFor(11500);
 await checkLabel('Still working on your answer…');
 await complete();

 // Finish the next request before its stages run, and verify all timers are cancelled.
 await page.evaluate(() => {
  const set = window.setTimeout.bind(window), clear = window.clearTimeout.bind(window);
  const timers = new Set();
  window.progressTimersPending = timers;
  window.setTimeout = (callback, delay, ...args) => {
   const id = set(callback, delay, ...args);
   if ([2500, 6500, 18000].includes(delay)) timers.add(id);
   return id;
  };
  window.clearTimeout = id => {
   timers.delete(id);
   clear(id);
  };
 });
 await question.fill('Ask again');
 await question.evaluate(element => {
  const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true });
  element.dispatchEvent(event);
  if (event.defaultPrevented) throw new Error('Composing Enter must not be intercepted');
 });
 assert.equal(pendingRoute, undefined);
 await question.press('Enter');
 await page.clock.runFor(1);
 await checkLabel('Thinking through your question…');
 assert.equal(await page.evaluate(() => window.progressTimersPending.size), 3);
 await complete();
 assert.equal(await page.evaluate(() => window.progressTimersPending.size), 0);
 await page.clock.runFor(20000);
 assert.equal(await progress.count(), 0);
 assert.deepEqual(errors, []);
 console.log('PASS keyboard submission and answer progress: Enter, Shift+Enter, composition, all stages, reset, removal, and timer cleanup (mocked APIs)');
} finally { await browser.close(); }
