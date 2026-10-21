import { z } from 'zod';
import { dateOnlySchema, idSchema } from './common.js';

export const salesGroupBySchema = z.enum(['day', 'hour', 'weekday', 'branch', 'category', 'item', 'staff', 'source', 'method']);
export type SalesGroupBy = z.infer<typeof salesGroupBySchema>;

export const reportRangeSchema = z.object({
  branchId: idSchema.optional(),
  from: dateOnlySchema,
  to: dateOnlySchema,
});

export const salesQuerySchema = reportRangeSchema.extend({ groupBy: salesGroupBySchema.default('day') });
export type SalesQuery = z.infer<typeof salesQuerySchema>;

export const realtimeQuerySchema = z.object({ branchId: idSchema.optional() });

export const exportQuerySchema = salesQuerySchema.extend({ report: z.enum(['sales', 'kitchen', 'discounts-voids', 'shifts']).default('sales') });

export interface SalesRow {
  key: string;
  label: string;
  revenue: number;
  bills: number;
  guests: number;
  discounts: number;
  avgBill: number;
}

export interface RealtimeReport {
  branchIds: string[];
  businessDate: string;
  todayRevenue: number;
  lastWeekSameDayRevenue: number;
  changePct: number | null;
  todayBills: number;
  todayGuests: number;
  openSessions: number;
  seatedGuests: number;
  overdueTickets: number;
  openServiceRequests: number;
  upcomingReservations: number;
  eventsToday: number;
  hourly: { hour: number; revenue: number; bills: number }[];
  byMethod: Record<string, number>;
}

export const SALES_GROUP_LABELS: Record<SalesGroupBy, string> = {
  day: 'Theo ngày',
  hour: 'Theo giờ',
  weekday: 'Theo thứ',
  branch: 'Theo cơ sở',
  category: 'Theo danh mục',
  item: 'Theo món',
  staff: 'Theo nhân viên',
  source: 'Theo nguồn đơn',
  method: 'Theo phương thức thanh toán',
};
