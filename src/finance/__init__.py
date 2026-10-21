"""Fork-local (ver LOCAL_CHANGES.md): arquivo financeiro pessoal.

Spec: docs/superpowers/specs/2026-10-20-financas-design.md

Tres camadas, tudo local em data/finance/:
  raw/               bruto imutavel (arquivo importado ou resposta de API, por sha256)
  finance.sqlite     source_records (uma linha por transacao de cada fonte) +
                     transactions (livro canonico, reconstruivel) + checkpoints
  ledger/            export hledger para auditoria independente
"""
