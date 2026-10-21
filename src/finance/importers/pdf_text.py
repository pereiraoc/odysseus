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


def pdf_text_columns(data: bytes, password: Optional[str] = None) -> str:
    """Faturas em duas colunas: texto de cada pagina como metade esquerda + metade direita
    (pdftotext com recorte; mantem espacos, ao contrario do pdfplumber nesse layout)."""
    if not (shutil.which("pdftotext") and shutil.which("pdfinfo")):
        raise ParseError("layout em colunas precisa do poppler (pdftotext/pdfinfo)")
    pw = ["-upw", password] if password else []
    with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
        f.write(data)
        f.flush()
        info = subprocess.run(["pdfinfo", *pw, f.name], capture_output=True, text=True, timeout=60)
        if info.returncode != 0:
            raise ParseError(f"pdfinfo falhou: {info.stderr.strip()}" + (" (PDF com senha)" if "password" in info.stderr.lower() else ""))
        pages = int(next(l.split()[1] for l in info.stdout.splitlines() if l.startswith("Pages:")))
        size = next(l for l in info.stdout.splitlines() if l.startswith("Page size:")).split()
        w, h = float(size[2]), float(size[4])
        out = []
        for pg in range(1, pages + 1):
            for x in (0, w / 2):
                p = subprocess.run(["pdftotext", "-layout", *pw, "-f", str(pg), "-l", str(pg), "-x", str(int(x)), "-y", "0",
                                    "-W", str(int(w / 2) + 1), "-H", str(int(h) + 1), f.name, "-"],
                                   capture_output=True, timeout=120)
                out.append(p.stdout.decode("utf-8", "replace"))
        return "\n\f".join(out)
