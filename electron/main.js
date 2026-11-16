'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, clipboard, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const { SettingsStore } = require('./store');
const { lookupSelection, testConnection } = require('./deepseek');

app.setName('Yomikata');

if (process.env.YOMIKATA_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.YOMIKATA_USER_DATA));
}

const MAX_EPUB_BYTES = 250 * 1024 * 1024;
const MAX_SELECTION_CHARS = 800;

let mainWindow = null;
let store = null;
let pendingEpubPath = extractEpubPath(process.argv);

function extractEpubPath(argv) {
  for (const argument of argv.slice(1)) {
    if (!argument || argument.startsWith('-')) continue;
    if (path.extname(argument).toLowerCase() === '.epub' && fs.existsSync(argument)) {
      return path.resolve(argument);
    }
  }
  return null;
}

function readEpubFile(filePath) {
  const resolved = path.resolve(String(filePath || ''));
  if (path.extname(resolved).toLowerCase() !== '.epub') {
    throw new Error('请选择 .epub 格式的电子书');
  }
  if (!fs.existsSync(resolved)) {
    throw new Error('找不到这个文件，它可能已被移动或删除');
  }
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error('选择的路径不是文件');
  if (stat.size > MAX_EPUB_BYTES) throw new Error('这个 EPUB 超过 250 MB，暂不支持');
  const buffer = fs.readFileSync(resolved);
  const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return {
    path: resolved,
    name: path.basename(resolved),
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    data
  };
}

function createWindow() {
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.max(900, Math.min(1440, workArea.width - 32));
  const height = Math.max(600, Math.min(920, workArea.height - 32));

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 900,
    minHeight: 600,
    center: true,
    show: false,
    backgroundColor: '#eee7d9',
    title: 'Yomikata よみかた',
    icon: path.join(__dirname, '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });

  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    const isDevToggle = input.type === 'keyDown' && input.key === 'F12';
    if (isDevToggle && (process.argv.includes('--dev') || process.env.YOMIKATA_DEV === '1')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function focusWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function openExternal(url) {
  if (!/^https?:\/\//i.test(String(url))) return false;
  shell.openExternal(url);
  return true;
}

function registerIpc() {
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    name: app.getName(),
    pendingEpub: pendingEpubPath
  }));

  ipcMain.handle('settings:get', () => store.publicSettings());

  ipcMain.handle('settings:save', (_event, patch) => store.update(patch));

  ipcMain.handle('secret:set', (_event, key) => {
    const result = store.setKey(key);
    return { ...result, maskedKey: store.maskedKey() };
  });

  ipcMain.handle('secret:clear', () => store.clearKey());

  ipcMain.handle('secret:test', async (_event, payload = {}) => {
    try {
      const settings = store.getSettings();
      const apiKey = String(payload.apiKey || '').trim() || store.readKey();
      if (!apiKey) {
        return { ok: false, error: { code: 'NO_KEY', message: '请先填写 API Key' } };
      }
      const baseUrl = String(payload.baseUrl || settings.baseUrl).trim();
      const model = String(payload.model || settings.model).trim();
      const result = await testConnection({ apiKey, baseUrl, model });
      return { ok: true, ...result };
    } catch (error) {
      return {
        ok: false,
        error: { code: error.code || 'ERROR', message: error.message || '连接失败' }
      };
    }
  });

  ipcMain.handle('book:open', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择一本日文 EPUB',
      properties: ['openFile'],
      filters: [{ name: 'EPUB 电子书', extensions: ['epub'] }]
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
    try {
      return { ok: true, book: readEpubFile(result.filePaths[0]) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('book:read', (_event, filePath) => {
    try {
      return { ok: true, book: readEpubFile(filePath) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('book:pending', () => {
    const filePath = pendingEpubPath;
    pendingEpubPath = null;
    return filePath;
  });

  ipcMain.handle('lookup:selection', async (_event, payload = {}) => {
    const text = String(payload.text || '').replace(/\s+/g, ' ').trim();
    if (!text) {
      return { ok: false, error: { code: 'EMPTY', message: '没有选中任何文字' } };
    }
    if (text.length > MAX_SELECTION_CHARS) {
      return {
        ok: false,
        error: {
          code: 'TOO_LONG',
          message: `一次最多查询 ${MAX_SELECTION_CHARS} 个字符。请只划取想查的词语或句子。`
        }
      };
    }
    if (!store.hasKey()) {
      return {
        ok: false,
        error: { code: 'NO_KEY', message: '还没有配置 DeepSeek API Key' }
      };
    }

    try {
      const settings = store.getSettings();
      const result = await lookupSelection({
        text,
        apiKey: store.readKey(),
        baseUrl: settings.baseUrl,
        model: settings.model
      });
      return { ok: true, ...result };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: error.code || 'ERROR',
          status: error.status || null,
          message: error.message || '查询失败，请稍后重试'
        }
      };
    }
  });

  ipcMain.handle('clipboard:write', (_event, text) => {
    clipboard.writeText(String(text || ''));
    return true;
  });

  ipcMain.handle('export:csv', async (_event, payload = {}) => {
    const content = String(payload.content || '');
    const suggested = String(payload.filename || 'yomikata-vocabulary.csv').replace(/[\\/:*?"<>|]/g, '-');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出生词本',
      defaultPath: suggested,
      filters: [{ name: 'CSV 表格', extensions: ['csv'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    try {
      fs.writeFileSync(result.filePath, `\uFEFF${content}`, 'utf8');
      return { ok: true, path: result.filePath };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('shell:external', (_event, url) => openExternal(url));
}

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const filePath = extractEpubPath(argv);
    if (filePath) {
      pendingEpubPath = filePath;
      if (mainWindow) mainWindow.webContents.send('book:open-request', filePath);
    }
    focusWindow();
  });

  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    pendingEpubPath = filePath;
    if (mainWindow) mainWindow.webContents.send('book:open-request', filePath);
  });

  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('com.yomikata.reader');
    Menu.setApplicationMenu(null);
    store = new SettingsStore(app.getPath('userData'));
    registerIpc();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
