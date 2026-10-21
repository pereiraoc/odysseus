"""Texto de PDF com layout preservado. pdftotext (poppler) se existir; senao pdfplumber."""
from __future__ import annotations

import shutil
import subprocess
import tempfile
from typing import Optional

from src.finance.importers.base import ParseError


def pdf_text(data: bytes, password: Optional[str] = None) -> str:
    if shutil.which("pdftotext"):
        with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
            f.write(data)
            f.flush()
            cmd = ["pdftotext", "-layout"]
            if password:
                cmd += ["-upw", password]
            cmd += [f.name, "-"]
            p = subprocess.run(cmd, capture_output=True, timeout=120)
        if p.returncode != 0:
            err = p.stderr.decode("utf-8", "replace").strip()
            raise ParseError(f"pdftotext falhou: {err}" + (" (PDF com senha)" if "password" in err.lower() else ""))
        return p.stdout.decode("utf-8", "replace")
    try:
        import io

        import pdfplumber
    except ImportError as exc:  # pragma: no cover - depende do ambiente
        raise ParseError("nem pdftotext nem pdfplumber disponiveis") from exc
    try:
        with pdfplumber.open(io.BytesIO(data), password=password or "") as pdf:
            return "\n\f".join((page.extract_text(layout=True) or "") for page in pdf.pages)
    except Exception as exc:  # pdfminer levanta tipos variados para senha/corrompido
        raise ParseError(f"pdfplumber falhou: {exc}") from exc
