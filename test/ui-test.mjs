import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const electronPath = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const userData = path.join(root, 'test', 'userdata-ui');
const shots = path.join(root, 'test', 'shots');
const sample = path.join(root, 'test', 'sample.epub');
fs.mkdirSync(shots, { recursive: true });
fs.rmSync(userData, { recursive: true, force: true });

const env = { ...process.env, YOMIKATA_USER_DATA: userData, YOMIKATA_TEST: '1' };
delete env.ELECTRON_RUN_AS_NODE;

const app = await electron.launch({
  executablePath: electronPath,
  args: ['.', sample, '--no-sandbox', '--disable-gpu'],
  cwd: root,
  env,
  timeout: 30000
});
const page = await app.firstWindow();
page.on('console', (message) => console.log(`[console:${message.type()}] ${message.text()}`));
page.on('pageerror', (error) => console.log(`[pageerror] ${error.stack}`));
await page.waitForLoadState('domcontentloaded');
await page.waitForFunction(() => document.body.classList.contains('has-book'), null, { timeout: 15000 });
await page.waitForTimeout(1000);

// Settings dialog screenshot.
await page.locator('#btn-settings').click();
await page.waitForSelector('#settings-modal:not([hidden])');
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(shots, 'settings.png'), fullPage: false });
console.log('SETTINGS VISIBLE:', await page.locator('#settings-modal').isVisible());

// Cancel a night-theme preview and confirm it reverts.
await page.locator('.theme-option[data-theme="night"]').click();
await page.waitForTimeout(300);
console.log('PREVIEW THEME:', await page.evaluate(() => document.body.dataset.theme));
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
console.log('THEME AFTER CANCEL:', await page.evaluate(() => document.body.dataset.theme));

// Original layout should preserve publisher typography and switch to scrolled flow.
await page.locator('#btn-settings').click();
await page.waitForSelector('#settings-modal:not([hidden])');
await page.locator('#layout-options button[data-layout="original"]').click();
await page.locator('#btn-save-settings').click();
await page.waitForSelector('#settings-modal', { state: 'hidden' });
await page.waitForTimeout(1800);
let frame = page.frames().find((item) => item !== page.mainFrame());
console.log('ORIGINAL FRAME FONT:', await frame.evaluate(() => getComputedStyle(document.body).fontFamily));
console.log('ORIGINAL FRAME PADDING:', await frame.evaluate(() => getComputedStyle(document.body).padding));
console.log('ORIGINAL FRAME WRITING:', await frame.evaluate(() => getComputedStyle(document.body).writingMode));
console.log('ORIGINAL TITLE:', await page.locator('#chapter-title').textContent());
await page.screenshot({ path: path.join(shots, 'original-layout.png'), fullPage: false });

// Back to horizontal.
await page.locator('#btn-settings').click();
await page.waitForSelector('#settings-modal:not([hidden])');
await page.locator('#layout-options button[data-layout="horizontal"]').click();
await page.locator('#btn-save-settings').click();
await page.waitForSelector('#settings-modal', { state: 'hidden' });
await page.waitForTimeout(1200);

// Narrow window.
await app.evaluate(({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0];
  win.setSize(1060, 720);
});
await page.waitForTimeout(1000);
await page.screenshot({ path: path.join(shots, 'narrow-panel.png'), fullPage: false });
console.log('NARROW PANEL VISIBLE:', await page.locator('#lookup-panel').isVisible());
console.log('NARROW PANEL BOX:', await page.locator('#lookup-panel').boundingBox());
await page.locator('#btn-panel-close').click();
await page.waitForTimeout(600);
console.log('NARROW AFTER CLOSE BOX:', await page.locator('#lookup-panel').boundingBox());
await page.screenshot({ path: path.join(shots, 'narrow-closed.png'), fullPage: false });

// Toggle the panel back and test Ctrl+J / keyboard paging.
await page.locator('#btn-panel').click();
await page.waitForTimeout(500);
console.log('PANEL AFTER TOGGLE:', await page.locator('#lookup-panel').boundingBox());
await page.keyboard.press('Control+j');
await page.waitForTimeout(500);
console.log('PANEL AFTER CTRL+J:', await page.locator('#lookup-panel').boundingBox());

console.log('UI TEST OK');
await app.close();
