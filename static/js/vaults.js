// static/js/vaults.js — Painel de Vaults (fork-local; ver LOCAL_CHANGES.md)
//
// Seção "Vaults" no sidebar lista as vaults de tool_path_extra_roots
// (via /api/vaultfs/vaults). Clicar numa vault abre um painel dockado à
// borda direita com árvore de navegação + viewer/editor de markdown
// (wikilinks Obsidian) + strip de git estilo VS Code.
import { applyEdgeDock } from './modalSnap.js';
import * as Modals from './modalManager.js';
import { makeWindowDraggable } from './windowDrag.js';
import { showToast, showError, styledConfirm, styledPrompt, esc } from './ui.js';
import { mdToHtml, svgifyEmoji } from './markdown.js';
import { renderCommitGraph } from './vaultsGraph.js';
import { registerMenuDismiss } from './escMenuStack.js';
import { runQuery, runBase, evalInline } from './vaultsDataview.js';

const PANEL_ID = 'vaults-panel';
const VAULT_ICON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2"/><rect x="3" y="7" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="2"/><path d="M12 15v3"/></svg>';

// Ícones feather-style no mesmo padrão visual do resto do Odysseus (issue #3).
const FI = (paths, s = 12) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICONS = {
  notePlus: FI('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="12" y1="12" x2="12" y2="18"/><line x1="9" y1="15" x2="15" y2="15"/>'),
  folderPlus: FI('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="10" x2="12" y2="16"/><line x1="9" y1="13" x2="15" y2="13"/>'),
  refresh: FI('<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>'),
  pencil: FI('<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>', 11),
  trash: FI('<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>', 11),
  plus: FI('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', 11),
  minus: FI('<line x1="5" y1="12" x2="19" y2="12"/>', 11),
  discard: FI('<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>', 11),
  check: FI('<polyline points="20 6 9 17 4 12"/>'),
  undo: FI('<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>', 11),
  branch: FI('<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>'),
  down: FI('<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>', 11),
  up: FI('<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>', 11),
  chevron: FI('<polyline points="9 18 15 12 9 6"/>', 11),
  file: FI('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>', 11),
  folder: FI('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>', 11),
  cloud: FI('<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>', 13),
};

const state = {
  vaults: [],
  currentId: null,
  tree: null,
  noteIndex: new Map(),   // basename lowercase (sem .md) -> [relPaths]
  openPath: null,
  openMtime: null,
  content: '',
  mode: 'view',           // 'view' | 'edit' | 'image' | 'diff' | 'graph'
  dirty: false,
  git: null,              // payload de /git/status (Fase 2)
};
const els = {};           // refs DOM do painel

async function api(path, opts) {
  const r = await fetch(`/api/vaultfs${path}`, opts);
  if (!r.ok) {
    let detail = null;
    try { detail = (await r.json()).detail; } catch (_) {}
    const err = new Error(typeof detail === 'string' ? detail : (detail?.message || detail?.code || r.statusText));
    err.status = r.status;
    err.detail = detail;
    throw err;
  }
  return r.json();
}

