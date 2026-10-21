"""Registro de importadores. detect() escolhe pelo conteudo, nunca so pelo nome."""
from __future__ import annotations

from typing import Optional

from src.finance.importers import (nubank_fatura_pdf, ofx, santander_cc_pdf, santander_csv, santander_fatura_pdf, wise_api,
                                   wise_csv)
from src.finance.importers.base import ParsedFile, ParseError
from src.finance.importers.pdf_text import ocr_pdf_text, pdf_text

BY_NAME = {m.NAME: m for m in (ofx, wise_csv, santander_csv, santander_cc_pdf, nubank_fatura_pdf, santander_fatura_pdf)}
BY_NAME[santander_cc_pdf.OCR_NAME] = santander_cc_pdf
BY_NAME[wise_api.NAME] = wise_api
PDF_IMPORTERS = (santander_cc_pdf, nubank_fatura_pdf)
SNIFF_IMPORTERS = (ofx, wise_csv, santander_csv)


def apply_corrections(text: str, corrections: list[dict]) -> tuple[str, list[str]]:
    """Correcoes manuais de leitura (OCR), guardadas fora do bruto: cada 'find' tem que
    aparecer exatamente uma vez, senao a correcao e recusada (nao corrige no escuro)."""
    notes = []
    for c in corrections:
        n = text.count(c["find"])
        if n != 1:
            raise ParseError(f"correcao {c['find']!r} aparece {n}x no texto (esperado 1)")
        text = text.replace(c["find"], c["replace"])
        notes.append(f"correcao manual: {c['find']!r} -> {c['replace']!r} ({c.get('reason', '')})")
    return text, notes


def parse_file(name: str, data: bytes, pdf_password: Optional[str] = None,
               corrections: Optional[list[dict]] = None) -> ParsedFile:
    if data[:5] == b"%PDF-":
        text = pdf_text(data, pdf_password)
        if len(text.strip()) < 50:
            text, notes = apply_corrections(ocr_pdf_text(data), corrections or [])
            if santander_cc_pdf.matches_ocr_text(text):
                parsed = santander_cc_pdf.parse(name, data, text=text, ocr=True)
                parsed.warnings += notes
                inferred = [r for r in parsed.records if r.extra.get("ocr_inferred")]
                parsed.warnings += [f"valor deduzido do saldo impresso: {r.date} {r.description} = {r.amount_cents / 100:.2f}"
                                    for r in inferred]
                return parsed
            raise ParseError("PDF em imagem: OCR feito, mas layout desconhecido")
        if santander_fatura_pdf.matches_text(text):  # duas colunas: rele o PDF por metades
            return santander_fatura_pdf.parse(name, data, password=pdf_password)
        for mod in PDF_IMPORTERS:
            if mod.matches_text(text):
                return mod.parse(name, data, text=text)
        raise ParseError("PDF de layout desconhecido")
    head = data[:4096]
    for mod in SNIFF_IMPORTERS:
        if mod.sniff(name, head):
            return mod.parse(name, data)
    raise ParseError("formato desconhecido")


def parse_file_multi(name: str, data: bytes, pdf_password: Optional[str] = None,
                     corrections: Optional[list[dict]] = None) -> list[ParsedFile]:
    """Um bruto pode gerar varias contas (ex.: saldos de todas as moedas do Wise num JSON)."""
    if wise_api.sniff(name, data[:4096]):
        return wise_api.parse_multi(name, data)
    return [parse_file(name, data, pdf_password, corrections)]
