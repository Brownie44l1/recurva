import { config } from '../config';
import { logger } from '../logger';
import { getDb } from '../db/client';
import { runBillingCycle } from './billing';
import { executeDunningRetries } from './dunning';
import { processOutboundDeliveries } from '../webhooks/outbound/delivery';
import { reportBillingError } from '../observability/report-error';

function parseCronMinuteHour(cron: string): { hour: number; minute: number } | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const minute = parseInt(parts[0]!, 10);
  const hour = parseInt(parts[1]!, 10);
  if (isNaN(minute) || isNaN(hour)) return null;
  return { hour, minute };
}

let lastBillingRunDate = '';

function shouldRunBilling(): boolean {
  const now = new Date();
  const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  if (lastBillingRunDate === today) return false;

  const cron = parseCronMinuteHour(config.BILLING_CRON);
  if (!cron) return false;

  return now.getUTCHours() === cron.hour && now.getUTCMinutes() === cron.minute;
}

export async function pingHealthcheck(url?: string): Promise<void> {
  const pingUrl = url ?? config.HEALTHCHECK_DUNNING_URL;
  if (!pingUrl) return;
  try {
    await fetch(pingUrl, { method: 'GET' });
  } catch {
    logger.warn({ url: pingUrl }, 'Healthcheck ping failed');
  }
}

export function startSchedulers(): void {
  setInterval(async () => {
    try {
      const sql = getDb();

      if (shouldRunBilling()) {
        logger.info('Starting billing cycle');
        const result = await runBillingCycle(sql);
        if (result.processed > 0 || result.failed > 0) {
          const now = new Date();
          lastBillingRunDate = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
        }
      }
    } catch (err) {
      logger.error({ err }, 'Billing scheduler error');
    }
  }, 60_000);

  setInterval(async () => {
    try {
      const sql = getDb();
      await executeDunningRetries(sql);
      await pingHealthcheck();
    } catch (err) {
      reportBillingError({}, 'Dunning scheduler error', err);
    }
  }, 60_000);

  setInterval(async () => {
    try {
      const sql = getDb();
      await processOutboundDeliveries(sql);
    } catch (err) {
      logger.error({ err }, 'Outbound webhook delivery scheduler error');
    }
  }, 60_000);

  logger.info({ billingCron: config.BILLING_CRON }, 'Schedulers started');
}
