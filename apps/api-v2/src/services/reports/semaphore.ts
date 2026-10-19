// apps/api-v2/src/services/reports/semaphore.ts · semáforo asíncrono con cola
// acotada y timeout de espera. Lo usa pdf-renderer para limitar los renders de
// Chromium simultáneos (REP-A27: antecedente del 502 con 512 MB). Puro y sin
// dependencias, para poder probarlo con renders simulados.

/** La cola está llena o la espera venció: el cliente debe reintentar. */
export class BusyError extends Error {
  readonly retryAfterSec: number;
  constructor(message: string, retryAfterSec: number) {
    super(message);
    this.name = 'BusyError';
    this.retryAfterSec = retryAfterSec;
  }
}

export interface SemaphoreOptions {
  /** Ejecuciones simultáneas máximas. */
  max: number;
  /** Tareas esperando como máximo; al superarlo se rechaza al instante. */
  maxQueue: number;
  /** Cuánto puede esperar una tarea en cola antes de rendirse (ms). */
  queueTimeoutMs: number;
  /** Valor sugerido para `Retry-After` (segundos). */
  retryAfterSec?: number;
}

interface Waiter { start: () => void; timer: ReturnType<typeof setTimeout> }

export class Semaphore {
  private active = 0;
  private readonly queue: Waiter[] = [];
  private readonly retryAfterSec: number;

  constructor(private readonly opts: SemaphoreOptions) {
    this.retryAfterSec = opts.retryAfterSec ?? 5;
  }

  get running(): number { return this.active; }
  get waiting(): number { return this.queue.length; }

  /** Ejecuta `fn` cuando haya cupo. Lanza BusyError si la cola está llena o vence la espera. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.opts.max) {
      this.active += 1;
      return Promise.resolve();
    }
    if (this.queue.length >= this.opts.maxQueue) {
      return Promise.reject(new BusyError('Cola de PDF llena.', this.retryAfterSec));
    }
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        start: () => { clearTimeout(waiter.timer); resolve(); },
        timer: setTimeout(() => {
          const i = this.queue.indexOf(waiter);
          if (i >= 0) this.queue.splice(i, 1);
          reject(new BusyError('Se agotó la espera por un turno de PDF.', this.retryAfterSec));
        }, this.opts.queueTimeoutMs),
      };
      this.queue.push(waiter);
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) next.start(); // el turno pasa directo: `active` no baja
    else this.active -= 1;
  }
}

const intEnv = (name: string, fallback: number): number => {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/** Semáforo configurado desde el entorno (PDF_MAX_CONCURRENCY=2, PDF_MAX_QUEUE=8, PDF_QUEUE_TIMEOUT_MS=30000). */
export function semaphoreFromEnv(): Semaphore {
  return new Semaphore({
    max: intEnv('PDF_MAX_CONCURRENCY', 2),
    maxQueue: intEnv('PDF_MAX_QUEUE', 8),
    queueTimeoutMs: intEnv('PDF_QUEUE_TIMEOUT_MS', 30_000),
    retryAfterSec: 5,
  });
}
