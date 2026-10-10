#!/usr/bin/env bash
# Isolated, keyless God's Eye View sidecar for Travis (no changes to Centro Server).
set -Eeuo pipefail
umask 077
UPSTREAM="https://github.com/bilawalsidhu/gods-eye-view.git"
REVISION="591f299d11f38a612629a274463196d57ae3862e"
APP_DIR="$HOME/travis-gev-keyless"
STATE_DIR="$HOME/.local/state/travis-gev"
PID_FILE="$STATE_DIR/app.pid"
LOG_FILE="$STATE_DIR/app.log"
PORT=4173

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
info() { printf '[Travis GEV] %s\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || die "Missing dependency: $1"; }
keyless() {
  env -u OPENAI_API_KEY -u GOOGLE_MAPS_API_KEY -u GOOGLE_MAPS_SERVER_API_KEY \
    -u CESIUM_ION_TOKEN -u AISSTREAM_API_KEY -u FIRMS_MAP_KEY \
    -u MAPILLARY_CLIENT_TOKEN -u TOMTOM_API_KEY -u LL2_API_TOKEN \
    -u OPENSKY_CLIENT_ID -u OPENSKY_CLIENT_SECRET "$@"
}
check_node() {
  need node
  node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(((a===24&&b>=14)||a===26)?0:1)' \
    || die "Requires Node 24.14+ (24.x) or Node 26.x."
}
check_no_keys() {
  local f
  for f in .env .env.local .env.development .env.development.local; do
    [[ ! -e "$APP_DIR/$f" ]] || die "Keyless setup refuses $f. Please inspect it yourself."
  done
}
check_checkout() {
  [[ -d "$APP_DIR/.git" ]] || die "Install first with: bash scripts/travis-gev-keyless.sh install"
  local origin current
  origin="$(git -C "$APP_DIR" remote get-url origin)"
  [[ "$origin" == "$UPSTREAM" || "$origin" == "https://github.com/bilawalsidhu/gods-eye-view" ]] \
    || die "Different repository at $APP_DIR; refusing to touch it."
  current="$(git -C "$APP_DIR" rev-parse HEAD)"
  [[ "$current" == "$REVISION" ]] || die "Checkout version differs from pinned revision; no automatic overwrite."
  check_no_keys
}
check_storage() {
  local available
  available="$(df -Pk "$HOME" | awk 'END{print $4}')"
  if [[ "$available" =~ ^[0-9]+$ ]] && (( available < 1000000 )); then
    die "Less than 1 GB free space. No installation attempted."
  fi
}
endpoint_ready() {
  node - "$PORT" <<'NODE' >/dev/null 2>&1
fetch('http://127.0.0.1:' + process.argv[2] + '/', {signal:AbortSignal.timeout(1200)})
  .then(async r=>{const body=await r.text();process.exit(r.ok && /God.s Eye View|WorldView/i.test(body)?0:1);})
  .catch(()=>process.exit(1));
NODE
}
port_free() {
  node - "$PORT" <<'NODE' >/dev/null 2>&1
const net=require('node:net'),server=net.createServer();
server.once('error',()=>process.exit(1));
server.listen(Number(process.argv[2]),'127.0.0.1',()=>server.close(()=>process.exit(0)));
NODE
}
install_app() {
  need git; need npm; check_node; check_storage
  if [[ ! -e "$APP_DIR" ]]; then
    info "Cloning upstream into $APP_DIR"
    git clone --quiet --depth 1 "$UPSTREAM" "$APP_DIR"
  fi
  [[ -d "$APP_DIR/.git" ]] || die "Destination exists but is not a checkout."
  local origin
  origin="$(git -C "$APP_DIR" remote get-url origin)"
  [[ "$origin" == "$UPSTREAM" || "$origin" == "https://github.com/bilawalsidhu/gods-eye-view" ]] \
    || die "Destination points at a different repository."
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    die "Sidecar process still running; will not reinstall."
  fi
  git -C "$APP_DIR" fetch --quiet --depth 1 origin "$REVISION"
  git -C "$APP_DIR" checkout --quiet --detach "$REVISION"
  check_checkout
  info "Installing locked dependencies; Chromium download disabled for Android"
  (cd "$APP_DIR" && keyless env PUPPETEER_SKIP_DOWNLOAD=1 npm ci --no-audit --no-fund)
  info "Checking upstream runtime"
  (cd "$APP_DIR" && keyless npm run doctor)
  info "Installed. Start with: bash scripts/travis-gev-keyless.sh start"
}
# Direct Node/Vite daemon: setsid separates its session from the Remote MCP shell.
# Keep this command internal; launch only via start_app after preflight.
serve_app() {
  check_node; check_checkout
  [[ -d "$APP_DIR/node_modules/vite" ]] || die "Run install first."
  mkdir -p "$STATE_DIR"
  cd "$APP_DIR"
  printf '%s\n' "$$" > "$PID_FILE"
  exec env -u OPENAI_API_KEY -u GOOGLE_MAPS_API_KEY -u GOOGLE_MAPS_SERVER_API_KEY \
    -u CESIUM_ION_TOKEN -u AISSTREAM_API_KEY -u FIRMS_MAP_KEY \
    -u MAPILLARY_CLIENT_TOKEN -u TOMTOM_API_KEY -u LL2_API_TOKEN \
    -u OPENSKY_CLIENT_ID -u OPENSKY_CLIENT_SECRET HOST=127.0.0.1 \
    node node_modules/vite/bin/vite.js --host 127.0.0.1 --port "$PORT" --strictPort
}
start_app() {
  check_node; check_checkout
  [[ -d "$APP_DIR/node_modules/vite" ]] || die "Run install first."
  mkdir -p "$STATE_DIR"
  if endpoint_ready; then
    info "Already responding at http://127.0.0.1:$PORT/ (no restart)"
    return
  fi
  if [[ -f "$PID_FILE" ]]; then
    local old_pid
    old_pid="$(cat "$PID_FILE")"
    if [[ "$old_pid" =~ ^[0-9]+$ ]] && kill -0 "$old_pid" 2>/dev/null; then
      # A reboot may reuse this numeric PID for an unrelated process.
      # Never kill or block on a PID unless its working directory and command match.
      if [[ "$(readlink "/proc/$old_pid/cwd" 2>/dev/null || true)" == "$APP_DIR" ]] \
         && [[ "$(tr '\0' ' ' < "/proc/$old_pid/cmdline" 2>/dev/null || true)" == *"node_modules/vite/bin/vite.js"* ]]; then
        die "Owned PID $old_pid is alive but HTTP is not healthy. Inspect $LOG_FILE."
      fi
      info "Ignoring stale/recycled PID $old_pid from an earlier Android session."
    fi
  fi
  port_free || die "Port $PORT occupied by another service; refusing to change it."
  rm -f "$PID_FILE"
  # No npm shell intermediary; the orphaned process belongs to its own session.
  setsid -f bash "$0" _serve >> "$LOG_FILE" 2>&1 < /dev/null
  local n
  for n in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    if endpoint_ready; then
      info "ONLINE: http://127.0.0.1:$PORT/ (17 keyless-capable layers)"
      return
    fi
    sleep 2
  done
  die "Health check failed. Inspect $LOG_FILE; other services were not changed."
}
status_app() {
  check_node
  info "Checkout: $APP_DIR"
  if endpoint_ready; then info "HTTP OK: http://127.0.0.1:$PORT/"; else info "HTTP unavailable at $PORT"; fi
  if [[ -f "$PID_FILE" ]]; then info "Stored PID: $(cat "$PID_FILE")"; fi
  if [[ -f "$LOG_FILE" ]]; then info "Recent log:"; tail -n 10 "$LOG_FILE"; fi
}
mcp_app() {
  check_node; check_checkout
  endpoint_ready || die "Start the sidecar before MCP registration."
  (cd "$APP_DIR" && keyless npm run build:panel)
  if command -v claude >/dev/null 2>&1; then
    if claude mcp get gods-eye-view >/dev/null 2>&1; then
      info "Claude MCP exists; no changes."
    else
      claude mcp add gods-eye-view -- node "$APP_DIR/server/mcp/stdio.js" --api-base "http://127.0.0.1:$PORT"
    fi
  fi
  if command -v codex >/dev/null 2>&1; then
    if codex mcp get gods-eye-view >/dev/null 2>&1; then
      info "Codex MCP exists; no changes."
    else
      codex mcp add gods-eye-view -- node "$APP_DIR/server/mcp/stdio.js" --api-base "http://127.0.0.1:$PORT"
    fi
  fi
}
if (( $# == 0 )); then
  printf 'Usage: bash scripts/travis-gev-keyless.sh install|start|status|mcp\n' >&2
  exit 2
fi
case "$1" in
  install) install_app ;;
  start) start_app ;;
  _serve) serve_app ;;
  status) status_app ;;
  mcp) mcp_app ;;
  *) die "Unknown action: $1 (use install|start|status|mcp)" ;;
esac
