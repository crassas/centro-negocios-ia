#!/usr/bin/env python3
"""Self-test pequeno das garantias de segurança do executor de repositórios."""
import importlib.util
import tempfile
from pathlib import Path

SERVER = Path(__file__).with_name("centro_server.py")
spec = importlib.util.spec_from_file_location("centro_server_policy", SERVER)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def expect(value, message):
    if not value:
        raise AssertionError(message)


def test_protected_paths():
    blocked = [
        ".env",
        "./.env",
        ".env.local",
        ".git",
        ".git/config",
        "./.git/config",
        ".github/workflows",
        ".github/workflows/deploy.yml",
        "../outside.txt",
        "/tmp/outside.txt",
        "config/secret.txt",
        "config/credentials.json",
        "certs/site.pem",
        "keys/private.key",
    ]
    for path in blocked:
        expect(module.protected_repo_path(path), f"deveria bloquear: {path}")

    allowed = [
        "src/main.js",
        "./src/app.py",
        ".github/dependabot.yml",
        "README.md",
        "public/assets/logo.svg",
    ]
    for path in allowed:
        expect(not module.protected_repo_path(path), f"não deveria bloquear: {path}")


def test_plan_is_atomic():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        first = root / "a.txt"
        first.write_text("antes\n", encoding="utf-8")
        plan = {
            "edits": [
                {
                    "path": "a.txt",
                    "operation": "replace",
                    "search": "antes",
                    "content": "depois",
                },
                {
                    "path": "missing.txt",
                    "operation": "replace",
                    "search": "x",
                    "content": "y",
                },
            ]
        }
        try:
            module.apply_repo_change_plan(root, plan)
        except RuntimeError:
            pass
        else:
            raise AssertionError("plano inválido deveria falhar")

        expect(first.read_text(encoding="utf-8") == "antes\n", "plano parcial alterou o ficheiro")


def main():
    test_protected_paths()
    test_plan_is_atomic()
    print("policy_selftest: OK")


if __name__ == "__main__":
    main()
