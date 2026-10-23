"""Fork-local: nucleo do arquivo financeiro (src/finance). Dados sinteticos, nada pessoal."""
from __future__ import annotations

import os
import shutil
import subprocess

import pytest

from src.finance import dedup, reconcile
from src.finance.importers import santander_csv
from src.finance.importers.base import ParseError
from src.finance.ingest import ingest_bytes
from src.finance.ledger import export
from src.finance.money import digits, norm_desc, parse_brl, parse_decimal
from src.finance.store import Store


def ofx(acct: str, rows: list[tuple], bank: str = "0260", bal: tuple | None = None, rendimento: str | None = None,
        start: str = "20230101", end: str = "20230131") -> bytes:
    trn = "".join(
        f"<STMTTRN>\n<TRNTYPE>OTHER</TRNTYPE>\n<DTPOSTED>{d}000000[-3:BRT]</DTPOSTED>\n<TRNAMT>{a}</TRNAMT>\n"
        f"<FITID>{fid}</FITID>\n<MEMO>{memo}</MEMO>\n</STMTTRN>\n" for d, a, fid, memo in rows)
    ledger = f"<LEDGERBAL>\n<BALAMT>{bal[1]}</BALAMT>\n<DTASOF>{bal[0]}000000[-3:BRT]</DTASOF>\n</LEDGERBAL>\n" if bal else ""
    ballist = (f"<BALLIST>\n<BAL>\n<NAME>RENDIMENTO LIQUIDO</NAME>\n<BALTYPE>NUMBER</BALTYPE>\n<VALUE>{rendimento}</VALUE>\n"
               f"</BAL>\n</BALLIST>\n") if rendimento else ""
    return ("OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nENCODING:UTF-8\n\n<OFX>\n<BANKMSGSRSV1>\n<STMTTRNRS>\n<STMTRS>\n"
            f"<CURDEF>BRL</CURDEF>\n<BANKACCTFROM>\n<BANKID>{bank}</BANKID>\n<ACCTID>{acct}</ACCTID>\n"
            f"<ACCTTYPE>CHECKING</ACCTTYPE>\n</BANKACCTFROM>\n<BANKTRANLIST>\n<DTSTART>{start}000000[-3:BRT]</DTSTART>\n"
            f"<DTEND>{end}000000[-3:BRT]</DTEND>\n{trn}</BANKTRANLIST>\n{ledger}{ballist}</STMTRS>\n</STMTTRNRS>\n"
            "</BANKMSGSRSV1>\n</OFX>\n").encode()


WISE_HEADER = ('"TransferWise ID",Date,Amount,Currency,Description,"Payment Reference","Running Balance","Exchange From",'
               '"Exchange To","Exchange Rate","Payer Name","Payee Name","Payee Account Number",Merchant,'
               '"Card Last Four Digits","Card Holder Full Name",Attachment,Note,"Total fees","Exchange To Amount"\n')


def wise(rows: list[tuple]) -> bytes:
    return (WISE_HEADER + "".join(f'{i},{d},{a},EUR,"{desc}",,{bal},,,,,,,,,,,,0.00,\n' for i, d, a, desc, bal in rows)).encode()


@pytest.fixture
def store(tmp_path):
    s = Store(tmp_path / "finance")
    yield s
    s.close()


def tx_count(store, account_prefix=""):
    return store.db.execute("SELECT count(*) FROM transactions WHERE account_key LIKE ?", (account_prefix + "%",)).fetchone()[0]


# --- valores -----------------------------------------------------------------

def test_money_parsing():
    assert parse_brl("1.234,56") == 123456
    assert parse_brl("10,99-") == -1099
    assert parse_brl("R$ 5,00") == 500
    assert parse_decimal("-8.64") == -864
    assert parse_decimal("1200.0") == 120000
    with pytest.raises(ValueError):
        parse_decimal("1.005")
    assert digits("000010804931") == digits("01.080493-1") == "10804931"
    assert norm_desc("Compra no débito - Café") == "compra no debito cafe"


# --- ingestao idempotente ------------------------------------------------------

def test_same_file_twice_is_noop(store):
    data = ofx("1234-5", [("20230105", "-10.00", "u-1", "Padaria")], bal=("20230131", "90.00"))
    first = ingest_bytes(store, "a.ofx", data)
    second = ingest_bytes(store, "copia-com-outro-nome.ofx", data)
    assert first["new_records"] == 1 and second["new_records"] == 0
    assert second["new_blob"] is False
    assert store.db.execute("SELECT count(*) FROM raw_blobs").fetchone()[0] == 1
    assert store.db.execute("SELECT count(*) FROM blob_names").fetchone()[0] == 2


def test_identical_rows_in_one_file_are_two_records(store):
    rows = [("20230105", "-5.00", "000000", "CAFE"), ("20230105", "-5.00", "000000", "CAFE")]
    ingest_bytes(store, "s.ofx", ofx("000012345678", rows, bank="0033"))
    dedup.rebuild(store)
    assert tx_count(store) == 2


def test_overlapping_files_without_ids_do_not_duplicate(store):
    a = ofx("000012345678", [("20230105", "-5.00", "000000", "CAFE"), ("20230105", "-5.00", "000000", "CAFE")], bank="0033")
    b = ofx("000012345678", [("20230105", "-5.00", "000000", "CAFE"), ("20230105", "-5.00", "000000", "CAFE"),
                             ("20230106", "-7.00", "000000", "PAO")], bank="0033", end="20230110")
    ingest_bytes(store, "jan-1.ofx", a)
    ingest_bytes(store, "jan-2.ofx", b)
    dedup.rebuild(store)
    assert tx_count(store) == 3


