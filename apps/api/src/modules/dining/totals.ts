import { computeBill, type BillTotals, type RoundingMode } from '@dalan/domain';

/** Dòng món tối thiểu để tính tạm tính. */
export interface LineForTotals {
  id: string;
  status: string;
  lineTotal: bigint | number;
  vatRateBps: number;
}

export interface BranchTaxConfig {
  vatRateBps: number;
  priceIncludesVat: boolean;
  serviceChargeBps: number;
  rounding: RoundingMode;
}

export const BILLABLE_STATUSES = new Set(['SENT', 'PREPARING', 'READY', 'SERVED']);

/** Tạm tính của phiên trên các dòng đã gửi bếp (chưa trừ các bill đã thanh toán). */
export function provisionalTotals(lines: LineForTotals[], branch: BranchTaxConfig, extra?: { serviceChargeBps?: number | null; minSpend?: number | null }): BillTotals {
  return computeBill({
    lines: lines
      .filter((l) => BILLABLE_STATUSES.has(l.status))
      .map((l) => ({ id: l.id, amount: Number(l.lineTotal), vatRateBps: l.vatRateBps })),
    serviceChargeBps: extra?.serviceChargeBps ?? branch.serviceChargeBps,
    defaultVatBps: branch.vatRateBps,
    priceIncludesVat: branch.priceIncludesVat,
    rounding: branch.rounding,
    minSpend: extra?.minSpend ?? null,
  });
}
