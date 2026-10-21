import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { logger } from './logger.js';
import type { PrintJobDto, PrintJobKind, PrinterDto } from './types.js';

const log = logger('local');

const localPrintSchema = z.object({
  kind: z.enum(['KITCHEN_TICKET', 'KITCHEN_VOID', 'BILL_PROVISIONAL', 'BILL_FINAL', 'SHIFT_REPORT', 'DEPOSIT_RECEIPT', 'TEST', 'LABEL']),
  payload: z.record(z.string(), z.unknown()),
  printerCode: z.string().optional(),
  printerId: z.string().optional(),
});

export interface LocalServerDeps {
  printers: () => PrinterDto[];
  enqueueLocal: (job: PrintJobDto) => void;
  status: () => Record<string, unknown>;
  requeue: (id: string) => boolean;
}

/**
 * Máy chủ HTTP nội bộ trong LAN:
 *  - GET  /          trang trạng thái
 *  - GET  /status    JSON trạng thái (hàng đợi, máy in, kết nối API)
 *  - POST /print     in khẩn cấp khi mất internet: { kind, payload, printerCode? | printerId? }
 *  - POST /requeue/:id  in lại một job
 */
export function startLocalServer(port: number, deps: LocalServerDeps) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/status') return json(res, 200, deps.status());
      if (req.method === 'GET' && url.pathname === '/') return html(res, statusPage(deps.status()));
      if (req.method === 'POST' && url.pathname === '/print') {
        const body = localPrintSchema.safeParse(await readJson(req));
        if (!body.success) return json(res, 400, { error: 'Dữ liệu không hợp lệ', issues: body.error.issues });
        const printer = resolvePrinter(deps.printers(), body.data);
        if (!printer) return json(res, 404, { error: 'Không tìm thấy máy in phù hợp' });
        const job: PrintJobDto = { id: `local-${randomUUID()}`, branchId: 'local', printerId: printer.id, kind: body.data.kind as PrintJobKind, payload: body.data.payload, printer, local: true };
        deps.enqueueLocal(job);
        return json(res, 202, { id: job.id, printer: printer.code });
      }
      const requeue = /^\/requeue\/([^/]+)$/.exec(url.pathname);
      if (req.method === 'POST' && requeue && requeue[1]) {
        return json(res, deps.requeue(decodeURIComponent(requeue[1])) ? 200 : 404, { ok: true });
      }
      json(res, 404, { error: 'Không tìm thấy' });
    } catch (err) {
      log.error(`Lỗi xử lý ${req.method} ${req.url}: ${String(err)}`);
      json(res, 500, { error: 'Lỗi máy chủ cục bộ' });
    }
  });
  server.listen(port, '0.0.0.0', () => log.info(`Máy chủ cục bộ tại http://0.0.0.0:${port}`));
  server.on('error', (err) => log.error(`Máy chủ cục bộ lỗi: ${err.message}`));
  return server;
}

function resolvePrinter(printers: PrinterDto[], input: { printerCode?: string; printerId?: string; kind: string }): PrinterDto | undefined {
  if (input.printerId) return printers.find((p) => p.id === input.printerId);
  if (input.printerCode) return printers.find((p) => p.code.toUpperCase() === input.printerCode!.toUpperCase());
  const wantKind = input.kind.startsWith('KITCHEN') || input.kind === 'LABEL' ? 'KITCHEN' : 'RECEIPT';
  return printers.find((p) => p.kind === wantKind && p.isActive !== false) ?? printers[0];
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      data += chunk;
      if (data.length > 2_000_000) reject(new Error('Body quá lớn'));
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body));
}

function html(res: ServerResponse, body: string): void {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
}

function statusPage(status: Record<string, unknown>): string {
  const esc = (s: unknown) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c);
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Cầu in DaLan OS</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;margin:24px;color:#222}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px;font-size:14px}pre{background:#f4f4f4;padding:12px;overflow:auto}</style></head>
<body><h1>Cầu in DaLan OS</h1><p>Trạng thái cập nhật lúc ${esc(new Date().toLocaleString('vi-VN'))}. Làm mới trang để xem lại.</p>
<pre>${esc(JSON.stringify(status, null, 2))}</pre>
<p>In khẩn cấp: <code>POST /print</code> với JSON { kind, payload, printerCode }.</p></body></html>`;
}