def test_failed_parse_keeps_raw_blob(store):
    res = ingest_bytes(store, "lixo.bin", b"nada reconhecivel")
    assert res["status"] == "error"
    row = store.db.execute("SELECT status, path FROM raw_blobs").fetchone()
    assert row["status"] == "error" and (store.root / row["path"]).is_file()


# --- dedup entre fontes --------------------------------------------------------

def test_cross_source_merge_respects_multiplicity(store):
    # mesma conta em OFX (com FITID) e em CSV secundario do mesmo mes: 2 cafes iguais + 1 pao
    ingest_bytes(store, "n.ofx", ofx("000012345678", [
        ("20230105", "-5.00", "000000", "COMPRA CAFE"), ("20230105", "-5.00", "000000", "COMPRA CAFE"),
        ("20230107", "-7.00", "000000", "PADARIA")], bank="0033"))
    csv = ("Descrição,Valor,Data,Categoria,Subcategoria,Conta\n"
           "COMPRA CAFE,5.0,05/01/2023,Comida,Cafe,01.234567-8\nCOMPRA CAFE,5.0,05/01/2023,Comida,Cafe,01.234567-8\n"
           "PADARIA,7.0,09/01/2023,Comida,Pao,01.234567-8\n")
    ingest_bytes(store, "SANTANDER_2023_01_DESPESAS.csv", csv.encode())
    stats = dedup.rebuild(store)
    assert tx_count(store) == 3
    assert stats["auto_merged"] == 3 and stats["queued"] == 0


def test_secondary_without_pair_goes_to_queue_not_ledger(store):
    ingest_bytes(store, "n.ofx", ofx("000012345678", [("20230105", "-5.00", "000000", "CAFE")], bank="0033"))
    csv = "Data,Descrição,Valor\n20/01,ALGO QUE NAO EXISTE,99.0\n"
    ingest_bytes(store, "SANTANDER_2023_01_DESPESAS.csv", csv.encode())
    stats = dedup.rebuild(store)
    assert tx_count(store) == 1 and stats["queued"] == 1
    assert store.db.execute("SELECT reason FROM review_queue").fetchone()["reason"] == "secundaria_sem_par"


def test_manual_decision_survives_rebuild(store):
    ingest_bytes(store, "n.ofx", ofx("000012345678", [("20230105", "-5.00", "000000", "CAFE")], bank="0033"))
    ingest_bytes(store, "SANTANDER_2023_01_DESPESAS.csv", "Data,Descrição,Valor\n20/01,OUTRA COISA,5.0\n".encode())
    dedup.rebuild(store)
    rows = {r["importer"]: r for r in store.db.execute("SELECT * FROM source_records")}
    store.db.execute("INSERT INTO merge_decisions VALUES (?,?,datetime('now'),'teste')",
                     (dedup.record_key(rows["santander_csv"]), dedup.record_key(rows["ofx"])))
    for _ in range(2):
        stats = dedup.rebuild(store)
        assert stats["manual"] == 1 and stats["queued"] == 0 and tx_count(store) == 1


def test_rebuild_is_deterministic(store):
    ingest_bytes(store, "n.ofx", ofx("1", [("20230105", "-5.00", f"id-{i}", f"X{i}") for i in range(20)]))
    dedup.rebuild(store)
    snap1 = store.db.execute("SELECT anchor_key, date, amount_cents FROM transactions ORDER BY anchor_key").fetchall()
    dedup.rebuild(store)
    snap2 = store.db.execute("SELECT anchor_key, date, amount_cents FROM transactions ORDER BY anchor_key").fetchall()
    assert [tuple(r) for r in snap1] == [tuple(r) for r in snap2]


# --- importadores --------------------------------------------------------------

def test_nubank_rendimento_becomes_record_and_balances(store):
    ingest_bytes(store, "jan.ofx", ofx("5555-1", [("20230110", "-10.00", "u-1", "Compra")],
                                       bal=("20230131", "100.00"), end="20230131"))
    ingest_bytes(store, "fev.ofx", ofx("5555-1", [("20230210", "-20.00", "u-2", "Compra")],
                                       bal=("20230228", "80.50"), rendimento="0.50", start="20230201", end="20230228"))
    dedup.rebuild(store)
    rep = reconcile.reconcile_balances(store, "nubank:checking:55551:BRL")
    assert rep["status"] == "ok" and rep["checked"] == 2


def test_wise_same_id_opposite_amounts_are_distinct(store):
    y1 = wise([("CARD-1", "30-12-2022", "-10.00", "hold", "90.00")])
    y2 = wise([("CARD-1", "02-01-2023", "10.00", "estorno", "100.00")])
    ingest_bytes(store, "statement_77_EUR_2022-01-01_2022-12-31.csv", y1)
    ingest_bytes(store, "statement_77_EUR_2023-01-01_2023-12-31.csv", y2)
    dedup.rebuild(store)
    assert tx_count(store, "wise:") == 2
    assert reconcile.reconcile_balances(store, "wise:wallet:77:EUR")["status"] == "ok"


def test_santander_csv_date_disambiguation():
    assert santander_csv._date("2023-02-10", 2023, 10) == "2023-10-02"   # dia/mes trocados
    assert santander_csv._date("05/04", 2023, 4) == "2023-04-05"         # sem ano
    assert santander_csv._date("13/01/2023", 2023, 1) == "2023-01-13"
    with pytest.raises(ParseError):
        santander_csv._date("ontem", 2023, 1)


# --- reconciliacao e ledger ----------------------------------------------------

