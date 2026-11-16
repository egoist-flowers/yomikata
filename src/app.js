'use strict';

(() => {
  const api = window.yomikata;
  const LS = {
    library: 'yomikata.library.v1',
    vocab: 'yomikata.vocab.v1',
    history: 'yomikata.history.v1',
    cache: 'yomikata.cache.v1'
  };
  const MAX_RESULT_CHARS = 800;
  const THEME_ORDER = ['paper', 'sepia', 'night'];

  const state = {
    appInfo: null,
    settings: null,
    settingsDraft: null,
    settingsSnapshot: null,
    library: [],
    vocab: [],
    history: [],
    cache: {},
    book: null,
    rendition: null,
    spineIdentifierHook: null,
    bookLayout: null,
    autoLayoutChecked: false,
    autoVerticalDetected: false,
    detectedVertical: false,
    sectionJumping: false,
    imageZoom: 1,
    restoringScroll: false,
    wheelAccum: 0,
    lastWheelAt: 0,
    bookTitle: '',
    bookAuthor: '',
    bookLanguage: '',
    currentBookPath: null,
    currentRecord: null,
    toc: [],
    activeTocHref: '',
    currentChapter: '',
    currentCfi: null,
    lastLocation: null,
    currentProgress: 0,
    locationsReady: false,
    verticalReader: false,
    verticalHintShown: false,
    bookLoading: false,
    panelOpen: true,
    sidebarView: 'shelf',
    selectionText: '',
    selectionCfiRange: null,
    selectionPointerDown: false,
    selectionContents: null,
    selectionFinalizeTimer: null,
    selectionLiveTimer: null,
    lastSelectionLiveCount: 0,
    lastSelectionProcessed: '',
    lastSelectionAt: 0,
    autoTimer: null,
    popoverAbove: false,
    lookupToken: 0,
    isLookupLoading: false,
    lastLookupText: '',
    currentResult: null,
    currentResultSource: null,
    draggingProgress: false,
    saveTimer: null,
    themeTimer: null,
    notebookTab: 'vocab',
    notebookQuery: '',
    confirmResolve: null,
    speechVoices: [],
    startedAt: Date.now()
  };

  const ui = {};
  let domReady = false;

  function $(selector, root = document) {
    return root.querySelector(selector);
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function cacheDom() {
    const ids = [
      'workspace', 'sidebar', 'topbar-book-title', 'topbar-chapter', 'book-status-dot',
      'btn-sidebar', 'btn-notebook', 'btn-settings', 'btn-open-top', 'vocab-count',
      'tab-shelf', 'tab-toc', 'view-shelf', 'view-toc', 'recent-list', 'shelf-empty',
      'btn-open-side', 'btn-open-sidebar', 'btn-open-hero', 'btn-settings-hero',
      'btn-prev', 'btn-next', 'chapter-kicker', 'chapter-title', 'btn-font-down',
      'btn-font-up', 'font-value', 'btn-theme', 'btn-layout', 'btn-panel', 'viewer', 'viewer-wrap',
      'landing', 'reader-loading', 'selection-popover', 'selection-quote', 'selection-live', 'selection-live-count',
      'selection-lookup', 'selection-speak', 'progress-range', 'progress-fill',
      'progress-percent', 'locations-status', 'lookup-panel', 'btn-panel-close',
      'panel-body', 'panel-empty', 'panel-loading', 'loading-selection', 'panel-error',
      'error-title', 'error-message', 'btn-retry', 'btn-error-settings', 'panel-result',
      'panel-api-notice', 'panel-foot', 'panel-empty-note', 'api-status', 'api-dot',
      'api-status-text', 'btn-cancel-lookup', 'book-mini', 'book-mini-cover',
      'book-mini-glyph', 'book-mini-title', 'book-mini-author', 'book-mini-progress',
      'toc-count', 'toc-list', 'toc-empty', 'settings-modal', 'notebook-modal',
      'confirm-modal', 'confirm-title', 'confirm-message', 'confirm-yes',
      'input-api-key', 'btn-toggle-key', 'key-hint', 'input-base-url', 'input-model',
      'btn-test-api', 'btn-clear-key', 'btn-get-key', 'test-result', 'key-status-pill',
      'toggle-auto', 'toggle-cache', 'toggle-reopen', 'theme-options',
      'range-font-size', 'label-font-size', 'range-line-height', 'label-line-height',
      'font-options', 'layout-options', 'btn-clear-cache', 'cache-size',
      'settings-version', 'btn-save-settings', 'notebook-count', 'notebook-search',
      'vocab-list', 'history-list', 'notebook-empty', 'btn-export', 'btn-clear-vocab',
      'notebook-footnote', 'toast-host', 'drop-overlay', 'brand-button'
    ];
    for (const id of ids) {
      const key = id.replace(/-([a-z])/g, (_m, letter) => letter.toUpperCase());
      ui[key] = byId(id);
    }
    ui.panelEmptyNote = $('#panel-empty-note span', ui.panelEmpty);
    ui.notebookTabs = Array.from(document.querySelectorAll('.notebook-tabs button'));
    ui.themeButtons = Array.from(document.querySelectorAll('#theme-options .theme-option'));
    ui.fontButtons = Array.from(document.querySelectorAll('#font-options button'));
    ui.layoutButtons = Array.from(document.querySelectorAll('#layout-options button'));
  }

  function init() {
    cacheDom();
    domReady = true;
    bindEvents();

    if (!api) {
      showFatal('应用桥接没有加载成功，请重新安装 Yomikata。');
      return;
    }

    loadLocalState();
    renderLibrary();
    renderNotebookBadge();
    updatePanelEmptyCopy();

    api.appInfo()
      .then((info) => {
        state.appInfo = info;
        if (ui.settingsVersion) ui.settingsVersion.textContent = `Yomikata ${info.version}`;
      })
      .catch(() => {
        if (ui.settingsVersion) ui.settingsVersion.textContent = 'Yomikata 1.0.0';
      });

    api.getSettings()
      .then((settings) => {
        state.settings = settings;
        applyAllSettings(settings);
        updateApiStatus();
        bootOpen();
      })
      .catch((error) => {
        showFatal(`读取设置失败：${error.message}`);
      });
  }

  function showFatal(message) {
    document.body.innerHTML = `<div style="height:100vh;display:grid;place-items:center;padding:40px;font-family:'Microsoft YaHei UI',sans-serif;background:#e9e1d2;color:#26221c"><div style="max-width:440px;text-align:center"><div style="font-family:serif;font-size:52px;color:#b2492f;margin-bottom:16px">読</div><h1 style="font-size:20px;margin:0 0 10px">Yomikata 没能启动</h1><p style="font-size:12px;line-height:1.8;color:#6d6355">${escapeHtml(message)}</p></div></div>`;
  }

  /* =========================================================
     Small utilities
     ========================================================= */

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }

  function cleanText(value) {
    return String(value ?? '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, ' ').trim();
  }

  function asText(value) {
    if (Array.isArray(value)) return value.map(asText).filter(Boolean).join('、');
    if (value && typeof value === 'object') {
      if (typeof value.name === 'string') return value.name;
      if (typeof value.value === 'string') return value.value;
      return '';
    }
    return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  }

  function hashString(value) {
    let hash = 2166136261;
    const text = String(value || '');
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function firstGlyph(title) {
    const clean = String(title || '').replace(/[『』「」〈〉《》\s·・]/g, '');
    return Array.from(clean)[0] || '読';
  }

  function formatRelative(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const diff = Date.now() - date.getTime();
    if (diff < 60 * 1000) return '刚刚';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
    const today = new Date();
    const sameDay = date.toDateString() === today.toDateString();
    if (sameDay) return `今天 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return '昨天';
    return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  }

  function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function debounce(callback, delay) {
    let timer = null;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => callback.apply(this, args), delay);
    };
  }

  function readJson(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      if (!value) return fallback;
      const parsed = JSON.parse(value);
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function saveCache() {
    if (!writeJson(LS.cache, state.cache)) {
      const entries = Object.entries(state.cache).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, 40);
      state.cache = Object.fromEntries(entries);
      writeJson(LS.cache, state.cache);
    }
  }

  function loadLocalState() {
    const library = readJson(LS.library, []);
    state.library = Array.isArray(library) ? library.filter((item) => item && item.path && item.title) : [];
    state.library.sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));

    const vocab = readJson(LS.vocab, []);
    state.vocab = Array.isArray(vocab) ? vocab.filter((item) => item && item.id) : [];

    const history = readJson(LS.history, []);
    state.history = Array.isArray(history) ? history.filter((item) => item && item.result) : [];

    const cache = readJson(LS.cache, {});
    state.cache = cache && typeof cache === 'object' && !Array.isArray(cache) ? cache : {};
  }

  function toArrayBuffer(data) {
    if (data instanceof ArrayBuffer) return data;
    if (ArrayBuffer.isView(data)) return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    if (Array.isArray(data)) return new Uint8Array(data).buffer;
    throw new Error('电子书数据为空');
  }

  /* =========================================================
     Settings & theme
     ========================================================= */

  function applyAllSettings(settings) {
    if (!settings) return;
    document.body.dataset.theme = settings.theme || 'paper';
    state.panelOpen = settings.panelOpen !== false;
    ui.workspace.dataset.panel = state.panelOpen ? 'open' : 'closed';
    ui.workspace.classList.toggle('panel-collapsed', !state.panelOpen);
    ui.fontValue.textContent = String(settings.fontSize || 19);
    ui.rangeFontSize.value = String(settings.fontSize || 19);
    ui.labelFontSize.textContent = `${settings.fontSize || 19} px`;
    ui.rangeLineHeight.value = String(settings.lineHeight || 1.95);
    ui.labelLineHeight.textContent = Number(settings.lineHeight || 1.95).toFixed(2);
    ui.toggleAuto.checked = Boolean(settings.autoLookup);
    ui.toggleCache.checked = Boolean(settings.cacheEnabled);
    ui.toggleReopen.checked = Boolean(settings.reopenLast);
    ui.themeButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.theme === settings.theme));
    ui.fontButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.font === settings.fontFamily));
    ui.layoutButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.layout === settings.layout));
    updatePanelEmptyCopy();
    updatePanelCollapsedLabel();
    updateLayoutButton();
    refreshRenditionTheme();
  }

  function updateLayoutButton() {
    if (!ui.btnLayout) return;
    const original = currentLayout() === 'original';
    // A vertical book's fixed spread pages do not reflow safely into a
    // horizontal paginated layout, so keep this quick toggle for horizontal books.
    ui.btnLayout.hidden = state.detectedVertical;
    ui.btnLayout.classList.toggle('is-active', original);
    ui.btnLayout.title = original
      ? '当前：原书排版。点击切换为横向翻页'
      : '当前：横向翻页。点击切换为原书排版';
    ui.btnLayout.setAttribute('aria-label', ui.btnLayout.title);
  }

  async function toggleBookLayout() {
    if (!state.book) return;
    const next = currentLayout() === 'original' ? 'horizontal' : 'original';
    state.bookLayout = next;
    if (state.currentRecord) {
      state.currentRecord.readerLayout = next;
      writeJson(LS.library, state.library);
    }
    await rebuildRendition({ silent: true });
    updateLayoutButton();
    toast(next === 'original' ? '已切换到原书排版' : '已切换到横向翻页');
  }

  function persistSetting(patch) {
    if (!api || !state.settings) return;
    api.saveSettings(patch).catch(() => {});
  }

  function setTheme(theme, { persist = false, preview = false } = {}) {
    const next = THEME_ORDER.includes(theme) ? theme : 'paper';
    document.body.dataset.theme = next;
    ui.themeButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.theme === next));
    if (preview) {
      refreshRenditionTheme(state.settingsDraft);
      return;
    }
    if (state.settings) state.settings.theme = next;
    refreshRenditionTheme();
    if (persist) persistSetting({ theme: next });
  }

  function cycleTheme() {
    const current = state.settings?.theme || 'paper';
    const next = THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length];
    setTheme(next, { persist: true });
    toast(`已切换到${next === 'paper' ? '纸白' : next === 'sepia' ? '茶褐' : '夜读'}主题`);
  }

  function readerPalette(theme) {
    if (theme === 'night') {
      return { bg: '#181c17', ink: '#ddd5c4', muted: '#8f8879', accent: '#d77659', line: 'rgba(233,225,209,.13)', selection: 'rgba(215,118,89,.3)' };
    }
    if (theme === 'sepia') {
      return { bg: '#eee0c4', ink: '#3a2e1e', muted: '#7d6748', accent: '#a3452e', line: 'rgba(53,41,26,.16)', selection: 'rgba(163,69,46,.26)' };
    }
    return { bg: '#faf6ec', ink: '#2d2820', muted: '#776d5e', accent: '#b2492f', line: 'rgba(38,34,28,.13)', selection: 'rgba(178,73,47,.24)' };
  }

  function currentLayout(settings = state.settings) {
    return state.bookLayout || settings?.layout || 'horizontal';
  }

  function buildReaderCss(settings, layout = currentLayout(settings)) {
    const palette = readerPalette(settings.theme || 'paper');
    const font = settings.fontFamily === 'sans'
      ? '"Yu Gothic UI", "Meiryo", "Microsoft YaHei UI", sans-serif'
      : '"BIZ UDMincho", "Yu Mincho", "YuMincho", "MS Mincho", "Noto Serif JP", serif';
    const horizontal = layout !== 'original';
    const padding = horizontal ? '18px 38px 24px' : '12px 18px 44px';
    const writing = horizontal
      ? 'writing-mode: horizontal-tb !important; direction: ltr !important;'
      : '';
    const horizontalTypography = horizontal
      ? `
        font-family: ${font} !important;
        line-height: ${Number(settings.lineHeight) || 1.95} !important;
        padding: ${padding} !important;
        ${writing}
      `
      : `padding: ${padding} !important;`;
    return `
      html { background: ${palette.bg} !important; }
      body {
        background: ${palette.bg} !important;
        color: ${palette.ink} !important;
        font-size: ${Number(settings.fontSize) || 19}px !important;
        box-sizing: border-box !important;
        ${horizontalTypography}
        -webkit-font-smoothing: antialiased;
      }
      ${horizontal ? `
        p, li, blockquote, dd, dt {
          line-height: ${Number(settings.lineHeight) || 1.95} !important;
        }
        h1, h2, h3, h4, h5, h6 {
          font-family: ${font} !important;
          line-height: 1.5 !important;
        }
        html.vrtl body, html.vrtl body * {
          writing-mode: horizontal-tb !important;
        }
        html.vrtl .main, html.vrtl body > div {
          width: auto !important;
          max-width: 100% !important;
        }
        figure { margin-left: 0 !important; margin-right: 0 !important; }
      ` : ''}
      img, svg, video {
        max-width: 100% !important;
        max-height: calc(100vh - 36px) !important;
        object-fit: contain !important;
      }
      body.yomikata-image-page {
        --yomikata-image-zoom: 1;
      }
      body.yomikata-image-page img,
      body.yomikata-image-page svg,
      body.yomikata-image-page video {
        max-width: calc(100% * var(--yomikata-image-zoom, 1)) !important;
        max-height: calc((100vh - 36px) * var(--yomikata-image-zoom, 1)) !important;
      }
      h1, h2, h3, h4, h5, h6 { color: ${palette.ink} !important; }
      a { color: ${palette.accent} !important; }
      hr { border-color: ${palette.line} !important; }
      ruby rt, ruby rp {
        font-size: .46em !important;
        color: ${palette.accent} !important;
        letter-spacing: 0 !important;
        opacity: .8;
        -webkit-user-select: none !important;
        user-select: none !important;
      }
      ::selection { background: ${palette.selection} !important; }
      body ::selection { background: ${palette.selection} !important; }
    `;
  }

  function refreshRenditionTheme(settings = state.settings) {
    if (!state.rendition || !settings) return;
    try {
      state.rendition.themes.registerCss('yomikata', buildReaderCss(settings, currentLayout(settings)));
      state.rendition.themes.select('yomikata');
    } catch (error) {
      console.warn('Theme update failed', error);
    }
  }

  const scheduleThemeRefresh = debounce(() => refreshRenditionTheme(state.settingsDraft || state.settings), 110);

  function adjustFont(delta) {
    if (!state.settings) return;
    const next = clamp(Number(state.settings.fontSize) + delta, 15, 28);
    if (next === state.settings.fontSize) return;
    state.settings.fontSize = next;
    ui.fontValue.textContent = String(next);
    ui.rangeFontSize.value = String(next);
    ui.labelFontSize.textContent = `${next} px`;
    refreshRenditionTheme();
    persistSetting({ fontSize: next });
  }

  function updateApiStatus() {
    if (!ui.apiStatus) return;
    const hasKey = Boolean(state.settings?.hasKey);
    ui.apiDot.classList.toggle('ok', hasKey);
    ui.apiDot.classList.toggle('warn', !hasKey);
    ui.apiStatusText.textContent = hasKey
      ? `DeepSeek · ${state.settings.model || 'deepseek-chat'}`
      : '尚未配置 API Key';
    ui.panelApiNotice.hidden = hasKey;
  }

  function updatePanelEmptyCopy() {
    if (!ui.panelEmptyNote || !state.settings) return;
    ui.panelEmptyNote.textContent = state.settings.autoLookup
      ? '划词即查已开启，选中后会自动查询；可在设置中关闭。'
      : '划词即查已关闭，选中文字后点击“解释”再查询。';
  }

  function updatePanelCollapsedLabel() {
    if (!ui.btnPanel) return;
    ui.btnPanel.classList.toggle('is-active', state.panelOpen);
    ui.btnPanel.title = state.panelOpen ? '隐藏查词面板 (Ctrl+J)' : '显示查词面板 (Ctrl+J)';
  }

  function openPanel() {
    state.panelOpen = true;
    ui.workspace.dataset.panel = 'open';
    ui.workspace.classList.remove('panel-collapsed');
    updatePanelCollapsedLabel();
    persistSetting({ panelOpen: true });
  }

  function closePanel() {
    state.panelOpen = false;
    ui.workspace.dataset.panel = 'closed';
    ui.workspace.classList.add('panel-collapsed');
    updatePanelCollapsedLabel();
    persistSetting({ panelOpen: false });
  }

  function togglePanel() {
    if (state.panelOpen) closePanel();
    else openPanel();
  }

  /* =========================================================
     Sidebar / library
     ========================================================= */

  function switchSidebarView(view) {
    state.sidebarView = view;
    const shelf = view === 'shelf';
    ui.tabShelf.classList.toggle('is-active', shelf);
    ui.tabToc.classList.toggle('is-active', !shelf);
    ui.tabShelf.setAttribute('aria-selected', String(shelf));
    ui.tabToc.setAttribute('aria-selected', String(!shelf));
    ui.viewShelf.hidden = !shelf;
    ui.viewToc.hidden = shelf;
  }

  function expandSidebar() {
    ui.workspace.classList.remove('sidebar-collapsed');
  }

  function toggleSidebar() {
    ui.workspace.classList.toggle('sidebar-collapsed');
  }

  function renderLibrary() {
    if (!ui.recentList) return;
    ui.shelfEmpty.hidden = state.library.length > 0;
    const html = state.library.map((entry) => {
      const progress = Math.round(clamp(Number(entry.progress) || 0, 0, 1) * 100);
      const isCurrent = state.currentBookPath && entry.path === state.currentBookPath;
      return `
        <button class="recent-book${isCurrent ? ' is-current' : ''}" data-path="${escapeHtml(entry.path)}" title="${escapeHtml(entry.title)}">
          <span class="mini-cover tone-${entry.tone || 1}">${escapeHtml(firstGlyph(entry.title))}</span>
          <span class="recent-meta">
            <span class="recent-title">${escapeHtml(entry.title)}</span>
            <span class="recent-author">${escapeHtml(entry.author || '未知作者')} · ${escapeHtml(formatRelative(entry.lastOpened))}</span>
            <span class="recent-progress"><i style="--p:${progress}%"></i><span>${progress}%</span></span>
          </span>
        </button>`;
    }).join('');
    ui.recentList.innerHTML = html;
  }

  function renderNotebookBadge() {
    const count = state.vocab.length;
    ui.vocabCount.hidden = count === 0;
    ui.vocabCount.textContent = String(count);
    ui.notebookCount.textContent = String(count);
  }

  function upsertLibraryRecord(record, file) {
    if (!record.path) return null;
    const existing = state.library.find((item) => item.path === record.path);
    const tone = existing?.tone || (1 + (parseInt(hashString(record.path), 36) % 4));
    const merged = {
      ...existing,
      ...record,
      path: record.path,
      name: file.name || existing?.name || '',
      title: record.title || existing?.title || file.name || '未命名',
      author: record.author || existing?.author || '',
      tone,
      addedAt: existing?.addedAt || Date.now(),
      lastOpened: Date.now()
    };
    if (existing) {
      Object.assign(existing, merged);
    } else {
      state.library.unshift(merged);
    }
    state.library.sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));
    writeJson(LS.library, state.library);
    renderLibrary();
    state.currentRecord = existing || merged;
    return state.currentRecord;
  }

  function currentReaderBody() {
    try {
      return state.rendition?.getContents()?.[0]?.document?.body || null;
    } catch {
      return null;
    }
  }

  function captureScrollState() {
    if (!state.currentRecord || currentLayout() !== 'original' || state.restoringScroll || state.sectionJumping) return;
    const body = currentReaderBody();
    if (!body) return;
    const vertical = /vertical/i.test(getComputedStyle(body).writingMode);
    let ratio = 0;
    if (vertical) {
      const maxScroll = Math.max(0, body.scrollWidth - body.clientWidth);
      ratio = maxScroll > 0 ? clamp(-body.scrollLeft / maxScroll, 0, 1) : 0;
      state.currentRecord.scrollLeft = body.scrollLeft;
    } else {
      const maxScroll = Math.max(0, body.scrollHeight - body.clientHeight);
      ratio = maxScroll > 0 ? clamp(body.scrollTop / maxScroll, 0, 1) : 0;
      state.currentRecord.scrollTop = body.scrollTop;
    }
    state.currentRecord.scrollRatio = ratio;
    state.currentRecord.scrollCfi = state.currentCfi;
    state.currentRecord.scrollHref = state.lastLocation?.start?.href || '';
  }

  function saveProgressNow() {
    if (!state.currentRecord || !state.currentBookPath) return;
    captureScrollState();
    state.currentRecord.cfi = state.currentCfi || state.currentRecord.cfi || null;
    state.currentRecord.progress = state.currentProgress || 0;
    state.currentRecord.chapter = state.currentChapter || '';
    state.currentRecord.lastOpened = Date.now();
    writeJson(LS.library, state.library);
  }

  function queueProgressSave() {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveProgressNow, 900);
  }

  function restoreSavedScroll(record) {
    if (!record || currentLayout() !== 'original') return;
    const ratio = Number(record.scrollRatio);
    if (!Number.isFinite(ratio)) return;
    const body = currentReaderBody();
    if (!body) return;

    const currentHref = hrefBase(state.lastLocation?.start?.href || '');
    if (record.scrollHref && currentHref && hrefBase(record.scrollHref) !== currentHref) return;

    const vertical = /vertical/i.test(getComputedStyle(body).writingMode);
    state.restoringScroll = true;
    if (vertical) {
      const maxScroll = Math.max(0, body.scrollWidth - body.clientWidth);
      body.scrollLeft = -clamp(ratio, 0, 1) * maxScroll;
    } else {
      const maxScroll = Math.max(0, body.scrollHeight - body.clientHeight);
      body.scrollTop = clamp(ratio, 0, 1) * maxScroll;
    }
    setTimeout(() => {
      state.restoringScroll = false;
    }, 320);
  }

  /* =========================================================
     Opening books
     ========================================================= */

  async function openBookDialog() {
    if (state.bookLoading) return;
    try {
      const result = await api.openEpub();
      if (!result?.ok) {
        if (!result?.canceled) toast(result?.error || '打开书籍失败', 'error');
        return;
      }
      await loadBook(result.book);
    } catch (error) {
      toast(`打开书籍失败：${error.message}`, 'error');
    }
  }

  async function openBookPath(filePath, options = {}) {
    if (!filePath || state.bookLoading) return;
    if (state.currentBookPath === filePath) {
      switchSidebarView('toc');
      expandSidebar();
      return;
    }
    try {
      const result = await api.readEpub(filePath);
      if (!result?.ok) {
        toast(result?.error || '无法读取这本书', 'error');
        return;
      }
      await loadBook(result.book, options);
    } catch (error) {
      toast(`无法读取这本书：${error.message}`, 'error');
    }
  }

  async function loadBook(file, options = {}) {
    if (!file?.data) {
      toast('这个文件没有可读取的内容', 'error');
      return;
    }
    if (state.bookLoading) return;
    state.bookLoading = true;
    hidePopover();
    ui.readerLoading.hidden = false;
    ui.readerLoading.querySelector('p').textContent = options.auto ? '正在恢复上次阅读…' : '正在展开书页…';

    try {
      saveProgressNow();
      await destroyCurrentBook();

      const buffer = toArrayBuffer(file.data);
      if (buffer.byteLength === 0) throw new Error('文件是空的');

      if (typeof window.ePub !== 'function') throw new Error('阅读引擎没有加载成功');
      const book = window.ePub(buffer);
      state.book = book;
      await book.ready;

      let metadata = {};
      try {
        metadata = await book.loaded.metadata;
      } catch {
        metadata = {};
      }
      let navigation = { toc: [] };
      try {
        navigation = await book.loaded.navigation;
      } catch {
        navigation = { toc: [] };
      }

      const title = cleanText(asText(metadata.title)) || file.name?.replace(/\.epub$/i, '') || '未命名书籍';
      const author = cleanText(asText(metadata.creator)) || '未知作者';
      state.bookTitle = title;
      state.bookAuthor = author;
      state.bookLanguage = cleanText(asText(metadata.language));
      state.currentBookPath = file.path || null;
      state.currentCfi = null;
      state.currentProgress = 0;
      state.locationsReady = false;
      state.currentChapter = '';

      let record = state.currentBookPath
        ? state.library.find((item) => item.path === state.currentBookPath)
        : null;
      const savedCfi = record?.cfi || null;
      state.bookLayout = record?.readerLayout || null;
      state.autoLayoutChecked = false;
      state.autoVerticalDetected = false;
      state.sectionJumping = false;
      state.imageZoom = 1;
      state.restoringScroll = false;
      state.wheelAccum = 0;
      state.lastWheelAt = 0;

      const verticalBook = await detectVerticalBook(book);
      state.detectedVertical = verticalBook;
      if (!state.bookLayout && verticalBook && state.settings.layout === 'horizontal') {
        state.bookLayout = 'original';
        state.autoVerticalDetected = true;
        state.verticalHintShown = true;
      }

      document.title = `${title} · Yomikata`;
      ui.topbarBookTitle.textContent = title;
      ui.topbarChapter.textContent = author;
      ui.chapterTitle.textContent = '正在展开…';
      ui.chapterKicker.textContent = 'READING DESK';
      ui.bookMini.hidden = false;
      ui.bookMiniGlyph.textContent = firstGlyph(title);
      ui.bookMiniTitle.textContent = title;
      ui.bookMiniAuthor.textContent = author;
      ui.bookMiniProgress.style.width = `${Math.round((record?.progress || 0) * 100)}%`;
      ui.bookMiniCover.className = `book-mini-cover tone-${record?.tone || 1}`;
      state.currentRecord = record || null;

      renderToc(navigation?.toc || []);
      state.currentCfi = savedCfi;
      document.body.classList.add('has-book');
      expandSidebar();
      switchSidebarView('toc');

      ui.viewer.classList.add('is-preparing');
      await createRendition(savedCfi);
      await new Promise((resolve) => setTimeout(resolve, 180));
      restoreSavedScroll(record);
      await new Promise((resolve) => setTimeout(resolve, 60));
      ui.viewer.classList.remove('is-preparing');
      updateLayoutButton();
      ui.readerLoading.hidden = true;
      if (state.autoVerticalDetected) {
        setTimeout(() => toast('检测到竖排小说，已使用原书竖排；滚轮、空格和方向键都可翻页。', 'info', 5200), 700);
      }

      if (!record && state.currentBookPath) {
        record = upsertLibraryRecord({
          path: state.currentBookPath,
          title,
          author,
          cfi: state.currentCfi,
          progress: 0,
          chapter: '',
          readerLayout: state.bookLayout || null,
          tone: 1 + (parseInt(hashString(state.currentBookPath), 36) % 4)
        }, file);
      } else if (record) {
        record.title = title;
        record.author = author;
        record.name = file.name || record.name;
        record.lastOpened = Date.now();
        record.readerLayout = state.bookLayout || record.readerLayout || null;
        state.currentRecord = record;
        writeJson(LS.library, state.library);
        renderLibrary();
      }

      renderBookMini();
      ui.btnPrev.disabled = false;
      ui.btnNext.disabled = false;
      ui.locationsStatus.textContent = '正在分析全书…';
      ui.locationsStatus.classList.add('is-working');
      ui.progressRange.disabled = true;
      setTimeout(() => generateLocations(book), 600);

      if (options.auto) toast('已回到上次阅读的位置');
    } catch (error) {
      console.error(error);
      ui.viewer.classList.remove('is-preparing');
      await destroyCurrentBook();
      resetReaderUi();
      toast(`这本 EPUB 无法打开：${error.message || '文件可能已损坏'}`, 'error', 5200);
    } finally {
      state.bookLoading = false;
      ui.readerLoading.hidden = true;
    }
  }

  async function destroyCurrentBook() {
    hidePopover();
    hideSelectionLive();
    state.lookupToken += 1;
    state.currentResult = null;
    if (state.rendition) {
      try { state.rendition.destroy(); } catch { /* ignore */ }
      state.rendition = null;
    }
    if (state.book) {
      try { state.book.destroy(); } catch { /* ignore */ }
      state.book = null;
    }
    state.spineIdentifierHook = null;
    state.bookLayout = null;
    state.autoLayoutChecked = false;
    state.autoVerticalDetected = false;
    state.detectedVertical = false;
    state.sectionJumping = false;
    state.imageZoom = 1;
    state.restoringScroll = false;
    state.wheelAccum = 0;
    state.lastWheelAt = 0;
    state.currentRecord = null;
    state.currentBookPath = null;
    state.bookTitle = '';
    state.bookAuthor = '';
    state.toc = [];
    state.activeTocHref = '';
    state.lastLocation = null;
    state.locationsReady = false;
    state.currentCfi = null;
    state.currentProgress = 0;
    state.verticalReader = false;
    state.verticalHintShown = false;
    document.body.classList.remove('has-book');
    document.title = 'Yomikata よみかた';
    ui.viewer.classList.remove('is-preparing');
    ui.viewer.innerHTML = '';
    updateLayoutButton();
    showPanelState('empty');
  }

  function resetReaderUi() {
    ui.readerLoading.hidden = true;
    ui.topbarBookTitle.textContent = '尚未打开书籍';
    ui.topbarChapter.textContent = '读一页，查一个词';
    ui.chapterKicker.textContent = 'READING DESK';
    ui.chapterTitle.textContent = '准备开始阅读';
    ui.progressFill.style.width = '0%';
    ui.progressPercent.textContent = '0%';
    ui.progressRange.value = '0';
    ui.progressRange.disabled = true;
    ui.locationsStatus.textContent = '等待打开书籍';
    ui.locationsStatus.classList.remove('is-working');
    ui.bookMini.hidden = true;
    ui.tocList.innerHTML = '';
    ui.tocEmpty.hidden = false;
    ui.tocCount.textContent = '';
    ui.btnPrev.disabled = true;
    ui.btnNext.disabled = true;
    switchSidebarView('shelf');
    renderLibrary();
  }

  /* =========================================================
     EPUB rendition
     ========================================================= */

  function createRendition(initialCfi) {
    if (!state.book) return Promise.reject(new Error('没有书籍'));
    ui.viewer.innerHTML = '';

    const rendition = state.book.renderTo(ui.viewer, {
      width: '100%',
      height: '100%',
      flow: currentLayout() === 'original' ? 'scrolled-doc' : 'paginated',
      direction: 'ltr',
      spread: 'none',
      allowScriptedContent: false,
      allowPopups: false
    });

    state.rendition = rendition;
    // EPUB.js keeps its identifier injection hook on the shared spine. Remember
    // this rendition's bound hook so it can be removed before a layout rebuild.
    const spineHooks = state.book.spine.hooks.content.list();
    state.spineIdentifierHook = spineHooks[spineHooks.length - 1] || null;
    rendition.themes.registerCss('yomikata', buildReaderCss(state.settings, currentLayout()));
    try { rendition.themes.select('yomikata'); } catch { /* theme arrives with first content */ }

    rendition.hooks.content.register((contents) => {
      try {
        // EPUB.js only injects serialized CSS from its "inject" hook when a
        // rules object or URL exists, so register our serialized theme here.
        rendition.themes.add('yomikata', contents);
        if (currentLayout() === 'original') prepareImagePage(contents.document);
        contents.document.documentElement.style.background = 'transparent';
        contents.document.addEventListener('mousedown', (event) => {
          if (event.button === 0) beginSelection(contents);
        }, true);
        contents.document.addEventListener('pointerdown', (event) => {
          if (event.button === 0) beginSelection(contents);
        }, true);
        const markDragging = (event) => {
          if ((event.buttons & 1) && !state.selectionPointerDown) beginSelection(contents);
        };
        contents.document.addEventListener('mousemove', markDragging, true);
        contents.document.addEventListener('pointermove', markDragging, true);
        contents.document.addEventListener('selectstart', () => {
          beginSelection(contents);
        }, true);
        contents.document.addEventListener('mouseup', (event) => {
          if (event.button === 0) endSelection(contents);
        }, true);
        contents.document.addEventListener('pointerup', (event) => {
          if (event.button === 0) endSelection(contents);
        }, true);
        contents.document.addEventListener('selectionchange', () => {
          const selection = contents.window?.getSelection?.();
          if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
            hideSelectionLive();
            return;
          }
          if (state.selectionPointerDown) {
            // The live counter has its own lightweight 100 ms ticker; doing
            // any real work on every selectionchange is what made vertical
            // text selection trail the pointer.
            return;
          }
          // Selection can still settle after pointerup, especially in vertical
          // writing. Restart the timer on every change so lookup waits for a
          // genuinely stable final range.
          clearTimeout(state.autoTimer);
          hidePopover();
          queueSelectionFinalize(contents, 450);
        });
        contents.document.addEventListener('keydown', (event) => {
          if (event.key === 'Escape' || event.ctrlKey || event.metaKey || isPageKey(event)) {
            handleGlobalKeydown(event);
          }
        });
        contents.document.addEventListener('wheel', (event) => {
          handleReaderWheel(event, contents);
        }, { passive: false });
        contents.document.addEventListener('scroll', () => {
          if (!state.restoringScroll) queueProgressSave();
        }, { passive: true, capture: true });
        contents.document.addEventListener('click', (event) => {
          const anchor = event.target?.closest?.('a');
          if (anchor && /^https?:\/\//i.test(anchor.href)) {
            event.preventDefault();
            api.openExternal(anchor.href);
          }
        });
      } catch {
        // A malformed chapter should not take down the reader.
      }
    });

    rendition.on('selected', (cfiRange, contents) => {
      if (window.__YOMIKATA_DEBUG) console.log('[sel] epub selected, pointerDown=', state.selectionPointerDown);
      if (state.selectionPointerDown) return;
      if (!state.selectionFinalizeTimer) {
        queueSelectionFinalize(contents, 300);
      }
    });

    rendition.on('relocated', (location) => {
      handleRelocated(location);
    });

    rendition.on('rendered', () => {
      setTimeout(applyVerticalViewport, 40);
    });

    return displayAt(rendition, initialCfi).then(() => {
      setTimeout(applyVerticalViewport, 60);
    });
  }

  function isImagePageDocument(doc) {
    return Boolean(doc?.body) &&
      (doc.body.innerText || '').trim().length < 80 &&
      Boolean(doc.querySelector('img, svg, image'));
  }

  function prepareImagePage(doc) {
    if (!isImagePageDocument(doc)) return false;
    doc.body.classList.add('yomikata-image-page');
    doc.documentElement.style.height = '100%';
    doc.body.style.height = '100%';
    doc.body.style.display = 'flex';
    doc.body.style.overflow = 'auto';
    applyImageZoomToDocument(doc, state.imageZoom);
    return true;
  }

  function applyImageZoomToDocument(doc, zoom) {
    if (!doc?.body) return;
    const value = clamp(Number(zoom) || 1, 0.55, 3);
    doc.body.style.setProperty('--yomikata-image-zoom', String(value));
    doc.querySelectorAll('img, svg, video').forEach((element) => {
      element.style.zoom = String(value);
    });
    const overflow = value > 1.35;
    doc.body.style.alignItems = overflow ? 'flex-start' : 'center';
    doc.body.style.justifyContent = overflow ? 'flex-start' : 'center';
  }

  function applyVerticalViewport() {
    if (!state.rendition || currentLayout() !== 'original') return;
    let contents = [];
    try { contents = state.rendition.getContents() || []; } catch { return; }
    for (const content of contents) {
      try {
        const doc = content.document;
        const writingMode = getComputedStyle(doc.body).writingMode || getComputedStyle(doc.documentElement).writingMode;
        const iframe = doc.defaultView.frameElement;
        if (!iframe) continue;

        if (!/vertical/i.test(writingMode)) {
          // Covers and SVG front-matter pages are sized to their own content
          // by EPUB.js scrolled-doc mode. Give them the full reading viewport so
          // the image can fit instead of rendering as a thin strip.
          if (isImagePageDocument(doc)) {
            prepareImagePage(doc);
            const height = Math.max(240, ui.viewerWrap.clientHeight);
            iframe.style.height = `${height}px`;
            iframe.style.width = '100%';
            doc.documentElement.style.height = `${height}px`;
            doc.documentElement.style.overflow = 'hidden';
          }
          continue;
        }
        if (!state.verticalReader) {
          state.verticalReader = true;
          updateSectionStatus(state.lastLocation);
          if (!state.verticalHintShown) {
            state.verticalHintShown = true;
            toast('检测到竖排书籍：滚轮、空格和方向键都可翻页', 'info', 4200);
          }
        }
        const height = Math.max(240, ui.viewerWrap.clientHeight);
        iframe.style.height = `${height}px`;
        iframe.style.width = '100%';
        doc.documentElement.style.height = `${height}px`;
        doc.documentElement.style.overflowX = 'auto';
        doc.documentElement.style.overflowY = 'hidden';
        doc.body.style.height = `${height}px`;
        doc.body.style.overflowX = 'auto';
        doc.body.style.overflowY = 'hidden';
      } catch {
        // Ignore chapters that cannot expose their document.
      }
    }
  }

  async function detectVerticalBook(book) {
    const items = book?.spine?.spineItems || [];
    let checked = 0;
    for (const section of items) {
      if (checked >= 10) break;
      if (String(section.properties || '').includes('svg')) continue;
      try {
        const root = await section.load(book.load.bind(book));
        const element = root?.documentElement || root;
        if (element?.classList?.contains('vrtl')) return true;
        if (element?.querySelector?.('[class*="vrtl"]')) return true;
        const serialized = element?.outerHTML || '';
        if (/writing-mode\s*:\s*vertical/i.test(serialized)) return true;
        checked += 1;
      } catch {
        // Skip sections that cannot be inspected.
      }
    }
    return false;
  }

  async function displayAt(rendition, cfi) {
    try {
      if (cfi) {
        await rendition.display(cfi);
      } else {
        await rendition.display();
      }
    } catch (error) {
      console.warn('Could not restore reading position, opening first page.', error);
      await rendition.display();
    }
  }

  async function rebuildRendition(options = {}) {
    if (!state.book || !state.rendition) return;
    const cfi = state.lastLocation?.start?.cfi || state.currentCfi;
    saveProgressNow();
    try {
      if (state.spineIdentifierHook && state.book?.spine?.hooks?.content) {
        state.book.spine.hooks.content.deregister(state.spineIdentifierHook);
      }
      state.spineIdentifierHook = null;
      state.rendition.destroy();
    } catch { /* ignore */ }
    state.rendition = null;
    state.verticalReader = false;
    state.verticalHintShown = false;
    ui.viewer.innerHTML = '';
    await createRendition(cfi);
    updateLayoutButton();
    if (!options.silent) toast('排版已更新');
  }

  function generateLocations(book) {
    if (!book || state.book !== book) return;
    book.locations.generate(1600)
      .then(() => {
        if (state.book !== book) return;
        state.locationsReady = true;
        ui.progressRange.disabled = false;
        ui.locationsStatus.classList.remove('is-working');
        updateSectionStatus(state.lastLocation);
        const location = state.lastLocation;
        if (location?.start?.cfi) {
          const percentage = book.locations.percentageFromCfi(location.start.cfi);
          if (Number.isFinite(percentage)) updateProgress(percentage);
        }
      })
      .catch((error) => {
        console.warn('Location generation failed', error);
        if (state.book !== book) return;
        state.locationsReady = false;
        ui.locationsStatus.classList.remove('is-working');
        ui.locationsStatus.textContent = '按章节估算进度';
      });
  }

  function handleRelocated(location) {
    if (!location || !location.start) return;
    state.lastLocation = location;
    state.currentCfi = location.start.cfi || state.currentCfi;
    const percentage = calculateProgress(location);
    updateProgress(percentage);
    updateChapter(location);
    if (state.currentRecord) {
      state.currentRecord.progress = percentage;
      state.currentRecord.cfi = state.currentCfi;
    }
    const spineLength = state.book?.spine?.spineItems?.length || 0;
    const spineIndex = Number.isFinite(location.start.index) ? location.start.index : 0;
    ui.btnPrev.disabled = spineIndex === 0 && Boolean(location.atStart);
    ui.btnNext.disabled = spineLength > 0 && spineIndex >= spineLength - 1 && Boolean(location.atEnd);
    updateSectionStatus(location);
    queueProgressSave();
  }

  function updateSectionStatus(location) {
    const total = state.book?.spine?.spineItems?.length || 0;
    const index = (Number.isFinite(location?.start?.index) ? location.start.index : 0) + 1;
    if (!total) {
      ui.locationsStatus.textContent = '等待打开书籍';
      return;
    }
    const vertical = state.verticalReader && currentLayout() === 'original';
    ui.locationsStatus.textContent = vertical
      ? `原书竖排 · 第 ${index} / ${total} 节`
      : `第 ${index} / ${total} 节`;
  }

  function calculateProgress(location) {
    if (!location) return 0;
    if (state.locationsReady && state.book && location.start?.cfi) {
      try {
        const percentage = state.book.locations.percentageFromCfi(location.start.cfi);
        if (Number.isFinite(percentage)) return clamp(percentage, 0, 1);
      } catch { /* fall through */ }
    }
    const spineLength = state.book?.spine?.spineItems?.length || 0;
    if (spineLength && Number.isFinite(location.start?.index)) {
      return clamp((location.start.index + (location.atEnd ? 1 : 0)) / spineLength, 0, 1);
    }
    return 0;
  }

  function updateProgress(percentage) {
    const pct = clamp(Number(percentage) || 0, 0, 1);
    state.currentProgress = pct;
    const rounded = Math.round(pct * 100);
    ui.progressFill.style.width = `${pct * 100}%`;
    ui.progressPercent.textContent = `${rounded}%`;
    if (!state.draggingProgress) ui.progressRange.value = String(Math.round(pct * 1000));
    ui.bookMiniProgress.style.width = `${rounded}%`;
  }

  function jumpToProgress(value) {
    if (!state.locationsReady || !state.book || !state.rendition) return;
    const percentage = clamp(Number(value) / 1000, 0, 1);
    try {
      const cfi = state.book.locations.cfiFromPercentage(percentage);
      if (cfi) state.rendition.display(cfi);
    } catch (error) {
      console.warn('Jump failed', error);
    }
  }

  async function jumpToToc(href) {
    if (!state.rendition || !href || state.sectionJumping) return;
    state.sectionJumping = true;
    hidePopover();
    ui.locationsStatus.textContent = '正在打开章节…';
    try {
      await state.rendition.display(href);
      let contents = null;
      try { contents = state.rendition.getContents()?.[0]; } catch { /* ignore */ }
      applyVerticalViewport();
      if (contents?.document?.body) {
        contents.document.body.scrollLeft = 0;
        contents.document.body.scrollTop = 0;
      }
      await new Promise((resolve) => setTimeout(resolve, 80));
      applyVerticalViewport();
      updateSectionStatus(state.lastLocation);
    } catch (error) {
      toast(`打开章节失败：${error.message || '未知错误'}`, 'error');
      updateSectionStatus(state.lastLocation);
    } finally {
      state.sectionJumping = false;
    }
  }

  function navPage(direction) {
    if (!state.rendition || state.sectionJumping) return;
    hidePopover();

    if (currentLayout() === 'original') {
      try {
        const contents = state.rendition.getContents()?.[0];
        const body = contents?.document?.body;
        if (body) {
          if (state.verticalReader) {
            const maxScroll = Math.max(0, body.scrollWidth - body.clientWidth);
            const current = -body.scrollLeft;
            const step = Math.max(140, body.clientWidth * 0.82);
            if (direction > 0 && current < maxScroll - 4) {
              body.scrollBy({ left: -step, behavior: 'smooth' });
              return;
            }
            if (direction < 0 && current > 4) {
              body.scrollBy({ left: step, behavior: 'smooth' });
              return;
            }
          } else {
            const maxScroll = Math.max(0, body.scrollHeight - body.clientHeight);
            const step = Math.max(120, body.clientHeight * 0.85);
            if (direction > 0 && body.scrollTop < maxScroll - 4) {
              body.scrollBy({ top: step, behavior: 'smooth' });
              return;
            }
            if (direction < 0 && body.scrollTop > 4) {
              body.scrollBy({ top: -step, behavior: 'smooth' });
              return;
            }
          }
        }
      } catch {
        // Fall through to chapter navigation.
      }
    }

    try {
      const action = direction > 0 ? state.rendition.next() : state.rendition.prev();
      if (action?.catch) action.catch(() => {});
    } catch { /* end of book */ }
  }

  function normalizeWheelDelta(event) {
    if (event.deltaMode === 1) return event.deltaY * 16;
    if (event.deltaMode === 2) return event.deltaY * 400;
    return event.deltaY;
  }

  function handleReaderWheel(event, contents = null) {
    if (!state.rendition || state.bookLoading || state.sectionJumping) return;
    if (event.ctrlKey || event.metaKey) return;
    if (!ui.settingsModal.hidden || !ui.notebookModal.hidden || !ui.confirmModal.hidden) return;

    if (event.altKey) {
      try {
        const doc = contents?.document || state.rendition.getContents()?.[0]?.document;
        if (isImagePageDocument(doc)) {
          event.preventDefault();
          const delta = normalizeWheelDelta(event);
          if (delta) {
            const factor = delta < 0 ? 1.12 : 1 / 1.12;
            state.imageZoom = clamp(state.imageZoom * factor, 0.55, 3);
            prepareImagePage(doc);
          }
          return;
        }
      } catch { /* ignore */ }
    }

    if (currentLayout() === 'original') {
      try {
        const doc = contents?.document || state.rendition.getContents()?.[0]?.document;
        const body = doc?.body;
        const delta = normalizeWheelDelta(event);
        if (state.verticalReader && body && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
          // Vertical-rl starts at the right edge and scrolls towards negative
          // offsets, so a downward wheel moves to the next column on the left.
          const maxScroll = Math.max(0, body.scrollWidth - body.clientWidth);
          const current = -body.scrollLeft;
          const atEnd = delta > 0 && current >= maxScroll - 2;
          const atStart = delta < 0 && current <= 2;
          if (!atEnd && !atStart) {
            body.scrollLeft -= delta;
            event.preventDefault();
            return;
          }
          // At the edge, fall through to the next/previous section.
        }
        if (body) {
          const maxScroll = Math.max(0, body.scrollHeight - body.clientHeight);
          const atTop = body.scrollTop <= 2;
          const atBottom = body.scrollTop >= maxScroll - 2;
          if (maxScroll > 4 && !(delta > 0 && atBottom) && !(delta < 0 && atTop)) {
            body.scrollTop += delta;
            event.preventDefault();
            return;
          }
        }
        // A cover or a page that fits entirely falls through to page turning.
      } catch { /* ignore */ }
    }

    const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY) * 1.2;
    if (horizontal) return;

    const delta = normalizeWheelDelta(event);
    if (Math.abs(delta) < 1) return;
    event.preventDefault();

    const now = Date.now();
    if (now - state.lastWheelAt < 380) return;
    if (Math.sign(delta) !== Math.sign(state.wheelAccum)) state.wheelAccum = 0;
    state.wheelAccum += delta;
    if (Math.abs(state.wheelAccum) < 36) return;

    const direction = state.wheelAccum > 0 ? 1 : -1;
    state.wheelAccum = 0;
    state.lastWheelAt = now;
    navPage(direction);
  }

  /* =========================================================
     TOC / chapter tracking
     ========================================================= */

  function flattenToc(items, depth = 0, output = []) {
    if (!Array.isArray(items)) return output;
    for (const item of items) {
      if (!item) continue;
      const label = cleanText(item.label) || '未命名章节';
      const href = item.href || '';
      if (href) {
        output.push({ label, href, depth, index: output.length });
      }
      if (Array.isArray(item.subitems) && item.subitems.length) {
        flattenToc(item.subitems, Math.min(depth + 1, 2), output);
      }
    }
    return output;
  }

  function hrefBase(href) {
    return String(href || '').split('#')[0].replace(/^\.\//, '');
  }

  function renderToc(tocItems) {
    state.toc = flattenToc(tocItems);
    ui.tocCount.textContent = state.toc.length ? `${state.toc.length} 节` : '';
    ui.tocEmpty.hidden = state.toc.length > 0;
    if (!state.toc.length) {
      ui.tocList.innerHTML = '';
      return;
    }
    ui.tocList.innerHTML = state.toc.map((item) => `
      <button class="toc-item depth-${item.depth}" data-href="${escapeHtml(item.href)}" data-index="${item.index}" title="${escapeHtml(item.label)}">
        <span class="toc-index">${String(item.index + 1).padStart(2, '0')}</span>
        <span>${escapeHtml(item.label)}</span>
      </button>`).join('');
  }

  function findTocItem(location) {
    if (!location?.start) return null;
    const href = String(location.start.href || '');
    const base = hrefBase(href);
    const exact = state.toc.find((item) => hrefBase(item.href) === base && item.href === href);
    if (exact) return exact;
    const matches = state.toc.filter((item) => hrefBase(item.href) === base);
    return matches.length ? matches[matches.length - 1] : null;
  }

  function updateChapter(location) {
    const item = findTocItem(location);
    let title = item?.label;
    if (!title) {
      const href = String(location?.start?.href || '').split('#')[0].split('/').pop() || '';
      title = href.replace(/\.x?html?$/i, '') || '正文';
    }
    state.currentChapter = title;
    state.activeTocHref = item?.href || '';
    ui.chapterTitle.textContent = title;
    ui.topbarChapter.textContent = title;
    ui.chapterKicker.textContent = item ? `CHAPTER ${String(item.index + 1).padStart(2, '0')}` : 'READING DESK';
    ui.tocList.querySelectorAll('.toc-item').forEach((button) => {
      const active = button.dataset.href === state.activeTocHref;
      button.classList.toggle('is-active', active);
      if (active) button.scrollIntoView({ block: 'nearest' });
    });
    renderBookMini();
  }

  function renderBookMini() {
    if (!state.bookTitle) return;
    ui.bookMiniTitle.textContent = state.bookTitle;
    ui.bookMiniAuthor.textContent = state.bookAuthor;
    ui.bookMiniGlyph.textContent = firstGlyph(state.bookTitle);
    ui.bookMiniProgress.style.width = `${Math.round(state.currentProgress * 100)}%`;
    ui.topbarBookTitle.textContent = state.bookTitle;
  }

  /* =========================================================
     Selection
     ========================================================= */

  function extractSelectedText(range, fallback = '') {
    let text = fallback;
    try {
      const fragment = range.cloneContents();
      fragment.querySelectorAll('rt, rp, .rt, .ruby').forEach((node) => {
        if (node.tagName === 'RUBY') {
          node.querySelectorAll('rt, rp').forEach((annotation) => annotation.remove());
        } else {
          node.remove();
        }
      });
      const wrapper = document.createElement('div');
      wrapper.appendChild(fragment);
      wrapper.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
      const blockText = wrapper.textContent || '';
      if (blockText.trim()) text = blockText;
    } catch {
      // Fall back to Selection.toString().
    }
    return cleanText(text).slice(0, MAX_RESULT_CHARS + 200);
  }

  function beginSelection(contents) {
    if (!contents) return;
    state.selectionContents = contents;
    if (state.selectionPointerDown) return;
    state.selectionPointerDown = true;
    state.lookupToken += 1;
    if (state.isLookupLoading) {
      state.isLookupLoading = false;
      showPanelState('empty');
    }
    clearTimeout(state.autoTimer);
    clearTimeout(state.selectionFinalizeTimer);
    state.selectionFinalizeTimer = null;
    hidePopover();
    hideSelectionLive();
    startSelectionLiveTicker(contents);
    if (window.__YOMIKATA_DEBUG) console.log('[sel] begin');
  }

  function startSelectionLiveTicker(contents) {
    stopSelectionLiveTicker();
    state.selectionLiveTimer = setInterval(() => {
      if (!state.selectionPointerDown) return;
      const selection = contents?.window?.getSelection?.();
      if (!selection || selection.isCollapsed) {
        hideSelectionLive();
        return;
      }
      showSelectionLive(selection.toString());
    }, 100);
  }

  function stopSelectionLiveTicker() {
    if (state.selectionLiveTimer) {
      clearInterval(state.selectionLiveTimer);
      state.selectionLiveTimer = null;
    }
  }

  function endSelection(contents = state.selectionContents) {
    if (!state.selectionPointerDown) return;
    state.selectionPointerDown = false;
    stopSelectionLiveTicker();
    state.selectionContents = contents;
    queueSelectionFinalize(contents, 300);
    if (window.__YOMIKATA_DEBUG) console.log('[sel] end');
  }

  function queueSelectionFinalize(contents, delay = 300) {
    clearTimeout(state.selectionFinalizeTimer);
    state.selectionFinalizeTimer = setTimeout(() => finalizeSelection(contents), delay);
    if (window.__YOMIKATA_DEBUG) console.log('[sel] queue finalize', delay);
  }

  function showSelectionLive(text) {
    if (!ui.selectionLive) return;
    const count = Array.from(String(text || '').replace(/\s+/g, '')).length;
    if (!count) {
      hideSelectionLive();
      return;
    }
    if (count === state.lastSelectionLiveCount && !ui.selectionLive.hidden) return;
    state.lastSelectionLiveCount = count;
    ui.selectionLiveCount.textContent = String(count);
    ui.selectionLive.hidden = false;
  }

  function hideSelectionLive() {
    stopSelectionLiveTicker();
    state.lastSelectionLiveCount = 0;
    if (ui.selectionLive) ui.selectionLive.hidden = true;
  }

  function handleSelection(cfiRange, contents, options = {}) {
    if (!domReady || state.bookLoading) return;
    // EPUB.js reports a selection 250 ms after the last selectionchange, which
    // can happen while the user is still dragging. React only after pointerup
    // so the popover never appears under the cursor mid-drag.
    if (state.selectionPointerDown) {
      if (window.__YOMIKATA_DEBUG) console.log('[sel] ignored while pointer down');
      return;
    }
    const selection = contents?.window?.getSelection?.();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const text = extractSelectedText(range, selection.toString());
    if (!text) return;
    if (!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]/u.test(text)) return;

    const now = Date.now();
    if (!options.force && text === state.lastSelectionProcessed && now - state.lastSelectionAt < 700) return;
    state.lastSelectionProcessed = text;
    state.lastSelectionAt = now;

    state.selectionText = text;
    state.selectionCfiRange = cfiRange || state.selectionCfiRange;

    if (text.length > MAX_RESULT_CHARS) {
      toast(`一次最多查询 ${MAX_RESULT_CHARS} 个字符，请选短一点`, 'error');
      hidePopover();
      return;
    }

    clearTimeout(state.autoTimer);
    showPopover(text, range, contents);

    if (state.settings?.autoLookup && text.length <= 60) {
      if (window.__YOMIKATA_DEBUG) console.log('[sel] schedule lookup', text.length);
      state.autoTimer = setTimeout(() => {
        if (window.__YOMIKATA_DEBUG) console.log('[sel] fire lookup', text.length);
        hidePopover();
        lookup(text);
      }, 500);
    }
  }

  function finalizeSelection(contents = state.selectionContents) {
    state.selectionFinalizeTimer = null;
    hideSelectionLive();
    if (!contents || state.selectionPointerDown) return;
    const selection = contents.window?.getSelection?.();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    handleSelection(state.selectionCfiRange, contents);
  }

  function showPopover(text, range, contents) {
    let rect;
    try {
      rect = range.getBoundingClientRect();
    } catch {
      return;
    }
    const frame = contents?.document?.defaultView?.frameElement;
    const viewerRect = ui.viewerWrap.getBoundingClientRect();
    let frameRect = { left: 0, top: 0, width: viewerRect.width, height: viewerRect.height };
    if (frame) {
      try { frameRect = frame.getBoundingClientRect(); } catch { /* ignore */ }
    }

    ui.selectionQuote.textContent = text.length > 34 ? `${text.slice(0, 34)}…` : text;
    ui.selectionLookup.querySelector('span').textContent = '解释';
    ui.selectionPopover.classList.remove('is-loading');
    ui.selectionPopover.hidden = false;

    const popWidth = ui.selectionPopover.offsetWidth || 220;
    const popHeight = ui.selectionPopover.offsetHeight || 36;
    let left = frameRect.left - viewerRect.left + rect.left + rect.width / 2;
    left = clamp(left, popWidth / 2 + 8, viewerRect.width - popWidth / 2 - 8);

    const selectionBottom = frameRect.top - viewerRect.top + rect.bottom;
    const selectionTop = frameRect.top - viewerRect.top + rect.top;
    const above = selectionBottom + popHeight + 24 > viewerRect.height;
    const top = above ? selectionTop : selectionBottom;

    ui.selectionPopover.classList.toggle('is-above', above);
    ui.selectionPopover.style.left = `${left}px`;
    ui.selectionPopover.style.top = `${top}px`;
  }

  function hidePopover() {
    if (!ui.selectionPopover) return;
    ui.selectionPopover.hidden = true;
    ui.selectionPopover.classList.remove('is-above', 'is-loading');
  }

  /* =========================================================
     DeepSeek lookup
     ========================================================= */

  async function lookup(text, options = {}) {
    const normalized = cleanText(text);
    if (!normalized) {
      toast('没有选中文字', 'error');
      return;
    }
    if (normalized.length > MAX_RESULT_CHARS) {
      toast(`一次最多查询 ${MAX_RESULT_CHARS} 个字符`, 'error');
      return;
    }
    if (!state.settings?.hasKey) {
      openPanel();
      showPanelError('还差一个 API Key', '在设置中填入 DeepSeek API Key 后，就可以划词查询了。', 'NO_KEY');
      return;
    }

    state.lookupToken += 1;
    const token = state.lookupToken;
    state.lastLookupText = normalized;
    state.isLookupLoading = true;
    openPanel();
    hidePopover();
    ui.loadingSelection.textContent = normalized.length > 90 ? `${normalized.slice(0, 90)}…` : normalized;
    showPanelState('loading');

    if (!options.force && state.settings.cacheEnabled) {
      const cached = getCachedResult(normalized);
      if (cached) {
        if (token !== state.lookupToken) return;
        state.isLookupLoading = false;
        applyLookupResult(cached.data, {
          ...cached.meta,
          cached: true,
          source: currentBookSource()
        });
        return;
      }
    }

    try {
      const response = await api.lookup({ text: normalized });
      if (token !== state.lookupToken) return;
      if (!response?.ok) {
        const error = response?.error || { code: 'ERROR', message: '查询失败，请稍后重试' };
        showPanelErrorFor(error);
        state.isLookupLoading = false;
        return;
      }

      const normalizedResult = normalizeResult(response.data, normalized);
      if (!normalizedResult) {
        showPanelError('这次没有看懂结果', '模型返回了无法解析的内容，请点击重试。', 'BAD_JSON');
        state.isLookupLoading = false;
        return;
      }

      const result = {
        ...normalizedResult,
        id: resultId(normalizedResult),
        source: currentBookSource(),
        meta: response.meta || {}
      };
      state.isLookupLoading = false;

      if (state.settings.cacheEnabled) {
        putCachedResult(normalized, normalizedResult, response.meta || {});
      }
      addHistory(result);
      renderResult(result, { cached: false });
    } catch (error) {
      if (token !== state.lookupToken) return;
      state.isLookupLoading = false;
      showPanelError('查询没有完成', error.message || '网络连接似乎出了问题，请稍后重试。', error.code || 'ERROR');
    }
  }

  function currentBookSource() {
    if (!state.bookTitle) return null;
    return {
      book: state.bookTitle,
      author: state.bookAuthor,
      chapter: state.currentChapter
    };
  }

  function normalizeResult(raw, selectedText) {
    let data = raw;
    if (Array.isArray(data)) data = data[0];
    if (!data || typeof data !== 'object') return null;

    const kindValue = asText(data.kind || data.type).toLowerCase();
    let kind = 'word';
    if (/sentence|句子/.test(kindValue)) kind = 'sentence';
    else if (/phrase|短语|表达/.test(kindValue)) kind = 'phrase';

    const headword = asText(data.headword || data.word || data.term || data.surface) || selectedText;
    const reading = asText(data.reading || data.kana || data.hiragana || data.yomi || data.pronunciation);
    const romaji = asText(data.romaji || data.roman || data.romanization);
    const pos = asText(data.part_of_speech || data.partOfSpeech || data.pos || data.part_of_speech_zh);
    const meaning = asText(data.meaning || data.definition || data.explanation || data.meaning_zh || data.zh);
    const nuance = asText(data.nuance || data.note || data.usage || data.context_note);
    let sentence = asText(data.sentence_meaning || data.sentence_translation || data.translation || data.sentenceMeaning);
    if (kind === 'word' && sentence && !meaning) {
      return { kind, headword, reading, romaji, pos, meaning: sentence, nuance, sentence: '', kanji: [], words: [], selected: selectedText };
    }
    if (!meaning && !sentence && !data.words?.length && !data.kanji?.length) return null;

    const kanjiRaw = data.kanji || data.kanji_readings || data.kanjiReadings || data.characters || [];
    const kanji = [];
    const seenKanji = new Set();

    const pushKanji = (char, source = {}) => {
      const glyph = asText(char).slice(0, 1);
      if (!glyph || !/[\u3400-\u9fff\uf900-\ufaff]/.test(glyph) || seenKanji.has(glyph)) return;
      seenKanji.add(glyph);
      const on = asText(source.on || source.on_yomi || source.onYomi || source.onyomi || source.onyomi_zh || source['音读'] || source['音読み']);
      const kun = asText(source.kun || source.kun_yomi || source.kunYomi || source.kunyomi || source['训读'] || source['訓読み']);
      const inWord = asText(source.in_word || source.inWord || source.in_word_reading || source.word_reading || source['词中读法'] || source['語中']);
      const note = asText(source.note || source.notes || source.note_zh || source['备注']);
      kanji.push({ char: glyph, on: on || '—', kun: kun || '—', inWord: inWord || '—', note });
    };

    if (Array.isArray(kanjiRaw)) {
      for (const item of kanjiRaw) {
        if (typeof item === 'string') pushKanji(item);
        else if (item && typeof item === 'object') pushKanji(item.char || item.kanji || item.character || item.glyph, item);
      }
    } else if (kanjiRaw && typeof kanjiRaw === 'object') {
      for (const [char, value] of Object.entries(kanjiRaw)) {
        if (value && typeof value === 'object') pushKanji(char, value);
        else pushKanji(char, { inWord: asText(value) });
      }
    }

    const wordsRaw = data.words || data.keywords || data.vocabulary || data.key_words || [];
    const words = [];
    if (Array.isArray(wordsRaw)) {
      for (const item of wordsRaw.slice(0, 10)) {
        if (typeof item === 'string') {
          if (item.trim()) words.push({ surface: item.trim(), reading: '', meaning: '' });
        } else if (item && typeof item === 'object') {
          const surface = asText(item.surface || item.word || item.term || item.text);
          if (!surface) continue;
          words.push({
            surface,
            reading: asText(item.reading || item.kana || item.hiragana || item.yomi),
            meaning: asText(item.meaning || item.definition || item.explanation || item.zh)
          });
        }
      }
    }

    if (!meaning && !sentence && !words.length) return null;

    return {
      kind,
      headword,
      reading,
      romaji,
      pos,
      meaning,
      nuance,
      sentence,
      kanji,
      words,
      selected: selectedText
    };
  }

  function getCachedResult(text) {
    const key = `${state.settings.model}|${text}`;
    const item = state.cache[key];
    if (!item || !item.data) return null;
    return item;
  }

  function putCachedResult(text, data, meta) {
    const key = `${state.settings.model}|${text}`;
    state.cache[key] = { data, meta, at: Date.now() };
    const keys = Object.keys(state.cache);
    if (keys.length > 160) {
      keys.sort((a, b) => (state.cache[a].at || 0) - (state.cache[b].at || 0));
      for (const oldKey of keys.slice(0, keys.length - 140)) delete state.cache[oldKey];
    }
    saveCache();
  }

  function applyLookupResult(data, meta) {
    const result = {
      ...data,
      id: data.id || resultId(data),
      source: meta.source || currentBookSource(),
      meta
    };
    addHistory(result);
    renderResult(result, { cached: Boolean(meta.cached) });
  }

  function addHistory(result) {
    const last = state.history[0];
    if (last && last.result?.id === result.id && Date.now() - (last.at || 0) < 6000) return;
    state.history.unshift({
      id: `${Date.now()}-${hashString(result.headword + result.reading)}`,
      text: result.selected || result.headword,
      result: { ...result, id: result.id },
      at: Date.now()
    });
    state.history = state.history.slice(0, 80);
    writeJson(LS.history, state.history);
    if (state.notebookTab === 'history' && !ui.notebookModal.hidden) renderNotebook();
  }

  function showPanelState(name) {
    ui.panelEmpty.hidden = name !== 'empty';
    ui.panelLoading.hidden = name !== 'loading';
    ui.panelError.hidden = name !== 'error';
    ui.panelResult.hidden = name !== 'result';
    if (name === 'loading') ui.panelBody.scrollTop = 0;
  }

  function showPanelError(title, message, code = 'ERROR') {
    showPanelState('error');
    ui.errorTitle.textContent = title;
    ui.errorMessage.textContent = message;
    ui.btnRetry.hidden = ['NO_KEY', 'TOO_LONG'].includes(code);
    ui.btnErrorSettings.hidden = false;
    openPanel();
  }

  function showPanelErrorFor(error) {
    const code = error?.code || 'ERROR';
    let title = '查询没有完成';
    let message = error?.message || '请稍后重试。';
    if (code === 'NO_KEY') {
      title = '还差一个 API Key';
      message = '在设置中填入 DeepSeek API Key 后，就可以划词查询了。';
    } else if (code === 'TIMEOUT') {
      title = '等得有点久';
      message = '请求超时了。检查网络后再试一次，或换一个更快的模型。';
    } else if (code === 'NETWORK_ERROR') {
      title = '连接不上 DeepSeek';
      message = '请检查网络、代理或 API 地址是否正确。';
    } else if (code === 'API_ERROR') {
      title = error.status === 401 ? 'API Key 不对' : '接口返回了错误';
    } else if (code === 'BAD_JSON') {
      title = '这次没有看懂结果';
    }
    showPanelError(title, message, code);
  }

  /* =========================================================
     Result rendering
     ========================================================= */

  function kindLabel(kind) {
    return kind === 'sentence' ? '句子' : kind === 'phrase' ? '短语' : '词语';
  }

  function resultId(result) {
    return hashString(`${cleanText(result.headword)}\u0000${cleanText(result.reading)}`);
  }

  function resultHtml(result, options = {}) {
    const saved = isSaved(result.id);
    const kind = kindLabel(result.kind);
    const headwordClass = Array.from(result.headword || '').length > 10 ? ' is-long' : '';
    const source = result.source;
    const model = result.meta?.model || state.settings?.model || 'deepseek-chat';
    const meaning = result.meaning || result.sentence || '—';
    const cached = options.cached || result.meta?.cached;

    const kanjiHtml = result.kanji?.length ? `
      <div class="section-label">汉字读音</div>
      <div class="kanji-list">
        ${result.kanji.map((item) => `
          <div class="kanji-card">
            <div class="kanji-glyph">${escapeHtml(item.char)}</div>
            <div class="kanji-readings">
              <div class="kanji-reading-row"><span class="tag">音</span><b>${escapeHtml(item.on || '—')}</b></div>
              <div class="kanji-reading-row"><span class="tag">訓</span><b>${escapeHtml(item.kun || '—')}</b></div>
              <div class="kanji-reading-row"><span class="tag in-word">词中</span><b>${escapeHtml(item.inWord || '—')}</b></div>
              ${item.note ? `<div class="kanji-reading-row"><span class="tag">注</span><small>${escapeHtml(item.note)}</small></div>` : ''}
            </div>
          </div>`).join('')}
      </div>` : '';

    const wordsHtml = result.words?.length ? `
      <div class="section-label">片段中的关键词</div>
      <div class="words-list">
        ${result.words.map((word) => `
          <div class="word-row">
            <div class="word-surface">${escapeHtml(word.surface)}${word.reading ? `<span>${escapeHtml(word.reading)}</span>` : ''}</div>
            <span class="word-source">${escapeHtml(kind)}</span>
            ${word.meaning ? `<div class="word-meaning">${escapeHtml(word.meaning)}</div>` : ''}
          </div>`).join('')}
      </div>` : '';

    const sentenceHtml = result.sentence && result.kind !== 'word' ? `
      <div class="section-label">这段的意思</div>
      <div class="sentence-block">${escapeHtml(result.sentence).replace(/\n/g, '<br>')}</div>` : '';

    const nuanceHtml = result.nuance ? `
      <div class="section-label">语感与用法</div>
      <div class="nuance-block">${escapeHtml(result.nuance).replace(/\n/g, '<br>')}</div>` : '';

    const sourceHtml = source?.book ? `
      <div class="result-source">
        <b>${escapeHtml(source.book)}</b>
        <span>${escapeHtml(source.author || '')}${source.chapter ? ` · ${escapeHtml(source.chapter)}` : ''}</span>
      </div>` : '';

    return `
      <div class="result-top">
        <div class="result-tags">
          <span class="chip accent">${kind}</span>
          ${result.pos ? `<span class="chip">${escapeHtml(result.pos)}</span>` : ''}
          ${cached ? '<span class="chip green">缓存</span>' : ''}
        </div>
        <div class="result-actions">
          <button class="result-action" data-result-action="speak" title="朗读" aria-label="朗读"><svg><use href="#i-volume"></use></svg></button>
          <button class="result-action" data-result-action="copy" title="复制释义" aria-label="复制释义"><svg><use href="#i-copy"></use></svg></button>
          <button class="result-action${saved ? ' is-saved' : ''}" data-result-action="save" title="${saved ? '从生词本移除' : '加入生词本'}" aria-label="${saved ? '从生词本移除' : '加入生词本'}"><svg><use href="#i-star"></use></svg></button>
        </div>
      </div>
      <div class="result-word${headwordClass}">${escapeHtml(result.headword)}</div>
      ${result.reading ? `<div class="result-reading"><b>${escapeHtml(result.reading)}</b>${result.romaji ? `<span>${escapeHtml(result.romaji)}</span>` : ''}</div>` : ''}
      <div class="result-pos">${escapeHtml(result.pos || (result.kind === 'sentence' ? '按语境解释' : '日语'))}</div>
      <div class="meaning-block">
        <div class="section-label">中文释义</div>
        <div class="meaning-text">${escapeHtml(meaning).replace(/\n/g, '<br>')}</div>
      </div>
      ${sentenceHtml}
      ${kanjiHtml}
      ${wordsHtml}
      ${nuanceHtml}
      ${sourceHtml}
      <div class="result-foot">
        <svg><use href="#i-sparkle"></use></svg>
        <span>由 ${escapeHtml(model)} 生成 · AI 释义仅供参考</span>
      </div>
    `;
  }

  function renderResult(result, options = {}) {
    result.id = result.id || resultId(result);
    state.currentResult = result;
    ui.panelResult.innerHTML = resultHtml(result, options);
    showPanelState('result');
    ui.panelBody.scrollTop = 0;
    openPanel();
  }

  function isSaved(id) {
    return state.vocab.some((entry) => entry.id === id);
  }

  function toggleCurrentSave() {
    const result = state.currentResult;
    if (!result) return;
    const id = result.id || resultId(result);
    const index = state.vocab.findIndex((entry) => entry.id === id);
    if (index >= 0) {
      state.vocab.splice(index, 1);
      toast('已从生词本移除');
    } else {
      state.vocab.unshift({
        id,
        headword: result.headword,
        reading: result.reading,
        meaning: result.meaning || result.sentence || '',
        kind: result.kind,
        pos: result.pos,
        savedAt: Date.now(),
        result: JSON.parse(JSON.stringify({ ...result, id }))
      });
      toast('已加入生词本');
    }
    writeJson(LS.vocab, state.vocab);
    renderNotebookBadge();
    if (!ui.notebookModal.hidden) renderNotebook();
    const button = ui.panelResult.querySelector('[data-result-action="save"]');
    if (button) {
      const nowSaved = index < 0;
      button.classList.toggle('is-saved', nowSaved);
      button.title = nowSaved ? '从生词本移除' : '加入生词本';
      button.setAttribute('aria-label', button.title);
    }
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) {
      toast('这台电脑没有可用的语音朗读', 'error');
      return;
    }
    const phrase = cleanText(text);
    if (!phrase) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(phrase);
      utterance.lang = 'ja-JP';
      utterance.rate = 0.86;
      utterance.pitch = 1;
      const voices = window.speechSynthesis.getVoices();
      const japanese = voices.find((voice) => /^ja([-_]|$)/i.test(voice.lang));
      if (japanese) utterance.voice = japanese;
      else toast('没有找到日文语音，将使用系统默认发音');
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      toast(`朗读失败：${error.message}`, 'error');
    }
  }

  async function copyResult() {
    const result = state.currentResult;
    if (!result) return;
    const text = [
      result.headword,
      result.reading ? `读音：${result.reading}` : '',
      result.meaning ? `释义：${result.meaning}` : '',
      result.kanji?.length ? `汉字：${result.kanji.map((item) => `${item.char}（${item.inWord || item.kun || item.on}）`).join('、')}` : '',
      result.source?.book ? `出处：${result.source.book}${result.source.chapter ? ` · ${result.source.chapter}` : ''}` : ''
    ].filter(Boolean).join('\n');
    try {
      await api.copyText(text);
      toast('已复制到剪贴板');
    } catch {
      toast('复制失败', 'error');
    }
  }

  function handleResultAction(action) {
    if (action === 'save') toggleCurrentSave();
    else if (action === 'speak') {
      if (!state.currentResult) return;
      speak(state.currentResult.kind === 'sentence' && state.currentResult.selected
        ? state.currentResult.selected
        : state.currentResult.headword);
    } else if (action === 'copy') copyResult();
    else if (action === 'retry') lookup(state.lastLookupText || state.currentResult?.headword || '', { force: true });
  }

  /* =========================================================
     Notebook
     ========================================================= */

  function openNotebook(tab = 'vocab') {
    state.notebookTab = tab;
    state.notebookQuery = '';
    ui.notebookSearch.value = '';
    ui.notebookModal.hidden = false;
    renderNotebook();
    setTimeout(() => ui.notebookSearch.focus(), 80);
  }

  function closeNotebook() {
    ui.notebookModal.hidden = true;
  }

  function setNotebookTab(tab) {
    state.notebookTab = tab;
    state.notebookQuery = '';
    ui.notebookSearch.value = '';
    ui.notebookTabs.forEach((button) => button.classList.toggle('is-active', button.dataset.tab === tab));
    renderNotebook();
  }

  function filteredVocab() {
    const query = state.notebookQuery.trim().toLowerCase();
    if (!query) return state.vocab;
    return state.vocab.filter((entry) => `${entry.headword} ${entry.reading} ${entry.meaning}`.toLowerCase().includes(query));
  }

  function filteredHistory() {
    const query = state.notebookQuery.trim().toLowerCase();
    if (!query) return state.history;
    return state.history.filter((entry) => `${entry.result?.headword || ''} ${entry.result?.reading || ''} ${entry.result?.meaning || ''}`.toLowerCase().includes(query));
  }

  function vocabCard(entry) {
    return `
      <article class="entry-card" data-entry-id="${escapeHtml(entry.id)}" tabindex="0" role="button" aria-label="查看 ${escapeHtml(entry.headword)}">
        <div class="entry-word">
          <b>${escapeHtml(entry.headword)}</b>
          <span>${escapeHtml(entry.reading || '')}</span>
        </div>
        <div class="entry-body">
          <div class="entry-meaning">${escapeHtml(entry.meaning || '')}</div>
          <div class="entry-meta">
            ${entry.pos ? `<span class="chip">${escapeHtml(entry.pos)}</span>` : ''}
            <span>${escapeHtml(entry.result?.source?.book || '')}</span>
            <span>${escapeHtml(formatRelative(entry.savedAt))}</span>
          </div>
        </div>
        <div class="entry-actions">
          <button data-entry-action="open" title="查看详情" aria-label="查看详情"><svg><use href="#i-arrow-right"></use></svg></button>
          <button class="delete" data-entry-action="delete" title="删除" aria-label="删除"><svg><use href="#i-trash"></use></svg></button>
        </div>
      </article>`;
  }

  function historyCard(entry) {
    const result = entry.result;
    return `
      <article class="entry-card history-card" data-entry-id="${escapeHtml(entry.id)}" tabindex="0" role="button" aria-label="查看 ${escapeHtml(result.headword)}">
        <div class="entry-word">
          <b>${escapeHtml(result.headword)}</b>
          <span>${escapeHtml(result.reading || '')}</span>
        </div>
        <div class="entry-body">
          <div class="entry-meaning">${escapeHtml(result.meaning || result.sentence || '')}</div>
          <div class="entry-meta">
            <span>${escapeHtml(result.source?.book || '')}</span>
            <span>${escapeHtml(result.source?.chapter || '')}</span>
          </div>
        </div>
        <div class="entry-actions">
          <span class="history-time">${escapeHtml(formatRelative(entry.at))}</span>
          <button data-entry-action="open" title="查看详情" aria-label="查看详情"><svg><use href="#i-arrow-right"></use></svg></button>
          <button class="delete" data-entry-action="delete" title="删除" aria-label="删除"><svg><use href="#i-trash"></use></svg></button>
        </div>
      </article>`;
  }

  function renderNotebook() {
    const isVocab = state.notebookTab === 'vocab';
    ui.notebookTabs.forEach((button) => button.classList.toggle('is-active', button.dataset.tab === state.notebookTab));
    ui.vocabList.hidden = !isVocab;
    ui.historyList.hidden = isVocab;
    ui.btnExport.hidden = !isVocab;
    ui.btnClearVocab.hidden = !isVocab;

    const vocab = filteredVocab();
    const history = filteredHistory();
    ui.vocabList.innerHTML = vocab.map(vocabCard).join('');
    ui.historyList.innerHTML = history.map(historyCard).join('');

    const count = isVocab ? vocab.length : history.length;
    ui.notebookEmpty.hidden = count > 0;
    const title = ui.notebookEmpty.querySelector('h3');
    const paragraph = ui.notebookEmpty.querySelector('p');
    if (state.notebookQuery.trim()) {
      title.textContent = '没有找到匹配的条目';
      paragraph.textContent = '换一个关键词试试，搜索会匹配词语、读音和释义。';
    } else if (isVocab) {
      title.textContent = '还没有收藏生词';
      paragraph.textContent = '查到想记住的词时，点击结果右上角的星标，就会出现在这里。';
    } else {
      title.textContent = '还没有查询记录';
      paragraph.textContent = '在正文中划词查询后，最近 80 次查询会留在这里。';
    }
    ui.notebookFootnote.textContent = isVocab
      ? `生词本共 ${state.vocab.length} 条 · 只保存在本机`
      : `查询历史共 ${state.history.length} 条 · 只保存在本机`;
    ui.btnExport.disabled = state.vocab.length === 0;
  }

  function handleEntryClick(event) {
    const actionButton = event.target.closest('[data-entry-action]');
    const card = event.target.closest('.entry-card');
    if (!card) return;
    const id = card.dataset.entryId;
    const isHistory = state.notebookTab === 'history';
    if (actionButton?.dataset.entryAction === 'delete') {
      if (isHistory) {
        state.history = state.history.filter((entry) => entry.id !== id);
        writeJson(LS.history, state.history);
      } else {
        state.vocab = state.vocab.filter((entry) => entry.id !== id);
        writeJson(LS.vocab, state.vocab);
        renderNotebookBadge();
      }
      renderNotebook();
      return;
    }
    if (actionButton?.dataset.entryAction === 'open' || !actionButton) {
      const entry = isHistory
        ? state.history.find((item) => item.id === id)
        : state.vocab.find((item) => item.id === id);
      if (!entry) return;
      const result = isHistory ? entry.result : entry.result;
      if (!result) return;
      closeNotebook();
      renderResult({ ...result, id: entry.id }, { cached: false, fromNotebook: true });
    }
  }

  async function exportVocab() {
    if (!state.vocab.length) return;
    const header = ['表面', '读音', '罗马字', '词性', '中文释义', '汉字读音', '摘录', '书名', '章节', '收藏时间'];
    const rows = state.vocab.map((entry) => {
      const result = entry.result || {};
      const kanji = (result.kanji || []).map((item) => `${item.char}(音:${item.on}/訓:${item.kun}/词中:${item.inWord})`).join('；');
      return [
        entry.headword,
        entry.reading,
        result.romaji || '',
        entry.pos || '',
        entry.meaning,
        kanji,
        result.selected || '',
        result.source?.book || '',
        result.source?.chapter || '',
        formatDate(entry.savedAt)
      ];
    });
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const date = new Date();
    const filename = `yomikata-vocab-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}.csv`;
    try {
      const result = await api.exportCsv({ content: csv, filename });
      if (result?.ok) toast('生词本已导出，可用 Excel 或 Anki 打开');
      else if (!result?.canceled) toast(result?.error || '导出失败', 'error');
    } catch (error) {
      toast(`导出失败：${error.message}`, 'error');
    }
  }

  function csvCell(value) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
  }

  /* =========================================================
     Settings modal
     ========================================================= */

  function openSettings(focusKey = false) {
    if (!state.settings) return;
    state.settingsDraft = { ...state.settings };
    state.settingsSnapshot = { ...state.settings };
    populateSettingsForm();
    ui.settingsModal.hidden = false;
    if (focusKey) setTimeout(() => ui.inputApiKey.focus(), 90);
  }

  function populateSettingsForm() {
    const settings = state.settingsDraft;
    const publicSettings = state.settings;
    ui.inputApiKey.value = '';
    ui.inputApiKey.placeholder = publicSettings.hasKey
      ? `已保存 ${publicSettings.maskedKey || ''}（留空不修改）`
      : 'sk-…';
    ui.keyHint.textContent = publicSettings.hasKey
      ? '已保存的 Key 使用 Windows 系统加密。留空表示不修改。'
      : 'Key 只保存在本机，使用 Windows 系统加密，不会发送到除 API 地址以外的任何地方。';
    ui.keyStatusPill.textContent = publicSettings.hasKey ? '已配置' : '未配置';
    ui.keyStatusPill.className = `status-pill ${publicSettings.hasKey ? 'ok' : 'warn'}`;
    ui.btnClearKey.hidden = !publicSettings.hasKey;
    ui.inputBaseUrl.value = settings.baseUrl || 'https://api.deepseek.com';
    ui.inputModel.value = settings.model || 'deepseek-chat';
    ui.toggleAuto.checked = Boolean(settings.autoLookup);
    ui.toggleCache.checked = Boolean(settings.cacheEnabled);
    ui.toggleReopen.checked = Boolean(settings.reopenLast);
    ui.rangeFontSize.value = String(settings.fontSize);
    ui.rangeLineHeight.value = String(settings.lineHeight);
    ui.labelFontSize.textContent = `${settings.fontSize} px`;
    ui.labelLineHeight.textContent = Number(settings.lineHeight).toFixed(2);
    ui.themeButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.theme === settings.theme));
    ui.fontButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.font === settings.fontFamily));
    ui.layoutButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.layout === settings.layout));
    ui.cacheSize.textContent = `(${Object.keys(state.cache).length})`;
    ui.settingsVersion.textContent = `Yomikata ${state.appInfo?.version || '1.0.0'} · Electron`;
    ui.testResult.textContent = '';
    ui.testResult.className = 'test-result';
    ui.inputApiKey.type = 'password';
    ui.btnToggleKey.querySelector('use').setAttribute('href', '#i-eye');
  }

  async function closeSettings(revert = true) {
    if (revert && state.settingsSnapshot) {
      state.settingsDraft = state.settingsSnapshot;
      refreshRenditionTheme(state.settingsSnapshot);
      document.body.dataset.theme = state.settingsSnapshot.theme;
      ui.themeButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.theme === state.settingsSnapshot.theme));
    }
    state.settingsDraft = null;
    state.settingsSnapshot = null;
    ui.settingsModal.hidden = true;
  }

  async function saveSettings() {
    if (!state.settingsDraft) return;
    const draft = { ...state.settingsDraft };
    draft.baseUrl = ui.inputBaseUrl.value.trim().replace(/\/+$/, '');
    draft.model = ui.inputModel.value.trim();
    if (!/^https?:\/\//i.test(draft.baseUrl)) {
      toast('API 地址需要以 http:// 或 https:// 开头', 'error');
      ui.inputBaseUrl.focus();
      return;
    }
    if (!draft.model) {
      toast('请填写要使用的模型名称', 'error');
      ui.inputModel.focus();
      return;
    }
    const keyValue = ui.inputApiKey.value.trim();
    const layoutChanged = draft.layout !== state.settings.layout;
    ui.btnSaveSettings.disabled = true;
    try {
      if (keyValue) await api.setKey(keyValue);
      await api.saveSettings(draft);
      state.settings = await api.getSettings();
      state.settingsDraft = null;
      state.settingsSnapshot = null;
      ui.settingsModal.hidden = true;
      if (layoutChanged) {
        state.bookLayout = null;
        if (state.currentRecord) {
          state.currentRecord.readerLayout = null;
          writeJson(LS.library, state.library);
        }
      }
      applyAllSettings(state.settings);
      updateApiStatus();
      if (layoutChanged && state.book) await rebuildRendition();
      toast('设置已保存');
    } catch (error) {
      toast(`保存设置失败：${error.message}`, 'error');
    } finally {
      ui.btnSaveSettings.disabled = false;
    }
  }

  async function testApiConnection() {
    const apiKey = ui.inputApiKey.value.trim();
    if (!apiKey && !state.settings.hasKey) {
      ui.testResult.textContent = '请先填写 API Key';
      ui.testResult.className = 'test-result bad';
      ui.inputApiKey.focus();
      return;
    }
    const spinner = ui.btnTestApi.querySelector('.button-spinner');
    ui.btnTestApi.disabled = true;
    if (spinner) spinner.hidden = false;
    ui.testResult.textContent = '正在连接…';
    ui.testResult.className = 'test-result';
    try {
      const result = await api.testConnection({
        apiKey: apiKey || undefined,
        baseUrl: ui.inputBaseUrl.value.trim() || 'https://api.deepseek.com',
        model: ui.inputModel.value.trim() || 'deepseek-chat'
      });
      if (result.ok) {
        ui.testResult.textContent = `连接成功 · ${result.latency} ms · ${result.model}`;
        ui.testResult.className = 'test-result ok';
      } else {
        ui.testResult.textContent = result.error?.message || '连接失败';
        ui.testResult.className = 'test-result bad';
      }
    } catch (error) {
      ui.testResult.textContent = `连接失败：${error.message}`;
      ui.testResult.className = 'test-result bad';
    } finally {
      ui.btnTestApi.disabled = false;
      if (spinner) spinner.hidden = true;
    }
  }

  async function clearApiKey() {
    const accepted = await askConfirm({
      title: '清除 API Key？',
      message: '清除后划词查询会暂停，直到你重新填写 Key。',
      confirmLabel: '清除'
    });
    if (!accepted) return;
    await api.clearKey();
    state.settings = await api.getSettings();
    if (state.settingsDraft) state.settingsDraft.hasKey = false;
    updateApiStatus();
    populateSettingsForm();
    toast('已清除 API Key');
  }

  async function clearCache() {
    const accepted = await askConfirm({
      title: '清除查询缓存？',
      message: `将删除 ${Object.keys(state.cache).length} 条缓存。已收藏的生词和查询历史不受影响。`,
      confirmLabel: '清除缓存'
    });
    if (!accepted) return;
    state.cache = {};
    writeJson(LS.cache, state.cache);
    ui.cacheSize.textContent = '(0)';
    toast('查询缓存已清除');
  }

  /* =========================================================
     Confirm & modal helpers
     ========================================================= */

  function askConfirm({ title, message, confirmLabel = '确认' }) {
    return new Promise((resolve) => {
      state.confirmResolve = resolve;
      ui.confirmTitle.textContent = title;
      ui.confirmMessage.textContent = message;
      ui.confirmYes.textContent = confirmLabel;
      ui.confirmModal.hidden = false;
      setTimeout(() => ui.confirmYes.focus(), 40);
    });
  }

  function resolveConfirm(value) {
    const resolve = state.confirmResolve;
    state.confirmResolve = null;
    ui.confirmModal.hidden = true;
    if (resolve) resolve(value);
  }

  function toast(message, type = 'info', duration = 3000) {
    if (!ui.toastHost) return;
    const node = document.createElement('div');
    node.className = `toast${type === 'error' ? ' is-error' : ''}`;
    const icon = type === 'error' ? 'i-alert' : 'i-check';
    node.innerHTML = `<svg><use href="#${icon}"></use></svg><span>${escapeHtml(message)}</span>`;
    ui.toastHost.appendChild(node);
    while (ui.toastHost.children.length > 3) ui.toastHost.firstElementChild.remove();
    setTimeout(() => {
      node.classList.add('is-leaving');
      setTimeout(() => node.remove(), 220);
    }, duration);
  }

  /* =========================================================
     Startup
     ========================================================= */

  async function bootOpen() {
    try {
      const pending = await api.pendingEpub();
      if (pending) {
        setTimeout(() => openBookPath(pending), 180);
        return;
      }
      if (state.settings.reopenLast && state.library.length) {
        const first = state.library[0];
        if (first?.path) {
          setTimeout(() => openBookPath(first.path, { auto: true }), 300);
        }
      }
    } catch {
      // No pending file.
    }
  }

  /* =========================================================
     Events
     ========================================================= */

  function bindEvents() {
    ui.btnOpenTop.addEventListener('click', openBookDialog);
    ui.btnOpenSide.addEventListener('click', openBookDialog);
    ui.btnOpenSidebar.addEventListener('click', openBookDialog);
    ui.btnOpenHero.addEventListener('click', openBookDialog);
    ui.btnSettingsHero.addEventListener('click', () => openSettings(true));
    ui.apiStatus.addEventListener('click', () => openSettings(true));
    ui.btnSettings.addEventListener('click', () => openSettings());
    ui.btnNotebook.addEventListener('click', () => openNotebook('vocab'));

    ui.brandButton.addEventListener('click', () => {
      expandSidebar();
      switchSidebarView('shelf');
    });

    ui.btnSidebar.addEventListener('click', toggleSidebar);
    ui.tabShelf.addEventListener('click', () => switchSidebarView('shelf'));
    ui.tabToc.addEventListener('click', () => switchSidebarView('toc'));

    ui.recentList.addEventListener('click', (event) => {
      const item = event.target.closest('.recent-book');
      if (item) openBookPath(item.dataset.path);
    });

    ui.btnPrev.addEventListener('click', () => navPage(-1));
    ui.btnNext.addEventListener('click', () => navPage(1));
    ui.btnFontDown.addEventListener('click', () => adjustFont(-1));
    ui.btnFontUp.addEventListener('click', () => adjustFont(1));
    ui.btnTheme.addEventListener('click', cycleTheme);
    ui.btnLayout.addEventListener('click', toggleBookLayout);
    ui.btnPanel.addEventListener('click', togglePanel);
    ui.viewerWrap.addEventListener('wheel', (event) => handleReaderWheel(event), { passive: false });
    ui.btnPanelClose.addEventListener('click', closePanel);
    ui.panelApiNotice.addEventListener('click', () => openSettings(true));

    ui.progressRange.addEventListener('pointerdown', () => { state.draggingProgress = true; });
    ui.progressRange.addEventListener('input', () => {
      state.draggingProgress = true;
      const value = Number(ui.progressRange.value) / 1000;
      ui.progressFill.style.width = `${value * 100}%`;
      ui.progressPercent.textContent = `${Math.round(value * 100)}%`;
    });
    ui.progressRange.addEventListener('change', () => {
      state.draggingProgress = false;
      jumpToProgress(ui.progressRange.value);
    });
    ui.progressRange.addEventListener('pointerup', () => { state.draggingProgress = false; });

    ui.tocList.addEventListener('click', (event) => {
      const item = event.target.closest('.toc-item');
      if (!item || !state.rendition) return;
      jumpToToc(item.dataset.href);
    });

    ui.selectionPopover.addEventListener('mousedown', (event) => event.stopPropagation());
    ui.selectionLookup.addEventListener('click', () => {
      const text = state.selectionText;
      hidePopover();
      lookup(text);
    });
    ui.selectionSpeak.addEventListener('click', () => speak(state.selectionText));

    ui.btnRetry.addEventListener('click', () => {
      lookup(state.lastLookupText, { force: true });
    });
    ui.btnErrorSettings.addEventListener('click', () => openSettings(true));
    ui.btnCancelLookup.addEventListener('click', () => {
      state.lookupToken += 1;
      state.isLookupLoading = false;
      showPanelState('empty');
    });

    ui.panelResult.addEventListener('click', (event) => {
      const button = event.target.closest('[data-result-action]');
      if (button) handleResultAction(button.dataset.resultAction);
    });

    document.addEventListener('mousedown', (event) => {
      if (!ui.selectionPopover.hidden && !ui.selectionPopover.contains(event.target)) hidePopover();
    });

    document.addEventListener('mouseup', () => {
      endSelection(state.selectionContents);
    });

    document.addEventListener('click', (event) => {
      const closer = event.target.closest('[data-close]');
      if (!closer) return;
      const target = closer.dataset.close;
      if (target === 'settings') closeSettings(true);
      else if (target === 'notebook') closeNotebook();
      else if (target === 'confirm') resolveConfirm(false);
    });

    ui.notebookTabs.forEach((button) => {
      button.addEventListener('click', () => setNotebookTab(button.dataset.tab));
    });
    ui.notebookSearch.addEventListener('input', () => {
      state.notebookQuery = ui.notebookSearch.value;
      renderNotebook();
    });
    ui.vocabList.addEventListener('click', handleEntryClick);
    ui.historyList.addEventListener('click', handleEntryClick);
    ui.vocabList.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('.entry-card')) {
        event.preventDefault();
        event.target.closest('.entry-card').click();
      }
    });
    ui.historyList.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('.entry-card')) {
        event.preventDefault();
        event.target.closest('.entry-card').click();
      }
    });
    ui.btnExport.addEventListener('click', exportVocab);
    ui.btnClearVocab.addEventListener('click', clearVocab);

    ui.btnSaveSettings.addEventListener('click', saveSettings);
    ui.btnTestApi.addEventListener('click', testApiConnection);
    ui.btnClearKey.addEventListener('click', clearApiKey);
    ui.btnGetKey.addEventListener('click', () => api.openExternal('https://platform.deepseek.com/api_keys'));
    ui.btnToggleKey.addEventListener('click', () => {
      const visible = ui.inputApiKey.type === 'text';
      ui.inputApiKey.type = visible ? 'password' : 'text';
      ui.btnToggleKey.querySelector('use').setAttribute('href', visible ? '#i-eye' : '#i-eye-off');
    });
    ui.btnClearCache.addEventListener('click', clearCache);

    ui.inputBaseUrl.addEventListener('input', () => {
      if (state.settingsDraft) state.settingsDraft.baseUrl = ui.inputBaseUrl.value.trim();
    });
    ui.inputModel.addEventListener('input', () => {
      if (state.settingsDraft) state.settingsDraft.model = ui.inputModel.value.trim();
    });
    ui.toggleAuto.addEventListener('change', () => {
      if (!state.settingsDraft) return;
      state.settingsDraft.autoLookup = ui.toggleAuto.checked;
    });
    ui.toggleCache.addEventListener('change', () => {
      if (!state.settingsDraft) return;
      state.settingsDraft.cacheEnabled = ui.toggleCache.checked;
    });
    ui.toggleReopen.addEventListener('change', () => {
      if (!state.settingsDraft) return;
      state.settingsDraft.reopenLast = ui.toggleReopen.checked;
    });

    ui.themeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (!state.settingsDraft) return;
        state.settingsDraft.theme = button.dataset.theme;
        setTheme(button.dataset.theme, { preview: true });
      });
    });
    ui.fontButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (!state.settingsDraft) return;
        state.settingsDraft.fontFamily = button.dataset.font;
        ui.fontButtons.forEach((item) => item.classList.toggle('is-active', item === button));
        refreshRenditionTheme(state.settingsDraft);
      });
    });
    ui.layoutButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (!state.settingsDraft) return;
        state.settingsDraft.layout = button.dataset.layout;
        ui.layoutButtons.forEach((item) => item.classList.toggle('is-active', item === button));
      });
    });
    ui.rangeFontSize.addEventListener('input', () => {
      if (!state.settingsDraft) return;
      const value = Number(ui.rangeFontSize.value);
      state.settingsDraft.fontSize = value;
      ui.labelFontSize.textContent = `${value} px`;
      scheduleThemeRefresh();
    });
    ui.rangeLineHeight.addEventListener('input', () => {
      if (!state.settingsDraft) return;
      const value = Number(ui.rangeLineHeight.value);
      state.settingsDraft.lineHeight = value;
      ui.labelLineHeight.textContent = value.toFixed(2);
      scheduleThemeRefresh();
    });

    ui.confirmYes.addEventListener('click', () => resolveConfirm(true));

    document.addEventListener('keydown', handleGlobalKeydown);

    window.addEventListener('resize', () => {
      hidePopover();
      applyVerticalViewport();
    });
    window.addEventListener('beforeunload', saveProgressNow);
    window.addEventListener('pagehide', saveProgressNow);
    window.addEventListener('blur', () => {
      state.selectionPointerDown = false;
      clearTimeout(state.selectionFinalizeTimer);
      hideSelectionLive();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) saveProgressNow();
    });

    window.addEventListener('dragenter', (event) => {
      if (!event.dataTransfer?.types?.includes('Files')) return;
      event.preventDefault();
      ui.dropOverlay.hidden = false;
    });
    window.addEventListener('dragover', (event) => {
      if (!event.dataTransfer?.types?.includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    });
    window.addEventListener('dragleave', (event) => {
      if (event.clientX === 0 && event.clientY === 0) ui.dropOverlay.hidden = true;
    });
    window.addEventListener('drop', handleDrop);
    ui.dropOverlay.addEventListener('dragleave', () => { ui.dropOverlay.hidden = true; });

    if (api?.onOpenRequest) {
      api.onOpenRequest((filePath) => openBookPath(filePath));
    }

    const tryLoadVoices = () => {
      try { state.speechVoices = window.speechSynthesis?.getVoices?.() || []; } catch { /* ignore */ }
    };
    tryLoadVoices();
    if ('speechSynthesis' in window) window.speechSynthesis.addEventListener?.('voiceschanged', tryLoadVoices);
  }

  async function handleDrop(event) {
    event.preventDefault();
    ui.dropOverlay.hidden = true;
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.epub')) {
      toast('请拖入 .epub 格式的电子书', 'error');
      return;
    }
    try {
      const filePath = api.pathForFile ? api.pathForFile(file) : '';
      if (filePath) {
        await openBookPath(filePath);
      } else {
        const buffer = await file.arrayBuffer();
        await loadBook({ name: file.name, data: buffer, path: null, size: file.size });
      }
    } catch (error) {
      toast(`读取拖入的文件失败：${error.message}`, 'error');
    }
  }

  function isPageKey(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    return [
      'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
      'PageUp', 'PageDown'
    ].includes(event.key) || event.code === 'Space';
  }

  function isInteractiveTarget(target) {
    if (!target || typeof target.closest !== 'function') return false;
    return Boolean(target.closest('input, textarea, select, button, a, [contenteditable="true"], [role="textbox"]'));
  }

  function handleGlobalKeydown(event) {
    const key = event.key;

    if (key === 'Escape') {
      if (!ui.confirmModal.hidden) { resolveConfirm(false); return; }
      if (!ui.settingsModal.hidden) { closeSettings(true); return; }
      if (!ui.notebookModal.hidden) { closeNotebook(); return; }
      if (!ui.selectionPopover.hidden) { hidePopover(); return; }
    }

    if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === 'o') {
      event.preventDefault();
      openBookDialog();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === 'b') {
      event.preventDefault();
      toggleSidebar();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === 'j') {
      event.preventDefault();
      togglePanel();
      return;
    }

    if (!isPageKey(event)) return;
    if (state.sectionJumping) return;
    if (!ui.settingsModal.hidden || !ui.notebookModal.hidden || !ui.confirmModal.hidden) return;
    if (isInteractiveTarget(event.target)) return;
    if (!ui.selectionPopover.hidden) return;

    let direction = 0;
    if (key === 'ArrowRight' || key === 'ArrowDown' || key === 'PageDown') direction = 1;
    else if (key === 'ArrowLeft' || key === 'ArrowUp' || key === 'PageUp') direction = -1;
    else if (event.code === 'Space') direction = event.shiftKey ? -1 : 1;

    if (!direction) return;
    event.preventDefault();
    navPage(direction);
  }

  async function clearVocab() {
    if (!state.vocab.length) return;
    const accepted = await askConfirm({
      title: '清空生词本？',
      message: `将删除全部 ${state.vocab.length} 条收藏。此操作无法撤销，建议先导出 CSV。`,
      confirmLabel: '清空'
    });
    if (!accepted) return;
    state.vocab = [];
    writeJson(LS.vocab, state.vocab);
    renderNotebookBadge();
    renderNotebook();
    toast('生词本已清空');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
