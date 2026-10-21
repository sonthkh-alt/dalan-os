/** Chia dòng theo bề rộng với hàm đo chữ tùy ý (để kiểm thử không cần canvas). */

export type Measure = (text: string) => number;

export function wrapText(input: string, maxWidth: number, measure: Measure): string[] {
  const lines: string[] = [];
  for (const paragraph of input.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      // Từ dài hơn bề rộng: cắt theo ký tự
      if (measure(word) > maxWidth) {
        let chunk = '';
        for (const ch of word) {
          if (measure(chunk + ch) > maxWidth && chunk) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

/** Cắt chuỗi cho vừa bề rộng, thêm dấu … nếu bị cắt. */
export function ellipsize(input: string, maxWidth: number, measure: Measure): string {
  if (measure(input) <= maxWidth) return input;
  let out = input;
  while (out.length > 0 && measure(`${out}…`) > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}
