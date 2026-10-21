/** Bỏ dấu tiếng Việt (kể cả đ/Đ) để tìm kiếm, sinh mã và nội dung chuyển khoản. */
export function removeDiacritics(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/** Chuỗi tìm kiếm: bỏ dấu, chữ thường, gộp khoảng trắng. */
export function normalizeSearch(input: string): string {
  return removeDiacritics(input).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Kiểm tra `query` xuất hiện trong `text` không phân biệt dấu và hoa thường. */
export function matchesSearch(text: string, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  return normalizeSearch(text).includes(q);
}

/** Slug ASCII: "Gà ri luộc rút xương" → "ga-ri-luoc-rut-xuong". */
export function slugify(input: string): string {
  return removeDiacritics(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Mã viết hoa gọn: "Gà ri luộc" → "GA-RI-LUOC". */
export function codify(input: string, maxLength = 40): string {
  return slugify(input).toUpperCase().slice(0, maxLength).replace(/-+$/g, '');
}

/**
 * Sinh mã chứng từ dạng `{prefix}-{YYYYMMDD}-{seq}` với seq đệm 4 số.
 * Ví dụ: bill `C-20261020-0001`, phiên `S-20261020-0042`.
 */
export function documentCode(prefix: string, businessDate: string, seq: number): string {
  const ymd = businessDate.replace(/-/g, '');
  return `${prefix}-${ymd}-${seq.toString().padStart(4, '0')}`;
}
