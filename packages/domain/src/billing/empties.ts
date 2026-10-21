/** Đếm vỏ bia, nước, khăn lạnh cuối bữa và đối chiếu với số đã gọi. */
export interface EmptiesCount {
  itemId: string;
  orderedQty: number;
  countedQty: number;
}

export interface EmptiesAdjustment {
  itemId: string;
  /** Dương: thêm dòng; âm: bớt số lượng (khách dùng ít hơn đã gọi). */
  delta: number;
}

export function reconcileEmpties(counts: EmptiesCount[]): EmptiesAdjustment[] {
  const adjustments: EmptiesAdjustment[] = [];
  for (const c of counts) {
    if (!Number.isInteger(c.orderedQty) || !Number.isInteger(c.countedQty) || c.countedQty < 0) {
      throw new RangeError(`Số lượng không hợp lệ cho ${c.itemId}`);
    }
    const delta = c.countedQty - c.orderedQty;
    if (delta !== 0) adjustments.push({ itemId: c.itemId, delta });
  }
  return adjustments;
}
