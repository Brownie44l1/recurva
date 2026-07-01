import type { Sql } from 'postgres';
import { logger } from '../../logger';
import * as deliveryQueries from '../../db/queries/webhook-delivery.queries';
import * as endpointQueries from '../../db/queries/webhook-endpoint.queries';
import { signPayload } from '../../domain/webhook/webhook.service';

const MAX_ATTEMPTS = 5;
const BACKOFF_MINUTES = [1, 5, 30, 120, 480];

export async function processOutboundDeliveries(sql: Sql): Promise<void> {
  const now = new Date();
  const deliveries = await deliveryQueries.findPendingDeliveries(sql, now, 50);

  for (const delivery of deliveries) {
    try {
      const endpoint = await endpointQueries.findEndpointById(sql, delivery.tenantId, delivery.webhookEndpointId);
      if (!endpoint || !endpoint.isActive) {
        await deliveryQueries.updateDelivery(sql, delivery.id, { status: 'abandoned' });
        continue;
      }

      const payload = JSON.stringify(delivery.payload);
      const signature = signPayload(endpoint.signingSecret, payload);

      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Recurva-Signature': signature,
          'User-Agent': 'Recurva-Webhook/1.0',
        },
        body: payload,
      });

      const responseBody = await response.text();
      const truncatedBody = responseBody.length > 1024 ? responseBody.slice(0, 1024) : responseBody;
      const newAttemptCount = delivery.attemptCount + 1;

      const deliveryUpdate: {
        status: string;
        attemptCount: number;
        lastResponseCode: number | null;
        lastResponseBody: string | null;
        nextRetryAt?: Date | null;
      } = {
        status: 'succeeded',
        attemptCount: newAttemptCount,
        lastResponseCode: response.status,
        lastResponseBody: truncatedBody,
      };

      if (response.ok) {
        await deliveryQueries.updateDelivery(sql, delivery.id, deliveryUpdate);
        logger.info(
          { deliveryId: delivery.id, endpointId: delivery.webhookEndpointId, status: response.status },
          'Outbound webhook delivered',
        );
      } else {
        if (newAttemptCount >= MAX_ATTEMPTS) {
          deliveryUpdate.status = 'failed';
        } else {
          deliveryUpdate.status = 'failed';
          const backoffIndex = Math.min(newAttemptCount - 1, BACKOFF_MINUTES.length - 1);
          const nextRetry = new Date(now.getTime() + BACKOFF_MINUTES[backoffIndex]! * 60000);
          deliveryUpdate.nextRetryAt = nextRetry;
        }
        await deliveryQueries.updateDelivery(sql, delivery.id, deliveryUpdate);
        logger.warn(
          { deliveryId: delivery.id, endpointId: delivery.webhookEndpointId, status: response.status, attempt: newAttemptCount },
          'Outbound webhook delivery failed',
        );
      }
    } catch (err) {
      logger.error({ deliveryId: delivery.id, err }, 'Outbound webhook delivery error');
      const newAttemptCount = delivery.attemptCount + 1;

      if (newAttemptCount >= MAX_ATTEMPTS) {
        await deliveryQueries.updateDelivery(sql, delivery.id, {
          status: 'failed',
          attemptCount: newAttemptCount,
        });
      } else {
        const backoffIndex = Math.min(newAttemptCount - 1, BACKOFF_MINUTES.length - 1);
        const nextRetry = new Date(now.getTime() + BACKOFF_MINUTES[backoffIndex]! * 60000);
        await deliveryQueries.updateDelivery(sql, delivery.id, {
          status: 'failed',
          attemptCount: newAttemptCount,
          nextRetryAt: nextRetry,
        });
      }
    }
  }
}
