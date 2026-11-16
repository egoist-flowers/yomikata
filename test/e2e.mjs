import { _electron as electron } from 'playwright-core';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const electronPath = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const userData = path.join(root, 'test', 'userdata-e2e');
const shots = path.join(root, 'test', 'shots');
const sample = path.join(root, 'test', 'sample.epub');
fs.mkdirSync(shots, { recursive: true });
fs.rmSync(userData, { recursive: true, force: true });

const lookupPayload = {
  kind: 'word',
  headword: '猫',
  reading: 'ねこ',
  romaji: 'neko',
  part_of_speech: '名词',
  meaning: '猫。这里是叙述者的自称，带着一点调侃和自嘲。',
  nuance: '日常口语中很常用；在小说里也常用来形容自由散漫、难以捉摸的人。',
  sentence_meaning: '',
  kanji: [
    { char: '猫', on: 'ビョウ', kun: 'ねこ', in_word: 'ねこ', note: '日常使用训读' }
  ],
  words: []
};

const requests = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    if (req.method === 'POST' && req.url.includes('/chat/completions')) {
      let parsed = null;
      try { parsed = JSON.parse(body); } catch { /* ignore */ }
      requests.push({ url: req.url, auth: req.headers.authorization, body: parsed });
      const isConnectionTest = parsed?.messages?.[0]?.content?.includes('connection test');
      const userContent = parsed?.messages?.[1]?.content || '';
      const match = userContent.match(/<<<\n([\s\S]*?)\n>>>/);
      const selected = match ? match[1].trim() : '';
      const dynamicPayload = {
        ...lookupPayload,
        headword: selected || lookupPayload.headword,
        reading: selected === '猫' ? 'ねこ' : selected === '見当' ? 'けんとう' : 'よみかた',
        romaji: selected === '猫' ? 'neko' : selected === '見当' ? 'kentō' : 'yomikata',
        kanji: selected === '見当'
          ? [
              { char: '見', on: 'ケン', kun: 'み.る', in_word: 'けん', note: '' },
              { char: '当', on: 'トウ', kun: 'あ.たる', in_word: 'とう', note: '熟字训 見当（けんとう）' }
            ]
          : lookupPayload.kanji
      };
      const content = isConnectionTest ? 'OK' : JSON.stringify(dynamicPayload);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'mock-1',
        model: 'deepseek-chat',
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 500, completion_tokens: 160, total_tokens: 660 }
      }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'not found' } }));
  });
});
await new Promise((resolve) => server.listen(8899, '127.0.0.1', resolve));

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
await page.waitForTimeout(1200);
console.log('BOOK LOADED:', await page.locator('#chapter-title').textContent());

// Configure the mock API through the real settings UI.
await page.locator('#btn-settings').click();
await page.waitForSelector('#settings-modal:not([hidden])');
await page.locator('#input-api-key').fill('sk-test-1234567890abcdef');
await page.locator('#input-base-url').fill('http://127.0.0.1:8899/v1');
await page.locator('#input-model').fill('deepseek-chat');
await page.locator('#btn-test-api').click();
await page.waitForFunction(() => document.querySelector('#test-result')?.textContent.includes('连接成功'), null, { timeout: 10000 });
console.log('TEST RESULT:', await page.locator('#test-result').textContent());
await page.locator('#btn-save-settings').click();
await page.waitForSelector('#settings-modal', { state: 'hidden' });
await page.waitForTimeout(400);
console.log('API DOT OK:', await page.locator('#api-dot').evaluate((node) => node.classList.contains('ok')));

