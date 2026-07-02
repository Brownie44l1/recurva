import type { ProrationResult } from './proration.types';

export function calculateProration(
  oldPlanAmount: number,
  newPlanAmount: number,
  cycleStart: Date,
  changeDate: Date,
  cycleEnd: Date,
  oldPlanIntervalDays?: number,
  newPlanIntervalDays?: number,
): ProrationResult {
  const daysInPeriod = Math.ceil((cycleEnd.getTime() - cycleStart.getTime()) / 86400000);
  const daysRemaining = Math.ceil((cycleEnd.getTime() - changeDate.getTime()) / 86400000);

  if (daysRemaining <= 0) {
    return {
      creditAmount: 0,
      chargeAmount: 0,
      netAmount: 0,
      daysRemaining: 0,
      daysInPeriod,
      dailyOldRate: 0,
      dailyNewRate: 0,
      oldPlanAmount,
      newPlanAmount,
    };
  }

  const oldPeriodDays = oldPlanIntervalDays ?? daysInPeriod;
  const newPeriodDays = newPlanIntervalDays ?? daysInPeriod;

  const dailyOldRate = Math.floor(oldPlanAmount / oldPeriodDays);
  const dailyNewRate = Math.floor(newPlanAmount / newPeriodDays);

  const creditAmount = Math.floor(oldPlanAmount * daysRemaining / oldPeriodDays);
  const chargeAmount = Math.floor(newPlanAmount * daysRemaining / newPeriodDays);
  const netAmount = chargeAmount - creditAmount;

  return {
    creditAmount,
    chargeAmount,
    netAmount,
    daysRemaining,
    daysInPeriod,
    dailyOldRate,
    dailyNewRate,
    oldPlanAmount,
    newPlanAmount,
  };
}
