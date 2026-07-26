// static/js/vaults.js — Vaults (sessões do Obsidian) + tool Files (fork-local)
//
// Seção "Vaults" no sidebar: cada vault abre a SUA sessão do Obsidian
// oficial (container por vault, iframe KasmVNC). O tool "Files" (em Tools)
// é o File Browser: raízes configuráveis, árvore lazy, favoritos, preview
// universal (md c/ Dataview, código, imagem, PDF, mídia) e git estilo VS Code.
import { applyEdgeDock } from './modalSnap.js';
import { snapModalToZone } from './tileManager.js';
import * as Modals from './modalManager.js';
import { makeWindowDraggable } from './windowDrag.js';
import { showToast, showError, styledConfirm, styledPrompt, esc } from './ui.js';
import { mdToHtml, svgifyEmoji } from './markdown.js';
import { renderCommitGraph } from './vaultsGraph.js';
import { registerMenuDismiss } from './escMenuStack.js';
import { runQuery, runBase, evalInline } from './vaultsDataview.js';

const PANEL_ID = 'files-panel';
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
  gem: FI('<polygon points="6 3 18 3 22 9 12 22 2 9"/><path d="M2 9h20"/><path d="M12 22 8 9l4-6 4 6-4 13"/>', 13),
  layout: FI('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/>', 13),
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
          <span class="vaults-title">Files</span>
          <button class="vaults-snapbtn" title="Posicionar na tela">${ICONS.layout}</button>
          <button class="close-btn" aria-label="Close files">✖</button>
        </div>
        <div class="vaults-body">
          <div class="vaults-viewer"></div>
          <div class="vaults-nav" data-tab="browser">
            <div class="vaults-tabs">
              <button class="vaults-tab" data-vaults-tab="browser">Browser</button>
              <button class="vaults-tab" data-vaults-tab="git">Git<span class="vaults-tab-badge vaults-git-badge" style="display:none"></span></button>
            </div>
            <div class="vaults-tabpane vaults-pane-browser">
              <div class="vaults-toolbar"></div>
              <div class="vaults-favs"></div>
              <div class="vaults-tree"></div>
            </div>
            <div class="vaults-tabpane vaults-pane-git">
              <div class="vaults-git"></div>
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
    els.favs = panel.querySelector('.vaults-favs');
    // Abas Browser | Git (estilo VS Code)
    const setTab = (t) => {
      els.nav.dataset.tab = t;
      els.nav.querySelectorAll('.vaults-tab').forEach(b =>
        b.classList.toggle('active', b.dataset.vaultsTab === t));
      try { localStorage.setItem('odysseus-vaults-tab', t); } catch (_) {}
      if (t === 'git') maybeLoadGraph();
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
    wireSnapControls(panel);
    panel.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
      }
    });
    wireViewerClicks();
    wireGitClicks();
    els.favs.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-fav]');
      if (chip) openFav(getFavs()[parseInt(chip.dataset.fav, 10)]);
    });
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
        if ('vaultsAddroot' in btn.dataset) {
          const p = await styledPrompt('Caminho ABSOLUTO da pasta (no container — ex: /app/vaults/x ou /app/data):',
            { title: 'Nova raiz', maxLength: 300 });
          if (!p) return;
          const extras = state.vaults.filter(v => !v.is_vault).map(v => v.path).concat([p]);
          await saveRoots(extras);
          renderToolbar();
          const added = state.vaults.find(v => v.path === p || v.path === p.replace(/\/$/, ''));
          if (added) openRoot(added.id);
        } else if ('vaultsDelroot' in btn.dataset) {
          const cur = state.vaults.find(v => v.id === state.currentId);
          if (!cur || cur.is_vault) {
            showError('Só raízes adicionadas (não-vault) podem ser removidas.');
            return;
          }
          if (!(await styledConfirm(`Remover a raiz "${cur.name}" do Files? (a pasta não é apagada)`,
            { confirmText: 'Remover', danger: true }))) return;
          const extras = state.vaults.filter(v => !v.is_vault && v.id !== cur.id).map(v => v.path);
          await saveRoots(extras);
          const next = state.vaults.find(v => v.exists);
          if (next) openRoot(next.id);
        } else if (btn.dataset.vaultsNew) {
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
      label: 'Files',
      icon: FI('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>', 14),
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

async function openRoot(id) {
  const panel = buildPanel();
  if (state.dirty && state.currentId && state.currentId !== id) {
    if (!(await styledConfirm('Há edição não salva. Descartar?', { danger: true }))) return;
    state.dirty = false;
  }
  const switching = state.currentId !== id;
  state.currentId = id;
  try { localStorage.setItem('odysseus-files-root', id); } catch (_) {}
  const v = state.vaults.find(x => x.id === id);
  els.title.textContent = v ? `Files — ${v.name}` : 'Files';
  panel.classList.remove('hidden', 'modal-minimized');
  if (!panel.classList.contains('modal-right-docked')) {
    try {
      if (!localStorage.getItem(`odysseus-edge-dock-width:right:${PANEL_ID}`) && !els.content._userDockWidth) {
        els.content._userDockWidth = Math.min(1000, Math.round(window.innerWidth * 0.55));
      }
    } catch (_) {}
    applyEdgeDock(panel, 'right');
  }
  renderToolbar();
  renderFavs();
  if (switching) {
    state.openPath = null;
    state.git = null;
    state.meta = null;
    state.assets = null;
    state.noteIndex = new Map();
    renderViewerEmpty();
  }
  await refreshTree();
  await refreshGit();
}

function renderViewerEmpty() {
  els.viewer.innerHTML = '<div class="vaults-empty">Selecione uma nota na árvore →</div>';
}

function renderToolbar() {
  const opts = state.vaults.filter(v => v.exists).map(v =>
    `<option value="${esc(v.id)}"${v.id === state.currentId ? ' selected' : ''}>${esc(v.name)}${v.is_vault ? ' ⛨' : ''}</option>`).join('');
  els.toolbar.innerHTML = `
    <select class="vaults-root-sel" title="Raiz atual">${opts}</select>
    <button class="vaults-btn vaults-btn-icon" data-vaults-addroot title="Adicionar pasta como raiz">${ICONS.plus}</button>
    <button class="vaults-btn vaults-btn-icon" data-vaults-delroot title="Remover esta raiz (só não-vault)">${ICONS.minus}</button>
    <span class="vaults-toolbar-sep"></span>
    <button class="vaults-btn" data-vaults-new="file" title="Novo arquivo">${ICONS.notePlus}<span>novo</span></button>
    <button class="vaults-btn vaults-btn-icon" data-vaults-new="dir" title="Nova pasta">${ICONS.folderPlus}</button>
    <button class="vaults-btn vaults-btn-icon" data-vaults-refresh title="Recarregar">${ICONS.refresh}</button>`;
  els.toolbar.querySelector('.vaults-root-sel').addEventListener('change', (e) => openRoot(e.target.value));
}

async function saveRoots(extraPaths) {
  const r = await api('/roots', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roots: extraPaths }),
  });
  state.vaults = r.vaults;
  return r.vaults;
}

