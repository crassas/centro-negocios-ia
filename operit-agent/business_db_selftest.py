#!/usr/bin/env python3
import tempfile
from pathlib import Path
from business_db import BusinessDB
with tempfile.TemporaryDirectory() as tmp:
    db=BusinessDB(Path(tmp)/"negocio.db")
    s=db.summary()
    assert s["private"] and s["counts"]["businesses"]==4 and s["counts"]["sites"]==4 and s["counts"]["leads"]==1
    lead=db.add_lead({"name":"Teste","businessName":"Lavandaria Teste","status":"Novo","estimatedValue":"40"})
    assert lead["estimated_value_cents"]==4000
    lead=db.update_lead(lead["id"],{"status":"Interessado","nextAction":"Telefonar amanhã"})
    assert lead["status"]=="Interessado"
    pay=db.add_payment({"label":"Site teste","amount":"40","direction":"Entrada","status":"Pendente"})
    assert pay["amount_cents"]==4000
    task=db.add_task({"title":"Preparar proposta","priority":"Alta"})
    assert task["priority"]=="Alta"
    assert db.summary()["receivableCents"]==4000
print("BUSINESS_DB_SELFTEST_OK")
