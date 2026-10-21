import { io, type Socket } from 'socket.io-client';
import { logger } from './logger.js';

const log = logger('realtime');

export interface RealtimeHandlers {
  onPrintJob: () => void;
  onConnected: () => void;
}

/**
 * Kết nối Socket.IO /rt bằng token thiết bị để nhận `print.job.created` ngay lập tức.
 * Nếu máy chủ không chấp nhận, cầu in vẫn chạy bằng poll định kỳ.
 */
export function connectRealtime(apiUrl: string, deviceToken: string, handlers: RealtimeHandlers): Socket {
  const socket = io(`${apiUrl}/rt`, {
    auth: { deviceToken },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 30_000,
    timeout: 10_000,
  });
  socket.on('connect', () => log.info('Đã kết nối realtime'));
  socket.on('ready', (info: { kind?: string; branchId?: string }) => {
    log.info(`Realtime sẵn sàng (${info?.kind ?? '?'}, cơ sở ${info?.branchId ?? '?'})`);
    handlers.onConnected();
  });
  socket.on('event', (event: { type?: string }) => {
    if (event?.type === 'print.job.created') handlers.onPrintJob();
  });
  socket.on('error', (err: unknown) => log.warn(`Realtime lỗi: ${JSON.stringify(err)}`));
  socket.on('connect_error', (err: Error) => log.debug(`Realtime chưa kết nối được: ${err.message}`));
  socket.on('disconnect', (reason: string) => log.warn(`Realtime ngắt: ${reason}`));
  return socket;
}
