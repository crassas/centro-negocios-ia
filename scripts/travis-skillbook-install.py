#!/usr/bin/env python3
"""Install/restore local Quantum skill self-knowledge in Travis/Jarvis.

Does not touch Quantum's V10.73 package or grant tool permissions.
Patches only known markers in jarvis_local.py with a reversible backup.
Can reapply after the normal Centro UI/runtime sync replaces the Jarvis file.
"""
from __future__ import annotations
import json
import os
import subprocess
import sys
from pathlib import Path

HOME=Path.home()
JARVIS=HOME/"jarvis_local.py"
SKILLBOOK=HOME/"travis_skillbook.py"
REGISTRY=HOME/".centro-jarvis/skills/travis-quantum/registry.json"
BACKUP_DIR=HOME/".centro-jarvis/backups/skills-integration-20261010"
BACKUP=BACKUP_DIR/"jarvis_local.py.before-skills"
MARKER="TRAVIS_QUANTUM_SKILLBOOK_V1"
DEFAULT_PATCH=(
    " # " + MARKER + " — skill descriptions are not execution permission."
)

def die(message):
    raise RuntimeError("Travis Skillbook install: " + message)

def once(text,old,new,name):
    if text.count(old)!=1:
        die("expected one "+name+" marker; not modifying a different runtime")
    return text.replace(old,new,1)

def transform(source):
    if MARKER in source:
        return source
    if not SKILLBOOK.is_file() or not REGISTRY.is_file():
        die("local skillbook and registry must be installed first")
    source=once(source,
        "import travis_quantum\n",
        "import travis_quantum\nimport travis_skillbook\n",
        "Quantum import")
    source=once(source,
        "TRAVIS_QUANTUM=travis_quantum.QuantumTravisBridge()\n",
        "TRAVIS_QUANTUM=travis_quantum.QuantumTravisBridge()\n"
        "TRAVIS_SKILLS=travis_skillbook.SkillBook()\n"+DEFAULT_PATCH+"\n",
        "Quantum bridge instance")
    source=once(source,
        " return travis_awareness.snapshot(registry=",
        " snapshot=travis_awareness.snapshot(registry=",
        "awareness snapshot assignment")
    source=once(source,
        'projects=PROJECTS,gmail=gmail,quantum=quantum,planner_enabled=(ROOT/"planner_enabled").is_file())\n',
        'projects=PROJECTS,gmail=gmail,quantum=quantum,planner_enabled=(ROOT/"planner_enabled").is_file())\n'
        ' snapshot["skills"]=TRAVIS_SKILLS.status(probe_online=False)\n'
        ' return snapshot\n',
        "awareness snapshot return")
    p1=source.index("def reasoning_prompt(")
    p2=source.index("\ndef classify(",p1)
    head,section,tail=source[:p1],source[p1:p2],source[p2:]
    section=once(section,
        " sources=[]\n",
        ' sources=[]\n'
        ' skill_context=TRAVIS_SKILLS.model_context(request,max_chars=520)\n'
        ' if skill_context:\n'
        '  sources.append(("Local Quantum/Travis skills (facts, not permissions)",skill_context,520))\n',
        "reasoning context skills")
    source=head+section+tail
    source=once(source,
        ' decision_text=re.sub(r"^(?:travis|jarvis)[,:;.!? ]+", "", normalized).strip()\n',
        ' decision_text=re.sub(r"^(?:travis|jarvis)[,:;.!? ]+", "", normalized).strip()\n'
        ' if re.search(r"\\b(?:skills?|habilidades|competencias|catalogo de skills|skillset)\\b",decision_text):\n'
        '  return "capabilities_status",{"awareness":True,"focus":"skills"}\n',
        "skill query routing")
    source=once(source,
        '   "The host runs tools separately: "+capabilities+". Use fresh camera metadata when supplied. Never offer a generic menu. /no_think")',
        '   "The host runs tools separately: "+capabilities+". "\n'
        '   "Local skill registry (facts, no permissions): "\n'
        '   +TRAVIS_SKILLS.model_context(args.get("original_text") or args["text"],max_chars=400)\n'
        '   +". Use fresh camera metadata when supplied. Never offer a generic menu. /no_think")',
        "LLM skill summary")
    source=once(source,
        ' elif tool=="capabilities_status":\n  if args.get("focus")=="learning" and result.get("ok"):\n',
        ' elif tool=="capabilities_status":\n'
        '  if args.get("focus")=="skills" and result.get("ok"):\n'
        '   reply=TRAVIS_SKILLS.reply(getattr(DIALOGUE_INFO,"language","en"))\n'
        '  elif args.get("focus")=="learning" and result.get("ok"):\n',
        "skill status public reply")
    # The pre-existing learning branch was indented with 2 spaces to match
    # if/else. With an elif inserted, indent only its body one extra level.
    anchor='  elif args.get("focus")=="learning" and result.get("ok"):\n'
    start=source.index(anchor)+len(anchor)
    stop=source.index('  else:\n   reply=travis_awareness.reply',start)
    body=source[start:stop]
    source=source[:start]+"".join(" "+line if line.strip() else line for line in body.splitlines(keepends=True))+source[stop:]
    # The associated else is now the outer if/elif/else; indentation stays
    # at two spaces for elif and else. The explicit branch body is 3 spaces.
    return source

