type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let current: Level = 'info';

export function setLogLevel(level: Level): void {
  current = level;
}

function stamp(): string {
  return new Date().toLocaleString('vi-VN', { hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });
}

function write(level: Level, scope: string, message: string, extra?: unknown): void {
  if (ORDER[level] < ORDER[current]) return;
  const line = `[${stamp()}] ${level.toUpperCase().padEnd(5)} [${scope}] ${message}`;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (extra !== undefined) fn(line, extra);
  else fn(line);
}

export function logger(scope: string) {
  return {
    debug: (m: string, e?: unknown) => write('debug', scope, m, e),
    info: (m: string, e?: unknown) => write('info', scope, m, e),
    warn: (m: string, e?: unknown) => write('warn', scope, m, e),
    error: (m: string, e?: unknown) => write('error', scope, m, e),
  };
}

export type Logger = ReturnType<typeof logger>;
