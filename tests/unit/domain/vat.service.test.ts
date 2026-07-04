import { describe, it, expect } from 'bun:test';
import { calculateVat, NIGERIAN_VAT_RATE, TURNOVER_EXEMPTION_THRESHOLD } from '../../../src/domain/tax/vat.service';

describe('Nigerian VAT Engine', () => {
  it('charges 7.5% VAT on taxable amount for non-exempt tenant', () => {
    const tenant = { annualTurnover: 100_000_000, taxExempt: false };
    const result = calculateVat(10000, tenant);
    expect(result.vatAmount).toBe(750);
    expect(result.vatRate).toBe(0.075);
    expect(result.exemptionReason).toBeNull();
  });

  it('rounds VAT amount to nearest integer (kobo)', () => {
    const tenant = { annualTurnover: 100_000_000, taxExempt: false };
    const result = calculateVat(133, tenant);
    expect(result.vatAmount).toBe(10);
  });

  it('exempts tenant with turnover below ₦50M threshold', () => {
    const tenant = { annualTurnover: 25_000_000, taxExempt: false };
    const result = calculateVat(10000, tenant);
    expect(result.vatAmount).toBe(0);
    expect(result.vatRate).toBe(0.075);
    expect(result.exemptionReason).toContain('50M');
  });

  it('applies exemption when tenant is marked taxExempt', () => {
    const tenant = { annualTurnover: null, taxExempt: true };
    const result = calculateVat(10000, tenant);
    expect(result.vatAmount).toBe(0);
    expect(result.exemptionReason).toBe('Tenant marked as tax exempt');
  });

  it('charges VAT when annualTurnover is null (unknown)', () => {
    const tenant = { annualTurnover: null, taxExempt: false };
    const result = calculateVat(10000, tenant);
    expect(result.vatAmount).toBe(750);
    expect(result.exemptionReason).toBeNull();
  });

  it('charges VAT at exactly ₦50M threshold', () => {
    const tenant = { annualTurnover: TURNOVER_EXEMPTION_THRESHOLD, taxExempt: false };
    const result = calculateVat(10000, tenant);
    expect(result.vatAmount).toBe(750);
    expect(result.exemptionReason).toBeNull();
  });

  it('exempts at ₦1 below threshold', () => {
    const tenant = { annualTurnover: TURNOVER_EXEMPTION_THRESHOLD - 1, taxExempt: false };
    const result = calculateVat(10000, tenant);
    expect(result.vatAmount).toBe(0);
  });

  it('returns zero VAT for zero taxable amount', () => {
    const tenant = { annualTurnover: 100_000_000, taxExempt: false };
    const result = calculateVat(0, tenant);
    expect(result.vatAmount).toBe(0);
  });

  it('uses override exemption reason when provided', () => {
    const tenant = { annualTurnover: 100_000_000, taxExempt: false };
    const result = calculateVat(10000, tenant, 'Export services - zero rated');
    expect(result.vatAmount).toBe(0);
    expect(result.exemptionReason).toBe('Export services - zero rated');
  });
});
