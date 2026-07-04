import type { Invoice, InvoiceLineItem } from '../invoice/invoice.types';
import type { Tenant } from '../tenant/tenant.types';

export interface NrsInvoice {
  invoiceNumber: string;
  invoiceDate: string;
  supplier: {
    name: string;
    taxId: string | null;
    address: string | null;
  };
  customer: {
    name: string;
    email: string;
    taxId: string | null;
  };
  currency: string;
  lineItems: NrsLineItem[];
  taxSummary: NrsTaxSummary[];
  totals: {
    netTotal: number;
    taxTotal: number;
    grossTotal: number;
  };
}

export interface NrsLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  netAmount: number;
  taxRate: string;
  taxAmount: number;
}

export interface NrsTaxSummary {
  taxRate: string;
  taxableAmount: number;
  taxAmount: number;
}

export function toNrsInvoice(invoice: Invoice, tenant: Pick<Tenant, 'name' | 'email'>, customer: { name: string | null; email: string }): NrsInvoice {
  const lineItems: NrsLineItem[] = invoice.lineItems
    .filter((li) => li.type !== 'tax' && li.type !== 'credit')
    .map((li) => ({
      description: li.description,
      quantity: li.quantity,
      unitPrice: li.unitAmount,
      netAmount: li.amount,
      taxRate: invoice.taxRate !== null ? `${(invoice.taxRate * 100).toFixed(1)}%` : '0.0%',
      taxAmount: invoice.taxRate !== null ? Math.round(li.amount * invoice.taxRate) : 0,
    }));

  const netTotal = lineItems.reduce((sum, li) => sum + li.netAmount, 0);
  const taxTotal = invoice.taxAmount;
  const grossTotal = netTotal + taxTotal;

  return {
    invoiceNumber: invoice.id.slice(0, 8).toUpperCase(),
    invoiceDate: invoice.createdAt.toISOString().split('T')[0]!,
    supplier: {
      name: tenant.name,
      taxId: null,
      address: null,
    },
    customer: {
      name: customer.name ?? 'Unknown',
      email: customer.email,
      taxId: null,
    },
    currency: invoice.currency,
    lineItems,
    taxSummary: [
      {
        taxRate: invoice.taxRate !== null ? `${(invoice.taxRate * 100).toFixed(1)}%` : '0.0%',
        taxableAmount: netTotal,
        taxAmount: taxTotal,
      },
    ],
    totals: { netTotal, taxTotal, grossTotal },
  };
}
