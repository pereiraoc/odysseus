"""Fork-local: roda os testes node dos módulos puros do painel Life."""
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.skipif(not shutil.which("node"), reason="node não instalado")
def test_life_format_js():
    r = subprocess.run(["node", "--test", str(ROOT / "tests" / "life_format.test.mjs")],
                       capture_output=True, text=True, timeout=120, cwd=ROOT)
    assert r.returncode == 0, r.stdout + r.stderr
