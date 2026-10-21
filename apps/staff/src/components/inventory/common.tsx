'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { StockItem, Warehouse } from '@/lib/queries-ops';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/primitives';
import { MoneyInput, NumberInput } from '@/components/ops/ui';

export const WAREHOUSE_KIND: Record<string, string> = { MAIN: 'Kho chính', KITCHEN: 'Kho bếp', BAR: 'Kho bar', COLD: 'Kho lạnh', CENTRAL: 'Kho trung tâm', FACTORY: 'Nhà máy' };

export const PO_STATUS: Record<string, { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }> = {
  DRAFT: { label: 'Nháp', tone: 'neutral' },
  SENT: { label: 'Đã gửi NCC', tone: 'info' },
  PARTIAL: { label: 'Nhận một phần', tone: 'warning' },
  RECEIVED: { label: 'Đã nhận đủ', tone: 'success' },
  CANCELLED: { label: 'Đã hủy', tone: 'danger' },
};

export const TRANSFER_STATUS: Record<string, { label: string; tone: 'neutral' | 'info' | 'success' | 'danger' }> = {
  DRAFT: { label: 'Nháp', tone: 'neutral' },
  SENT: { label: 'Đang chuyển', tone: 'info' },
  RECEIVED: { label: 'Đã nhận', tone: 'success' },
  CANCELLED: { label: 'Đã hủy', tone: 'danger' },
};

export const STOCKTAKE_STATUS: Record<string, { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }> = {
  DRAFT: { label: 'Nháp', tone: 'neutral' },
  COUNTING: { label: 'Đang đếm', tone: 'info' },
  REVIEW: { label: 'Chờ duyệt', tone: 'warning' },
  APPROVED: { label: 'Đã duyệt', tone: 'success' },
  CANCELLED: { label: 'Đã hủy', tone: 'danger' },
};

export function WarehouseSelect({ label = 'Kho', value, onChange, warehouses, allowEmpty }: { label?: string; value: string; onChange: (id: string) => void; warehouses: Warehouse[]; allowEmpty?: string }) {
  return (
    <Select label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty !== undefined && <option value="">{allowEmpty}</option>}
      {warehouses.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name} ({w.code}){w.branch ? '' : ' · trung tâm'}
        </option>
      ))}
    </Select>
  );
}

export interface StockLine {
  stockItemId: string;
  quantity: number | null;
  unit: string;
  unitPrice: number | null;
}

export const emptyLine = (): StockLine => ({ stockItemId: '', quantity: null, unit: '', unitPrice: null });

/** Bảng nhập dòng nguyên liệu (đặt hàng, nhập kho, chuyển kho, hao hụt). */
export function StockLineEditor({ lines, onChange, items, withUnit, withPrice, qtyLabel = 'Số lượng' }: { lines: StockLine[]; onChange: (l: StockLine[]) => void; items: StockItem[]; withUnit?: boolean; withPrice?: boolean; qtyLabel?: string }) {
  const upd = (i: number, p: Partial<StockLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  return (
    <div className="space-y-2">
      {lines.map((l, i) => {
        const item = items.find((x) => x.id === l.stockItemId);
        return (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-ink-100 p-2 sm:grid-cols-[1fr_110px_120px_150px_auto]">
            <select
              value={l.stockItemId}
              onChange={(e) => {
                const it = items.find((x) => x.id === e.target.value);
                upd(i, { stockItemId: e.target.value, unit: withUnit ? (it?.purchaseUnit ?? '') : (it?.baseUnit ?? ''), unitPrice: withPrice && it ? Math.round(it.costPerBaseUnit * (withUnit ? it.purchaseUnitFactor : 1)) : l.unitPrice })}
              }
              className="col-span-2 min-h-[48px] rounded-xl border border-ink-300 bg-white px-2 sm:col-span-1"
              aria-label="Nguyên liệu"
            >
              <option value="">Chọn nguyên liệu...</option>
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name} ({it.code})
                </option>
              ))}
            </select>
            <NumberInput value={l.quantity} onChange={(v) => upd(i, { quantity: v })} min={0} inputClassName="text-right" />
            {withUnit ? (
              <select
                value={l.unit}
                onChange={(e) => {
                  const unit = e.target.value;
                  const price = item && withPrice ? Math.round(item.costPerBaseUnit * (unit === item.purchaseUnit ? item.purchaseUnitFactor : 1)) : l.unitPrice;
                  upd(i, { unit, unitPrice: price });
                }}
                className="min-h-[48px] rounded-xl border border-ink-300 bg-white px-2"
                aria-label="Đơn vị"
              >
                {item ? (
                  <>
                    <option value={item.purchaseUnit}>{item.purchaseUnit}</option>
                    {item.baseUnit !== item.purchaseUnit && <option value={item.baseUnit}>{item.baseUnit}</option>}
                  </>
                ) : (
                  <option value="">—</option>
                )}
              </select>
            ) : (
              <span className="flex items-center text-sm text-ink-500">{item?.baseUnit ?? ''}</span>
            )}
            {withPrice ? <MoneyInput value={l.unitPrice} onChange={(v) => upd(i, { unitPrice: v })} /> : <span className="hidden sm:block" />}
            <button type="button" onClick={() => onChange(lines.filter((_, j) => j !== i))} className="flex h-12 w-10 items-center justify-center text-red-700" aria-label="Xóa dòng">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        );
      })}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => onChange([...lines, emptyLine()])}>
          <Plus className="h-4 w-4" /> Thêm dòng
        </Button>
        <span className="text-xs text-ink-500">
          {qtyLabel}
          {withUnit ? ' theo đơn vị chọn' : ' theo đơn vị cơ sở'}
          {withPrice ? ', đơn giá theo đơn vị đó' : ''}
        </span>
      </div>
    </div>
  );
}

export const validLines = (lines: StockLine[], needPrice = false) => lines.length > 0 && lines.every((l) => l.stockItemId && (l.quantity ?? 0) > 0 && (!needPrice || l.unitPrice !== null));
