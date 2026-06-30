import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../../db/client';
import { tenantAuthMiddleware } from '../middleware/tenant-auth';
import { createCoupon, getCouponById, listCoupons, archiveCoupon, validateCoupon } from '../../domain/coupon/coupon.service';
import { createCouponSchema, validateCouponSchema } from '../validators/coupon.validator';

const router = new Hono();

router.use('*', tenantAuthMiddleware);

router.post('/', zValidator('json', createCouponSchema), async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const input = c.req.valid('json');
  const coupon = await createCoupon(sql, tenant.id, input);
  return c.json({ coupon }, 201);
});

router.get('/', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const activeOnly = c.req.query('active') === 'true';
  const coupons = await listCoupons(sql, tenant.id, activeOnly);
  return c.json({ coupons });
});

router.get('/:id', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const coupon = await getCouponById(sql, tenant.id, c.req.param('id'));
  return c.json({ coupon });
});

router.post('/validate', zValidator('json', validateCouponSchema), async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const { code, currency } = c.req.valid('json');
  const coupon = await validateCoupon(sql, tenant.id, code, currency);
  return c.json({ valid: true, coupon });
});

router.delete('/:id', async (c) => {
  const sql = getDb();
  const tenant = c.var.tenant;
  const coupon = await archiveCoupon(sql, tenant.id, c.req.param('id'));
  return c.json({ coupon });
});

export { router as couponRoutes };
