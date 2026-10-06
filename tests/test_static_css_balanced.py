"""Fork-local (ver LOCAL_CHANGES.md): chaves balanceadas nas folhas de estilo.

No sync de 2026-10-05 a resolução do conflito append-only em static/style.css
perdeu o `}` que fechava o último @media do upstream; o bloco .vaults-* inteiro
virou regra aninhada e o navegador descartou o CSS do fork sem erro nenhum.
"""

import re
from pathlib import Path

import pytest

STATIC = Path(__file__).resolve().parent.parent / "static"
CSS_FILES = sorted(p for p in STATIC.rglob("*.css") if "vendor" not in p.parts)


def _unbalanced_at(text: str):
    """Retorna (linha, motivo) do primeiro desbalanceio, ou None."""
    text = re.sub(r"/\*.*?\*/", lambda m: "\n" * m.group(0).count("\n"), text, flags=re.S)
    text = re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'', '""', text)
    depth, line = 0, 1
    for ch in text:
        if ch == "\n":
            line += 1
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth < 0:
                return line, "'}' sem '{' correspondente"
    if depth:
        return line, f"{depth} '{{' sem fechar no fim do arquivo"
    return None


@pytest.mark.parametrize("css", CSS_FILES, ids=lambda p: str(p.relative_to(STATIC)))
def test_css_braces_balanced(css):
    assert _unbalanced_at(css.read_text(encoding="utf-8")) is None