def test_gap_is_one_break_not_every_month(store):
    ingest_bytes(store, "m1.ofx", ofx("9-9", [("20230110", "-10.00", "a", "x")], bal=("20230131", "90.00")))
    # fevereiro faltando (saida de 30 nao importada); marco e abril ok a partir dai
    ingest_bytes(store, "m3.ofx", ofx("9-9", [("20230310", "-5.00", "c", "z")], bal=("20230331", "55.00"),
                                      start="20230301", end="20230331"))
    ingest_bytes(store, "m4.ofx", ofx("9-9", [("20230410", "-5.00", "d", "w")], bal=("20230430", "50.00"),
                                      start="20230401", end="20230430"))
    dedup.rebuild(store)
    rep = reconcile.reconcile_balances(store, "nubank:checking:99:BRL")
    assert len(rep["breaks"]) == 1
    assert rep["breaks"][0]["delta"] == 3000 and rep["breaks"][0]["after"] == "2023-01-31"


def test_ledger_export_passes_hledger_check(store, tmp_path):
    ingest_bytes(store, "m1.ofx", ofx("9-9", [("20230110", "-10.00", "a", "x; com ponto e virgula")],
                                      bal=("20230131", "90.00")))
    ingest_bytes(store, "m3.ofx", ofx("9-9", [("20230310", "-5.00", "c", "z")], bal=("20230331", "55.00"),
                                      start="20230301", end="20230331"))
    dedup.rebuild(store)
    res = export(store, tmp_path / "ledger", commit=False)
    assert res["gaps"] == 1 and res["assertions"] == 2
    hledger = os.environ.get("HLEDGER") or shutil.which("hledger")
    if not hledger:
        pytest.skip("hledger nao instalado")
    p = subprocess.run([hledger, "-f", str(tmp_path / "ledger" / "main.journal"), "check", "-s", "ordereddates"],
                       capture_output=True, text=True)
    assert p.returncode == 0, p.stderr


SANTANDER_TXT = """Extrato_PF_Inteligente - 1/1/2023
                 Resumo - maio/2023
       Agência                 Conta Corrente
       1234                    01.234567-8
               Conta Corrente
       Movimentação
       Data       Descrição                        Nº Documento   Movimento (R$)    Saldo (R$)
                  SALDO EM 30/04                                                     1.000,00
       02/05      COMPRA CARTAO MAESTRO               304174               10,99-
                  01/05 PADARIA
                  PIX RECEBIDO                          -                  100,00     1.089,01
       03/05      TARIFA                                -                    9,01-
                  SALDO EM 31/05                                                     1.080,00
"""


def test_santander_pdf_text_validates_balances():
    from src.finance.importers import santander_cc_pdf
    p = santander_cc_pdf.parse("x.pdf", b"", text=SANTANDER_TXT)
    assert [r.amount_cents for r in p.records] == [-1099, 10000, -901]
    assert p.records[0].description == "COMPRA CARTAO MAESTRO | 01/05 PADARIA"
    assert p.records[0].date == "2023-05-02" and p.checkpoints[0].date == "2023-04-30"
    with pytest.raises(ParseError):  # fechamento adulterado e rejeitado
        santander_cc_pdf.parse("x.pdf", b"", text=SANTANDER_TXT.replace("1.080,00", "1.081,00"))


NUBANK_TXT = """Nu Pagamentos S.A.
FATURA 11 JAN 2023 EMISSÃO E ENVIO 04 JAN 2023
RESUMO DA FATURA ATUAL                                   VALORES EM R$
             Fatura anterior                                       100,00
             Pagamento recebido                                    100,00
             Total de compras, 04 DEZ a 04 JAN                      60,00
             Total a pagar                                      R$ 50,00
TRANSAÇÕES   DE 04 DEZ A 04 JAN                                VALORES EM R$
             05 DEZ           Pagamento em 05 DEZ                  100,00
             20 DEZ           Loja - 1/3                            40,00
             02 JAN           Estorno de "Outra"                    10,00
             03 JAN           Mercado                               20,00
"""


def test_nubank_fatura_text_signs_years_and_check():
    from src.finance.importers import nubank_fatura_pdf
    p = nubank_fatura_pdf.parse("f.pdf", b"", text=NUBANK_TXT)
    assert [(r.date, r.amount_cents) for r in p.records] == [
        ("2022-12-05", 10000), ("2022-12-20", -4000), ("2023-01-02", 1000), ("2023-01-03", -2000)]
    assert p.records[1].extra == {"installment": 1, "installments": 3}
    assert not p.warnings
    bad = nubank_fatura_pdf.parse("f.pdf", b"", text=NUBANK_TXT.replace("R$ 50,00", "R$ 55,00"))
    assert bad.warnings


def test_wise_api_blobs_merge_with_csv(store):
    import json as _json
    ingest_bytes(store, "statement_77_EUR_2023-01-01_2023-12-31.csv",
                 wise([("CARD-5", "10-06-2023", "-5.87", "Loja", "20.03")]))
    stmt = {"_source": "wise_api", "kind": "statement", "profile": 1, "fetched_at": "2023-06-30T00:00:00+00:00",
            "balance_id": 77, "currency": "EUR",
            "data": {"transactions": [{"date": "2023-06-10T12:00:00Z", "amount": {"value": -5.87, "currency": "EUR"},
                                       "referenceNumber": "CARD-5", "details": {"description": "Loja", "type": "CARD"}}],
                     "endOfStatementBalance": {"value": 20.03}, "query": {"intervalEnd": "2023-06-30T00:00:00Z"}}}
    bal = {"_source": "wise_api", "kind": "balances", "profile": 1, "fetched_at": "2023-07-01T00:00:00+00:00",
           "data": [{"id": 77, "currency": "EUR", "amount": {"value": 20.03, "currency": "EUR"}}]}
    assert ingest_bytes(store, "s.json", _json.dumps(stmt).encode())["new_records"] == 1  # outra fonte; dedup funde
    assert ingest_bytes(store, "b.json", _json.dumps(bal).encode())["status"] == "parsed"
    dedup.rebuild(store)
    assert tx_count(store, "wise:") == 1
    rep = reconcile.reconcile_balances(store, "wise:wallet:77:EUR")
    assert rep["status"] == "ok" and rep["checked"] == 3