// ── Árvore ──
async function fetchTreeLevel(relPath) {
  const q = new URLSearchParams({ vault: state.currentId, depth: '1' });
  if (relPath) q.set('path', relPath);
  return (await api(`/tree?${q}`)).tree;
}

async function refreshTree() {
  els.tree.innerHTML = '<div class="vaults-empty">Carregando…</div>';
  try {
    state.tree = await fetchTreeLevel('');
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
      let kids = buildTreeNodes(n.children || []);
      kids.classList.add('vaults-collapsed');
      li.appendChild(kids);
      if (n.has_children === false) row.querySelector('.vaults-caret').style.visibility = 'hidden';
      let loaded = Array.isArray(n.children);
      row.addEventListener('click', async () => {
        if (!loaded) {
          loaded = true;
          try {
            n.children = await fetchTreeLevel(n.path);
          } catch (e) {
            loaded = false;
            showError(`files: ${e.message}`);
            return;
          }
          const fresh = buildTreeNodes(n.children);
          fresh.classList.add('vaults-collapsed');
          kids.replaceWith(fresh);
          kids = fresh;
          applyTreeBadges();
        }
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

// ── Snap layouts (reusa o tileManager do app; padrão Windows 11) ──
function _safeRect() {
  const sidebar = document.getElementById('sidebar');
  const rail = document.getElementById('icon-rail');
  let left = 0;
  const sb = sidebar?.getBoundingClientRect();
  if (sb && sb.right > 0 && !sidebar.classList.contains('hidden')) left = Math.max(left, sb.right);
  if (rail && getComputedStyle(rail).display !== 'none') {
    const rr = rail.getBoundingClientRect();
    if (rr.right > 0) left = Math.max(left, rr.right);
  }
  return { left: left + 4, top: 4, right: window.innerWidth - 4, bottom: window.innerHeight - 4 };
}

function zoneRect(name) {
  const sr = _safeRect();
  const W = sr.right - sr.left;
  const H = sr.bottom - sr.top;
  switch (name) {
    case 'fullscreen': return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    case 'maximize': return { left: sr.left, top: sr.top, width: W, height: H };
    case 'left-half': return { left: sr.left, top: sr.top, width: W / 2, height: H };
    case 'right-half': return { left: sr.left + W / 2, top: sr.top, width: W / 2, height: H };
    case 'top-half': return { left: sr.left, top: sr.top, width: W, height: H / 2 };
    case 'bottom-half': return { left: sr.left, top: sr.top + H / 2, width: W, height: H / 2 };
    case 'top-left': return { left: sr.left, top: sr.top, width: W / 2, height: H / 2 };
    case 'top-right': return { left: sr.left + W / 2, top: sr.top, width: W / 2, height: H / 2 };
    case 'bottom-left': return { left: sr.left, top: sr.top + H / 2, width: W / 2, height: H / 2 };
    case 'bottom-right': return { left: sr.left + W / 2, top: sr.top + H / 2, width: W / 2, height: H / 2 };
    default: return null;
  }
}

function unsnapContent(content) {
  const pre = content.dataset._tilePreSnap;
  ['position', 'left', 'top', 'width', 'height', 'max-height', 'margin', 'transform']
    .forEach(prop => content.style.removeProperty(prop));
  if (pre) {
    try { Object.assign(content.style, JSON.parse(pre)); } catch (_) {}
  }
  if (!content.style.position) content.style.position = 'fixed';
  delete content.dataset._tilePreSnap;
  delete content.dataset._tileZone;
}

function snapTo(modal, name) {
  const content = modal.querySelector('.modal-content');
  if (!content) return;
  if (name === 'restore') { unsnapContent(content); return; }
  const rect = zoneRect(name);
  if (rect) snapModalToZone(modal, { name, rect });
}

const SNAP_GRID = [
  ['top-left', 'top-half', 'top-right'],
  ['left-half', 'maximize', 'right-half'],
  ['bottom-left', 'bottom-half', 'bottom-right'],
];

function _snapFillStyle(z) {
  const map = {
    'maximize': 'inset:2px;',
    'left-half': 'top:2px;bottom:2px;left:2px;width:calc(50% - 2px);',
    'right-half': 'top:2px;bottom:2px;right:2px;width:calc(50% - 2px);',
    'top-half': 'left:2px;right:2px;top:2px;height:calc(50% - 2px);',
    'bottom-half': 'left:2px;right:2px;bottom:2px;height:calc(50% - 2px);',
    'top-left': 'top:2px;left:2px;width:calc(50% - 2px);height:calc(50% - 2px);',
    'top-right': 'top:2px;right:2px;width:calc(50% - 2px);height:calc(50% - 2px);',
    'bottom-left': 'bottom:2px;left:2px;width:calc(50% - 2px);height:calc(50% - 2px);',
    'bottom-right': 'bottom:2px;right:2px;width:calc(50% - 2px);height:calc(50% - 2px);',
  };
  return map[z] || '';
}

function openSnapMenu(anchorBtn, modal) {
  document.querySelector('.vaults-snap-menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'vaults-snap-menu';
  menu.innerHTML = SNAP_GRID.map(rowZ =>
    `<div class="vaults-snap-row">${rowZ.map(z =>
      `<button class="vaults-snap-cell" data-zone="${z}" title="${z}">
         <span class="vaults-snap-fill" style="${_snapFillStyle(z)}"></span>
       </button>`).join('')}</div>`).join('')
    + `<div class="vaults-snap-row">
        <button class="vaults-snap-wide" data-zone="fullscreen">tela cheia</button>
        <button class="vaults-snap-wide" data-zone="restore">restaurar</button>
      </div>`;
  const r = anchorBtn.getBoundingClientRect();
  menu.style.cssText = `position:fixed; top:${r.bottom + 6}px; left:${Math.max(8, r.right - 140)}px; z-index:10050;`;
  document.body.appendChild(menu);
  let unreg = () => {};
  const close = () => {
    menu.remove();
    unreg();
    document.removeEventListener('click', close, true);
  };
  menu._dismiss = close;
  unreg = registerMenuDismiss(close);
  setTimeout(() => document.addEventListener('click', close, true), 0);
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-zone]');
    if (!b) return;
    e.stopPropagation();
    close();
    snapTo(modal, b.dataset.zone);
  });
}

// header: botão de snap + duplo-clique maximiza/restaura
function wireSnapControls(modal) {
  const header = modal.querySelector('.modal-header');
  const content = modal.querySelector('.modal-content');
  const btn = modal.querySelector('.vaults-snapbtn');
  if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); openSnapMenu(btn, modal); });
  if (header) {
    header.addEventListener('dblclick', (e) => {
      if (e.target.closest('button')) return;
      snapTo(modal, content?.dataset._tileZone === 'maximize' ? 'restore' : 'maximize');
    });
  }
}