function buildPanel() {
  let panel = document.getElementById(PANEL_ID);
  if (!panel) {
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'modal hidden';
    panel.innerHTML = `
      <div class="modal-content vaults-content">
        <div class="modal-header vaults-header">
          <span class="vaults-title"></span>
          <button class="vaults-sync-btn" title="Obsidian Sync">${ICONS.cloud}</button>
          <button class="close-btn" aria-label="Close vaults">✖</button>
        </div>
        <div class="vaults-body">
          <div class="vaults-viewer"></div>
          <div class="vaults-nav" data-tab="browser">
            <div class="vaults-tabs">
              <button class="vaults-tab" data-vaults-tab="browser">Browser</button>
              <button class="vaults-tab" data-vaults-tab="git">Git<span class="vaults-tab-badge vaults-git-badge" style="display:none"></span></button>
              <button class="vaults-tab" data-vaults-tab="tasks">Tasks<span class="vaults-tab-badge vaults-tasks-badge" style="display:none"></span></button>
            </div>
            <div class="vaults-tabpane vaults-pane-browser">
              <div class="vaults-toolbar"></div>
              <div class="vaults-tree"></div>
            </div>
            <div class="vaults-tabpane vaults-pane-git">
              <div class="vaults-git"></div>
            </div>
            <div class="vaults-tabpane vaults-pane-tasks">
              <div class="vaults-tasks"></div>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(panel);
    els.panel = panel;
    els.content = panel.querySelector('.modal-content');
    els.header = panel.querySelector('.modal-header');
    els.title = panel.querySelector('.vaults-title');
    els.nav = panel.querySelector('.vaults-nav');
    els.toolbar = panel.querySelector('.vaults-toolbar');
    els.tree = panel.querySelector('.vaults-tree');
    els.viewer = panel.querySelector('.vaults-viewer');
    els.git = panel.querySelector('.vaults-git');
    els.tasks = panel.querySelector('.vaults-tasks');
    els.syncBtn = panel.querySelector('.vaults-sync-btn');
    els.syncBtn.addEventListener('click', onSyncClick);
    // Abas Browser | Git | Tasks (feedback: layout estilo VS Code)
    const setTab = (t) => {
      els.nav.dataset.tab = t;
      els.nav.querySelectorAll('.vaults-tab').forEach(b =>
        b.classList.toggle('active', b.dataset.vaultsTab === t));
      try { localStorage.setItem('odysseus-vaults-tab', t); } catch (_) {}
      if (t === 'git') maybeLoadGraph();
      if (t === 'tasks') loadTasks();
    };
    els.setTab = setTab;
    els.nav.querySelector('.vaults-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-vaults-tab]');
      if (b) setTab(b.dataset.vaultsTab);
    });
    let savedTab = 'browser';
    try { savedTab = localStorage.getItem('odysseus-vaults-tab') || 'browser'; } catch (_) {}
    setTab(savedTab);
    panel.querySelector('.close-btn').addEventListener('click', () => Modals.close(PANEL_ID));
    makeWindowDraggable(panel, { content: els.content, header: els.header });
    panel.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
      }
    });
    wireViewerClicks();
    wireGitClicks();
    wireTasksClicks();
    els.git.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter'
          && e.target.classList.contains('vaults-commit-msg')) {
        e.preventDefault();
        els.git.querySelector('[data-git="commit"]')?.click();
      }
    });
    els.toolbar.addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      try {
        if (btn.dataset.vaultsNew) {
          const kind = btn.dataset.vaultsNew;
          const p = await styledPrompt(
            kind === 'file' ? 'Caminho da nova nota (ex: Pasta/Nome.md):' : 'Caminho da nova pasta:',
            { title: kind === 'file' ? 'Nova nota' : 'Nova pasta', maxLength: 300 });
          if (!p) return;
          const path = (kind === 'file' && !/\.[a-z0-9]+$/i.test(p)) ? `${p}.md` : p;
          await api('/file', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vault: state.currentId, path, kind }),
          });
          await refreshTree();
          if (kind === 'file') openFile(path);
          refreshGit();
        } else if ('vaultsRefresh' in btn.dataset) {
          state.meta = null;
          await refreshTree();
          refreshGit();
        }
      } catch (err) {
        showError(`Falha: ${err.message}`);
      }
    });
  }
  if (!Modals.isRegistered(PANEL_ID)) {
    Modals.register(PANEL_ID, {
      label: 'Vaults',
      icon: VAULT_ICON_SVG,
      restoreFn: () => {},
      closeFn: () => {
        const p = document.getElementById(PANEL_ID);
        if (p) p.classList.add('hidden');
      },
    });
    Modals.injectMinimizeButton(panel, PANEL_ID);
  }
  return panel;
}

async function openVault(id) {
  const panel = buildPanel();
  if (state.dirty && state.currentId && state.currentId !== id) {
    if (!(await styledConfirm('Há edição não salva. Descartar?', { danger: true }))) return;
    state.dirty = false;
  }
  const switching = state.currentId !== id;
  state.currentId = id;
  const v = state.vaults.find(x => x.id === id);
  els.title.textContent = v ? v.name : id;
  panel.classList.remove('hidden', 'modal-minimized');
  if (!panel.classList.contains('modal-right-docked')) {
    // Issue #1: largura default estilo Obsidian (~700px de viewer + coluna de
    // nav), só enquanto o usuário nunca redimensionou este painel — depois a
    // largura salva pelo modalSnap (localStorage) manda.
    try {
      if (!localStorage.getItem(`odysseus-edge-dock-width:right:${PANEL_ID}`) && !els.content._userDockWidth) {
        els.content._userDockWidth = Math.min(1000, Math.round(window.innerWidth * 0.55));
      }
    } catch (_) {}
    applyEdgeDock(panel, 'right');
  }
  renderToolbar();
  if (switching) {
    state.openPath = null;
    state.git = null;
    state.meta = null;
    state.tasks = null;
    renderViewerEmpty();
  }
  refreshSyncStatus();
  await refreshTree();
  await refreshGit();
  if (els.nav.dataset.tab === 'tasks') loadTasks(true);
}

function renderViewerEmpty() {
  els.viewer.innerHTML = '<div class="vaults-empty">Selecione uma nota na árvore →</div>';
}

function renderToolbar() {
  els.toolbar.innerHTML = `
    <button class="vaults-btn" data-vaults-new="file" title="Nova nota">${ICONS.notePlus}<span>nota</span></button>
    <button class="vaults-btn" data-vaults-new="dir" title="Nova pasta">${ICONS.folderPlus}<span>pasta</span></button>
    <button class="vaults-btn vaults-btn-icon" data-vaults-refresh title="Recarregar">${ICONS.refresh}</button>`;
}

// ── Árvore ──
async function refreshTree() {
  els.tree.innerHTML = '<div class="vaults-empty">Carregando…</div>';
  try {
    const { tree } = await api(`/tree?vault=${encodeURIComponent(state.currentId)}`);
    state.tree = tree;
    state.noteIndex = new Map();
    (function index(nodes) {
      for (const n of nodes) {
        if (n.type === 'file') {
          const base = n.name.replace(/\.md$/i, '').toLowerCase();
          if (!state.noteIndex.has(base)) state.noteIndex.set(base, []);
          state.noteIndex.get(base).push(n.path);
        } else if (n.children) {
          index(n.children);
        }
      }
    })(tree);
    renderTree();
  } catch (e) {
    els.tree.innerHTML = `<div class="vaults-empty">Falha ao carregar: ${esc(e.message)}</div>`;
  }
}

function renderTree() {
  els.tree.innerHTML = '';
  els.tree.appendChild(buildTreeNodes(state.tree || []));
  if (state.openPath) highlightTreeRow(state.openPath);
}

function buildTreeNodes(nodes) {
  const ul = document.createElement('ul');
  ul.className = 'vaults-tree-list';
  for (const n of nodes) {
    const li = document.createElement('li');
    const row = document.createElement('div');
    row.className = `vaults-tree-row vaults-${n.type}`;
    row.dataset.path = n.path;
    row.innerHTML = n.type === 'dir'
      ? `<span class="vaults-caret">${ICONS.chevron}</span><span class="vaults-node-icon">${ICONS.folder}</span><span class="vaults-node-name">${svgifyEmoji(esc(n.name))}</span><span class="vaults-badge"></span>`
      : `<span class="vaults-node-icon">${ICONS.file}</span><span class="vaults-node-name">${svgifyEmoji(esc(n.name))}</span><span class="vaults-badge"></span>`;
    attachRowActions(row, n);
    li.appendChild(row);
    if (n.type === 'dir') {
      const kids = buildTreeNodes(n.children || []);
      kids.classList.add('vaults-collapsed');
      li.appendChild(kids);
      row.addEventListener('click', () => {
        kids.classList.toggle('vaults-collapsed');
        row.classList.toggle('vaults-open', !kids.classList.contains('vaults-collapsed'));
      });
    } else {
      row.addEventListener('click', () => openFile(n.path));
    }
    ul.appendChild(li);
  }
  return ul;
}

function attachRowActions(row, n) {
  const acts = document.createElement('span');
  acts.className = 'vaults-row-acts';
  acts.innerHTML = `<button class="vaults-row-btn" data-act="rename" title="Renomear/mover">${ICONS.pencil}</button>
    <button class="vaults-row-btn" data-act="delete" title="Apagar">${ICONS.trash}</button>`;
  row.appendChild(acts);
  acts.addEventListener('click', async (e) => {
    e.stopPropagation();
    const act = e.target.closest('[data-act]')?.dataset.act;
    try {
      if (act === 'rename') {
        const np = await styledPrompt('Novo caminho (relativo à vault):',
          { title: 'Renomear/mover', defaultValue: n.path, maxLength: 300 });
        if (!np || np === n.path) return;
        await api('/rename', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vault: state.currentId, path: n.path, new_path: np }),
        });
        if (state.openPath === n.path) state.openPath = np;
        await refreshTree();
        refreshGit();
      } else if (act === 'delete') {
        const isDir = n.type === 'dir';
        if (!(await styledConfirm(
          isDir ? `Apagar a pasta "${n.path}" e TODO o conteúdo?` : `Apagar "${n.path}"?`,
          { confirmText: 'Apagar', danger: true }))) return;
        await api(`/file?vault=${encodeURIComponent(state.currentId)}&path=${encodeURIComponent(n.path)}&recursive=${isDir}`,
          { method: 'DELETE' });
        if (state.openPath === n.path || (isDir && state.openPath?.startsWith(n.path + '/'))) {
          state.openPath = null;
          renderViewerEmpty();
        }
        await refreshTree();
        refreshGit();
      }
    } catch (err) {
      showError(`Falha: ${err.message}`);
    }
  });
}

function highlightTreeRow(relPath) {
  els.tree.querySelectorAll('.vaults-tree-row.vaults-active').forEach(r => r.classList.remove('vaults-active'));
  const row = els.tree.querySelector(`.vaults-tree-row[data-path="${CSS.escape(relPath)}"]`);
  if (!row) return;
  row.classList.add('vaults-active');
  let ul = row.closest('ul');
  while (ul && ul !== els.tree) {
    ul.classList.remove('vaults-collapsed');
    ul.parentElement.querySelector(':scope > .vaults-tree-row')?.classList.add('vaults-open');
    ul = ul.parentElement.closest('ul');
  }
}

// ── Wikilinks / markdown ──
const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

function resolveNote(name) {
  // Obsidian-style: match por basename; se o nome tiver '/', tenta sufixo do path.
  const clean = name.trim().replace(/\.md$/i, '');
  const cands = state.noteIndex.get(clean.split('/').pop().toLowerCase()) || [];
  if (!cands.length) return null;
  if (clean.includes('/')) {
    const suffix = (clean + '.md').toLowerCase();
    const hit = cands.find(p => p.toLowerCase().endsWith(suffix));
    if (hit) return hit;
  }
  return cands.slice().sort((a, b) => a.length - b.length)[0];
}

function rawUrl(relPath) {
  return `/api/vaultfs/raw?vault=${encodeURIComponent(state.currentId)}&path=${encodeURIComponent(relPath)}`;
}

function resolveRel(relDir, target) {
  // resolve caminho relativo à pasta da nota aberta (./, ../)
  const parts = (relDir ? relDir.split('/') : []).concat(target.split('/'));
  const out = [];
  for (const p of parts) {
    if (!p || p === '.') continue;
    if (p === '..') out.pop(); else out.push(p);
  }
  return out.join('/');
}

function findAsset(name) {
  // busca por basename em toda a árvore (anexos ficam em pastas próprias)
  let hit = null;
  (function walk(nodes) {
    for (const n of nodes) {
      if (hit) return;
      if (n.type === 'file' && n.name.toLowerCase() === name.toLowerCase()) hit = n.path;
      else if (n.children) walk(n.children);
    }
  })(state.tree || []);
  return hit;
}

function preprocessMd(src, relDir) {
  // ![[embed]] primeiro (senão o [[...]] captura)
  src = src.replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (m, target) => {
    const t = target.trim();
    if (IMG_EXT.test(t)) {
      const hit = findAsset(t.split('/').pop()) || resolveRel(relDir, t);
      return `<img class="vaults-embed" src="${rawUrl(hit)}" alt="${esc(t)}">`;
    }
    const note = resolveNote(t);
    return note
      ? `<a class="vaults-wikilink" data-vaults-open="${esc(note)}">${esc(t)}</a>`
      : `<a class="vaults-wikilink vaults-wikilink-missing" data-vaults-create="${esc(t)}">${esc(t)}</a>`;
  });
  src = src.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (m, target, alias) => {
    const label = (alias || target).trim();
    const note = resolveNote(target);
    return note
      ? `<a class="vaults-wikilink" data-vaults-open="${esc(note)}">${esc(label)}</a>`
      : `<a class="vaults-wikilink vaults-wikilink-missing" data-vaults-create="${esc(target.trim())}">${esc(label)}</a>`;
  });
  // imagens markdown com src relativo → rota raw
  src = src.replace(/!\[([^\]]*)\]\((?!https?:\/\/|\/|data:)([^)\s]+)\)/g,
    (m, alt, rel) => `![${alt}](${rawUrl(resolveRel(relDir, decodeURIComponent(rel)))})`);
  return src;
}

function relDirOf(p) {
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i);
}

// ── Dataview + bases do Obsidian (issue #2, read-only) ──
// Link renderer dos resultados: alvo não-nota (.base, anexo) resolve pela
// árvore, então clicar num [[X.base]] abre a base no painel.
function dvLinkHtml(path, label) {
  const target = path || findAsset(label);
  return target
    ? `<a class="vaults-wikilink" data-vaults-open="${esc(target)}">${esc(label)}</a>`
    : `<span class="vaults-wikilink vaults-wikilink-missing">${esc(label)}</span>`;
}

async function ensureMeta() {
  if (state.meta) return state.meta;
  const { notes } = await api(`/meta?vault=${encodeURIComponent(state.currentId)}`);
  state.meta = notes;
  return notes;
}

function renderDataviewBlocks() {
  const dvBlocks = els.viewer.querySelectorAll('code[data-lang="dataview"], code.language-dataview');
  const dvjsBlocks = els.viewer.querySelectorAll('code[data-lang="dataviewjs"], code.language-dataviewjs');
  dvjsBlocks.forEach(code => {
    const pre = code.closest('pre');
    if (!pre) return;
    const div = document.createElement('div');
    div.className = 'vaults-dv';
    div.innerHTML = `<div class="vaults-dv-warn">dataviewjs não é suportado (execução de JS arbitrário)</div>`;
    pre.replaceWith(div);
  });
  if (!dvBlocks.length) return;
  ensureMeta().then(notes => {
    const ctx = { notes, current: state.openPath, linkHtml: dvLinkHtml };
    dvBlocks.forEach(code => {
      const pre = code.closest('pre');
      if (!pre) return;
      const q = code.textContent;
      const div = document.createElement('div');
      div.className = 'vaults-dv';
      try {
        div.innerHTML = svgifyEmoji(runQuery(q, ctx).html);
      } catch (e) {
        div.innerHTML = `<div class="vaults-dv-warn">dataview: ${esc(e.message)}</div><pre class="vaults-dv-src">${esc(q)}</pre>`;
      }
      pre.replaceWith(div);
    });
    // inline queries do Dataview: `= this.campo` viram o valor avaliado
    els.viewer.querySelectorAll('.vaults-md code').forEach(code => {
      if (code.closest('pre')) return;
      const t = code.textContent.trim();
      if (!t.startsWith('=') || t.startsWith('==')) return;
      const span = document.createElement('span');
      span.className = 'vaults-dv-inline';
      try {
        span.innerHTML = svgifyEmoji(evalInline(t.slice(1).trim(), ctx));
      } catch (e) {
        span.className = 'vaults-dv-inline vaults-dv-inline-err';
        span.textContent = t;
        span.title = `dataview inline: ${e.message}`;
      }
      code.replaceWith(span);
    });
  }).catch(e => console.warn('vaults: meta indisponível', e));
}

async function openBase(relPath, viewIndex = null) {
  try {
    const [{ base }, notes] = await Promise.all([
      api(`/base?vault=${encodeURIComponent(state.currentId)}&path=${encodeURIComponent(relPath)}`),
      ensureMeta(),
    ]);
    state.openPath = relPath;
    state.mode = 'base';
    state.dirty = false;
    const viewKey = `odysseus-vaults-baseview:${state.currentId}:${relPath}`;
    if (viewIndex === null) {
      try { viewIndex = parseInt(localStorage.getItem(viewKey) || '0', 10) || 0; } catch (_) { viewIndex = 0; }
    }
    highlightTreeRow(relPath);
    const r = runBase(base, { notes, current: relPath, linkHtml: dvLinkHtml }, viewIndex);
    try { localStorage.setItem(viewKey, String(r.viewIndex)); } catch (_) {}
    const pills = r.views.map((v, i) =>
      `<button class="vaults-view-pill${i === r.viewIndex ? ' vaults-view-active' : ''}"
        data-vaults-baseview="${i}" title="view ${esc(v.type)}">${esc(v.name)}</button>`).join('');
    els.viewer.innerHTML = `<div class="vaults-viewbar">
        <span class="vaults-open-name">${esc(relPath)}</span>
      </div>
      ${r.views.length > 1 ? `<div class="vaults-view-pills">${pills}</div>` : ''}`
      + (r.warns.length
        ? `<div class="vaults-dv-warn">Não suportado (ignorado): ${esc([...new Set(r.warns)].join(' · ').slice(0, 400))}</div>`
        : '')
      + svgifyEmoji(r.html);
  } catch (e) {
    showError(`base: ${e.message}`);
  }
}

// ── Frontmatter (issue #4): oculto no view, barra Properties expansível ──
function splitFrontmatter(src) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  if (!m) return { props: null, body: src };
  return { props: m[1], body: src.slice(m[0].length) };
}

function parseProps(yamlText) {
  // Parse raso: `chave: valor` + listas `- item` (suficiente pra exibição).
  const out = [];
  let cur = null;
  for (const line of yamlText.split(/\r?\n/)) {
    const kv = /^([^\s:][^:]*):\s*(.*)$/.exec(line);
    const li = /^\s+-\s*(.*)$/.exec(line) || /^-\s*(.*)$/.exec(line);
    if (kv) {
      cur = { key: kv[1].trim(), value: kv[2].trim() };
      out.push(cur);
    } else if (li && cur) {
      cur.value = (cur.value ? cur.value + ', ' : '') + li[1].trim();
    }
  }
  return out;
}

function propsBarHtml(propsText) {
  const props = parseProps(propsText);
  const rows = props.map(p => `<tr><td class="vaults-prop-k">${esc(p.key)}</td><td>${esc(p.value)}</td></tr>`).join('');
  return `<div class="vaults-props">
      <div class="vaults-props-head" data-vaults-props-toggle>
        <span class="vaults-sec-chev">${ICONS.chevron}</span>
        <span>Properties</span><span class="vaults-sec-badge">${props.length}</span>
      </div>
      <div class="vaults-props-body"><table>${rows}</table></div>
    </div>`;
}

// ── Viewer/editor ──
async function openFile(relPath) {
  if (state.dirty && !(await styledConfirm('Há edição não salva. Descartar?', { danger: true }))) return;
  state.dirty = false;
  if (relPath.toLowerCase().endsWith('.base')) return openBase(relPath);
  try {
    const f = await api(`/file?vault=${encodeURIComponent(state.currentId)}&path=${encodeURIComponent(relPath)}`);
    state.openPath = relPath;
    state.openMtime = f.mtime;
    state.mode = 'view';
    state.content = f.content;
    highlightTreeRow(relPath);
    renderViewer();
  } catch (e) {
    if (e.status === 400 && IMG_EXT.test(relPath)) {
      state.openPath = relPath;
      state.mode = 'image';
      highlightTreeRow(relPath);
      renderViewer();
    } else {
      showError(`Falha ao abrir: ${e.message}`);
    }
  }
}

function renderViewer() {
  if (state.mode === 'image') {
    els.viewer.innerHTML = `<div class="vaults-viewbar"><span class="vaults-open-name">${esc(state.openPath)}</span></div>
      <img class="vaults-embed" src="${rawUrl(state.openPath)}">`;
    return;
  }
  const bar = `<div class="vaults-viewbar">
      <span class="vaults-open-name" title="${esc(state.openPath || '')}">${esc(state.openPath || '')}</span>
      <button class="vaults-btn" data-vaults-mode="${state.mode === 'view' ? 'edit' : 'view'}">
        ${state.mode === 'view' ? 'Editar' : 'Visualizar'}</button>
      ${state.mode === 'edit' ? '<button class="vaults-btn vaults-save-btn">Salvar</button>' : ''}
      <span class="vaults-dirty" style="display:${state.dirty ? '' : 'none'}" title="Não salvo">●</span>
    </div>`;
  if (state.mode === 'view') {
    const { props, body } = splitFrontmatter(state.content);
    els.viewer.innerHTML = bar
      + (props ? svgifyEmoji(propsBarHtml(props)) : '')
      + `<div class="vaults-md">${mdToHtml(preprocessMd(body, relDirOf(state.openPath || '')))}</div>`;
    renderDataviewBlocks();
  } else {
    els.viewer.innerHTML = bar + `<textarea class="vaults-editor" spellcheck="false"></textarea>`;
    const ta = els.viewer.querySelector('.vaults-editor');
    ta.value = state.content;
    ta.addEventListener('input', () => {
      state.content = ta.value;
      if (!state.dirty) {
        state.dirty = true;
        const dot = els.viewer.querySelector('.vaults-dirty');
        if (dot) dot.style.display = '';
      }
    });
    ta.focus();
  }
}

async function saveFile(force = false) {
  if (!state.openPath || state.mode !== 'edit') return;
  try {
    const r = await api('/file', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vault: state.currentId, path: state.openPath,
        content: state.content, base_mtime: state.openMtime, force,
      }),
    });
    state.openMtime = r.mtime;
    state.dirty = false;
    state.meta = null; // frontmatter pode ter mudado → dataview/bases releem
    const dot = els.viewer.querySelector('.vaults-dirty');
    if (dot) dot.style.display = 'none';
    showToast('Salvo');
    refreshGit();
  } catch (e) {
    if (e.status === 409 && e.detail?.code === 'mtime_conflict') {
      const ok = await styledConfirm(
        'O arquivo mudou no disco desde que você abriu (editado no Obsidian?). Sobrescrever mesmo assim?',
        { confirmText: 'Sobrescrever', danger: true, alternateText: 'Recarregar do disco', title: 'Conflito' });
      if (ok === true) return saveFile(true);
      if (ok === 'alternate') {
        state.dirty = false;
        openFile(state.openPath);
      }
    } else {
      showError(`Falha ao salvar: ${e.message}`);
    }
  }
}

function wireViewerClicks() {
  els.viewer.addEventListener('click', async (e) => {
    const propsToggle = e.target.closest('[data-vaults-props-toggle]');
    if (propsToggle) {
      propsToggle.closest('.vaults-props').classList.toggle('vaults-props-open');
      return;
    }
    const open = e.target.closest('[data-vaults-open]');
    if (open) { openFile(open.dataset.vaultsOpen); return; }
    const create = e.target.closest('[data-vaults-create]');
    if (create) {
      const name = create.dataset.vaultsCreate;
      if (await styledConfirm(`Criar a nota "${name}"?`, { confirmText: 'Criar' })) {
        const path = name.endsWith('.md') ? name : `${name}.md`;
        try {
          await api('/file', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vault: state.currentId, path, kind: 'file', content: `# ${name}\n` }),
          });
          await refreshTree();
          openFile(path);
          refreshGit();
        } catch (err) {
          showError(`Falha ao criar: ${err.message}`);
        }
      }
      return;
    }
    const bview = e.target.closest('[data-vaults-baseview]');
    if (bview && state.mode === 'base') {
      openBase(state.openPath, parseInt(bview.dataset.vaultsBaseview, 10));
      return;
    }
    const mode = e.target.closest('[data-vaults-mode]');
    if (mode) {
      state.mode = mode.dataset.vaultsMode;
      renderViewer();
      return;
    }
    if (e.target.closest('.vaults-save-btn')) saveFile();
  });
}

