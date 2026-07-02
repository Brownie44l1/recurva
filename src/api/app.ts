import { Hono } from 'hono';
import { requestIdMiddleware } from './middleware/request-id';
import { loggingMiddleware } from './middleware/logger';
import { errorHandler } from './middleware/error-handler';
import { rateLimiter } from './middleware/rate-limiter';
import { getDb } from '../db/client';
import { tenantRoutes } from './routes/tenant.routes';
import { planRoutes } from './routes/plan.routes';
import { couponRoutes } from './routes/coupon.routes';
import { customerRoutes } from './routes/customer.routes';
import { paymentMethodRoutes } from './routes/payment-method.routes';
import { subscriptionRoutes } from './routes/subscription.routes';
import { usageRoutes } from './routes/usage.routes';
import { invoiceRoutes } from './routes/invoice.routes';
import { webhookRoutes } from './routes/webhook.routes';
import { portalRoutes } from '../portal/routes';
import { dashboardRoutes } from '../dashboard/routes';
import { reportRoutes } from '../reports/routes';
import { handleNombaCheckoutCallback } from '../webhooks/inbound/nomba';
import { handleNombaWebhook } from '../webhooks/inbound/nomba-webhook';
import { idempotencyMiddleware } from './middleware/idempotency';

export function createApp() {
  const app = new Hono();

  app.use(requestIdMiddleware);
  app.use(loggingMiddleware);

  app.onError(errorHandler);

  app.notFound((c) => {
    return c.json(
      {
        error: {
          code: 'not_found',
          message: `Route ${c.req.method} ${c.req.path} not found`,
        },
        requestId: c.var.requestId,
      },
      404,
    );
  });

  app.post('/webhooks/nomba/checkout', handleNombaCheckoutCallback);
  app.post('/webhooks/nomba', handleNombaWebhook);

  app.get('/health', async (c) => {
    try {
      const sql = getDb();
      await sql`SELECT 1`;
      return c.json({
        status: 'ok',
        db: 'ok',
        uptime: Math.floor(process.uptime()),
      });
    } catch {
      return c.json(
        {
          status: 'degraded',
          db: 'error',
          uptime: Math.floor(process.uptime()),
        },
        503,
      );
    }
  });

  // API v1 routes
  const v1 = new Hono();

  if (process.env.DISABLE_RATE_LIMITER !== 'true') {
    v1.use(rateLimiter({ windowMs: 60_000, maxRead: 100, maxWrite: 20 }));
  }
  v1.use(idempotencyMiddleware);

  v1.route('/tenants', tenantRoutes);
  v1.route('/plans', planRoutes);
  v1.route('/coupons', couponRoutes);
  v1.route('/customers', customerRoutes);
  v1.route('/payment-methods', paymentMethodRoutes);
  v1.route('/subscriptions', subscriptionRoutes);
  v1.route('/invoices', invoiceRoutes);
  v1.route('/webhooks', webhookRoutes);

  // Usage routes are mounted under subscriptions
  v1.route('/subscriptions', usageRoutes);

  // Portal and dashboard routes
  v1.route('/portal', portalRoutes);
  v1.route('/dashboard', dashboardRoutes);

  // Reports routes
  v1.route('/reports', reportRoutes);

  app.route('/v1', v1);

  return app;
}