// Select the word 猫 inside the ruby annotation.
const frame = page.frames().find((item) => item !== page.mainFrame());
if (!frame) throw new Error('No EPUB frame');
const requestsBeforeSelect = requests.length;
const selectionInfo = await frame.evaluate(() => {
  const rubies = Array.from(document.querySelectorAll('ruby'));
  const ruby = rubies.find((item) => item.firstChild?.nodeValue?.trim() === '猫');
  if (!ruby) return { error: 'ruby not found' };
  const range = document.createRange();
  range.selectNodeContents(ruby.firstChild);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  const rect = range.getBoundingClientRect();
  return { text: selection.toString(), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
});
console.log('SELECTION:', selectionInfo);
await page.waitForTimeout(1000);
await page.waitForFunction(() => !document.querySelector('#panel-result').hidden, null, { timeout: 12000 });
console.log('RESULT WORD:', await page.locator('.result-word').textContent());
console.log('RESULT READING:', await page.locator('.result-reading b').textContent());
console.log('KANJI CARDS:', await page.locator('.kanji-card').count());
console.log('KANJI IN WORD:', await page.locator('.kanji-reading-row .tag.in-word + b').textContent());
console.log('CACHE CHIP:', await page.locator('.result-tags .chip.green').count());
console.log('REQUEST COUNT:', requests.length);
console.log('REQUESTS SINCE SELECT:', requests.length - requestsBeforeSelect);
for (const [index, request] of requests.slice(requestsBeforeSelect).entries()) {
  console.log(`LOOKUP #${index + 1} PROMPT:`, request.body?.messages?.[1]?.content);
}
const last = requests[requests.length - 1];
console.log('REQUEST AUTH:', last?.auth);
console.log('REQUEST USER PROMPT:', last?.body?.messages?.[1]?.content);
console.log('SENDS FULL PARAGRAPH:', last?.body?.messages?.[1]?.content?.includes('名前はまだ無い'));
console.log('SELECTED TEXT ONLY:', last?.body?.messages?.[1]?.content?.includes('<<<\n猫\n>>>'));

await page.screenshot({ path: path.join(shots, 'lookup.png'), fullPage: false });

// Save to notebook.
await page.locator('[data-result-action="save"]').click();
await page.waitForTimeout(300);
console.log('VOCAB BADGE:', await page.locator('#vocab-count').textContent());
console.log('SAVE ACTIVE:', await page.locator('[data-result-action="save"]').evaluate((node) => node.classList.contains('is-saved')));

// Select the same word again: it should come from cache without a new request.
async function selectRuby(firstChar) {
  return frame.evaluate((char) => {
    const ruby = Array.from(document.querySelectorAll('ruby'))
      .find((item) => item.firstChild?.nodeValue?.trim() === char);
    if (!ruby) return false;
    const range = document.createRange();
    range.selectNodeContents(ruby.firstChild);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }, firstChar);
}

await frame.evaluate(() => window.getSelection()?.removeAllRanges());
await page.waitForTimeout(300);
const requestCountBeforeCache = requests.length;
console.log('RESELECTED:', await selectRuby('猫'));
await page.waitForTimeout(1300);
console.log('CACHE CHIP AFTER RESELECT:', await page.locator('.result-tags .chip.green').count());
console.log('NEW REQUESTS FOR CACHED LOOKUP:', requests.length - requestCountBeforeCache);

// Turn off auto lookup and test the manual selection popover.
await page.locator('#btn-settings').click();
await page.waitForSelector('#settings-modal:not([hidden])');
await page.locator('#toggle-auto').evaluate((node) => {
  node.checked = false;
  node.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.locator('#btn-save-settings').click();
await page.waitForSelector('#settings-modal', { state: 'hidden' });
await page.waitForTimeout(300);

await frame.evaluate(() => window.getSelection()?.removeAllRanges());
await page.waitForTimeout(300);
const requestCountBeforeManual = requests.length;
console.log('RESELECTED MANUAL:', await selectRuby('見当'));
await page.waitForTimeout(900);
console.log('POPOVER VISIBLE:', await page.locator('#selection-popover').isVisible());
console.log('POPOVER QUOTE:', await page.locator('#selection-quote').textContent());
console.log('NO AUTO REQUEST:', requests.length === requestCountBeforeManual);
await page.screenshot({ path: path.join(shots, 'popover.png'), fullPage: false });
await page.locator('#selection-lookup').click();
await page.waitForFunction(() => !document.querySelector('#panel-result').hidden, null, { timeout: 12000 });
await page.waitForTimeout(400);
console.log('MANUAL RESULT WORD:', await page.locator('.result-word').textContent());
console.log('MANUAL KANJI CARDS:', await page.locator('.kanji-card').count());
await page.screenshot({ path: path.join(shots, 'manual-lookup.png'), fullPage: false });

// Theme and font controls should update both chrome and the EPUB iframe.
await page.locator('#btn-settings').click();
await page.waitForSelector('#settings-modal:not([hidden])');
await page.locator('.theme-option[data-theme="night"]').click();
await page.locator('#btn-save-settings').click();
await page.waitForSelector('#settings-modal', { state: 'hidden' });
await page.waitForTimeout(500);
console.log('BODY THEME:', await page.evaluate(() => document.body.dataset.theme));
const nightFrame = page.frames().find((item) => item !== page.mainFrame());
console.log('NIGHT FRAME BG:', await nightFrame.evaluate(() => getComputedStyle(document.body).backgroundColor));
await page.locator('#btn-font-up').click();
await page.waitForTimeout(500);
console.log('FONT AFTER +:', await nightFrame.evaluate(() => getComputedStyle(document.body).fontSize));
await page.screenshot({ path: path.join(shots, 'night.png'), fullPage: false });

// Switch back to paper and horizontal layout.
await page.locator('#btn-settings').click();
await page.waitForSelector('#settings-modal:not([hidden])');
await page.locator('.theme-option[data-theme="paper"]').click();
await page.locator('#btn-save-settings').click();
await page.waitForSelector('#settings-modal', { state: 'hidden' });
await page.waitForTimeout(400);

// Turn the page and verify chapter/progress updates.
await page.locator('#btn-next').click();
await page.waitForTimeout(1200);
console.log('AFTER NEXT CHAPTER:', await page.locator('#chapter-title').textContent());
console.log('AFTER NEXT PROGRESS:', await page.locator('#progress-percent').textContent());

// Open notebook and check the entry is there.
await page.locator('#btn-notebook').click();
await page.waitForSelector('#notebook-modal:not([hidden])');
console.log('NOTEBOOK ENTRIES:', await page.locator('#vocab-list .entry-card').count());
console.log('NOTEBOOK FIRST:', await page.locator('#vocab-list .entry-word b').first().textContent());
await page.screenshot({ path: path.join(shots, 'notebook.png'), fullPage: false });

console.log('ALL OK');
await app.close();
server.close();