SANTANDER_FATURA_TXT = """    Vencimento
    10/02/2023
Detalhamento da Fatura
OCTAVIO G PEREIRA - 5428 XXXX XXXX 1111
Pagamento e Demais Créditos
Compra Data Descrição                         Parcela      R$       US$
          10/01 DEB. AUTOM. DE FATURA EM C/                -100,00
Despesas
          04/01 LOJA EXTERIOR                                68,32    11,99
                  COTAÇÃO DOLAR R$ 5,6981
                  IOF DESPESA NO EXTERIOR                     3,50             R
   2      05/01 MERCADO                          02/03      28,18          R
          VALOR TOTAL                                       100,00
@ OCTAVIO G PEREIRA - 5428 XXXX XXXX 2222
          13/01 ESTORNO LOJA                                -10,00
Resumo da Fatura
Saldo Anterior                                             100,00
(=) Saldo Desta Fatura                                      90,00
"""


def test_santander_fatura_text():
    from src.finance.importers import santander_fatura_pdf
    p = santander_fatura_pdf.parse("f.pdf", b"", text=SANTANDER_FATURA_TXT)
    assert [(r.date, r.amount_cents, r.kind) for r in p.records] == [
        ("2023-01-10", 10000, "PAYMENT"), ("2023-01-04", -6832, "PURCHASE"), ("2023-01-04", -350, "IOF"),
        ("2023-01-05", -2818, "PURCHASE"), ("2023-01-13", 1000, "CREDIT")]
    assert p.records[3].extra["installment"] == 2 and p.records[4].extra["card"] == "2222"
    assert not p.warnings


def test_rules_priority_manual_and_transfer_pairs(store):
    import json as _json
    from src.finance import rules
    ingest_bytes(store, "n.ofx", ofx("5555-1", [
        ("20230105", "-100.00", "n1", "Pagamento da fatura - Cartão Nubank"),
        ("20230106", "-30.00", "n2", "Compra no débito - Uber Eats"),
        ("20230107", "-40.00", "n3", "Compra no débito - Uber Trip")]))
    ingest_bytes(store, "s.ofx", ofx("000012345678", [("20230108", "100.00", "000000", "DEB. AUTOM. DE FATURA EM C/")],
                                     bank="0033"))
    dedup.rebuild(store)
    (store.root / "ledger").mkdir(exist_ok=True)
    (store.root / "ledger" / "rules.json").write_text(_json.dumps({"rules": [
        {"id": "uber", "priority": 600, "when": {"text_any": ["uber"]}, "then": {"category": "transporte:app"}},
        {"id": "eats", "priority": 610, "when": {"text_any": ["uber eats"]}, "then": {"category": "alimentacao:delivery"}},
        {"id": "fatura", "priority": 900, "when": {"text_any": ["pagamento da fatura", "deb autom de fatura"]},
         "then": {"category": "transferencias:interna"}}]}))
    res = rules.categorize(store)
    assert res["coverage"] == 1.0 and res["hits"] == {"fatura": 2, "eats": 1, "uber": 1}
    cat = dict(store.db.execute("SELECT t.description, a.category FROM transactions t JOIN annotations a USING (anchor_key)").fetchall())
    assert cat["Compra no débito - Uber Eats"] == "alimentacao:delivery"
    assert rules.pair_transfers(store) == {"internal": 2, "pairs": 1, "unpaired": 0}
    # manual vence regra e sobrevive a recategorizar
    anchor = store.db.execute("SELECT anchor_key FROM transactions WHERE description LIKE '%Trip'").fetchone()[0]
    store.db.execute("INSERT OR REPLACE INTO annotations VALUES (?, 'viagem:taxi', 'manual', 1, 'x')", (anchor,))
    rules.categorize(store)
    assert store.db.execute("SELECT category FROM annotations WHERE anchor_key=?", (anchor,)).fetchone()[0] == "viagem:taxi"
    assert rules.merchant("COMPRA CARTAO MAESTRO | 25/02 ZAFFARI LOJA 08") == "zaffari loja 08"
    assert rules.merchant("Transação por cartão de 5.00 EUR emitida por Loja X") == "loja x"


def test_monthly_income_expenses_neutral_and_networth(store):
    import json as _json
    from src.finance import rules
    from src.finance.analytics import monthly
    ingest_bytes(store, "jan.ofx", ofx("5555-1", [
        ("20230105", "1000.00", "a", "Credito de salario"), ("20230110", "-300.00", "b", "Compra no débito - Mercado"),
        ("20230115", "-200.00", "c", "Aplicação RDB"), ("20230120", "-50.00", "d", "Transferência enviada pelo Pix - Fulano")],
        bal=("20230131", "450.00")))
    dedup.rebuild(store)
    (store.root / "ledger").mkdir(exist_ok=True)
    (store.root / "ledger" / "rules.json").write_text(_json.dumps({"rules": [
        {"id": "sal", "when": {"text_any": ["salario"]}, "then": {"category": "renda:salario"}},
        {"id": "merc", "when": {"text_any": ["mercado"]}, "then": {"category": "alimentacao:mercado"}},
        {"id": "rdb", "when": {"text_any": ["aplicacao rdb"]}, "then": {"category": "transferencias:investimento"}},
        {"id": "pix", "when": {"text_any": ["pix"]}, "then": {"category": "transferencias:pessoas"}}]}))
    rules.categorize(store)
    p = monthly(store)["periods"][0]
    assert (p["income"], p["salary"], p["expenses"], p["net"]) == (100000, 100000, 35000, 65000)
    assert p["savings_rate"] == 0.65 and p["net_worth"] == 45000 and p["invested"] == 20000 and p["nw_plus"] == 65000
    assert p["by_group"] == {"alimentacao": 30000, "pessoas": 5000}
    q = monthly(store, people=False)["periods"][0]
    assert q["expenses"] == 30000 and q["people_out"] == -5000


