import { formatVnd } from '@dalan/domain';
import type { SeedItem } from '../data/menu';

/** Hiển thị giá một món: giá thường, giá theo cỡ, giá theo kg hoặc giá theo thời điểm. */
export function ItemPrice({ item }: { item: SeedItem }) {
  if (item.variants?.length) {
    return (
      <span className="text-right">
        {item.variants.map((v, i) => (
          <span key={v.name} className="block whitespace-nowrap sm:inline">
            {i > 0 && (
              <span className="hidden px-1 text-ink-muted sm:inline" aria-hidden="true">
                ·
              </span>
            )}
            <span className="text-ink-soft">{v.name}</span>{' '}
            <strong className="font-semibold text-ink">{formatVnd(v.price)}</strong>
          </span>
        ))}
      </span>
    );
  }
  if (item.pricingMode === 'market' || item.price == null) {
    return (
      <span className="whitespace-nowrap font-medium italic text-warn">Giá theo thời điểm</span>
    );
  }
  if (item.pricingMode === 'weight') {
    return (
      <span className="text-right">
        <strong className="whitespace-nowrap font-semibold text-ink">
          {formatVnd(item.price)}
          <span className="font-normal text-ink-soft">/{item.unit}</span>
        </strong>
        <span className="block text-xs text-ink-muted">giá theo kg, tính theo cân thực tế</span>
      </span>
    );
  }
  return (
    <strong className="whitespace-nowrap font-semibold text-ink">{formatVnd(item.price)}</strong>
  );
}
