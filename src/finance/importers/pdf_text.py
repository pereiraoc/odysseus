"""Texto de PDF com layout preservado. pdftotext (poppler) se existir; senao pdfplumber."""
from __future__ import annotations

import os
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


def ocr_available() -> bool:
    return bool(shutil.which("tesseract") and shutil.which("pdftoppm"))


def ocr_pdf_text(data: bytes, dpi: int = 300, lang: str = "por") -> str:
    """PDF que e so imagem -> texto via pdftoppm + tesseract (psm 6, espacos preservados)."""
    if not ocr_available():
        raise ParseError("PDF sem texto (imagem): precisa de OCR e o tesseract nao esta instalado")
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "in.pdf")
        with open(src, "wb") as f:
            f.write(data)
        p = subprocess.run(["pdftoppm", "-r", str(dpi), "-png", src, os.path.join(tmp, "pg")], capture_output=True, timeout=600)
        if p.returncode != 0:
            raise ParseError(f"pdftoppm falhou: {p.stderr.decode('utf-8', 'replace').strip()}")
        pages = []
        for img in sorted(x for x in os.listdir(tmp) if x.startswith("pg") and x.endswith(".png")):
            t = subprocess.run(["tesseract", os.path.join(tmp, img), "stdout", "-l", lang, "--psm", "6",
                                "-c", "preserve_interword_spaces=1"], capture_output=True, timeout=600)
            if t.returncode != 0:
                raise ParseError(f"tesseract falhou: {t.stderr.decode('utf-8', 'replace').strip()[:200]}")
            pages.append(t.stdout.decode("utf-8", "replace"))
        return "\n\f".join(pages)
