"""Registro de importadores. detect() escolhe pelo conteudo, nunca so pelo nome."""
from __future__ import annotations

from typing import Optional

from src.finance.importers import nubank_fatura_pdf, ofx, santander_cc_pdf, santander_csv, wise_csv
from src.finance.importers.base import ParsedFile, ParseError
from src.finance.importers.pdf_text import pdf_text

BY_NAME = {m.NAME: m for m in (ofx, wise_csv, santander_csv, santander_cc_pdf, nubank_fatura_pdf)}
PDF_IMPORTERS = (santander_cc_pdf, nubank_fatura_pdf)
SNIFF_IMPORTERS = (ofx, wise_csv, santander_csv)


def parse_file(name: str, data: bytes, pdf_password: Optional[str] = None) -> ParsedFile:
    if data[:5] == b"%PDF-":
        text = pdf_text(data, pdf_password)
        if len(text.strip()) < 50:
            raise ParseError("PDF sem texto (imagem): precisa de OCR")
        for mod in PDF_IMPORTERS:
            if mod.matches_text(text):
                return mod.parse(name, data, text=text)
        raise ParseError("PDF de layout desconhecido")
    head = data[:4096]
    for mod in SNIFF_IMPORTERS:
        if mod.sniff(name, head):
            return mod.parse(name, data)
    raise ParseError("formato desconhecido")