def test_pluggy_blob_signs_dates_and_pending(store):
    import json as _json
    from src.finance.importers.pluggy import parse_multi
    card = {"_source": "pluggy", "kind": "account", "item": "i1", "institution": "nubank", "item_last_updated": "2026-10-21T02:11:27Z",
            "account": {"id": "a1", "type": "CREDIT", "currencyCode": "BRL", "name": "Cartao", "balance": 100},
            "transactions": [
                {"id": "t1", "type": "DEBIT", "amount": 50.5, "date": "2026-10-05T00:30:00Z", "description": "Loja",
                 "status": "POSTED", "creditCardMetadata": {"purchaseDate": "2026-10-04T23:30:00Z", "installmentNumber": 2, "totalInstallments": 3}},
                {"id": "t2", "type": "CREDIT", "amount": -20, "date": "2026-10-06T03:00:00Z", "description": "Pagamento recebido", "status": "POSTED"},
                {"id": "t3", "type": "DEBIT", "amount": 9, "date": "2027-01-05T03:00:00Z", "description": "Parcela futura", "status": "PENDING"}]}
    p = parse_multi("x.json", _json.dumps(card, sort_keys=True).encode())[0]
    assert p.account.key == "nubank:credit_card:principal:BRL" and not p.checkpoints
    assert [(r.date, r.amount_cents) for r in p.records] == [("2026-10-04", -5050), ("2026-10-06", 2000)]
    assert p.records[0].extra["installment"] == 2 and p.warnings
    bank = {**card, "account": {"id": "a2", "type": "BANK", "currencyCode": "BRL", "number": "05555-1", "balance": 638.27},
            "transactions": [{"id": "b1", "type": "DEBIT", "amount": -10, "date": "2026-10-20T01:00:00Z", "description": "Pix", "status": "POSTED"}]}
    q = parse_multi("y.json", _json.dumps(bank, sort_keys=True).encode())[0]
    assert q.account.key == "nubank:checking:55551:BRL" and q.records[0].date == "2026-10-19"
    assert q.checkpoints[0].date == "2026-10-20" and q.checkpoints[0].balance_cents == 63827
    res = ingest_bytes(store, "y.json", _json.dumps(bank, sort_keys=True).encode())
    assert res["status"] == "parsed" and res["new_records"] == 1
    inv = ingest_bytes(store, "inv.json", b'{"_source": "pluggy-investments", "results": []}')
    assert inv["status"] == "parsed" and inv["records"] == 0


def test_pluggy_self_transfer_and_counterparty_rule(store):
    import json as _json
    from src.finance import rules
    bank = {"_source": "pluggy", "kind": "account", "item": "i1", "institution": "nubank", "item_last_updated": "2026-10-21T02:11:27Z",
            "account": {"id": "a2", "type": "BANK", "currencyCode": "BRL", "number": "05555-1", "balance": 10, "taxNumber": "123.456.789-00"},
            "transactions": [
                {"id": "s1", "type": "CREDIT", "amount": 4980, "date": "2026-10-15T12:00:00Z", "description": "Transferência Recebida", "status": "POSTED",
                 "paymentData": {"payer": {"routingNumber": "033", "branchNumber": "3735", "accountNumber": "71308654-8",
                                           "documentNumber": {"type": "CPF", "value": "12345678900"}}}},
                {"id": "s2", "type": "CREDIT", "amount": 50, "date": "2026-10-16T12:00:00Z", "description": "Transferência Recebida", "status": "POSTED",
                 "paymentData": {"payer": {"routingNumber": "260", "accountNumber": "999", "documentNumber": {"type": "CPF", "value": "12345678900"}}}}]}
    ingest_bytes(store, "b.json", _json.dumps(bank, sort_keys=True).encode())
    dedup.rebuild(store)
    (store.root / "ledger").mkdir(exist_ok=True)
    (store.root / "ledger" / "rules.json").write_text(_json.dumps({"rules": [
        {"id": "sal", "priority": 960, "when": {"counterparty_account_any": ["033/3735/713086548"], "sign": "credit"}, "then": {"category": "renda:salario"}},
        {"id": "self", "priority": 905, "when": {"flag": "self_transfer"}, "then": {"category": "transferencias:interna"}}]}))
    assert rules.categorize(store)["hits"] == {"sal": 1, "self": 1}


def test_salary_split_estimates_13th_and_extra(store):
    import json as _json
    from src.finance import rules
    from src.finance.analytics import monthly
    rows, months = [], ["2023-%02d" % m for m in range(1, 13)]
    for m in months:
        amount = {"2023-04": "9000.00", "2023-11": "11000.00", "2023-12": "12000.00"}.get(m, "5000.00")
        rows.append((m.replace("-", "") + "15", amount, f"s{m}", "Credito de salario"))
    ingest_bytes(store, "a.ofx", ofx("5555-1", rows))
    dedup.rebuild(store)
    (store.root / "ledger").mkdir(exist_ok=True)
    (store.root / "ledger" / "rules.json").write_text(_json.dumps({"rules": [
        {"id": "sal", "when": {"text_any": ["salario"]}, "then": {"category": "renda:salario"}}]}))
    rules.categorize(store)
    p = {x["period"]: x for x in monthly(store)["periods"]}
    assert (p["2023-04"]["salary_base"], p["2023-04"]["salary_other"]) == (500000, 400000)   # pico fora de nov/dez = extra
    assert (p["2023-11"]["salary_base"], p["2023-11"]["salary_13"]) == (500000, 600000)      # nov/dez = 13o
    # 13o passa de 1,2 salario no ano: o excesso de dezembro e ferias coletivas
    assert (p["2023-12"]["salary_13"], p["2023-12"]["salary_other"]) == (0, 700000)
    assert p["2023-06"]["salary_13"] == p["2023-06"]["salary_other"] == 0 and p["2023-06"]["salary_base"] == 500000
    # mesada: parte propria no grafico do salario, fora da base
    store.db.execute("UPDATE annotations SET category='renda:mesada', manual=1 WHERE anchor_key ="
                     " (SELECT anchor_key FROM transactions WHERE date='2023-06-15')")
    q = {x["period"]: x for x in monthly(store)["periods"]}["2023-06"]
    assert (q["salary"], q["salary_mesada"], q["income"]) == (0, 500000, 500000)


