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
import { mdToHtml } from './markdown.js';

const PANEL_ID = 'vaults-panel';
const VAULT_ICON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2"/><rect x="3" y="7" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="2"/><path d="M12 15v3"/></svg>';

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
          <button class="close-btn" aria-label="Close vaults">✖</button>
        </div>
        <div class="vaults-body">
          <div class="vaults-viewer"></div>
          <div class="vaults-nav">
            <div class="vaults-toolbar"></div>
            <div class="vaults-tree"></div>
            <div class="vaults-git"></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(panel);
    els.panel = panel;
    els.content = panel.querySelector('.modal-content');
    els.header = panel.querySelector('.modal-header');
    els.title = panel.querySelector('.vaults-title');
    els.toolbar = panel.querySelector('.vaults-toolbar');
    els.tree = panel.querySelector('.vaults-tree');
    els.viewer = panel.querySelector('.vaults-viewer');
    els.git = panel.querySelector('.vaults-git');
    panel.querySelector('.close-btn').addEventListener('click', () => Modals.close(PANEL_ID));
    makeWindowDraggable(panel, { content: els.content, header: els.header });
    panel.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
      }
    });
    wireViewerClicks();
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
    applyEdgeDock(panel, 'right');
  }
  renderToolbar();
  if (switching) {
    state.openPath = null;
    renderViewerEmpty();
  }
  await refreshTree();
}

function renderViewerEmpty() {
  els.viewer.innerHTML = '<div class="vaults-empty">Selecione uma nota na árvore →</div>';
}

function renderToolbar() {
  els.toolbar.innerHTML = `
    <button class="vaults-btn" data-vaults-new="file" title="Nova nota">＋ nota</button>
    <button class="vaults-btn" data-vaults-new="dir" title="Nova pasta">＋ pasta</button>
    <button class="vaults-btn" data-vaults-refresh title="Recarregar">↻</button>`;
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
      ? `<span class="vaults-caret">▸</span><span class="vaults-node-name">${esc(n.name)}</span><span class="vaults-badge"></span>`
      : `<span class="vaults-node-name">${esc(n.name)}</span><span class="vaults-badge"></span>`;
    attachRowActions(row, n);
    li.appendChild(row);
    if (n.type === 'dir') {
      const kids = buildTreeNodes(n.children || []);
      kids.classList.add('vaults-collapsed');
      li.appendChild(kids);
      row.addEventListener('click', () => {
        kids.classList.toggle('vaults-collapsed');
        row.querySelector('.vaults-caret').textContent =
          kids.classList.contains('vaults-collapsed') ? '▸' : '▾';
      });
    } else {
      row.addEventListener('click', () => openFile(n.path));
    }
    ul.appendChild(li);
  }
  return ul;
}

function attachRowActions(row, n) { void row; void n; }

function highlightTreeRow(relPath) {
  els.tree.querySelectorAll('.vaults-tree-row.vaults-active').forEach(r => r.classList.remove('vaults-active'));
  const row = els.tree.querySelector(`.vaults-tree-row[data-path="${CSS.escape(relPath)}"]`);
  if (!row) return;
  row.classList.add('vaults-active');
  let ul = row.closest('ul');
  while (ul && ul !== els.tree) {
    ul.classList.remove('vaults-collapsed');
    const caret = ul.parentElement.querySelector(':scope > .vaults-tree-row .vaults-caret');
    if (caret) caret.textContent = '▾';
    ul = ul.parentElement.closest('ul');
  }
}

// ── Viewer/editor (Tasks 7-8) ──
async function openFile(relPath) { void relPath; }
async function saveFile(force = false) { void force; }
function wireViewerClicks() {}

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
