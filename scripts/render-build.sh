#!/usr/bin/env bash
# Build cho Render (gói miễn phí). Dùng: bash scripts/render-build.sh api|staff|guest
set -euo pipefail

TARGET="${1:?Thiếu tên dịch vụ: api | staff | guest}"
# pnpm đúng phiên bản trong package.json, không phụ thuộc corepack của máy build
PNPM="npx --yes pnpm@12.14.0"

$PNPM install --frozen-lockfile

case "$TARGET" in
  api)
    $PNPM --filter @dalan/domain --filter @dalan/contracts --filter @dalan/db build
    $PNPM --filter @dalan/api build
    ;;
  staff | guest)
    $PNPM --filter @dalan/domain --filter @dalan/contracts build
    $PNPM --filter "@dalan/$TARGET" build
    ;;
  *)
    echo "Dịch vụ không hợp lệ: $TARGET" >&2
    exit 1
    ;;
esac
