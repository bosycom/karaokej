#!/bin/bash
# Mount //192.168.50.1/Audio at /mnt/a for Karaokej.
#
# Prefer a direct CIFS mount (full POSIX rename/write on SMB). Fall back to
# drvfs A:\ when credentials are unavailable or CIFS fails.
#
# CIFS credentials (optional, recommended for rating/metadata writes):
#   sudo mkdir -p /etc/karaokej
#   sudo install -m 600 /dev/stdin /etc/karaokej/audio.credentials <<'EOF'
#   username=YOUR_USER
#   password=YOUR_PASSWORD
#   EOF
#
# Install:
#   sudo install -m 755 scripts/mount-windows-audio.sh /usr/local/sbin/mount-windows-audio.sh
# Ensure /etc/wsl.conf [boot] command runs this script (see README).
set -u

DEST=/mnt/a
SMB="//192.168.50.1/Audio"
CREDENTIALS="/etc/karaokej/audio.credentials"
DRVFS_SRC="A:\\"
DRVFS_OPTS="rw,noatime,uid=1000,gid=1000"

mkdir -p "$DEST"

if findmnt -n "$DEST" >/dev/null 2>&1; then
  if ls "$DEST" >/dev/null 2>&1; then
    exit 0
  fi
  umount "$DEST" >/dev/null 2>&1 || umount -l "$DEST" >/dev/null 2>&1 || true
fi

mount_cifs() {
  command -v mount.cifs >/dev/null 2>&1 || return 1
  [ -r "$CREDENTIALS" ] || return 1
  mount -t cifs "$SMB" "$DEST" \
    -o "credentials=$CREDENTIALS,uid=1000,gid=1000,file_mode=0664,dir_mode=0775,noperm"
}

mount_drvfs() {
  mount -t drvfs "$DRVFS_SRC" "$DEST" -o "$DRVFS_OPTS"
}

tries="${1:-45}"
for i in $(seq 1 "$tries"); do
  if mount_cifs; then
    exit 0
  fi
  if mount_drvfs; then
    exit 0
  fi
  sleep 1
done

echo "Timed out waiting to mount $SMB or $DRVFS_SRC at $DEST" >&2
exit 1
