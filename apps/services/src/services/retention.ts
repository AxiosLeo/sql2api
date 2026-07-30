import { printer } from '@axiosleo/cli-tool';
import config from '../config';
import { purgeInvokeLogs } from './sqlite';

const ONE_HOUR_MS = 60 * 60 * 1000;

function runPurge(): void {
  const retentionDays = config.envs.invoke_log.retention_days;
  try {
    const deleted = purgeInvokeLogs(retentionDays);
    if (deleted > 0) {
      printer.info(
        `[invoke-log] purged ${deleted} log(s) older than ${retentionDays} day(s)`
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    printer.warning(`[invoke-log] purge failed: ${message}`);
  }
}

/**
 * Purge expired invoke logs on startup, then every hour.
 * Interval is unref'd so it won't keep the process alive alone.
 */
export function startInvokeLogRetention(): void {
  runPurge();
  const timer = setInterval(runPurge, ONE_HOUR_MS);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
}
