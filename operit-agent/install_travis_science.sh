#!/bin/sh
set -eu
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
mkdir -p "$HOME/.local/bin"
install -m 600 "$here/travis_science.py" "$HOME/travis_science.py"
cat > "$HOME/.local/bin/travisscience" <<'TRAVIS_CMD_EOF'
#!/bin/sh
set -eu
action="${1:-run}"
case "$action" in
  run|verify) ;;
  *) echo "Usage: travisscience [run|verify]" >&2; exit 2 ;;
esac
exec python3 "$HOME/travis_science.py" "$action" --state-dir "$HOME/.centro-jarvis" --source-dir "$HOME/.centro-jarvis"
TRAVIS_CMD_EOF
chmod 755 "$HOME/.local/bin/travisscience"
echo "Installed: $HOME/.local/bin/travisscience"
