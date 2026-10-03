#!/bin/sh
# Agent entrypoint. Runs the server as the unprivileged `instinct` user.
#
# Containers usually start as root, and Maritime mounts /data owned by root. The only
# root work here is making /data writable by `instinct`; then privileges are dropped
# for good with setpriv. When the container is already unprivileged (docker run --user,
# a platform that sets the user), nothing changes and the command runs as is.
set -eu

DATA_DIR="${INSTINCT_DATA_DIR:-/data}"
RUN_USER="${INSTINCT_RUN_USER:-instinct}"

if [ "$(id -u)" = "0" ]; then
  if id "$RUN_USER" >/dev/null 2>&1; then
    mkdir -p "$DATA_DIR"
    # Top level and the secrets dir only: a large workspace does not need a recursive chown
    # on every boot, and anything the server creates is owned by instinct already.
    chown "$RUN_USER":"$RUN_USER" "$DATA_DIR"
    if [ -d "$DATA_DIR/secrets" ]; then chown -R "$RUN_USER":"$RUN_USER" "$DATA_DIR/secrets"; fi
    # Files a previous root-run image left behind: hand them over once.
    find "$DATA_DIR" -maxdepth 2 ! -user "$RUN_USER" -exec chown "$RUN_USER":"$RUN_USER" {} + 2>/dev/null || true
    export HOME="/home/$RUN_USER"
    if command -v setpriv >/dev/null 2>&1; then
      exec setpriv --reuid="$RUN_USER" --regid="$RUN_USER" --init-groups --inh-caps=-all "$@"
    fi
    echo "[entrypoint] setpriv not found; running as root" >&2
  else
    echo "[entrypoint] user $RUN_USER not found; running as root" >&2
  fi
fi

exec "$@"
