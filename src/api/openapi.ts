import { swaggerUI } from '@hono/swagger-ui';
import { Hono } from 'hono';
import { config } from '../config';

function buildSpec() {
  const baseUrl = config.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://api.recurva.xyz';

  return {
    openapi: '3.0.3',
    info: {
      title: 'Recurva API',
      version: '1.0.0',
      description: 'Subscription billing & recurring payment API powered by Nomba.',
    },
    servers: [{ url: `${baseUrl}/v1`, description: 'API v1' }],
    paths: {
      '/tenants/register': {
        post: {
          tags: ['Tenants'],
          summary: 'Register a new tenant',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'email', 'password'],
                  properties: {
                    name: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 8 },
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'Tenant created with API key' } },
        },
      },
      '/plans': {
        get: {
          tags: ['Plans'],
          summary: 'List plans',
          security: [{ ApiKeyAuth: [] }],
          responses: { '200': { description: 'List of plans' } },
        },
        post: {
          tags: ['Plans'],
          summary: 'Create a plan',
          security: [{ ApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'billingType', 'interval', 'prices'],
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    billingType: { type: 'string', enum: ['fixed', 'metered', 'mixed'] },
                    interval: { type: 'string', enum: ['week', 'month', 'year'] },
                    intervalCount: { type: 'integer', default: 1 },
                    trialDays: { type: 'integer' },
                    prices: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          currency: { type: 'string', enum: ['NGN', 'USD', 'GBP', 'EUR'] },
                          amount: { type: 'integer' },
                          unitAmount: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'Plan created' } },
        },
      },
      '/plans/{id}': {
        get: {
          tags: ['Plans'],
          summary: 'Get a plan',
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Plan details' } },
        },
      },
      '/customers': {
        get: {
          tags: ['Customers'],
          summary: 'List customers',
          security: [{ ApiKeyAuth: [] }],
          responses: { '200': { description: 'List of customers' } },
        },
        post: {
          tags: ['Customers'],
          summary: 'Create a customer',
          security: [{ ApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    name: { type: 'string' },
                    currency: { type: 'string', enum: ['NGN', 'USD', 'GBP', 'EUR'] },
                    externalId: { type: 'string' },
                    metadata: { type: 'object' },
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'Customer created' } },
        },
      },
      '/customers/{id}': {
        get: {
          tags: ['Customers'],
          summary: 'Get a customer',
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Customer details' } },
        },
      },
      '/payment-methods': {
        post: {
          tags: ['Payment Methods'],
          summary: 'Tokenize a payment method',
          security: [{ ApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['token', 'last4', 'brand', 'expMonth', 'expYear', 'customerId'],
                  properties: {
                    customerId: { type: 'string', format: 'uuid' },
                    token: { type: 'string' },
                    last4: { type: 'string', pattern: '^[0-9]{4}$' },
                    brand: { type: 'string' },
                    expMonth: { type: 'integer', minimum: 1, maximum: 12 },
                    expYear: { type: 'integer' },
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'Payment method tokenized' } },
        },
      },
      '/subscriptions': {
        get: {
          tags: ['Subscriptions'],
          summary: 'List subscriptions',
          security: [{ ApiKeyAuth: [] }],
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: { '200': { description: 'List of subscriptions' } },
        },
        post: {
          tags: ['Subscriptions'],
          summary: 'Create a subscription',
          security: [{ ApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['customerId', 'planId', 'currency'],
                  properties: {
                    customerId: { type: 'string', format: 'uuid' },
                    planId: { type: 'string', format: 'uuid' },
                    currency: { type: 'string', enum: ['NGN', 'USD', 'GBP', 'EUR'] },
                    paymentMethodId: { type: 'string', format: 'uuid' },
                    couponCode: { type: 'string' },
                    trialDays: { type: 'integer', minimum: 0 },
                    metadata: { type: 'object' },
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'Subscription created' } },
        },
      },
      '/subscriptions/{id}': {
        get: {
          tags: ['Subscriptions'],
          summary: 'Get a subscription',
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Subscription details' } },
        },
      },
      '/subscriptions/customer/{customerId}': {
        get: {
          tags: ['Subscriptions'],
          summary: 'List subscriptions by customer',
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'customerId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'List of subscriptions' } },
        },
      },
      '/subscriptions/{id}/cancel': {
        post: {
          tags: ['Subscriptions'],
          summary: 'Cancel a subscription',
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    cancelAtPeriodEnd: { type: 'boolean', default: false },
                    reason: { type: 'string', maxLength: 500 },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Subscription cancelled' } },
        },
      },
      '/subscriptions/{id}/pause': {
        post: {
          tags: ['Subscriptions'],
          summary: 'Pause a subscription',
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Subscription paused' } },
        },
      },
      '/subscriptions/{id}/resume': {
        post: {
          tags: ['Subscriptions'],
          summary: 'Resume a subscription',
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Subscription resumed' } },
        },
      },
      '/subscriptions/{id}/change-plan': {
        post: {
          tags: ['Subscriptions'],
          summary: 'Change plan',
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['newPlanId'],
                  properties: {
                    newPlanId: { type: 'string', format: 'uuid' },
                    immediate: { type: 'boolean', default: false },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Plan changed' } },
        },
      },
      '/subscriptions/{id}/payment-method': {
        post: {
          tags: ['Subscriptions'],
          summary: 'Update payment method',
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['paymentMethodId'],
                  properties: {
                    paymentMethodId: { type: 'string', format: 'uuid' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Payment method updated' } },
        },
      },
      '/invoices': {
        get: {
          tags: ['Invoices'],
          summary: 'List invoices',
          security: [{ ApiKeyAuth: [] }],
          parameters: [
            { name: 'customerId', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: { '200': { description: 'List of invoices' } },
        },
      },
      '/invoices/{id}': {
        get: {
          tags: ['Invoices'],
          summary: 'Get an invoice',
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Invoice details' } },
        },
      },
      '/invoices/{id}/retry': {
        post: {
          tags: ['Invoices'],
          summary: 'Retry charge on invoice',
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Charge retried' } },
        },
      },
      '/invoices/{id}/void': {
        post: {
          tags: ['Invoices'],
          summary: 'Void an invoice',
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Invoice voided' } },
        },
      },
      '/invoices/{id}/refund': {
        post: {
          tags: ['Invoices'],
          summary: 'Refund a paid invoice',
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['amount'],
                  properties: {
                    amount: { type: 'integer', description: 'Amount in kobo/cents' },
                    reason: { type: 'string', maxLength: 500 },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Refund processed' } },
        },
      },
      '/checkout': {
        post: {
          tags: ['Checkout'],
          summary: 'Create a checkout session',
          security: [{ ApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['customerId', 'planId', 'returnUrl'],
                  properties: {
                    customerId: { type: 'string', format: 'uuid' },
                    planId: { type: 'string', format: 'uuid' },
                    currency: { type: 'string', enum: ['NGN', 'USD', 'GBP', 'EUR'], default: 'NGN' },
                    returnUrl: { type: 'string', format: 'uri' },
                    metadata: { type: 'object' },
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'Checkout session created' } },
        },
      },
      '/coupons': {
        get: {
          tags: ['Coupons'],
          summary: 'List coupons',
          security: [{ ApiKeyAuth: [] }],
          responses: { '200': { description: 'List of coupons' } },
        },
        post: {
          tags: ['Coupons'],
          summary: 'Create a coupon',
          security: [{ ApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: { '201': { description: 'Coupon created' } },
        },
      },
      '/dunning-policies': {
        get: {
          tags: ['Dunning Policies'],
          summary: 'List dunning policies',
          security: [{ ApiKeyAuth: [] }],
          responses: { '200': { description: 'List of dunning policies' } },
        },
        post: {
          tags: ['Dunning Policies'],
          summary: 'Create a dunning policy',
          security: [{ ApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'retrySchedule', 'finalAction'],
                  properties: {
                    name: { type: 'string' },
                    retrySchedule: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          day: { type: 'integer', minimum: 0 },
                          useBackup: { type: 'boolean' },
                        },
                      },
                    },
                    finalAction: { type: 'string', enum: ['cancel', 'mark_unpaid'] },
                    isDefault: { type: 'boolean', default: false },
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'Dunning policy created' } },
        },
      },
      '/dunning-policies/{id}': {
        get: {
          tags: ['Dunning Policies'],
          summary: 'Get a dunning policy',
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Dunning policy details' } },
        },
        put: {
          tags: ['Dunning Policies'],
          summary: 'Update a dunning policy',
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: { '200': { description: 'Dunning policy updated' } },
        },
      },
      '/dashboard/auth': {
        post: {
          tags: ['Dashboard'],
          summary: 'Authenticate for dashboard',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Dashboard token' } },
        },
      },
      '/dashboard/metrics': {
        get: {
          tags: ['Dashboard'],
          summary: 'Get dashboard metrics',
          security: [{ DashboardAuth: [] }],
          responses: { '200': { description: 'Dashboard metrics' } },
        },
      },
      '/reports/revenue': {
        get: {
          tags: ['Reports'],
          summary: 'Revenue report',
          security: [{ ApiKeyAuth: [] }],
          parameters: [
            { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' } },
          ],
          responses: { '200': { description: 'Revenue report' } },
        },
      },
      '/webhooks': {
        get: {
          tags: ['Webhooks'],
          summary: 'List webhook events',
          security: [{ ApiKeyAuth: [] }],
          responses: { '200': { description: 'Webhook events' } },
        },
      },
      '/subscriptions/{id}/usage': {
        post: {
          tags: ['Usage'],
          summary: 'Report usage for metered subscription',
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['units'],
                  properties: {
                    units: { type: 'number', description: 'Number of units consumed' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Usage reported' } },
        },
      },
    },
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'Authorization',
          description: 'API key: Bearer rcv_live_...',
        },
        DashboardAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Dashboard JWT token',
        },
      },
    },
  };
}

export function registerOpenApiRoutes(app: Hono) {
  app.get('/v1/openapi.json', (c) => c.json(buildSpec()));
  app.get('/v1/docs', swaggerUI({ url: '/v1/openapi.json' }));
}