// Fix clássico: iframes engolem o ponteiro durante drags de janela — trava
// pointer-events dos iframes enquanto qualquer header estiver sendo arrastado.
document.addEventListener('pointerdown', (e) => {
  if (e.target?.closest?.('.modal-header')) document.body.classList.add('vaults-iframe-lock');
}, true);
['pointerup', 'pointercancel'].forEach(ev =>
  document.addEventListener(ev, () => document.body.classList.remove('vaults-iframe-lock'), true));

// ── Favoritos ──
const FAVS_KEY = 'odysseus-files-favs';

function getFavs() {
  try { return JSON.parse(localStorage.getItem(FAVS_KEY) || '[]'); } catch (_) { return []; }
}

function isFav(root, path) {
  return getFavs().some(f => f.root === root && f.path === path);
}

function toggleFav(n) {
  const favs = getFavs();
  const i = favs.findIndex(f => f.root === state.currentId && f.path === n.path);
  if (i >= 0) favs.splice(i, 1);
  else favs.push({ root: state.currentId, path: n.path, type: n.type, name: n.name });
  try { localStorage.setItem(FAVS_KEY, JSON.stringify(favs)); } catch (_) {}
  renderFavs();
}

function renderFavs() {
  if (!els.favs) return;
  const favs = getFavs();
  if (!favs.length) { els.favs.innerHTML = ''; return; }
  els.favs.innerHTML = favs.map((f, i) => `
    <span class="vaults-fav" data-fav="${i}" title="${esc(f.root)} · ${esc(f.path)}">
      ${f.type === 'dir' ? ICONS.folder : ICONS.file}<span>${esc(f.name)}</span>
    </span>`).join('');
}

