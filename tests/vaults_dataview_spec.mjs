// Spec do engine DQL (static/js/vaultsDataview.js) — rodar: node tests/vaults_dataview_spec.mjs
// Cobre as construções usadas nas vaults reais (ver docs/superpowers/specs/…-vaults-panel-design.md).
import { runQuery } from '../static/js/vaultsDataview.js';

const notes = [
  { path: 'Classes/Guerreiro.md', name: 'Guerreiro', folder: 'Classes', mtime: 300, ctime: 100,
    size: 10, tags: ['classe'], aliases: [], outlinks: ['Regras'], props: { categoria: 'Classe' } },
  { path: 'Técnicas/Aparar.md', name: 'Aparar', folder: 'Técnicas', mtime: 200, ctime: 50, size: 10,
    tags: ['tecnica'], aliases: [], outlinks: ['Guerreiro'],
    props: { categoria: 'Técnica', rank: 'Adepta', 'insight-type': 'x', 'nível': 2, title: 'Aparar Golpes' } },
  { path: 'Técnicas/Investida.md', name: 'Investida', folder: 'Técnicas', mtime: 100, ctime: 60, size: 10,
    tags: ['tecnica'], aliases: [], outlinks: ['Guerreiro'],
    props: { categoria: 'Técnica', rank: 'Mestre', 'nível': 1, title: 'Investida Brutal',
             disponivel: ['[[Guerreiro]]', '[[Monge]]'] } },
  { path: 'Regras.md', name: 'Regras', folder: '', mtime: 50, ctime: 10, size: 10,
    tags: [], aliases: [], outlinks: [], props: { categoria: 'regra', subcategoria: null } },
];
const linkHtml = (p, l) => p ? `<a href="${p}">${l}</a>` : `<span>${l}</span>`;
const ctx = cur => ({ notes, current: cur, linkHtml });

let fail = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ` (${extra})` : ''}`);
  if (!cond) { fail = 1; process.exitCode = 1; }
};

// TABLE WITHOUT ID + link(file.link, title) + FROM [[]] AND !outgoing([[]]) + sort multi
{
  const { html } = runQuery(`TABLE WITHOUT ID
  link(file.link, title) AS "Técnica",
  rank as "Categoria"
FROM [[]] AND !outgoing([[]])
where categoria="Técnica"
sort rank asc, file.name`, ctx('Classes/Guerreiro.md'));
  check('FROM [[]] AND !outgoing: acha as 2 técnicas', html.includes('2 resultado'), html);
  check('link(file.link, title) usa o display', html.includes('>Aparar Golpes</a>'));
  check('WITHOUT ID sem coluna File', !html.includes('<th>File</th>'));
  check('sort rank asc: Adepta antes de Mestre', html.indexOf('Adepta') < html.indexOf('Mestre'));
}

// this.file.name / = null / != NULL / identificador com hífen e acento
{
  const { html } = runQuery(
    'LIST WHERE categoria = "regra" and subcategoria = null and file.name != this.file.name',
    ctx('Técnicas/Aparar.md'));
  check('= null + this.file.name', html.includes('>Regras</a>') && html.includes('1 resultado'), html);
  const h2 = runQuery('LIST WHERE insight-type != NULL', ctx(null)).html;
  check('hífen no identificador + NULL case-insensitive', h2.includes('1 resultado'), h2);
  const h3 = runQuery('TABLE nível FROM #tecnica SORT nível DESC', ctx(null)).html;
  check('campo acentuado + FROM #tag + SORT DESC', h3.indexOf('Aparar') < h3.indexOf('Investida'), h3);
}

// contains() com array de links resolvendo this.file.link
{
  const { html } = runQuery(
    'LIST WHERE contains(disponivel, this.file.link)', ctx('Classes/Guerreiro.md'));
  check('contains(array de links, this.file.link)', html.includes('Investida') && html.includes('1 resultado'), html);
}

// LIMIT + file.mtime DESC + valor [[link]] do frontmatter vira link
{
  const { html } = runQuery('TABLE categoria SORT file.mtime DESC LIMIT 2', ctx(null));
  check('LIMIT 2', html.includes('2 resultado'));
  check('mtime DESC: Guerreiro primeiro', html.indexOf('Guerreiro') < html.indexOf('Aparar'));
  const h2 = runQuery('TABLE disponivel WHERE file.name = "Investida"', ctx(null)).html;
  check('frontmatter [[link]] renderiza como anchor', h2.includes('<a href="Classes/Guerreiro.md">'));
}

// TASK/dataviewjs degradam com erro claro
{
  let msg = '';
  try { runQuery('TASK FROM #x', ctx(null)); } catch (e) { msg = e.message; }
  check('TASK degrada com mensagem', msg.includes('TASK'));
}

console.log(fail ? '\nFALHOU' : '\nOK');
