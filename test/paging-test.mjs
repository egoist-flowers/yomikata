import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const exe = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const userData = path.join(root, 'test', 'userdata-paging');
const bookPath = path.join(root, 'test', 'sample.epub');
fs.rmSync(userData, { recursive: true, force: true });
fs.mkdirSync(userData, { recursive: true });
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({
  baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', autoLookup: false,
  cacheEnabled: true, reopenLast: false, fontSize: 19, lineHeight: 1.95,
  theme: 'paper', layout: 'horizontal', fontFamily: 'serif', panelOpen: true
}, null, 2));
const env = { ...process.env, YOMIKATA_USER_DATA: userData, YOMIKATA_TEST: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  executablePath: exe, args: ['.', bookPath, '--no-sandbox', '--disable-gpu'],
  cwd: root, env, timeout: 30000
});
const page = await app.firstWindow();
page.on('pageerror', (error) => console.log(`[pageerror] ${error.stack}`));
await page.waitForFunction(() => document.body.classList.contains('has-book'), null, { timeout: 20000 });
await page.waitForTimeout(1200);

const frame = page.frames().find((item) => item !== page.mainFrame());
await frame.locator('body').click({ position: { x: 500, y: 500 } });
const chapter = async () => page.locator('#chapter-title').textContent();
console.log('START:', await chapter());

for (const key of ['Space', 'ArrowDown', 'PageDown', 'ArrowUp']) {
  const before = await chapter();
  await page.keyboard.press(key);
  await page.waitForTimeout(800);
  console.log(`KEY ${key}: ${before} -> ${await chapter()}`);
}

const box = await page.locator('#viewer-wrap').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
const wheelBefore = await chapter();
await page.mouse.wheel(0, 260);
await page.waitForTimeout(900);
console.log('WHEEL:', wheelBefore, '->', await chapter());

const nextBefore = await chapter();
if (await page.locator('#btn-next').isDisabled()) {
  console.log('NEXT BUTTON: disabled at end (expected)');
} else {
  await page.locator('#btn-next').click();
  await page.waitForTimeout(900);
  console.log('NEXT BUTTON:', nextBefore, '->', await chapter());
}
if (!(await page.locator('#btn-prev').isDisabled())) {
  await page.locator('#btn-prev').click();
  await page.waitForTimeout(900);
  console.log('PREV BUTTON:', await chapter());
} else {
  console.log('PREV BUTTON: disabled at start (expected)');
}
await app.close();
