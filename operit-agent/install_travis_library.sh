#!/bin/sh
# Install a grounded, local-only library of historical texts and original notes.
set -eu
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PYTHONPATH="$here" python3 "$here/travis_library_selftest.py"
mkdir -p "$HOME/.local/bin" "$HOME/.centro-jarvis"
install -m 600 "$here/travis_library.py" "$HOME/travis_library.py"
install -m 600 "$here/travis_library_seed.py" "$HOME/travis_library_seed.py"
install -m 600 "$here/travis_world_knowledge.py" "$HOME/travis_world_knowledge.py"
cat > "$HOME/.local/bin/travisbooks" <<'TRAVIS_BOOKS_WRAPPER'
#!/bin/sh
set -eu
action="${1:-status}"
shift || true
case "$action" in
 seed|status|search|context|study|import|import-all) ;;
 *) echo "Use: travisbooks [status|search|study|import|import-all|seed] [book-id/query]" >&2; exit 2 ;;
esac
exec python3 "$HOME/travis_library.py" "$action" "$@" --state-dir "$HOME/.centro-jarvis"
TRAVIS_BOOKS_WRAPPER
chmod 755 "$HOME/.local/bin/travisbooks"
"$HOME/.local/bin/travisbooks" seed
if [ "${TRAVIS_BOOKS_FETCH:-1}" = "1" ]; then
  "$HOME/.local/bin/travisbooks" import-all
fi
"$HOME/.local/bin/travisbooks" status
