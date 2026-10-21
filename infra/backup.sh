#!/bin/sh
# Sao lưu PostgreSQL hằng ngày, giữ BACKUP_KEEP_DAYS ngày. Chạy trong container backup.
set -eu
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="/backups/dalan-${STAMP}.sql.gz"
pg_dump -h postgres -U "${POSTGRES_USER}" "${POSTGRES_DB}" | gzip > "${OUT}"
echo "Đã sao lưu ${OUT} ($(du -h "${OUT}" | cut -f1))"
find /backups -name 'dalan-*.sql.gz' -mtime +"${BACKUP_KEEP_DAYS:-30}" -delete
# Tùy chọn: đồng bộ lên lưu trữ đối tượng bằng rclone nếu cấu hình RCLONE_REMOTE
if [ -n "${RCLONE_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  rclone copy /backups "${RCLONE_REMOTE}" --include 'dalan-*.sql.gz'
fi
