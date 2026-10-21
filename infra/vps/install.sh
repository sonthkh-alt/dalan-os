#!/usr/bin/env bash
# Cài DaLan OS trên một máy chủ Ubuntu/Debian (Oracle Cloud Always Free, VPS...). Chạy liên tục, không ngủ.
#
#   curl -fsSL https://raw.githubusercontent.com/sonthkh-alt/dalan-os/main/infra/vps/install.sh | sudo bash
#
# Tùy chọn qua biến môi trường:
#   DOMAIN_BASE=dalan.com.vn   dùng tên miền riêng: api./app./menu.<DOMAIN_BASE> (trỏ DNS về IP máy chủ trước)
#   SEED_STAFF_PASSWORD, SEED_STAFF_PIN   mật khẩu/PIN nhân viên mẫu (không đặt thì script hỏi)
#   ACME_EMAIL                 email nhận thông báo chứng chỉ HTTPS
#   DEMO=1                     hiện gợi ý tài khoản ở trang đăng nhập (mặc định 1)
# Chạy lại script để cập nhật phiên bản mới (giữ nguyên dữ liệu và khóa bí mật).
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/sonthkh-alt/dalan-os.git}"
APP_DIR="${APP_DIR:-/opt/dalan-os}"
ENV_FILE="$APP_DIR/infra/.env.prod"

log() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mLỗi: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Hãy chạy bằng quyền root (thêm sudo)."
command -v apt-get >/dev/null || die "Script hỗ trợ Ubuntu/Debian."

log "Cài gói cần thiết"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git openssl >/dev/null

if ! command -v docker >/dev/null; then
  log "Cài Docker"
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
systemctl enable --now docker >/dev/null

# Máy ít RAM: thêm swap để build Next.js không bị thiếu bộ nhớ
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$MEM_MB" -lt 4000 ] && ! swapon --show | grep -q swapfile; then
  log "RAM ${MEM_MB} MB: tạo swap 4 GB"
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Ảnh Ubuntu của Oracle Cloud chặn sẵn mọi cổng trừ 22 bằng iptables: mở 80 và 443
log "Mở cổng 80, 443 trên tường lửa của máy"
REJECT_POS="$(iptables -L INPUT --line-numbers -n 2>/dev/null | awk '$2 == "REJECT" {print $1; exit}')"
if [ -n "$REJECT_POS" ]; then
  # Chèn ngay trước luật REJECT đầu tiên
  for rule in "-p tcp --dport 80" "-p tcp --dport 443" "-p udp --dport 443"; do
    # shellcheck disable=SC2086
    iptables -C INPUT $rule -j ACCEPT 2>/dev/null || iptables -I INPUT "$REJECT_POS" $rule -j ACCEPT
  done
  if command -v netfilter-persistent >/dev/null; then netfilter-persistent save >/dev/null 2>&1 || true; fi
fi
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null && ufw allow 443 >/dev/null
fi

log "Tải mã nguồn"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone --depth 1 "$REPO_URL" "$APP_DIR"
fi

if [ ! -f "$ENV_FILE" ]; then
  log "Tạo cấu hình lần đầu"
  PUBLIC_IP="$(curl -fsS4 https://api.ipify.org || curl -fsS4 https://ifconfig.me)"
  [ -n "$PUBLIC_IP" ] || die "Không xác định được địa chỉ IP công khai."
  if [ -n "${DOMAIN_BASE:-}" ]; then
    DOMAIN_API="api.$DOMAIN_BASE"; DOMAIN_STAFF="app.$DOMAIN_BASE"; DOMAIN_GUEST="menu.$DOMAIN_BASE"
  else
    # Không có tên miền: sslip.io phân giải api.1-2-3-4.sslip.io về 1.2.3.4, Caddy vẫn xin được HTTPS
    IP_DASH="${PUBLIC_IP//./-}"
    DOMAIN_API="api.$IP_DASH.sslip.io"; DOMAIN_STAFF="app.$IP_DASH.sslip.io"; DOMAIN_GUEST="menu.$IP_DASH.sslip.io"
  fi

  PASS="${SEED_STAFF_PASSWORD:-}"
  while [ ${#PASS} -lt 10 ] || [ "$PASS" = "Dalan@2026" ] || [[ "$PASS" == *"'"* ]]; do
    read -r -s -p "Mật khẩu cho tài khoản quản lý mẫu (ADMIN...), tối thiểu 10 ký tự, không chứa dấu ': " PASS </dev/tty; echo
  done
  PIN="${SEED_STAFF_PIN:-}"
  until [[ "$PIN" =~ ^[0-9]{4,6}$ ]] && [[ ! "$PIN" =~ ^(1234|1111|2222|9999|0000)$ ]]; do
    read -r -p "Mã PIN 4-6 số cho nhân viên mẫu (không dùng 1234, 1111...): " PIN </dev/tty
  done

  secret() { openssl rand -base64 48 | tr -d '\n/+='; }
  umask 077
  cat > "$ENV_FILE" <<EOF
# Tạo bởi infra/vps/install.sh lúc $(date -Iseconds). Giữ bí mật tệp này.
DOMAIN_API=$DOMAIN_API
DOMAIN_STAFF=$DOMAIN_STAFF
DOMAIN_GUEST=$DOMAIN_GUEST
ACME_EMAIL=${ACME_EMAIL:-admin@example.com}
POSTGRES_USER=dalan
POSTGRES_PASSWORD=$(secret)
POSTGRES_DB=dalan
JWT_ACCESS_SECRET=$(secret)
JWT_REFRESH_SECRET=$(secret)
GUEST_TOKEN_SECRET=$(secret)
SEED_STAFF_PASSWORD='$PASS'
SEED_STAFF_PIN=$PIN
NEXT_PUBLIC_DEMO=${DEMO:-1}
PAYMENT_PROVIDERS=vietqr,mock
EINVOICE_PROVIDER=mock
MESSAGING_PROVIDER=mock
EOF
  chmod 600 "$ENV_FILE"
fi

set -a; . "$ENV_FILE"; set +a

log "Build và khởi động (lần đầu mất 10-20 phút)"
cd "$APP_DIR"
docker compose -f infra/docker-compose.prod.yml --env-file "$ENV_FILE" up -d --build --remove-orphans

log "Chờ API sẵn sàng"
for i in $(seq 1 90); do
  if docker compose -f infra/docker-compose.prod.yml --env-file "$ENV_FILE" exec -T api wget -qO- http://127.0.0.1:4000/health 2>/dev/null | grep -q '"status":"ok"'; then
    OK=1; break
  fi
  sleep 5
done
[ "${OK:-0}" = 1 ] || die "API chưa sẵn sàng. Xem log: docker compose -f $APP_DIR/infra/docker-compose.prod.yml logs api"

docker image prune -f >/dev/null 2>&1 || true

cat <<EOF

DaLan OS đã chạy:
  App nhân viên : https://$DOMAIN_STAFF   (đăng nhập ADMIN + mật khẩu bạn đặt)
  App khách     : https://$DOMAIN_GUEST
  API, Swagger  : https://$DOMAIN_API/docs

Lần đầu Caddy cần khoảng 1 phút để xin chứng chỉ HTTPS.
Cập nhật phiên bản mới: chạy lại script này.
Xem log: docker compose -f $APP_DIR/infra/docker-compose.prod.yml logs -f api
EOF
