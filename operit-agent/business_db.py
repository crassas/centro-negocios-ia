#!/usr/bin/env python3
"""Base SQLite privada do negócio do operador do Centro."""
from __future__ import annotations
import json, os, sqlite3
from datetime import datetime, timezone
from pathlib import Path

LEAD_STATUSES={"Novo","Contactado","Interessado","Proposta","Fechado","Perdido"}
SITE_STATUSES={"Activo","Pausado","Concluído","Arquivo"}
PAYMENT_STATUSES={"Pendente","Pago","Cancelado"}
TASK_STATUSES={"Pendente","Em curso","Bloqueada","Concluída"}
TASK_PRIORITIES={"Baixa","Média","Alta","Crítica"}
DIRECTIONS={"Entrada","Saída"}

def now(): return datetime.now(timezone.utc).replace(microsecond=0).isoformat()
def txt(v,n=4000): return str(v or "").strip()[:n]
def cents(v):
    if v in (None,""): return 0
    if isinstance(v,int): return v
    return int(round(float(str(v).replace(",","."))*100))

class BusinessDB:
    def __init__(self,path:Path):
        self.path=Path(path); self.path.parent.mkdir(parents=True,exist_ok=True)
        try: os.chmod(self.path.parent,0o700)
        except OSError: pass
        self._migrate(); self.seed_defaults()
    def connect(self):
        c=sqlite3.connect(self.path,timeout=10); c.row_factory=sqlite3.Row
        c.execute("PRAGMA foreign_keys=ON"); c.execute("PRAGMA journal_mode=WAL"); c.execute("PRAGMA synchronous=NORMAL")
        return c
    def _migrate(self):
        sql="""
CREATE TABLE IF NOT EXISTS business_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS businesses(id INTEGER PRIMARY KEY AUTOINCREMENT,slug TEXT UNIQUE,name TEXT NOT NULL,sector TEXT NOT NULL DEFAULT '',phone TEXT NOT NULL DEFAULT '',email TEXT NOT NULL DEFAULT '',address TEXT NOT NULL DEFAULT '',area TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'Activo',source TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sites(id INTEGER PRIMARY KEY AUTOINCREMENT,business_id INTEGER REFERENCES businesses(id) ON DELETE SET NULL,slug TEXT UNIQUE,name TEXT NOT NULL,url TEXT NOT NULL DEFAULT '',domain TEXT NOT NULL DEFAULT '',repo TEXT NOT NULL DEFAULT '',area TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'Activo',published_at TEXT,notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS leads(id INTEGER PRIMARY KEY AUTOINCREMENT,business_id INTEGER REFERENCES businesses(id) ON DELETE SET NULL,name TEXT NOT NULL,business_name TEXT NOT NULL DEFAULT '',sector TEXT NOT NULL DEFAULT '',contact TEXT NOT NULL DEFAULT '',phone TEXT NOT NULL DEFAULT '',email TEXT NOT NULL DEFAULT '',source TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'Novo',estimated_value_cents INTEGER NOT NULL DEFAULT 0,last_contact_at TEXT,next_action TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY AUTOINCREMENT,business_id INTEGER REFERENCES businesses(id) ON DELETE SET NULL,site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL,label TEXT NOT NULL,amount_cents INTEGER NOT NULL,direction TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Pendente',due_at TEXT,paid_at TEXT,notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks(id INTEGER PRIMARY KEY AUTOINCREMENT,business_id INTEGER REFERENCES businesses(id) ON DELETE SET NULL,site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL,title TEXT NOT NULL,kind TEXT NOT NULL DEFAULT '',priority TEXT NOT NULL DEFAULT 'Média',status TEXT NOT NULL DEFAULT 'Pendente',due_at TEXT,notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS seo_metrics(id INTEGER PRIMARY KEY AUTOINCREMENT,site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,period_start TEXT NOT NULL,period_end TEXT NOT NULL,clicks REAL,impressions REAL,ctr REAL,position REAL,source TEXT NOT NULL DEFAULT 'Search Console',captured_at TEXT NOT NULL,raw_json TEXT NOT NULL DEFAULT '{}',UNIQUE(site_id,period_start,period_end,source));
CREATE TABLE IF NOT EXISTS activity(id INTEGER PRIMARY KEY AUTOINCREMENT,entity_type TEXT NOT NULL,entity_id INTEGER,action TEXT NOT NULL,detail_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at DESC);
"""
        with self.connect() as c:
            c.executescript(sql); t=now()
            c.execute("INSERT INTO business_meta(key,value,updated_at) VALUES('schema_version','1',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",(t,))
        try: os.chmod(self.path,0o600)
        except OSError: pass
    def _act(self,c,typ,eid,action,detail=None):
        c.execute("INSERT INTO activity(entity_type,entity_id,action,detail_json,created_at) VALUES(?,?,?,?,?)",(txt(typ,80),eid,txt(action,120),json.dumps(detail or {},ensure_ascii=False)[:12000],now()))
    def seed_defaults(self):
        t=now()
        rows=[
          ("pentehouse","Pentehouse","Barbearia","https://pentehouse.pt/","pentehouse.pt","https://github.com/crassas/pente_houselanding","Marquês / Constituição"),
          ("best-pizza","Best Pizza & Kebab","Restauração","https://bestpizzaandkebab.pt/","bestpizzaandkebab.pt","https://github.com/crassas/best-pizza-kebab","Campanhã / São Roque"),
          ("dois-irmaos","Restaurante 2 Irmãos","Restauração","https://restaurantedoisirmaos.pt/","restaurantedoisirmaos.pt","https://github.com/crassas/restaurante-2-irmaos","Campanhã / São Roque"),
          ("engomadoria-beatriz","Engomadoria Beatriz","Engomadoria / Lavandaria","https://engomadoriabeatriz.pt/","engomadoriabeatriz.pt","https://github.com/crassas/engomadoria-beatriz","Porto"),
        ]
        with self.connect() as c:
            for slug,name,sector,url,domain,repo,area in rows:
                c.execute("INSERT INTO businesses(slug,name,sector,area,status,source,created_at,updated_at) VALUES(?,?,?,?, 'Activo','site publicado',?,?) ON CONFLICT(slug) DO UPDATE SET name=excluded.name,sector=excluded.sector,area=excluded.area,updated_at=excluded.updated_at",(slug,name,sector,area,t,t))
                bid=c.execute("SELECT id FROM businesses WHERE slug=?",(slug,)).fetchone()["id"]
                c.execute("INSERT INTO sites(business_id,slug,name,url,domain,repo,area,status,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'Activo',?,?,?) ON CONFLICT(slug) DO UPDATE SET business_id=excluded.business_id,name=excluded.name,url=excluded.url,domain=excluded.domain,repo=excluded.repo,area=excluded.area,updated_at=excluded.updated_at",(bid,slug,name,url,domain,repo,area,t,t,t))
            if not c.execute("SELECT id FROM leads WHERE source='abordagem presencial' AND sector='Lavandaria' AND business_name='Lavandaria — lead presencial' LIMIT 1").fetchone():
                cur=c.execute("INSERT INTO leads(name,business_name,sector,source,status,last_contact_at,next_action,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",("Responsável da lavandaria","Lavandaria — lead presencial","Lavandaria","abordagem presencial","Interessado",t,"Aguardar decisão e preparar análise hiperlocal da concorrência.","Viu um site publicado, ficou com o contacto e disse que iria pensar. Potencial site montra hiperlocal; funcionalidades com base de dados são trabalho separado.",t,t))
                self._act(c,"lead",cur.lastrowid,"seeded",{"source":"conversa presencial"})
    def _rows(self,rows): return [dict(x) for x in rows]
    def summary(self):
        with self.connect() as c:
            counts={x:c.execute(f"SELECT COUNT(*) FROM {x}").fetchone()[0] for x in ("businesses","sites","leads","payments","tasks","seo_metrics","activity")}
            lead_status={r["status"]:r["n"] for r in c.execute("SELECT status,COUNT(*) n FROM leads GROUP BY status")}
            pending=c.execute("SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE direction='Entrada' AND status='Pendente'").fetchone()[0]
            paid=c.execute("SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE direction='Entrada' AND status='Pago'").fetchone()[0]
            return {"database":str(self.path),"private":True,"schemaVersion":1,"counts":counts,"leadStatus":lead_status,"receivableCents":int(pending or 0),"receivedCents":int(paid or 0)}
    def list_sites(self):
        with self.connect() as c:return self._rows(c.execute("SELECT * FROM sites ORDER BY name COLLATE NOCASE"))
    def list_leads(self):
        with self.connect() as c:return self._rows(c.execute("SELECT * FROM leads ORDER BY CASE status WHEN 'Interessado' THEN 0 WHEN 'Proposta' THEN 1 WHEN 'Novo' THEN 2 WHEN 'Contactado' THEN 3 ELSE 4 END, updated_at DESC"))
    def list_payments(self):
        with self.connect() as c:return self._rows(c.execute("SELECT * FROM payments ORDER BY created_at DESC,id DESC"))
    def list_tasks(self):
        with self.connect() as c:return self._rows(c.execute("SELECT * FROM tasks ORDER BY CASE priority WHEN 'Crítica' THEN 0 WHEN 'Alta' THEN 1 WHEN 'Média' THEN 2 ELSE 3 END,created_at DESC"))
    def list_activity(self,limit=50):
        limit=max(1,min(int(limit),200))
        with self.connect() as c:return self._rows(c.execute("SELECT * FROM activity ORDER BY id DESC LIMIT ?",(limit,)))
    def add_lead(self,p):
        status=txt(p.get("status") or "Novo",40)
        if status not in LEAD_STATUSES: raise ValueError("Estado de lead inválido.")
        name=txt(p.get("name"),180); business=txt(p.get("businessName"),220)
        if not name and not business: raise ValueError("O lead precisa de nome ou negócio.")
        t=now()
        with self.connect() as c:
            cur=c.execute("INSERT INTO leads(name,business_name,sector,contact,phone,email,source,status,estimated_value_cents,last_contact_at,next_action,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",(name or business,business,txt(p.get("sector"),120),txt(p.get("contact"),220),txt(p.get("phone"),80),txt(p.get("email"),180),txt(p.get("source"),120),status,cents(p.get("estimatedValue")),txt(p.get("lastContactAt"),64) or None,txt(p.get("nextAction"),1000),txt(p.get("notes"),4000),t,t))
            self._act(c,"lead",cur.lastrowid,"created",{"status":status}); return dict(c.execute("SELECT * FROM leads WHERE id=?",(cur.lastrowid,)).fetchone())
    def update_lead(self,lead_id,p):
        lead_id=int(lead_id); allowed={"status":("status",40),"nextAction":("next_action",1000),"notes":("notes",4000),"contact":("contact",220),"phone":("phone",80),"email":("email",180),"lastContactAt":("last_contact_at",64)}
        sets=[]; vals=[]
        for k,(col,lim) in allowed.items():
            if k not in p: continue
            v=txt(p.get(k),lim)
            if k=="status" and v not in LEAD_STATUSES: raise ValueError("Estado de lead inválido.")
            sets.append(f"{col}=?"); vals.append((v or None) if col=="last_contact_at" else v)
        if not sets: raise ValueError("Nenhuma alteração de lead recebida.")
        sets.append("updated_at=?"); vals.extend([now(),lead_id])
        with self.connect() as c:
            if not c.execute("SELECT 1 FROM leads WHERE id=?",(lead_id,)).fetchone(): raise ValueError("Lead não encontrado.")
            c.execute(f"UPDATE leads SET {','.join(sets)} WHERE id=?",vals); self._act(c,"lead",lead_id,"updated",{k:p[k] for k in p if k in allowed}); return dict(c.execute("SELECT * FROM leads WHERE id=?",(lead_id,)).fetchone())
    def add_site(self,p):
        name=txt(p.get("name"),220); status=txt(p.get("status") or "Activo",40)
        if not name: raise ValueError("Nome do site em falta.")
        if status not in SITE_STATUSES: raise ValueError("Estado de site inválido.")
        t=now()
        with self.connect() as c:
            cur=c.execute("INSERT INTO sites(slug,name,url,domain,repo,area,status,published_at,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",(txt(p.get("slug"),140) or None,name,txt(p.get("url"),500),txt(p.get("domain"),240),txt(p.get("repo"),500),txt(p.get("area"),240),status,txt(p.get("publishedAt"),64) or None,txt(p.get("notes"),4000),t,t))
            self._act(c,"site",cur.lastrowid,"created",{"name":name}); return dict(c.execute("SELECT * FROM sites WHERE id=?",(cur.lastrowid,)).fetchone())
    def add_payment(self,p):
        label=txt(p.get("label"),240); direction=txt(p.get("direction") or "Entrada",30); status=txt(p.get("status") or "Pendente",30)
        if not label: raise ValueError("Descrição do pagamento em falta.")
        if direction not in DIRECTIONS or status not in PAYMENT_STATUSES: raise ValueError("Direcção ou estado do pagamento inválido.")
        t=now()
        with self.connect() as c:
            cur=c.execute("INSERT INTO payments(business_id,site_id,label,amount_cents,direction,status,due_at,paid_at,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",(p.get("businessId"),p.get("siteId"),label,cents(p.get("amount")),direction,status,txt(p.get("dueAt"),64) or None,txt(p.get("paidAt"),64) or None,txt(p.get("notes"),4000),t,t))
            self._act(c,"payment",cur.lastrowid,"created",{"status":status,"direction":direction}); return dict(c.execute("SELECT * FROM payments WHERE id=?",(cur.lastrowid,)).fetchone())
    def add_task(self,p):
        title=txt(p.get("title"),300); priority=txt(p.get("priority") or "Média",30); status=txt(p.get("status") or "Pendente",30)
        if not title: raise ValueError("Título da tarefa em falta.")
        if priority not in TASK_PRIORITIES or status not in TASK_STATUSES: raise ValueError("Prioridade ou estado da tarefa inválido.")
        t=now()
        with self.connect() as c:
            cur=c.execute("INSERT INTO tasks(business_id,site_id,title,kind,priority,status,due_at,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",(p.get("businessId"),p.get("siteId"),title,txt(p.get("kind"),120),priority,status,txt(p.get("dueAt"),64) or None,txt(p.get("notes"),4000),t,t))
            self._act(c,"task",cur.lastrowid,"created",{"status":status,"priority":priority}); return dict(c.execute("SELECT * FROM tasks WHERE id=?",(cur.lastrowid,)).fetchone())
