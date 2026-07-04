import { config } from '../../config';
import { logger } from '../../logger';

interface FxRateResult {
  rate: number;
  source: 'api' | 'config' | 'default';
}

const DEFAULT_RATES: Record<string, Record<string, number>> = {
  USD: { NGN: 1550 },
  NGN: { USD: 1 / 1550 },
};

let cachedRate: { from: string; to: string; rate: number; expiresAt: number } | null = null;

export async function getFxRate(from: string, to: string): Promise<FxRateResult> {
  const fromUpper = from.toUpperCase();
  const toUpper = to.toUpperCase();

  if (fromUpper === toUpper) {
    return { rate: 1, source: 'default' };
  }

  if (config.FX_RATE_OVERRIDE) {
    const rate = parseFloat(config.FX_RATE_OVERRIDE);
    if (!isNaN(rate) && rate > 0) {
      return { rate, source: 'config' };
    }
  }

  const cacheKey = `${fromUpper}:${toUpper}`;
  if (cachedRate && cachedRate.expiresAt > Date.now() && cachedRate.from === fromUpper && cachedRate.to === toUpper) {
    return { rate: cachedRate.rate, source: 'api' };
  }

  try {
    const apiKey = config.FX_API_KEY;
    let rate: number | null = null;

    if (apiKey) {
      const url = `https://v6.exchangerate-api.com/v6/${apiKey}/pair/${fromUpper}/${toUpper}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        const data = await response.json() as { result: string; conversion_rate: number };
        if (data.result === 'success') {
          rate = data.conversion_rate;
        }
      }
    }

    if (rate === null) {
      const url = `https://open.er-api.com/v6/latest/${fromUpper}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        const data = await response.json() as { result: string; rates: Record<string, number> };
        if (data.result === 'success' && data.rates[toUpper]) {
          rate = data.rates[toUpper];
        }
      }
    }

    if (rate !== null) {
      cachedRate = { from: fromUpper, to: toUpper, rate, expiresAt: Date.now() + 3600_000 };
      return { rate, source: 'api' };
    }
  } catch (err) {
    logger.warn({ from, to, err }, 'FX rate API fetch failed, falling back to default');
  }

  const defaultRate = DEFAULT_RATES[fromUpper]?.[toUpper];
  if (defaultRate) {
    return { rate: defaultRate, source: 'default' };
  }

  logger.warn({ from, to }, 'No FX rate available, using 1:1 fallback');
  return { rate: 1, source: 'default' };
}

export function convertAmount(amount: number, rate: number): number {
  return Math.round(amount * rate);
}
