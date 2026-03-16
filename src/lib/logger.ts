/**
 * Structured JSON logger for server-side and worker code.
 *
 * In production (NODE_ENV=production) each log line is a single JSON object
 * on stdout, suitable for ingestion by log aggregators (Loki, Datadog, etc.):
 *   {"level":"info","ts":"2026-03-16T12:00:00.000Z","msg":"server started","port":3000}
 *
 * In development the same data is emitted as a readable one-liner:
 *   [INFO]  server started  { port: 3000 }
 *
 * Log level is controlled by the LOG_LEVEL env var (default: "info").
 * Valid levels in order of severity: error > warn > info > debug.
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;
type Level = keyof typeof LEVELS;

// Read log level from env without importing env.ts to avoid circular deps;
// env.ts validates the value so the cast is safe.
const configuredLevel = (process.env.LOG_LEVEL ?? "info") as Level;
const configuredSeverity = LEVELS[configuredLevel] ?? LEVELS.info;

const isProduction = process.env.NODE_ENV === "production";

function shouldLog(level: Level): boolean {
  return LEVELS[level] <= configuredSeverity;
}

function write(level: Level, msg: string, extra?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  if (isProduction) {
    const entry: Record<string, unknown> = {
      level,
      ts: new Date().toISOString(),
      msg,
      ...extra,
    };
    process.stdout.write(JSON.stringify(entry) + "\n");
  } else {
    const tag = `[${level.toUpperCase().padEnd(5)}]`;
    const parts = [tag, msg];
    if (extra && Object.keys(extra).length > 0) {
      parts.push(JSON.stringify(extra));
    }
    // Mirror browser console severity so terminal colouring works
    if (level === "error") {
      console.error(parts.join("  "));
    } else if (level === "warn") {
      console.warn(parts.join("  "));
    } else {
      console.log(parts.join("  "));
    }
  }
}

export const logger = {
  error(msg: string, extra?: Record<string, unknown>): void {
    write("error", msg, extra);
  },
  warn(msg: string, extra?: Record<string, unknown>): void {
    write("warn", msg, extra);
  },
  info(msg: string, extra?: Record<string, unknown>): void {
    write("info", msg, extra);
  },
  debug(msg: string, extra?: Record<string, unknown>): void {
    write("debug", msg, extra);
  },

  /**
   * Create a child logger that prefixes every message with a component tag
   * and merges in any fixed fields.
   *
   *   const log = logger.child("worker:image");
   *   log.info("processed", { userId, outKey });
   *   // → [INFO]  [worker:image] processed  {"userId":"…","outKey":"…"}
   */
  child(component: string, fixed?: Record<string, unknown>) {
    return {
      error: (msg: string, extra?: Record<string, unknown>) =>
        write("error", `[${component}] ${msg}`, { ...fixed, ...extra }),
      warn: (msg: string, extra?: Record<string, unknown>) =>
        write("warn", `[${component}] ${msg}`, { ...fixed, ...extra }),
      info: (msg: string, extra?: Record<string, unknown>) =>
        write("info", `[${component}] ${msg}`, { ...fixed, ...extra }),
      debug: (msg: string, extra?: Record<string, unknown>) =>
        write("debug", `[${component}] ${msg}`, { ...fixed, ...extra }),
    };
  },
};