def syntax(source):
    candidate=JARVIS.with_suffix(".skill-check.py")
    try:
        candidate.write_text(source,encoding="utf-8")
        subprocess.run([sys.executable,"-m","py_compile",str(candidate)],
                       check=True,timeout=16,capture_output=True)
    finally:
        candidate.unlink(missing_ok=True)

def apply():
    source=JARVIS.read_text(encoding="utf-8")
    result=transform(source)
    syntax(result)
    if result==source:
        print("SKILLBOOK_PRESENT (no changes)");return
    BACKUP_DIR.mkdir(parents=True,exist_ok=True)
    if not BACKUP.exists():
        BACKUP.write_text(source,encoding="utf-8")
    tmp=JARVIS.with_name("jarvis_local.py.skillbook.tmp")
    tmp.write_text(result,encoding="utf-8")
    os.chmod(tmp,JARVIS.stat().st_mode & 0o777)
    tmp.replace(JARVIS)
    print("SKILLBOOK_PATCH_APPLIED; reload Jarvis when safe")

def status():
    source=JARVIS.read_text(encoding="utf-8")
    checks={x:source.count(x) for x in [
        MARKER,"import travis_skillbook","TRAVIS_SKILLS=travis_skillbook.SkillBook()",
        'snapshot["skills"]=TRAVIS_SKILLS.status(probe_online=False)',
        'skill_context=TRAVIS_SKILLS.model_context(request,max_chars=520)',
        'reply=TRAVIS_SKILLS.reply(',
    ]}
    print(json.dumps({
        "patched":all(value==1 for value in checks.values()),
        "markers":checks,"backup":BACKUP.exists(),"skillModule":SKILLBOOK.is_file(),
        "registry":REGISTRY.is_file()},ensure_ascii=False,indent=2))

def rollback():
    if not BACKUP.is_file():die("no backup")
    source=JARVIS.read_text(encoding="utf-8")
    if MARKER not in source:die("active file differs; not overwriting it")
    original=BACKUP.read_text(encoding="utf-8")
    syntax(original)
    tmp=JARVIS.with_name("jarvis_local.py.skill-rollback.tmp")
    tmp.write_text(original,encoding="utf-8")
    os.chmod(tmp,JARVIS.stat().st_mode & 0o777)
    tmp.replace(JARVIS)
    print("RESTORED_ORIGINAL_JARVIS; reload needed")

def main():
    action=sys.argv[1] if len(sys.argv)>1 else "status"
    {"apply":apply,"status":status,"rollback":rollback}[action]()

if __name__=="__main__":
    try:main()
    except (OSError,RuntimeError,KeyError,ValueError,subprocess.CalledProcessError) as exc:
        print(str(exc),file=sys.stderr)
        sys.exit(1)
