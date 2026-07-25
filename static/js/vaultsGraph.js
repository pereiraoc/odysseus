// static/js/vaultsGraph.js — grafo de commits em SVG (fork-local; ver LOCAL_CHANGES.md)
//
// Algoritmo de lanes: varre os commits em ordem topológica (saída de
// `git log --all --topo-order --parents`). `lanes` guarda, por coluna, o
// hash do commit que aquela coluna está "esperando"; um commit ocupa a
// coluna que o espera (ou abre uma nova), o primeiro parent herda a
// coluna e parents extras (merges) abrem/reusam colunas próprias.

const COLORS = ['#61afef', '#98c379', '#e5c07b', '#e06c75', '#c678dd', '#56b6c2', '#d19a66'];
const ROW_H = 26;
const LANE_W = 14;
const DOT_R = 4;
const PAD = 8;

export function layoutGraph(commits) {
  const lanes = [];
  const rows = [];
  for (const c of commits) {
    let lane = lanes.indexOf(c.hash);
    if (lane === -1) {
      lane = lanes.indexOf(null);
      if (lane === -1) lane = lanes.length;
    }
    // Outras colunas que também esperavam este commit (merge chegando) colapsam.
    for (let l = 0; l < lanes.length; l++) {
      if (lanes[l] === c.hash && l !== lane) lanes[l] = null;
    }
    lanes[lane] = c.parents[0] || null;
    for (let p = 1; p < c.parents.length; p++) {
      if (lanes.indexOf(c.parents[p]) === -1) {
        let nl = lanes.indexOf(null);
        if (nl === -1) nl = lanes.length;
        lanes[nl] = c.parents[p];
      }
    }
    rows.push({ commit: c, lane });
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
  }
  const laneCount = Math.max(1, ...rows.map(r => r.lane + 1));
  return { rows, laneCount };
}

const _esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function renderCommitGraph(container, commits, onSelect, opts = {}) {
  if (!commits.length) {
    container.innerHTML = '<div class="vaults-empty">Sem commits ainda.</div>';
    return;
  }
  // compact: modo coluna-lateral (issue #5) — linhas menores, sem autor/data.
  const compact = !!opts.compact;
  const ROWH = compact ? 22 : ROW_H;
  const LANEW = compact ? 11 : LANE_W;
  const { rows, laneCount } = layoutGraph(commits);
  const gw = PAD * 2 + laneCount * LANEW;
  const h = rows.length * ROWH;
  const cx = l => PAD + l * LANEW + LANEW / 2;
  const cy = i => i * ROWH + ROWH / 2;
  const color = l => COLORS[l % COLORS.length];
  const hashRow = new Map(rows.map((r, i) => [r.commit.hash, i]));

  let paths = '';
  let dots = '';
  rows.forEach((r, i) => {
    r.commit.parents.forEach((ph, pi) => {
      const j = hashRow.get(ph);
      if (j === undefined) {
        // parent fora da página carregada — linha curta pra baixo indicando continuação
        paths += `<line x1="${cx(r.lane)}" y1="${cy(i)}" x2="${cx(r.lane)}" y2="${cy(i) + ROWH * 0.6}" stroke="${color(r.lane)}" stroke-dasharray="2,3"/>`;
        return;
      }
      const jl = rows[j].lane;
      if (r.lane === jl && pi === 0) {
        paths += `<line x1="${cx(r.lane)}" y1="${cy(i)}" x2="${cx(jl)}" y2="${cy(j)}" stroke="${color(r.lane)}"/>`;
      } else {
        paths += `<path d="M${cx(r.lane)},${cy(i)} C${cx(r.lane)},${cy(i) + ROWH * 0.8} ${cx(jl)},${cy(j) - ROWH * 0.8} ${cx(jl)},${cy(j)}" stroke="${color(jl)}" fill="none"/>`;
      }
    });
    dots += `<circle cx="${cx(r.lane)}" cy="${cy(i)}" r="${DOT_R}" fill="${color(r.lane)}"/>`;
  });

  container.innerHTML = `
    <div class="vaults-graph">
      <svg width="${gw}" height="${h}" class="vaults-graph-svg" aria-hidden="true">
        <g stroke-width="2">${paths}</g>${dots}
      </svg>
      <div class="vaults-graph-rows">
        ${rows.map(r => `
          <div class="vaults-graph-row" data-hash="${r.commit.hash}"
            style="height:${ROWH}px" title="${_esc(r.commit.subject)}">
            <span class="vaults-log-hash">${r.commit.short}</span>
            ${r.commit.refs.map(x => `<span class="vaults-ref">${_esc(x)}</span>`).join('')}
            <span class="vaults-log-subj">${_esc(r.commit.subject)}</span>
            ${compact ? '' : `<span class="vaults-graph-meta">${_esc(r.commit.author)} · ${new Date(r.commit.date).toLocaleDateString()}</span>`}
          </div>`).join('')}
      </div>
    </div>`;
  container.querySelectorAll('.vaults-graph-row').forEach(el =>
    el.addEventListener('click', () => onSelect && onSelect(el.dataset.hash)));
}
