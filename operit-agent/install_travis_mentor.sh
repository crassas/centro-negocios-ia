#!/bin/sh
# Install explicit mentor lessons in existing local Travis memory.
# No restarts, model calls, paid API, external execution, or permissions changes.
set -eu
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
python3 "$here/travis_mentor_selftest.py"
mkdir -p "$HOME/.local/bin" "$HOME/.centro-jarvis"
install -m 600 "$here/travis_mentor.py" "$HOME/travis_mentor.py"
cat > "$HOME/.local/bin/travismentor" <<'MENTOR_WRAPPER_EOF'
#!/bin/sh
set -eu
action="${1:-status}"
shift || true
case "$action" in
  status|seed|export|context|plan) ;;
  *) echo "Usage: travismentor [status|seed|export|context|plan] [--query text] [--tool tool]" >&2; exit 2 ;;
esac
exec python3 "$HOME/travis_mentor.py" "$action" --state-dir "$HOME/.centro-jarvis" "$@"
MENTOR_WRAPPER_EOF
chmod 755 "$HOME/.local/bin/travismentor"
"$HOME/.local/bin/travismentor" export
"$HOME/.local/bin/travismentor" seed
"$HOME/.local/bin/travismentor" status
