import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  stage?: string;
  message: string;
  metadata?: Record<string, any>;
  error?: {
    message: string;
    stack?: string;
  };
}

/**
 * Write log entry to file
 */
export function log(
  level: LogLevel,
  message: string,
  metadata?: Record<string, any>,
  error?: Error
) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    metadata,
  };

  if (error) {
    entry.error = {
      message: error.message,
      stack: error.stack,
    };
  }

  // Write to daily log file
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const logFile = path.join(LOG_DIR, `varikko-${date}.log`);

  fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');

  // Also log to console if not in TUI mode
  if (!process.env.TUI_MODE) {
    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}]`;
    console.log(`${prefix} ${message}`, metadata || '');
    if (error) {
      console.error(error);
    }
  }
}

export function info(message: string, metadata?: Record<string, any>) {
  log('info', message, metadata);
}

export function warn(message: string, metadata?: Record<string, any>) {
  log('warn', message, metadata);
}

export function error(message: string, metadata?: Record<string, any>, err?: Error) {
  log('error', message, metadata, err);
}

export function debug(message: string, metadata?: Record<string, any>) {
  log('debug', message, metadata);
}

/**
 * Get path to today's log file
 */
export function getTodayLogPath(): string {
  const date = new Date().toISOString().split('T')[0];
  return path.join(LOG_DIR, `varikko-${date}.log`);
}
