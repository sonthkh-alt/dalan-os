import { applyBps, assertAmount, roundHalfAwayFromZero, vatIncludedIn, vatOn } from '../money/money.js';

export interface EventMenuInput {
  pricePerTable: number;
  tables: number;
}

export interface EventServiceInput {
  unitPrice: number;
  quantity: number;
  isIncluded?: boolean;
}

export interface EventTotalsInput {
  menus: EventMenuInput[];
  services: EventServiceInput[];
  adjustments?: { amount: number }[];
  discountAmount?: number;
  serviceChargeBps?: number;
  vatBps: number;
  priceIncludesVat: boolean;
}

export interface EventTotals {
  subtotalMenu: number;
  subtotalServices: number;
  adjustmentsTotal: number;
  discountAmount: number;
  serviceChargeAmount: number;
  vatAmount: number;
  total: number;
}

export function computeEventTotals(input: EventTotalsInput): EventTotals {
  const subtotalMenu = input.menus.reduce((s, m) => s + assertAmount(m.pricePerTable) * m.tables, 0);
  const subtotalServices = input.services
    .filter((s) => !s.isIncluded)
    .reduce((s, x) => s + roundHalfAwayFromZero(assertAmount(x.unitPrice) * x.quantity), 0);
  const adjustmentsTotal = (input.adjustments ?? []).reduce((s, a) => s + assertAmount(a.amount), 0);
  const gross = subtotalMenu + subtotalServices + adjustmentsTotal;
  const discountAmount = Math.min(input.discountAmount ?? 0, gross);
  const net = gross - discountAmount;
  const serviceChargeAmount = applyBps(net, input.serviceChargeBps ?? 0);
  const taxable = net + serviceChargeAmount;
  const vatAmount = input.priceIncludesVat ? vatIncludedIn(taxable, input.vatBps) : vatOn(taxable, input.vatBps);
  const total = input.priceIncludesVat ? taxable : taxable + vatAmount;
  return { subtotalMenu, subtotalServices, adjustmentsTotal, discountAmount, serviceChargeAmount, vatAmount, total };
}

export interface DepositStep {
  label: string;
  percentBps?: number;
  amount?: number;
  dueDate: string;
}

export interface DepositScheduleRow {
  seq: number;
  label: string;
  amount: number;
  percentBps: number | null;
  dueDate: string;
}

/** Sinh lịch đặt cọc từ phần trăm hoặc số tiền; đợt cuối "còn lại" nếu tổng chưa đủ 100%. */
export function buildDepositSchedule(
  total: number,
  steps: DepositStep[],
  finalLabel = 'Thanh toán còn lại',
  finalDueDate?: string,
): DepositScheduleRow[] {
  assertAmount(total);
  let allocated = 0;
  const rows: DepositScheduleRow[] = steps.map((s, i) => {
    const amount = s.amount ?? (s.percentBps !== undefined ? applyBps(total, s.percentBps) : 0);
    allocated += amount;
    return { seq: i + 1, label: s.label, amount, percentBps: s.percentBps ?? null, dueDate: s.dueDate };
  });
  const remainder = total - allocated;
  if (remainder < 0) throw new RangeError('Tổng các đợt cọc vượt tổng giá trị tiệc');
  if (remainder > 0) {
    rows.push({
      seq: rows.length + 1,
      label: finalLabel,
      amount: remainder,
      percentBps: null,
      dueDate: finalDueDate ?? steps.at(-1)?.dueDate ?? '',
    });
  }
  return rows;
}

/** Định lượng bếp cho tiệc: số lượng mỗi món = số mâm (gồm dự phòng) × lượng mỗi mâm. */
export function banquetKitchenQuantities(
  lines: { name: string; quantityPerTable: number; unit?: string }[],
  confirmedTables: number,
  reserveTables: number,
) {
  const tables = confirmedTables + reserveTables;
  return lines.map((l) => ({
    name: l.name,
    unit: l.unit ?? null,
    quantity: Math.round(l.quantityPerTable * tables * 1000) / 1000,
    tables,
  }));
}