def test_card_ofx_repeated_fitid_and_chain(store):
    def card(rows, start, end, bal):
        trn = "".join(f"<STMTTRN>\n<TRNTYPE>DEBIT</TRNTYPE>\n<DTPOSTED>{d}000000[-3:BRT]</DTPOSTED>\n<TRNAMT>{a}</TRNAMT>\n"
                      f"<FITID>{fid}</FITID>\n<MEMO>{m}</MEMO>\n</STMTTRN>\n" for d, a, fid, m in rows)
        return ("OFXHEADER:100\n<OFX>\n<SIGNONMSGSRSV1>\n<SONRS>\n<FI>\n<ORG>NU PAGAMENTOS S.A.</ORG>\n<FID>260</FID>\n</FI>\n</SONRS>\n"
                "</SIGNONMSGSRSV1>\n<CREDITCARDMSGSRSV1>\n<CCSTMTTRNRS>\n<CCSTMTRS>\n<CURDEF>BRL</CURDEF>\n<CCACCTFROM>\n<ACCTID>x</ACCTID>\n"
                f"</CCACCTFROM>\n<BANKTRANLIST>\n<DTSTART>{start}000000</DTSTART>\n<DTEND>{end}000000</DTEND>\n{trn}</BANKTRANLIST>\n"
                f"<LEDGERBAL>\n<BALAMT>{bal}</BALAMT>\n<DTASOF>{end}000000</DTASOF>\n</LEDGERBAL>\n</CCSTMTRS>\n</CCSTMTTRNRS>\n"
                "</CREDITCARDMSGSRSV1>\n</OFX>\n").encode()
    jan = card([("20240101", "-62.18", "f1", "Patreon"), ("20240101", "-3.34", "f1", "IOF de Patreon")], "20231204", "20240104", "-65.52")
    fev = card([("20240110", "65.52", "p1", "Pagamento"), ("20240120", "-10.00", "f2", "Loja")], "20240104", "20240204", "-10.00")
    assert ingest_bytes(store, "jan.ofx", jan)["new_records"] == 2  # compra e IOF com o mesmo FITID: 2 registros
    ingest_bytes(store, "fev.ofx", fev)
    dedup.rebuild(store)
    r = reconcile.reconcile_bills(store, "nubank:credit_card:principal:BRL")
    assert r["status"] == "ok" and r["bills"] == 2 and not r["unbalanced"] and not r["chain_breaks"]


def test_rounding_cent_merges_only_same_day_similar_text(store):
    import json as _json
    ingest_bytes(store, "a.ofx", ofx("5555-1", [("20240101", "-3.35", "x1", 'IOF de "Patreon"'), ("20240102", "-10.00", "x2", "Loja A")]))
    blob = {"_source": "pluggy", "kind": "account", "item": "i", "institution": "nubank", "item_last_updated": "2024-01-03T12:00:00Z",
            "account": {"id": "a", "type": "BANK", "currencyCode": "BRL", "number": "05555-1", "balance": 0},
            "transactions": [
                {"id": "p1", "type": "DEBIT", "amount": -3.34, "date": "2024-01-01T12:00:00Z", "description": 'IOF de "Patreon"', "status": "POSTED"},
                {"id": "p2", "type": "DEBIT", "amount": -10.01, "date": "2024-01-02T12:00:00Z", "description": "Outra coisa", "status": "POSTED"},
                {"id": "p3", "type": "DEBIT", "amount": -10.01, "date": "2024-01-04T12:00:00Z", "description": "Loja A", "status": "POSTED"}]}
    ingest_bytes(store, "p.json", _json.dumps(blob, sort_keys=True).encode())
    stats = dedup.rebuild(store)
    # IOF 3,34 x 3,35 mesmo dia e mesmo texto: funde. 10,01 com texto diferente, ou com 2 dias de distancia: nao funde
    assert stats["auto_merged"] == 1 and tx_count(store, "nubank:checking") == 4


def test_merchant_and_confidence_and_user_rule(store):
    from src.finance import rules
    assert rules.merchant("Transferência enviada pelo Pix|Márcia Steemburgo") == "marcia steemburgo"
    assert rules.merchant("Transferência enviada pelo Pix - Márcia Steemburgo - •••.123.456-•• - NU PAGAMENTOS") == "marcia steemburgo"
    assert rules.merchant("COMPRA CARTAO MAESTRO | 25/02 ZAFFARI LOJA 08") == "zaffari loja 08"
    assert rules.confidence("transferencias:pessoas", "regra:pessoas", 0) == "baixa"
    assert rules.confidence("alimentacao:mercado", "regra:of-alimentacao-mercado", 0) == "media"
    assert rules.confidence("moradia:diarista", "regra:u-x-debit", 0) == "alta"
    ingest_bytes(store, "a.ofx", ofx("5555-1", [("20240105", "-150.00", "a", "Transferência enviada pelo Pix - Márcia Steemburgo - x"),
                                                ("20240106", "-30.00", "b", "Padaria")]))
    dedup.rebuild(store)
    q = rules.review_queue(store)
    assert q["items"][0]["merchant"] == "marcia steemburgo" and q["items"][0]["impact"] == 15000
    rules.add_user_rule(store, "marcia steemburgo", "debit", "moradia:diarista")
    rules.categorize(store)
    assert [i["merchant"] for i in rules.review_queue(store)["items"]] == ["padaria"]


