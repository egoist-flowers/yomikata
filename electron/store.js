'use strict';

const fs = require('fs');
const path = require('path');
const { safeStorage } = require('electron');

const DEFAULTS = {
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  autoLookup: true,
  cacheEnabled: true,
  reopenLast: true,
  fontSize: 19,
  lineHeight: 1.95,
  theme: 'paper',
  layout: 'horizontal',
  fontFamily: 'serif',
  panelOpen: true
};

const ALLOWED_KEYS = new Set(Object.keys(DEFAULTS));

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function cleanString(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

class SettingsStore {
  constructor(userDataPath) {
    this.dir = userDataPath;
    this.settingsFile = path.join(userDataPath, 'settings.json');
    this.secretFile = path.join(userDataPath, 'secret.json');
    this.data = { ...DEFAULTS };
    this.load();
  }

  load() {
    try {
      const saved = JSON.parse(fs.readFileSync(this.settingsFile, 'utf8'));
      for (const key of ALLOWED_KEYS) {
        if (Object.prototype.hasOwnProperty.call(saved, key)) {
          this.data[key] = saved[key];
        }
      }
    } catch {
      // First run or an unreadable settings file: keep defaults.
    }
  }

  persist() {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.settingsFile, JSON.stringify(this.data, null, 2), 'utf8');
  }

  getSettings() {
    return { ...this.data };
  }

  update(patch = {}) {
    const next = { ...this.data };

    if (typeof patch.baseUrl === 'string') {
      const baseUrl = cleanString(patch.baseUrl, 300).replace(/\/+$/, '');
      if (baseUrl && /^https?:\/\//i.test(baseUrl)) next.baseUrl = baseUrl;
    }
    if (typeof patch.model === 'string') {
      const model = cleanString(patch.model, 100);
      if (model) next.model = model;
    }
    if (typeof patch.autoLookup === 'boolean') next.autoLookup = patch.autoLookup;
    if (typeof patch.cacheEnabled === 'boolean') next.cacheEnabled = patch.cacheEnabled;
    if (typeof patch.reopenLast === 'boolean') next.reopenLast = patch.reopenLast;
    if (typeof patch.panelOpen === 'boolean') next.panelOpen = patch.panelOpen;
    if (patch.fontSize !== undefined) next.fontSize = clampNumber(patch.fontSize, 14, 30, this.data.fontSize);
    if (patch.lineHeight !== undefined) next.lineHeight = clampNumber(patch.lineHeight, 1.4, 2.5, this.data.lineHeight);
    if (['paper', 'sepia', 'night'].includes(patch.theme)) next.theme = patch.theme;
    if (['horizontal', 'original'].includes(patch.layout)) next.layout = patch.layout;
    if (['serif', 'sans'].includes(patch.fontFamily)) next.fontFamily = patch.fontFamily;

    this.data = next;
    this.persist();
    return this.getSettings();
  }

  hasKey() {
    return Boolean(this.readKey());
  }

  readKey() {
    try {
      if (!fs.existsSync(this.secretFile)) return '';
      const payload = JSON.parse(fs.readFileSync(this.secretFile, 'utf8'));
      if (!payload.value) return '';
      if (payload.encrypted && safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(payload.value, 'base64'));
      }
      if (!payload.encrypted) {
        return Buffer.from(payload.value, 'base64').toString('utf8');
      }
    } catch {
      return '';
    }
    return '';
  }

  setKey(rawKey) {
    const key = cleanString(rawKey, 500);
    if (!key) return this.clearKey();

    fs.mkdirSync(this.dir, { recursive: true });
    const encrypted = safeStorage.isEncryptionAvailable();
    const value = encrypted
      ? safeStorage.encryptString(key).toString('base64')
      : Buffer.from(key, 'utf8').toString('base64');
    fs.writeFileSync(
      this.secretFile,
      JSON.stringify({ encrypted, value, savedAt: new Date().toISOString() }, null, 2),
      'utf8'
    );
    return { hasKey: true, encrypted };
  }

  clearKey() {
    try {
      fs.rmSync(this.secretFile, { force: true });
    } catch {
      // Ignore a missing or locked secret file.
    }
    return { hasKey: false };
  }

  maskedKey() {
    const key = this.readKey();
    if (!key) return '';
    if (key.length <= 12) return '已保存';
    return `${key.slice(0, 5)}••••••${key.slice(-4)}`;
  }

  publicSettings() {
    return {
      ...this.getSettings(),
      hasKey: this.hasKey(),
      maskedKey: this.maskedKey(),
      secureStorage: safeStorage.isEncryptionAvailable()
    };
  }
}

module.exports = { SettingsStore, DEFAULTS };
