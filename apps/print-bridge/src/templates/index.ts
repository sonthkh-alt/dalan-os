import type { Block } from '../render/blocks.js';
import { text } from '../render/blocks.js';
import type { BillPayload, DepositReceiptPayload, KitchenTicketPayload, KitchenVoidPayload, LabelPayload, PrintJobDto, ShiftReportPayload, TestPayload } from '../types.js';
import { bill, depositReceipt } from './bill.js';
import { kitchenTicket, kitchenVoid, label } from './kitchen.js';
import { shiftReport, testPage } from './reports.js';

export interface TemplateResult {
  blocks: Block[];
  /** Mở két tiền sau khi in (bill cuối có tiền mặt) */
  openDrawer: boolean;
  /** Chuông báo (phiếu bếp, phiếu hủy) */
  beep: boolean;
}

/** Chọn mẫu in theo loại job và payload do API tạo. */
export function templateFor(job: PrintJobDto): TemplateResult {
  const p = job.payload;
  switch (job.kind) {
    case 'KITCHEN_TICKET':
      return { blocks: kitchenTicket(p as unknown as KitchenTicketPayload), openDrawer: false, beep: true };
    case 'KITCHEN_VOID':
      return { blocks: kitchenVoid(p as unknown as KitchenVoidPayload), openDrawer: false, beep: true };
    case 'BILL_PROVISIONAL':
    case 'BILL_FINAL': {
      const payload = p as unknown as BillPayload;
      const cash = job.kind === 'BILL_FINAL' && payload.payments?.some((x) => x.method === 'CASH');
      return { blocks: bill({ ...payload, kind: job.kind }), openDrawer: !!cash, beep: false };
    }
    case 'SHIFT_REPORT':
      return { blocks: shiftReport(p as unknown as ShiftReportPayload), openDrawer: false, beep: false };
    case 'DEPOSIT_RECEIPT':
      return { blocks: depositReceipt(p as unknown as DepositReceiptPayload), openDrawer: false, beep: false };
    case 'TEST':
      return { blocks: testPage(p as unknown as TestPayload, job.printer?.name), openDrawer: false, beep: false };
    case 'LABEL':
      return { blocks: label(p as unknown as LabelPayload), openDrawer: false, beep: false };
    default:
      return { blocks: [text(`Loại lệnh in chưa hỗ trợ: ${String(job.kind)}`, { size: 'md', bold: true })], openDrawer: false, beep: false };
  }
}
