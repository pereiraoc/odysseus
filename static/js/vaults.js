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
    wireGitClicks();
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
    applyEdgeDock(panel, 'right');
  }
  renderToolbar();
  if (switching) {
    state.openPath = null;
    state.git = null;
    renderViewerEmpty();
  }
  await refreshTree();
  await refreshGit();
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

function attachRowActions(row, n) {
  const acts = document.createElement('span');
  acts.className = 'vaults-row-acts';
  acts.innerHTML = `<button class="vaults-row-btn" data-act="rename" title="Renomear/mover">✎</button>
    <button class="vaults-row-btn" data-act="delete" title="Apagar">×</button>`;
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
    const caret = ul.parentElement.querySelector(':scope > .vaults-tree-row .vaults-caret');
    if (caret) caret.textContent = '▾';
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

// ── Viewer/editor ──
async function openFile(relPath) {
  if (state.dirty && !(await styledConfirm('Há edição não salva. Descartar?', { danger: true }))) return;
  state.dirty = false;
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
    els.viewer.innerHTML = bar + `<div class="vaults-md">${mdToHtml(preprocessMd(state.content, relDirOf(state.openPath || '')))}</div>`;
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

function renderGit() {
  const g = state.git;
  if (!g) { els.git.innerHTML = ''; return; }
  if (!g.has_git) {
    els.git.innerHTML = `<div class="vaults-git-sec">
      <button class="vaults-btn" data-git="init">Inicializar repositório git</button></div>`;
    return;
  }
  const n = g.staged.length + g.unstaged.length + g.untracked.length;
  const row = (p, code, staged, acts) => `
    <div class="vaults-chg" data-path="${esc(p)}" data-staged="${staged}">
      <span class="vaults-chg-name" data-git="diff" title="${esc(p)}">${esc(p.split('/').pop())}</span>
      <span class="vaults-chg-code">${esc(code)}</span>${acts}
    </div>`;
  const syncLabel = `${g.ahead ? g.ahead + '↑' : ''}${g.behind ? ' ' + g.behind + '↓' : ''}`.trim();
  els.git.innerHTML = `
    <div class="vaults-branch-row">
      <span class="vaults-branch" data-git="branches" title="Trocar/criar branch">⎇ ${esc(g.branch || '?')}</span>
      <span class="vaults-sync" title="ahead/behind do upstream">${syncLabel}</span>
      <button class="vaults-row-btn" data-git="pull" title="Pull (ff-only)">⇣</button>
      <button class="vaults-row-btn" data-git="push" title="Push">⇡</button>
      <button class="vaults-row-btn" data-git="fetch" title="Fetch">↺</button>
    </div>
    <div class="vaults-git-sec">
      <div class="vaults-git-head">MUDANÇAS (${n})</div>
      ${g.staged.map(c => row(c.path, c.code, true,
        `<button class="vaults-row-btn" data-git="unstage" title="Unstage">−</button>`)).join('')}
      ${g.unstaged.map(c => row(c.path, c.code, false,
        `<button class="vaults-row-btn" data-git="stage" title="Stage">＋</button>
         <button class="vaults-row-btn" data-git="discard" title="Descartar mudanças">↶</button>`)).join('')}
      ${g.untracked.map(p => row(p, 'U', false,
        `<button class="vaults-row-btn" data-git="stage" title="Stage">＋</button>
         <button class="vaults-row-btn" data-git="discard" title="Apagar (untracked)">↶</button>`)).join('')}
      ${n ? `<textarea class="vaults-commit-msg" placeholder="Mensagem de commit…" rows="2"></textarea>
      <div class="vaults-commit-row">
        <button class="vaults-btn" data-git="commit">✓ Commit</button>
        <label class="vaults-amend"><input type="checkbox" class="vaults-amend-cb"> amend</label>
        <button class="vaults-row-btn" data-git="undo" title="Desfazer último commit (reset soft)">↩</button>
      </div>` : `<div class="vaults-git-clean">✓ working tree limpo
        <button class="vaults-row-btn" data-git="undo" title="Desfazer último commit (reset soft)">↩</button></div>`}
    </div>
    <div class="vaults-git-sec vaults-log-sec"></div>`;
  renderGitLog();
}

function applyTreeBadges() {
  const g = state.git;
  const map = new Map();
  if (g?.has_git) {
    for (const c of g.unstaged) map.set(c.path, { code: c.code, cls: 'vaults-b-mod' });
    for (const c of g.staged) if (!map.has(c.path)) map.set(c.path, { code: c.code, cls: 'vaults-b-staged' });
    for (const p of g.untracked) map.set(p, { code: 'U', cls: 'vaults-b-new' });
  }
  const changedKeys = [...map.keys()];
  els.tree.querySelectorAll('.vaults-tree-row').forEach(rowEl => {
    const badge = rowEl.querySelector('.vaults-badge');
    if (!badge) return;
    const p = rowEl.dataset.path;
    const hit = map.get(p);
    if (hit) {
      badge.textContent = hit.code;
      badge.className = `vaults-badge ${hit.cls}`;
    } else {
      const isDirWithChange = rowEl.classList.contains('vaults-dir')
        && changedKeys.some(k => k.startsWith(p + '/'));
      badge.textContent = isDirWithChange ? '•' : '';
      badge.className = 'vaults-badge' + (isDirWithChange ? ' vaults-b-mod' : '');
    }
  });
}

async function renderGitLog() {
  const sec = els.git.querySelector('.vaults-log-sec');
  if (!sec || !state.git?.has_git) return;
  try {
    const { commits } = await api(`/git/log?vault=${encodeURIComponent(state.currentId)}&limit=30`);
    sec.innerHTML = `<div class="vaults-git-head">COMMITS (${esc(state.git.branch || '')})</div>`
      + commits.map(c => `<div class="vaults-log-row" data-git="show-commit" data-hash="${c.hash}"
          title="${esc(c.subject)} — ${esc(c.author)}">
          <span class="vaults-log-hash">${c.short}</span><span class="vaults-log-subj">${esc(c.subject)}</span>
        </div>`).join('')
      + `<div class="vaults-log-row vaults-log-more" data-git="graph">⋯ ver grafo completo</div>`;
  } catch (e) {
    sec.innerHTML = `<div class="vaults-git-head">COMMITS</div><div class="vaults-git-err">${esc(e.message)}</div>`;
  }
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
      } else if (action === 'show-commit') {
        openCommit(el.dataset.hash);
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
      } else if (action === 'graph') {
        openGraph();
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
  const closeMenu = () => menu.remove();
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

function openGraph() { /* Task 18 */ }

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