def test_annual_subscription_amortized_and_aliases(store):
    import json as _json
    from src.finance import rules
    from src.finance.analytics import _sub_key, cost_structure
    assert _sub_key("Dropbox X3kj1h5v5m6d") == _sub_key("Dropbox Bqnxq2zb5h66") == "dropbox"
    assert _sub_key("Dl*Google Google") == "google one" and _sub_key("Dl*Google Youtub") == "google youtubepremium"
    rows = [("20240205", "-616.78", "d1", "Dropbox X3kj1h5v5m6d"), ("20250205", "-722.21", "d2", "Dropbox Bqnxq2zb5h66"),
            ("20260227", "-638.93", "d3", "Dropbox Ggsj4b29tfj4")]
    rows += [(f"2026{m:02d}03", "-14.99", f"g{m}", "Google One" if m % 2 else "Dl*Google Google") for m in range(1, 10)]
    ingest_bytes(store, "a.ofx", ofx("5555-1", rows))
    dedup.rebuild(store)
    (store.root / "ledger").mkdir(exist_ok=True)
    (store.root / "ledger" / "rules.json").write_text(_json.dumps({"rules": [
        {"id": "arm", "priority": 650, "when": {"text_any": ["dropbox", "google one", "dl google google"]}, "then": {"category": "assinaturas:armazenamento"}}]}))
    rules.categorize(store)
    a = cost_structure(store, today="2026-10-21")["classes"]["assinaturas"]
    items = {i["key"]: i for i in a["items"]}
    assert items["dropbox"]["annual"] and items["dropbox"]["avg"] == round(63893 / 12)
    assert items["google one"]["avg"] == 1499 and a["groups"]["assinaturas:armazenamento"] == round(63893 / 12) + 1499


def test_recurring_transfer_cluster_gets_own_rule(store):
    from src.finance import rules
    rows = [(f"2026{m:02d}10", "-150.00", f"f{m}", "Transferência enviada pelo Pix - Cristieli Santos - x") for m in range(1, 6)]
    rows += [("20260320", "-37.00", "o1", "Transferência enviada pelo Pix - Cristieli Santos - x"),
             ("20260325", "-1200.00", "o2", "Transferência enviada pelo Pix - Cristieli Santos - x")]
    ingest_bytes(store, "a.ofx", ofx("5555-1", rows))
    dedup.rebuild(store)
    (store.root / "ledger").mkdir(exist_ok=True)
    (store.root / "ledger" / "rules.json").write_text('{"rules": [{"id": "pessoas", "priority": 100, "when": {"text_any": ["pix"]}, "then": {"category": "transferencias:pessoas"}}]}')
    rules.categorize(store)
    items = rules.review_queue(store)["items"]
    rec = [i for i in items if i.get("band")]
    assert len(rec) == 1 and rec[0]["count"] == 5 and rec[0]["band"]["typical"] == 15000 and rec[0]["recurring"]["frequency"] == "mensal"
    assert any(i.get("rest_of_recurring") and i["count"] == 2 for i in items)
    b = rec[0]["band"]
    rules.add_user_rule(store, "cristieli santos", "debit", "lazer:futebol", amount_min=b["min"], amount_max=b["max"])
    rules.categorize(store)
    cats = [r[0] for r in store.db.execute("SELECT n.category FROM transactions t JOIN annotations n USING (anchor_key) ORDER BY t.date")]
    assert cats.count("lazer:futebol") == 5 and cats.count("transferencias:pessoas") == 2  # avulsos ficam de fora


def test_merchant_old_santander_pix_without_separator():
    from src.finance import rules
    assert rules.merchant("PIX RECEBIDO Suelen Valentini") == rules.merchant("Transferência Recebida|Suélen Valentini") == "suelen valentini"