async function openFav(f) {
  if (f.root !== state.currentId) {
    if (!state.vaults.some(v => v.id === f.root && v.exists)) {
      showError(`Raiz do favorito não existe mais: ${f.root}`);
      return;
    }
    await openRoot(f.root);
  }
  if (f.type === 'dir') await revealPath(f.path);
  else openFile(f.path);
}

// expande a árvore lazy até o caminho (best-effort)
async function revealPath(relPath) {
  const segs = relPath.split('/');
  let acc = '';
  for (const seg of segs) {
    acc = acc ? `${acc}/${seg}` : seg;
    const row = els.tree.querySelector(`.vaults-tree-row.vaults-dir[data-path="${CSS.escape(acc)}"]`);
    if (!row) break;
    const kids = row.parentElement.querySelector(':scope > ul');
    if (kids && kids.classList.contains('vaults-collapsed')) {
      row.click();
      await new Promise(r => setTimeout(r, 120));
    }
  }
  highlightTreeRow(relPath);
}

function attachRowActions(row, n) {
  const acts = document.createElement('span');
  acts.className = 'vaults-row-acts';
  acts.innerHTML = `<button class="vaults-row-btn" data-act="fav" title="Favoritar">${isFav(state.currentId, n.path) ? '★' : '☆'}</button>
    <button class="vaults-row-btn" data-act="rename" title="Renomear/mover">${ICONS.pencil}</button>
    <button class="vaults-row-btn" data-act="delete" title="Apagar">${ICONS.trash}</button>`;
  row.appendChild(acts);
  acts.addEventListener('click', async (e) => {
    e.stopPropagation();
    const act = e.target.closest('[data-act]')?.dataset.act;
    try {
      if (act === 'fav') {
        toggleFav(n);
        e.target.closest('[data-act]').textContent = isFav(state.currentId, n.path) ? '★' : '☆';
      } else if (act === 'rename') {
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
  // busca por basename nos assets do meta (árvore agora é lazy)
  const low = String(name || '').toLowerCase();
  const hit = (state.assets || []).find(a => a.name.toLowerCase() === low);
  return hit ? hit.path : null;
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
  const r = await api(`/meta?vault=${encodeURIComponent(state.currentId)}`);
  state.meta = r.notes;
  state.assets = r.assets || [];
  state.noteIndex = new Map();
  for (const n of r.notes) {
    const base = n.name.toLowerCase();
    if (!state.noteIndex.has(base)) state.noteIndex.set(base, []);
    state.noteIndex.get(base).push(n.path);
  }
  return state.meta;
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
const PDF_EXT = /\.pdf$/i;
const AUDIO_EXT = /\.(mp3|ogg|wav|m4a|flac|opus)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|mkv)$/i;
const MD_EXT = /\.(md|markdown)$/i;

async function openFile(relPath) {
  if (state.dirty && !(await styledConfirm('Há edição não salva. Descartar?', { danger: true }))) return;
  state.dirty = false;
  const low = relPath.toLowerCase();
  if (low.endsWith('.base')) return openBase(relPath);
  const mediaMode = IMG_EXT.test(low) ? 'image'
    : PDF_EXT.test(low) ? 'pdf'
    : AUDIO_EXT.test(low) ? 'audio'
    : VIDEO_EXT.test(low) ? 'video' : null;
  if (mediaMode) {
    state.openPath = relPath;
    state.mode = mediaMode;
    highlightTreeRow(relPath);
    renderViewer();
    return;
  }
  try {
    const f = await api(`/file?vault=${encodeURIComponent(state.currentId)}&path=${encodeURIComponent(relPath)}`);
    state.openPath = relPath;
    state.openMtime = f.mtime;
    state.mode = 'view';
    state.kind = MD_EXT.test(low) ? 'md' : 'code';
    state.content = f.content;
    highlightTreeRow(relPath);
    if (state.kind === 'md') {
      // wikilinks/embeds resolvem via meta (árvore é lazy)
      try { await ensureMeta(); } catch (_) {}
    }
    renderViewer();
  } catch (e) {
    if (e.status === 400 || e.status === 413) {
      state.openPath = relPath;
      state.mode = 'binary';
      highlightTreeRow(relPath);
      renderViewer();
    } else {
      showError(`Falha ao abrir: ${e.message}`);
    }
  }
}

function renderViewer() {
  const nameBar = `<div class="vaults-viewbar"><span class="vaults-open-name">${esc(state.openPath || '')}</span></div>`;
  if (state.mode === 'image') {
    els.viewer.innerHTML = `${nameBar}<img class="vaults-embed" src="${rawUrl(state.openPath)}">`;
    return;
  }
  if (state.mode === 'pdf') {
    els.viewer.innerHTML = `${nameBar}<embed class="vaults-pdf" src="${rawUrl(state.openPath)}" type="application/pdf">`;
    return;
  }
  if (state.mode === 'audio') {
    els.viewer.innerHTML = `${nameBar}<audio class="vaults-media" controls src="${rawUrl(state.openPath)}"></audio>`;
    return;
  }
  if (state.mode === 'video') {
    els.viewer.innerHTML = `${nameBar}<video class="vaults-media vaults-video" controls src="${rawUrl(state.openPath)}"></video>`;
    return;
  }
  if (state.mode === 'binary') {
    els.viewer.innerHTML = `${nameBar}
      <div class="vaults-empty">Arquivo binário/grande — sem preview de texto.<br><br>
        <a class="vaults-btn" href="${rawUrl(state.openPath)}" download>${ICONS.down} baixar ${esc(state.openPath.split('/').pop())}</a>
      </div>`;
    return;
  }
  const bar = `<div class="vaults-viewbar">
      <span class="vaults-open-name" title="${esc(state.openPath || '')}">${esc(state.openPath || '')}</span>
      <button class="vaults-btn" data-vaults-mode="${state.mode === 'view' ? 'edit' : 'view'}">
        ${state.mode === 'view' ? 'Editar' : 'Visualizar'}</button>
      ${state.mode === 'edit' ? '<button class="vaults-btn vaults-save-btn">Salvar</button>' : ''}
      <span class="vaults-dirty" style="display:${state.dirty ? '' : 'none'}" title="Não salvo">●</span>
    </div>`;
  if (state.mode === 'view' && state.kind === 'code') {
    els.viewer.innerHTML = bar + `<pre class="vaults-codeview"><code>${esc(state.content)}</code></pre>`;
    const codeEl = els.viewer.querySelector('.vaults-codeview code');
    try { window.hljs?.highlightElement?.(codeEl); } catch (_) {}
  } else if (state.mode === 'view') {
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

function gitSection(key, title, badge, bodyHtml, defOpen = true) {
  const open = secOpen(key, defOpen);
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
    + 'display:block; z-index:10050; min-width:180px; max-height:50vh; overflow-y:auto;';
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


// ── Sessões do Obsidian (uma por vault) ──
const sessionsState = { available: false, list: [], byId: new Map() };

async function refreshSessions() {
  try {
    const r = await api('/obsidian-sync');
    sessionsState.available = r.available;
    sessionsState.list = r.sessions || [];
  } catch (_) {
    sessionsState.available = false;
    sessionsState.list = [];
  }
  sessionsState.byId = new Map(sessionsState.list.map(s => [s.id, s]));
  updateSidebarDots();
}

function updateSidebarDots() {
  document.querySelectorAll('#vaults-list .vaults-side-item').forEach(item => {
    const s = sessionsState.byId.get(item.dataset.vaultId);
    const dot = item.querySelector('.vaults-dot');
    if (dot) dot.className = 'vaults-dot' + (s?.running ? ' vaults-dot-on' : '');
    const cloud = item.querySelector('.vaults-side-cloud');
    if (cloud) {
      cloud.classList.toggle('vaults-sync-on', !!s?.running);
      cloud.title = s?.running
        ? 'Sessão do Obsidian ATIVA (sync rodando) — clique pra desligar'
        : 'Ligar a sessão do Obsidian desta vault';
    }
  });
}

async function toggleSession(vaultId) {
  const s = sessionsState.byId.get(vaultId);
  const enable = !(s && s.running);
  if (!enable && !(await styledConfirm(
    'Desligar a sessão do Obsidian desta vault? A sincronização dela pausa.',
    { confirmText: 'Desligar', danger: true, title: 'Obsidian' }))) return;
  try {
    await api('/obsidian-sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vault: vaultId, enable }),
    });
    showToast(enable ? 'Sessão do Obsidian ligada' : 'Sessão desligada');
  } catch (e) {
    showError(`Obsidian: ${e.message}`);
  }
  refreshSessions();
}

async function openVaultObsidian(v) {
  try {
    const r = await api('/obsidian-open', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vault: v.id }),
    });
    ensureObsidianModal(v, r.ui_url, r.started);
    refreshSessions();
  } catch (e) {
    showError(`Obsidian (${v.name}): ${e.message}`);
  }
}

function ensureObsidianModal(v, url, started) {
  const id = `vaults-obsidian-${v.id}`;
  let m = document.getElementById(id);
  if (!m) {
    m = document.createElement('div');
    m.id = id;
    m.className = 'modal hidden';
    m.innerHTML = `
      <div class="modal-content vaults-obsidian-content">
        <div class="modal-header vaults-header">
          <span class="vaults-title">${ICONS.gem} ${esc(v.name)}</span>
          <button class="vaults-snapbtn" title="Posicionar na tela">${ICONS.layout}</button>
          <button class="vaults-sync-btn" title="Ligar/desligar esta sessão">${ICONS.cloud}</button>
          <button class="vaults-reload-btn" title="Recarregar a tela">${ICONS.refresh}</button>
          <button class="close-btn" aria-label="Close">✖</button>
        </div>
        <iframe class="vaults-obsidian-frame" src="about:blank"
          allow="clipboard-read; clipboard-write"></iframe>
      </div>`;
    document.body.appendChild(m);
    m.querySelector('.close-btn').addEventListener('click', () => Modals.close(id));
    m.querySelector('.vaults-reload-btn').addEventListener('click', () => {
      const fr = m.querySelector('iframe');
      const src = fr.src;
      fr.src = 'about:blank';
      setTimeout(() => { fr.src = src; }, 100);
    });
    m.querySelector('.vaults-sync-btn').addEventListener('click', () => toggleSession(v.id));
    makeWindowDraggable(m, {
      content: m.querySelector('.modal-content'),
      header: m.querySelector('.modal-header'),
    });
    wireSnapControls(m);
  }
  if (!Modals.isRegistered(id)) {
    Modals.register(id, {
      label: v.name,
      icon: ICONS.gem,
      restoreFn: () => {},
      // fechar solta a tela (iframe em branco) mas NÃO para a sessão — o
      // Obsidian continua sincronizando; a nuvem é quem liga/desliga.
      closeFn: () => {
        const el = document.getElementById(id);
        if (el) {
          el.querySelector('iframe').src = 'about:blank';
          el.classList.add('hidden');
        }
      },
    });
    Modals.injectMinimizeButton(m, id);
  }
  const fr = m.querySelector('iframe');
  m.classList.remove('hidden', 'modal-minimized');
  if (started) {
    fr.src = 'about:blank';
    showToast(`Abrindo ${v.name} no Obsidian… (iniciando a sessão)`);
    setTimeout(() => { fr.src = url; }, 4000);
  } else if (fr.getAttribute('src') !== url) {
    fr.src = url;
  }
}

// ── Sidebar (Vaults = launcher de sessões do Obsidian) ──
async function loadRoots() {
  const { vaults } = await api('/vaults');
  state.vaults = vaults;
  return vaults;
}

async function initSidebar() {
  const list = document.getElementById('vaults-list');
  if (!list) return;
  try {
    const vaults = await loadRoots();
    list.innerHTML = '';
    for (const v of vaults.filter(x => x.is_vault)) {
      const item = document.createElement('div');
      item.className = 'list-item vaults-side-item' + (v.exists ? '' : ' vaults-missing');
      item.dataset.vaultId = v.id;
      item.title = v.exists ? `${v.path} — abre no Obsidian` : `Pasta não encontrada: ${v.path}`;
      item.innerHTML = `<span class="vaults-dot"></span>${VAULT_ICON_SVG.replace('<svg ', '<svg style="flex-shrink:0;opacity:0.5;" ')}<span class="grow">${esc(v.name)}</span>
        <button class="vaults-side-cloud" title="Ligar/desligar sessão">${ICONS.cloud}</button>`;
      if (v.exists) {
        item.addEventListener('click', () => openVaultObsidian(v));
        item.querySelector('.vaults-side-cloud').addEventListener('click', (e) => {
          e.stopPropagation();
          toggleSession(v.id);
        });
      }
      list.appendChild(item);
    }
    const section = document.getElementById('vaults-section');
    if (section && !vaults.some(v => v.is_vault)) section.style.display = 'none';
    refreshSessions();
  } catch (e) {
    console.warn('vaults: falha ao listar', e);
  }
}

// ── Tool "Files" (File Browser) ──
async function openFiles() {
  buildPanel();
  if (!state.vaults.length) {
    try { await loadRoots(); } catch (e) { showError(`files: ${e.message}`); return; }
  }
  let rootId = null;
  try { rootId = localStorage.getItem('odysseus-files-root'); } catch (_) {}
  if (!state.vaults.some(v => v.id === rootId && v.exists)) {
    rootId = (state.vaults.find(v => v.exists) || {}).id || null;
  }
  if (!rootId) {
    showError('Nenhuma raiz configurada — adicione uma pasta em ＋.');
    return;
  }
  await openRoot(rootId);
}

function wireFilesButton() {
  const btn = document.getElementById('tool-files-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (Modals.toggle(PANEL_ID)) return;
    const panel = document.getElementById(PANEL_ID);
    if (panel && !panel.classList.contains('hidden') && !panel.classList.contains('modal-minimized')) {
      Modals.minimize(PANEL_ID);
      return;
    }
    openFiles();
  });
}

function boot() {
  initSidebar();
  wireFilesButton();
}

if (document.readyState !== 'loading') boot();
else document.addEventListener('DOMContentLoaded', boot);
