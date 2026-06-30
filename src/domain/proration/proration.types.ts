export interface ProrationResult {
  creditAmount: number;
  chargeAmount: number;
  netAmount: number;
  daysRemaining: number;
  daysInPeriod: number;
  dailyOldRate: number;
  dailyNewRate: number;
  oldPlanAmount: number;
  newPlanAmount: number;
}