def test_split_monthly_first_then_rest_loans_and_ledger(store, tmp_path):
    import json as _json
    from src.finance import rules
    from src.finance.analytics import loans, monthly
    assert rules.merchant("Eskine Industria e Com 5/6") == "eskine industria e com"
    rows = [("20240710", "1800.00", "s1", "Transferência recebida pelo Pix - Fulana Tal - x"),
            ("20240805", "700.00", "s2", "Transferência recebida pelo Pix - Fulana Tal - x"),
            ("20240818", "800.00", "s3", "Transferência recebida pelo Pix - Fulana Tal - x"),
            ("20240601", "5000.00", "s0", "Transferência recebida pelo Pix - Fulana Tal - x"),  # antes do date_from
            ("20240702", "-3000.00", "e1", "Transferência enviada pelo Pix - Fulana Tal - x")]
    ingest_bytes(store, "a.ofx", ofx("5555-1", rows))
    dedup.rebuild(store)
    led = store.root / "ledger"
    led.mkdir(exist_ok=True)
    (led / "rules.json").write_text(_json.dumps({"rules": [
        {"id": "pessoas", "priority": 10, "when": {"text_any": ["pelo pix"]}, "then": {"category": "transferencias:pessoas"}},
        {"id": "u-emp", "priority": 990, "when": {"merchant_any": ["fulana tal"], "sign": "debit"},
         "then": {"category": "emprestimos:fulana"}}]}))
    (led / "splits.json").write_text(_json.dumps({"splits": [
        {"id": "f-moradia", "when": {"merchant_any": ["fulana tal"], "sign": "credit", "date_from": "2024-07"},
         "monthly_first": {"category": "moradia:rateio", "amount": 1000}, "rest": "emprestimos:fulana"}]}))
    rules.categorize(store)
    lines = {(r["anchor_key"][-2:], r["category"]): r["amount_cents"] for r in store.db.execute(
        "SELECT t.anchor_key, s.category, s.amount_cents FROM splits s JOIN transactions t ON t.anchor_key=s.anchor_key")}
    got = sorted((r["category"], r["amount_cents"]) for r in store.db.execute("SELECT category, amount_cents FROM splits"))
    # julho: 1000 + 800; agosto: 700 (todo rateio) e 800 = 300 rateio + 500 devolucao
    assert got == sorted([("moradia:rateio", 100000), ("emprestimos:fulana", 80000), ("moradia:rateio", 70000),
                          ("moradia:rateio", 30000), ("emprestimos:fulana", 50000)]), lines
    lo = loans(store)
    assert lo[0]["lent"] == 300000 and lo[0]["repaid"] == 130000 and lo[0]["outstanding"] == 170000
    per = {p["period"]: p for p in monthly(store, "BRL")["periods"]}
    assert per["2024-07"]["income"] == 0 and per["2024-07"]["expenses"] == -100000  # rateio abate gasto; emprestimo neutro
    assert per["2024-06"]["income"] == 500000  # fora da divisao: continua Pix de pessoa
    # manual vence a divisao
    ak = store.db.execute("SELECT anchor_key FROM transactions WHERE amount_cents=180000").fetchone()[0]
    store.db.execute("INSERT OR REPLACE INTO annotations VALUES (?, 'renda:outros', NULL, 1, 'x')", (ak,))
    rules.categorize(store)
    assert [r[0] for r in store.db.execute("SELECT category FROM tx_lines WHERE anchor_key=?", (ak,))] == ["renda:outros"]
    out = export(store, out_dir=tmp_path / "led", commit=False)
    text = "".join(p.read_text() for p in (tmp_path / "led").glob("2024.journal"))
    assert "categorias:moradia:rateio    -300.00 BRL" in text and "categorias:emprestimos:fulana    -500.00 BRL" in text
    hl = shutil.which("hledger")
    if hl:
        r = subprocess.run([hl, "-f", str(tmp_path / "led" / "main.journal"), "check"], capture_output=True, text=True)
        assert r.returncode == 0, r.stderr


def test_asset_purchase_is_neutral_and_listed(store):
    import json as _json
    from src.finance import rules
    from src.finance.analytics import assets, monthly
    ingest_bytes(store, "a.ofx", ofx("5555-1", [("20241220", "-35000.00", "c1", "Transferência enviada pelo Pix - Vendedor - x"),
                                                ("20241221", "-50.00", "c2", "Padaria")]))
    dedup.rebuild(store)
    (store.root / "ledger").mkdir(exist_ok=True)
    (store.root / "ledger" / "rules.json").write_text(_json.dumps({"rules": [
        {"id": "carro", "priority": 995, "when": {"merchant_any": ["vendedor"], "min": 34999, "max": 35001},
         "then": {"category": "patrimonio:veiculo"}}]}))
    rules.categorize(store)
    assert assets(store)[0]["paid"] == 3500000
    assert {p["period"]: p for p in monthly(store, "BRL")["periods"]}["2024-12"]["expenses"] == 5000


def test_refunds_match_full_partial_iof_and_people():
    from src.finance import refunds
    r = lambda i, d, v, desc, cat, acc="card": {"id": i, "account_key": acc, "date": d, "amount_cents": v,
                                                "description": desc, "category": cat}
    rows = [
        r(1, "2024-10-29", -157800, "Mp *Kubaaudio", "compras:eletronicos"),
        r(2, "2025-03-22", 157800, 'Estorno de "Mp *Kubaaudio"', "compras:eletronicos"),       # total, 144 dias depois
        r(3, "2024-08-24", -12752, "Mercadolivre*Atropuz", "compras:online"),
        r(4, "2024-09-16", 6762, 'Estorno de "Mercadolivre*Atropuz"', "compras:online"),       # dois parciais = total
        r(5, "2024-09-16", 5990, 'Estorno de "Mercadolivre*Atropuz"', "compras:online"),
        r(6, "2026-04-16", -45774, "Claude.Ai Subscription", "assinaturas:ia"),
        r(7, "2026-04-16", 1602, "IOF de volta de Claude.Ai Subscription", "impostos:iof-exterior"),  # abate a compra
        r(8, "2025-12-29", 2398, "Estorno de Uber - NuPay", "transporte:app"),                 # estorno 1 dia antes
        r(9, "2025-12-30", -2398, "Uber", "transporte:app"),
        r(10, "2023-10-16", -8873, "PIX ENVIADO Shannon David Cabral", "transferencias:pessoas", "acc"),
        r(11, "2023-10-16", 8873, "PIX RECEBIDO Shannon David Cabral", "transferencias:pessoas", "acc"),
        r(12, "2024-01-05", 500000, "Salario", "renda:salario", "acc"),                         # renda nunca casa
        r(13, "2024-01-01", -500000, "Salario", "transporte:app", "acc"),
        r(14, "2024-03-01", -5000, "Loja X", "compras:geral"),
        r(15, "2024-03-02", 2000, "Loja X", "compras:geral"),                                    # parcial sem cara de estorno: nao
        r(16, "2024-03-02", 9999, 'Estorno de "Loja Y"', "compras:geral"),                       # outra loja: nao
    ]
    got = {c: (d, a) for c, d, a in refunds.match(rows)}
    assert got == {2: (1, 157800), 4: (3, 6762), 5: (3, 5990), 7: (6, 1602), 8: (9, 2398), 11: (10, 8873)}
    adj = {x["id"]: x["amount_cents"] for x in refunds.adjust([dict(x) for x in rows], refunds.match(rows))}
    assert 1 not in adj and 2 not in adj and 3 not in adj and 4 not in adj and 9 not in adj and 10 not in adj
    assert adj[6] == -45774 + 1602 and 7 not in adj and adj[15] == 2000 and adj[16] == 9999
