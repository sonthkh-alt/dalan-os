import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Icon, Sheet, useNavigate } from 'zmp-ui';
import type { GuestOrderInput } from '@dalan/contracts';
import { api, ApiError, errorMessage, newIdempotencyKey } from '../lib/api';
import { cartCount, cartLineTotal, cartTotal, useCart } from '../lib/cart-store';
import { formatVnd } from '../lib/format';
import { useGuestSession, useGuestToken } from '../lib/session-store';
import { inputClass, useToast } from './ui';

/** Thanh giỏ nổi phía trên thanh điều hướng. */
export function CartBar() {
  const lines = useCart((s) => s.lines);
  const [open, setOpen] = useState(false);
  if (lines.length === 0) return null;
  return (
    <>
      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+64px)] z-40 px-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mx-auto flex w-full max-w-lg items-center justify-between gap-2 rounded-2xl bg-maroon px-4 py-3 text-white shadow-lg"
        >
          <span className="font-semibold">Giỏ món · {cartCount(lines)}</span>
          <span className="font-bold">{formatVnd(cartTotal(lines))}</span>
          <span className="rounded-lg bg-white/15 px-3 py-1 text-sm font-semibold">Xem giỏ</span>
        </button>
      </div>
      <CartSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function CartSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast((s) => s.show);
  const token = useGuestToken();
  const clearSession = useGuestSession((s) => s.clear);
  const { lines, orderNote, setQuantity, remove, setOrderNote, clear } = useCart();
  const [idemKey, setIdemKey] = useState(() => newIdempotencyKey());

  const submit = useMutation({
    mutationFn: async () => {
      const body: GuestOrderInput = {
        lines: lines.map((l) => ({
          itemId: l.itemId,
          variantId: l.variantId ?? undefined,
          quantity: l.quantity,
          modifiers: l.modifiers.map((m) => ({ groupId: m.groupId, optionId: m.optionId })),
          note: l.note || undefined,
          course: 1,
        })),
        notes: orderNote || undefined,
      };
      return api<{ id: string; status: string }>('/guest/orders', {
        body,
        guestToken: token,
        idempotencyKey: idemKey,
      });
    },
    onSuccess: (order) => {
      clear();
      setIdemKey(newIdempotencyKey());
      void queryClient.invalidateQueries({ queryKey: ['guest-session'] });
      toast(
        order.status === 'PENDING_CONFIRM'
          ? 'Đã gửi, chờ nhân viên xác nhận'
          : 'Đã gửi món xuống bếp',
      );
      onClose();
      navigate('/table/orders');
    },
    onError: (err) => {
      toast(`Gửi món chưa được: ${errorMessage(err)}`, 'error');
      if (err instanceof ApiError && err.status === 401) {
        clearSession();
        onClose();
        navigate('/table', { replace: true });
      }
    },
  });

  return (
    <Sheet visible={open} onClose={onClose} autoHeight mask handler swipeToClose title="Giỏ món">
      <div className="flex max-h-[75vh] flex-col">
        <div className="flex-1 overflow-y-auto px-4 pb-3">
          {lines.length === 0 ? (
            <p className="py-10 text-center text-ink-muted">Giỏ đang trống</p>
          ) : (
            <ul className="divide-y divide-line">
              {lines.map((l) => (
                <li key={l.key} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">
                      {l.name}
                      {l.variantName ? (
                        <span className="text-ink-soft"> · {l.variantName}</span>
                      ) : null}
                    </p>
                    {l.modifiers.length ? (
                      <p className="text-xs text-ink-soft">
                        {l.modifiers.map((m) => m.optionName).join(', ')}
                      </p>
                    ) : null}
                    {l.note ? <p className="text-xs text-ink-muted">“{l.note}”</p> : null}
                    <p className="mt-1 text-sm font-bold text-maroon">
                      {formatVnd(cartLineTotal(l))}
                    </p>
                  </div>
                  {l.pricingMode === 'WEIGHT' ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-ink-soft">{l.quantity} kg</span>
                      <button
                        type="button"
                        aria-label="Xóa món"
                        onClick={() => remove(l.key)}
                        className="rounded-full p-2 text-ink-muted"
                      >
                        <Icon icon="zi-delete" size={18} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center rounded-xl border border-line bg-paper">
                      <button
                        type="button"
                        aria-label="Giảm"
                        className="h-9 w-9 text-lg text-ink-soft"
                        onClick={() => setQuantity(l.key, l.quantity - 1)}
                      >
                        −
                      </button>
                      <span className="w-7 text-center font-bold">{l.quantity}</span>
                      <button
                        type="button"
                        aria-label="Tăng"
                        className="h-9 w-9 text-lg text-ink-soft"
                        onClick={() => setQuantity(l.key, l.quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {lines.length > 0 ? (
            <div className="mt-2 flex items-end gap-2">
              <label className="flex-1">
                <span className="mb-1 block text-sm font-medium text-ink-soft">
                  Ghi chú chung cho đợt gọi
                </span>
                <input
                  type="text"
                  value={orderNote}
                  onChange={(e) => setOrderNote(e.target.value)}
                  maxLength={300}
                  className={inputClass}
                />
              </label>
              <button
                type="button"
                onClick={clear}
                className="h-11 rounded-xl px-3 text-sm font-semibold text-danger"
              >
                Xóa hết
              </button>
            </div>
          ) : null}
        </div>
        {lines.length > 0 ? (
          <div className="safe-bottom space-y-2 border-t border-line bg-paper px-4 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-ink-soft">Tạm tính</span>
              <span className="text-xl font-bold text-maroon">{formatVnd(cartTotal(lines))}</span>
            </div>
            <Button
              fullWidth
              onClick={() => submit.mutate()}
              loading={submit.isPending}
              disabled={!token}
            >
              {submit.isPending ? 'Đang gửi...' : 'Gửi món'}
            </Button>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
