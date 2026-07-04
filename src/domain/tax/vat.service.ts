const NIGERIAN_VAT_RATE = 0.075;
const TURNOVER_EXEMPTION_THRESHOLD = 50_000_000;

export interface VatCalculationResult {
  vatAmount: number;
  vatRate: number;
  exemptionReason: string | null;
}

export function calculateVat(
  taxableAmount: number,
  tenant: { annualTurnover: number | null; taxExempt: boolean },
  overrideExemptionReason?: string | null,
): VatCalculationResult {
  if (overrideExemptionReason !== undefined) {
    return { vatAmount: 0, vatRate: NIGERIAN_VAT_RATE, exemptionReason: overrideExemptionReason };
  }

  if (tenant.taxExempt) {
    return { vatAmount: 0, vatRate: NIGERIAN_VAT_RATE, exemptionReason: 'Tenant marked as tax exempt' };
  }

  if (tenant.annualTurnover !== null && tenant.annualTurnover < TURNOVER_EXEMPTION_THRESHOLD) {
    return { vatAmount: 0, vatRate: NIGERIAN_VAT_RATE, exemptionReason: `Annual turnover (₦${tenant.annualTurnover.toLocaleString()}) below ₦50M exemption threshold` };
  }

  const vatAmount = Math.round(taxableAmount * NIGERIAN_VAT_RATE);
  return { vatAmount, vatRate: NIGERIAN_VAT_RATE, exemptionReason: null };
}

export { NIGERIAN_VAT_RATE, TURNOVER_EXEMPTION_THRESHOLD };