// ── Git ──
async function refreshGit() {
  if (!state.currentId) return;
  try {
    state.git = await api(`/git/status?vault=${encodeURIComponent(state.currentId)}`);
  } catch (e) {
    state.git = null;
    els.git.innerHTML = `<div class="vaults-git-sec vaults-git-err">git: ${esc(e.message)}</div>`;
    applyTreeBadges();
    return;
  }
  renderGit();
  applyTreeBadges();
}

function gitOp(route, body) {
  return api(`/git/${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vault: state.currentId, ...body }),
  }).then(r => {
    refreshGit();
    return r;
  }).catch(e => {
    showError(`git ${route}: ${e.message}`);
    refreshGit();
    throw e;
  });
}

// Seções colapsáveis estilo VS Code (issue #5), estado por seção no localStorage.
const SEC_KEY = k => `odysseus-vaults-sec:${k}`;
function secOpen(k, def = true) {
  try {
    const v = localStorage.getItem(SEC_KEY(k));
    return v === null ? def : v === '1';
  } catch (_) { return def; }
}

function gitSection(key, title, badge, bodyHtml) {
  const open = secOpen(key);
  return `<div class="vaults-sec${open ? ' vaults-sec-open' : ''}" data-sec="${key}">
      <div class="vaults-sec-head" data-sec-toggle="${key}">
        <span class="vaults-sec-chev">${ICONS.chevron}</span>
        <span class="vaults-sec-title">${title}</span>
        ${badge ? `<span class="vaults-sec-badge">${badge}</span>` : ''}
      </div>
      <div class="vaults-sec-body">${bodyHtml}</div>
    </div>`;
}

function chgRow(p, code, cls, staged, acts) {
  const i = p.lastIndexOf('/');
  const name = i < 0 ? p : p.slice(i + 1);
  const dir = i < 0 ? '' : p.slice(0, i);
  return `<div class="vaults-chg" data-path="${esc(p)}" data-staged="${staged}">
      <span class="vaults-chg-name" data-git="diff" title="${esc(p)}">${esc(name)}</span>
      ${dir ? `<span class="vaults-chg-dir">${esc(dir)}</span>` : ''}
      <span class="vaults-chg-acts">${acts}</span>
      <span class="vaults-chg-code ${cls}">${esc(code)}</span>
    </div>`;
}

function renderGit() {
  const g = state.git;
  const n = g?.has_git ? g.staged.length + g.unstaged.length + g.untracked.length : 0;
  const tabBadge = els.panel?.querySelector('.vaults-git-badge');
  if (tabBadge) {
    tabBadge.textContent = String(n);
    tabBadge.style.display = n ? '' : 'none';
  }
  if (!g) { els.git.innerHTML = ''; return; }
  if (!g.has_git) {
    els.git.innerHTML = `<div class="vaults-git-sec">
      <button class="vaults-btn" data-git="init">${ICONS.branch}<span>Inicializar repositório git</span></button></div>`;
    return;
  }
  const syncLabel = `${g.ahead ? g.ahead + '↑' : ''}${g.behind ? ' ' + g.behind + '↓' : ''}`.trim();
  const stagedRows = g.staged.map(c => chgRow(c.path, c.code, 'vaults-b-staged', true,
    `<button class="vaults-row-btn" data-git="unstage" title="Unstage">${ICONS.minus}</button>`)).join('');
  const changeRows = [
    ...g.unstaged.map(c => chgRow(c.path, c.code, 'vaults-b-mod', false,
      `<button class="vaults-row-btn" data-git="stage" title="Stage">${ICONS.plus}</button><button class="vaults-row-btn" data-git="discard" title="Descartar mudanças">${ICONS.discard}</button>`)),
    ...g.untracked.map(p => chgRow(p, 'U', 'vaults-b-new', false,
      `<button class="vaults-row-btn" data-git="stage" title="Stage">${ICONS.plus}</button><button class="vaults-row-btn" data-git="discard" title="Apagar (untracked)">${ICONS.discard}</button>`)),
  ].join('');
  const changesBody = `
      <textarea class="vaults-commit-msg" placeholder="Mensagem (Ctrl+Enter pra commitar)" rows="2"></textarea>
      <div class="vaults-commit-row">
        <button class="vaults-commit-btn" data-git="commit">${ICONS.check}<span>Commit</span></button>
        <label class="vaults-amend" title="Emendar o último commit"><input type="checkbox" class="vaults-amend-cb"> amend</label>
        <button class="vaults-row-btn" data-git="undo" title="Desfazer último commit (reset soft)">${ICONS.undo}</button>
      </div>
      ${stagedRows ? `<div class="vaults-chg-group">Staged Changes</div>${stagedRows}` : ''}
      ${changeRows ? `<div class="vaults-chg-group">Changes</div>${changeRows}`
        : (stagedRows ? '' : '<div class="vaults-git-clean">✓ working tree limpo</div>')}`;
  els.git.innerHTML = `
    <div class="vaults-branch-row">
      <span class="vaults-branch" data-git="branches" title="Trocar/criar branch">${ICONS.branch}<span>${esc(g.branch || '?')}</span></span>
      <span class="vaults-sync" title="ahead/behind do upstream">${syncLabel}</span>
      <button class="vaults-row-btn" data-git="pull" title="Pull (ff-only)">${ICONS.down}</button>
      <button class="vaults-row-btn" data-git="push" title="Push">${ICONS.up}</button>
      <button class="vaults-row-btn" data-git="fetch" title="Fetch">${ICONS.refresh}</button>
    </div>
    ${gitSection('changes', 'Changes', n, changesBody)}
    ${gitSection('graph', 'Graph', null, '<div class="vaults-graph-host"></div>')}`;
  state.graphLoaded = false;
  maybeLoadGraph();
}

function maybeLoadGraph(limit = 150) {
  if (!state.git?.has_git || state.graphLoaded) return;
  if (els.nav?.dataset.tab !== 'git' || !secOpen('graph')) return;
  const host = els.git.querySelector('.vaults-graph-host');
  if (!host) return;
  state.graphLoaded = true;
  api(`/git/graph?vault=${encodeURIComponent(state.currentId)}&limit=${limit}`)
    .then(({ commits }) => {
      renderCommitGraph(host, commits, openCommit, { compact: true });
      if (commits.length >= limit) {
        const more = document.createElement('button');
        more.className = 'vaults-btn vaults-graph-more';
        more.textContent = 'mais commits';
        more.addEventListener('click', () => {
          state.graphLoaded = false;
          maybeLoadGraph(limit + 300);
        });
        host.appendChild(more);
      }
    })
    .catch(e => {
      state.graphLoaded = false;
      host.innerHTML = `<div class="vaults-git-err">${esc(e.message)}</div>`;
    });
}

function applyTreeBadges() {
  const g = state.git;
  const map = new Map();
  if (g?.has_git) {
    for (const c of g.unstaged) map.set(c.path, { code: c.code, cls: 'vaults-b-mod', row: 'vaults-row-mod' });
    for (const c of g.staged) if (!map.has(c.path)) map.set(c.path, { code: c.code, cls: 'vaults-b-staged', row: 'vaults-row-staged' });
    for (const p of g.untracked) map.set(p, { code: 'U', cls: 'vaults-b-new', row: 'vaults-row-new' });
  }
  const changedKeys = [...map.keys()];
  els.tree.querySelectorAll('.vaults-tree-row').forEach(rowEl => {
    const badge = rowEl.querySelector('.vaults-badge');
    if (!badge) return;
    rowEl.classList.remove('vaults-row-mod', 'vaults-row-staged', 'vaults-row-new');
    const p = rowEl.dataset.path;
    const hit = map.get(p);
    if (hit) {
      badge.textContent = hit.code;
      badge.className = `vaults-badge ${hit.cls}`;
      rowEl.classList.add(hit.row);
    } else {
      // pasta ancestral de alguma mudança → nome colorido + dot (estilo VS Code)
      const isDirWithChange = rowEl.classList.contains('vaults-dir')
        && changedKeys.some(k => k.startsWith(p + '/'));
      badge.textContent = isDirWithChange ? '•' : '';
      badge.className = 'vaults-badge' + (isDirWithChange ? ' vaults-b-mod' : '');
      if (isDirWithChange) rowEl.classList.add('vaults-row-mod');
    }
  });
}

// ── Diff no viewer ──
function renderDiffText(text) {
  if (!text.trim()) {
    return '<div class="vaults-empty">Sem diferenças registradas (arquivo novo ainda não rastreado?)</div>';
  }
  return '<pre class="vaults-diff">' + text.split('\n').map(l => {
    const c = l.startsWith('+') && !l.startsWith('+++') ? 'vaults-dl-add'
      : l.startsWith('-') && !l.startsWith('---') ? 'vaults-dl-del'
      : l.startsWith('@@') ? 'vaults-dl-hunk'
      : (l.startsWith('diff ') || l.startsWith('commit ')) ? 'vaults-dl-head' : '';
    return `<span class="${c}">${esc(l)}</span>`;
  }).join('\n') + '</pre>';
}

async function fetchDiffText(params) {
  const q = new URLSearchParams({ vault: state.currentId, ...params });
  const r = await fetch(`/api/vaultfs/git/diff?${q}`);
  if (!r.ok) throw new Error(await r.text());
  return r.text();
}

async function openDiff(path, { staged = false } = {}) {
  try {
    const text = await fetchDiffText({ path, staged: String(staged) });
    state.mode = 'diff';
    els.viewer.innerHTML = `<div class="vaults-viewbar">
        <span class="vaults-open-name">diff${staged ? ' (staged)' : ''}: ${esc(path)}</span>
        <button class="vaults-btn" data-vaults-open="${esc(path)}">Abrir nota</button>
      </div>` + renderDiffText(text);
  } catch (e) {
    showError(`diff: ${e.message}`);
  }
}

async function openCommit(hash) {
  try {
    const text = await fetchDiffText({ commit: hash });
    state.mode = 'diff';
    els.viewer.innerHTML = `<div class="vaults-viewbar">
        <span class="vaults-open-name">commit ${esc(hash.slice(0, 10))}</span>
      </div>` + renderDiffText(text);
  } catch (e) {
    showError(`commit: ${e.message}`);
  }
}

// ── Delegated handler do strip git ──
function wireGitClicks() {
  els.git.addEventListener('click', async (e) => {
    const secT = e.target.closest('[data-sec-toggle]');
    if (secT) {
      const sec = secT.closest('.vaults-sec');
      const open = sec.classList.toggle('vaults-sec-open');
      try { localStorage.setItem(SEC_KEY(secT.dataset.secToggle), open ? '1' : '0'); } catch (_) {}
      if (open && secT.dataset.secToggle === 'graph') maybeLoadGraph();
      return;
    }
    const el = e.target.closest('[data-git]');
    if (!el) return;
    const action = el.dataset.git;
    const chg = e.target.closest('.vaults-chg');
    const p = chg?.dataset.path;
    try {
      if (action === 'stage' || action === 'unstage') {
        await gitOp(action, { paths: [p] });
      } else if (action === 'discard') {
        if (await styledConfirm(`Descartar as mudanças de "${p}"? (untracked será apagado)`,
          { confirmText: 'Descartar', danger: true })) {
          await gitOp('discard', { paths: [p] });
          if (state.openPath === p) openFile(p);
        }
      } else if (action === 'diff') {
        openDiff(p, { staged: chg?.dataset.staged === 'true' });
      } else if (action === 'commit') {
        const msg = els.git.querySelector('.vaults-commit-msg')?.value || '';
        const amend = !!els.git.querySelector('.vaults-amend-cb')?.checked;
        if (!msg.trim() && !amend) { showError('Escreva a mensagem de commit.'); return; }
        await gitOp('commit', { message: msg, amend });
        showToast(amend ? 'Commit emendado' : 'Commit criado');
      } else if (action === 'undo') {
        if (await styledConfirm('Desfazer o último commit? (reset soft — as mudanças voltam pro stage)',
          { confirmText: 'Desfazer', danger: true })) {
          await gitOp('undo_commit', {});
        }
      } else if (action === 'push' || action === 'pull' || action === 'fetch') {
        el.disabled = true;
        el.classList.add('vaults-busy');
        try {
          const r = await gitOp(action, {});
          showToast(`${action}: ok${r.output ? '' : ''}`);
        } finally {
          el.disabled = false;
          el.classList.remove('vaults-busy');
        }
      } else if (action === 'branches') {
        openBranchMenu(el);
      } else if (action === 'init') {
        await gitOp('init', {});
        showToast('Repositório git inicializado');
      }
    } catch (_) { /* gitOp já mostrou o erro */ }
  });
}

async function openBranchMenu(anchor) {
  document.querySelector('.vaults-branch-menu')?.remove();
  let branches;
  try {
    ({ branches } = await api(`/git/branches?vault=${encodeURIComponent(state.currentId)}`));
  } catch (e) {
    showError(`branches: ${e.message}`);
    return;
  }
  const menu = document.createElement('div');
  menu.className = 'dropdown vaults-branch-menu';
  menu.innerHTML = branches.map(b => `
      <div class="dropdown-item vaults-branch-item${b.current ? ' vaults-branch-current' : ''}"
        data-branch="${esc(b.name)}">${b.current ? '✓ ' : ''}${esc(b.name)}</div>`).join('')
    + `<div class="dropdown-item vaults-branch-item vaults-branch-new">＋ nova branch…</div>`;
  const r = anchor.getBoundingClientRect();
  menu.style.cssText = `position:fixed; left:${Math.max(8, r.right - 200)}px; top:${r.bottom + 4}px;`
    + 'display:block; z-index:400; min-width:180px; max-height:50vh; overflow-y:auto;';
  document.body.appendChild(menu);
  // Escape fecha SÓ o menu (LIFO do escMenuStack), não o painel inteiro.
  let unregister = () => {};
  const closeMenu = () => {
    menu.remove();
    unregister();
    document.removeEventListener('click', closeMenu);
  };
  menu._dismiss = closeMenu;
  unregister = registerMenuDismiss(closeMenu);
  setTimeout(() => document.addEventListener('click', closeMenu, { once: true }), 0);
  menu.addEventListener('click', async (e) => {
    const item = e.target.closest('.vaults-branch-item');
    if (!item) return;
    closeMenu();
    if (item.classList.contains('vaults-branch-new')) {
      const name = await styledPrompt('Nome da nova branch:', { title: 'Nova branch', maxLength: 120 });
      if (name) await gitOp('checkout', { branch: name, create: true });
    } else if (!item.classList.contains('vaults-branch-current')) {
      await gitOp('checkout', { branch: item.dataset.branch });
    }
  });
}


// ── My Tasks (Obsidian Tasks) ──
const TODAY = () => new Date().toISOString().slice(0, 10);

async function loadTasks(force = false) {
  if (!state.currentId || !els.tasks) return;
  if (state.tasks && !force) { renderTasks(); return; }
  els.tasks.innerHTML = '<div class="vaults-empty">Carregando…</div>';
  try {
    const { tasks } = await api(`/tasks?vault=${encodeURIComponent(state.currentId)}`);
    state.tasks = tasks;
  } catch (e) {
    els.tasks.innerHTML = `<div class="vaults-git-err">tasks: ${esc(e.message)}</div>`;
    return;
  }
  renderTasks();
}

function taskRow(t) {
  const done = t.status === 'x' || t.status === 'X';
  const cancelled = t.status === '-';
  const chips = [
    t.due ? `<span class="vaults-task-chip vaults-task-due${t.due < TODAY() && !done && !cancelled ? ' vaults-task-late' : ''}">📅 ${t.due}</span>` : '',
    t.scheduled ? `<span class="vaults-task-chip">⏳ ${t.scheduled}</span>` : '',
    t.priority ? `<span class="vaults-task-chip vaults-task-pri-${t.priority}">${
      { highest: '🔺', high: '⏫', medium: '🔼', low: '🔽', lowest: '⏬' }[t.priority]}</span>` : '',
    t.recurrence ? `<span class="vaults-task-chip">🔁</span>` : '',
  ].join('');
  const noteName = t.path.split('/').pop().replace(/\.md$/i, '');
  return svgifyEmoji(`<div class="vaults-task${done ? ' vaults-task-done' : ''}${cancelled ? ' vaults-task-cancelled' : ''}"
      data-path="${esc(t.path)}" data-line="${t.line}">
      <input type="checkbox" class="vaults-task-cb" ${done ? 'checked' : ''} ${cancelled ? 'disabled' : ''}>
      <span class="vaults-task-text" title="${esc(t.text)}">${esc(t.text)}</span>
      ${chips}
      <a class="vaults-task-note" data-vaults-tasknote="${esc(t.path)}" title="${esc(t.path)}">${esc(noteName)}</a>
    </div>`);
}

function tasksSection(key, title, items) {
  if (!items.length) return '';
  return gitSection(key, title, items.length, items.map(taskRow).join(''));
}

function renderTasks() {
  const all = state.tasks || [];
  const today = TODAY();
  const pending = all.filter(t => t.status !== 'x' && t.status !== 'X' && t.status !== '-');
  const done = all.filter(t => t.status === 'x' || t.status === 'X');
  const badge = els.panel?.querySelector('.vaults-tasks-badge');
  if (badge) {
    badge.textContent = String(pending.length);
    badge.style.display = pending.length ? '' : 'none';
  }
  const byDue = f => pending.filter(f).sort((a, b) =>
    (a.due || '9999').localeCompare(b.due || '9999') || a.path.localeCompare(b.path));
  els.tasks.innerHTML = `
    <div class="vaults-tasks-bar">
      <span class="vaults-tasks-title">My Tasks</span>
      <label class="vaults-amend"><input type="checkbox" class="vaults-tasks-showdone"
        ${state.showDoneTasks ? 'checked' : ''}> concluídas</label>
      <button class="vaults-row-btn" data-tasks-refresh title="Recarregar">${ICONS.refresh}</button>
    </div>`
    + tasksSection('tasks-late', 'Atrasadas', byDue(t => t.due && t.due < today))
    + tasksSection('tasks-today', 'Hoje', byDue(t => t.due === today))
    + tasksSection('tasks-next', 'Próximas', byDue(t => t.due && t.due > today))
    + tasksSection('tasks-nodate', 'Sem data', byDue(t => !t.due))
    + (state.showDoneTasks ? tasksSection('tasks-done', 'Concluídas',
        done.sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''))) : '')
    + (!pending.length && !state.showDoneTasks
        ? '<div class="vaults-empty">Nenhuma tarefa pendente 🎉</div>' : '');
}

function wireTasksClicks() {
  els.tasks.addEventListener('click', async (e) => {
    const secT = e.target.closest('[data-sec-toggle]');
    if (secT) {
      const open = secT.closest('.vaults-sec').classList.toggle('vaults-sec-open');
      try { localStorage.setItem(SEC_KEY(secT.dataset.secToggle), open ? '1' : '0'); } catch (_) {}
      return;
    }
    if (e.target.closest('[data-tasks-refresh]')) { loadTasks(true); return; }
    if (e.target.classList.contains('vaults-tasks-showdone')) {
      state.showDoneTasks = e.target.checked;
      renderTasks();
      return;
    }
    const note = e.target.closest('[data-vaults-tasknote]');
    if (note) { openFile(note.dataset.vaultsTasknote); return; }
    if (e.target.classList.contains('vaults-task-cb')) {
      const row = e.target.closest('.vaults-task');
      const path = row.dataset.path;
      const line = parseInt(row.dataset.line, 10);
      const doneNow = e.target.checked;
      try {
        const r = await api('/tasks/toggle', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vault: state.currentId, path, line, done: doneNow }),
        });
        const i = (state.tasks || []).findIndex(t => t.path === path && t.line === line);
        if (i >= 0) state.tasks[i] = r.task;
        state.meta = null;
        renderTasks();
        refreshGit();
        showToast(doneNow ? 'Tarefa concluída ✅' : 'Tarefa reaberta');
      } catch (err) {
        if (err.detail?.code === 'task_moved') {
          showError('A nota mudou no disco — recarregando as tarefas.');
          loadTasks(true);
        } else {
          showError(`tasks: ${err.message}`);
          e.target.checked = !doneNow;
        }
      }
    }
  });
}

// ── Obsidian Sync (container oficial, toggle liga/desliga) ──
async function refreshSyncStatus() {
  if (!els.syncBtn) return;
  try {
    state.sync = await api('/obsidian-sync');
  } catch (_) {
    state.sync = { available: false };
  }
  const s = state.sync;
  els.syncBtn.classList.toggle('vaults-sync-on', !!s.running);
  els.syncBtn.classList.toggle('vaults-sync-unavailable', !s.available);
  els.syncBtn.title = !s.available
    ? 'Obsidian Sync: indisponível (socket docker não montado — ver LOCAL_CHANGES.md)'
    : !s.installed
      ? 'Obsidian Sync: container ainda não criado — clique pra ver como ativar'
      : s.running
        ? `Obsidian Sync: ATIVO (cliente oficial em background) — clique pra desativar. Primeira configuração: ${s.ui_url}`
        : 'Obsidian Sync: desativado — clique pra ativar';
}

async function onSyncClick() {
  const s = state.sync || {};
  if (!s.available) {
    showError('Socket do docker não está montado no container — veja o item do Obsidian Sync no LOCAL_CHANGES.md.');
    return;
  }
  if (!s.installed) {
    await styledConfirm(
      'O container do Obsidian ainda não foi criado. Rode no host:\n\n'
      + 'docker compose --profile obsidian-sync up -d obsidian\n\n'
      + `Depois abra ${s.ui_url} uma vez pra logar na sua conta do Obsidian Sync.`,
      { confirmText: 'Entendi', cancelText: 'Fechar', title: 'Obsidian Sync' });
    return;
  }
  const enable = !s.running;
  if (!(await styledConfirm(
    enable
      ? 'Ativar o Obsidian Sync? O cliente oficial roda em background no container e sincroniza a vault.'
      : 'Desativar o Obsidian Sync? O container é parado e a sincronização pausa.',
    { confirmText: enable ? 'Ativar' : 'Desativar', title: 'Obsidian Sync', danger: !enable }))) return;
  try {
    await api('/obsidian-sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enable }),
    });
    showToast(enable ? 'Obsidian Sync ativado' : 'Obsidian Sync desativado');
  } catch (e) {
    showError(`Obsidian Sync: ${e.message}`);
  }
  refreshSyncStatus();
}

// ── Sidebar ──
async function initSidebar() {
  const list = document.getElementById('vaults-list');
  if (!list) return;
  try {
    const { vaults } = await api('/vaults');
    state.vaults = vaults;
    list.innerHTML = '';
    for (const v of vaults) {
      const item = document.createElement('div');
      item.className = 'list-item vaults-side-item' + (v.exists ? '' : ' vaults-missing');
      item.title = v.exists ? v.path : `Pasta não encontrada: ${v.path}`;
      item.innerHTML = `${VAULT_ICON_SVG.replace('<svg ', '<svg style="flex-shrink:0;opacity:0.5;" ')}<span class="grow">${esc(v.name)}</span>`;
      if (v.exists) item.addEventListener('click', () => openVault(v.id));
      list.appendChild(item);
    }
    const section = document.getElementById('vaults-section');
    if (section && !vaults.length) section.style.display = 'none';
  } catch (e) {
    console.warn('vaults: falha ao listar', e);
  }
}

if (document.readyState !== 'loading') initSidebar();
else document.addEventListener('DOMContentLoaded', initSidebar);
