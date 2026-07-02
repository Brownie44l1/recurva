import { describe, it, expect } from 'bun:test';
import { calculateProration } from '../../../src/domain/proration/proration.service';

describe('Proration Service', () => {
  it('calculates upgrade proration correctly at mid-cycle', () => {
    const cycleStart = new Date('2026-01-01');
    const changeDate = new Date('2026-01-16');
    const cycleEnd = new Date('2026-02-01');

    const result = calculateProration(5000, 10000, cycleStart, changeDate, cycleEnd);

    expect(result.daysInPeriod).toBe(31);
    expect(result.daysRemaining).toBe(16);
    expect(result.dailyOldRate).toBe(161);
    expect(result.dailyNewRate).toBe(322);
    expect(result.creditAmount).toBe(2576);
    expect(result.chargeAmount).toBe(5152);
    expect(result.netAmount).toBe(2576);
  });

  it('returns zero proration on last day', () => {
    const cycleStart = new Date('2026-01-01');
    const changeDate = new Date('2026-02-01');
    const cycleEnd = new Date('2026-02-01');

    const result = calculateProration(5000, 10000, cycleStart, changeDate, cycleEnd);
    expect(result.netAmount).toBe(0);
    expect(result.daysRemaining).toBe(0);
  });

  it('calculates downgrade proration (credit only)', () => {
    const cycleStart = new Date('2026-01-01');
    const changeDate = new Date('2026-01-16');
    const cycleEnd = new Date('2026-02-01');

    const result = calculateProration(10000, 5000, cycleStart, changeDate, cycleEnd);

    expect(result.netAmount).toBeLessThan(0);
    expect(result.creditAmount).toBeGreaterThan(0);
  });

  it('calculates cancellation credit correctly', () => {
    const cycleStart = new Date('2026-01-01');
    const changeDate = new Date('2026-01-20');
    const cycleEnd = new Date('2026-02-01');

    const result = calculateProration(5000, 0, cycleStart, changeDate, cycleEnd);

    expect(result.creditAmount).toBeGreaterThan(0);
    expect(result.daysRemaining).toBe(12);
  });

  it('handles zero-day edge case (change on period start)', () => {
    const cycleStart = new Date('2026-01-01');
    const changeDate = new Date('2026-01-01');
    const cycleEnd = new Date('2026-02-01');

    const result = calculateProration(5000, 10000, cycleStart, changeDate, cycleEnd);

    expect(result.daysRemaining).toBe(31);
    expect(result.creditAmount).toBeGreaterThan(0);
  });

  it('never produces negative proration for upgrade', () => {
    const cycleStart = new Date('2026-01-01');
    const changeDate = new Date('2026-01-15');
    const cycleEnd = new Date('2026-02-01');

    const result = calculateProration(1000, 2000, cycleStart, changeDate, cycleEnd);
    expect(result.netAmount).toBeGreaterThanOrEqual(0);
    expect(result.creditAmount).toBeGreaterThanOrEqual(0);
    expect(result.chargeAmount).toBeGreaterThanOrEqual(0);
  });

  describe('annual proration edge cases', () => {
    it('calculates correct days for annual period', () => {
      const cycleStart = new Date('2026-01-01');
      const changeDate = new Date('2026-07-02');
      const cycleEnd = new Date('2027-01-01');

      const result = calculateProration(60000, 0, cycleStart, changeDate, cycleEnd);
      expect(result.daysInPeriod).toBe(365);
      expect(result.daysRemaining).toBe(183);
      expect(result.creditAmount).toBeGreaterThan(0);
    });

    it('handles leap year annual period (366 days)', () => {
      const cycleStart = new Date('2024-01-01');
      const changeDate = new Date('2024-07-01');
      const cycleEnd = new Date('2025-01-01');

      const result = calculateProration(60000, 0, cycleStart, changeDate, cycleEnd);
      expect(result.daysInPeriod).toBe(366);
      expect(result.daysRemaining).toBe(184);
    });

    it('handles monthly to annual upgrade with interval normalization', () => {
      const cycleStart = new Date('2026-06-01');
      const changeDate = new Date('2026-06-16');
      const cycleEnd = new Date('2026-07-01');

      const monthlyAmount = 5000;
      const annualAmount = 50000;
      const monthlyDays = 30;
      const annualDays = 365;

      const result = calculateProration(
        monthlyAmount, annualAmount,
        cycleStart, changeDate, cycleEnd,
        monthlyDays, annualDays,
      );

      const expectedDailyOld = Math.floor(monthlyAmount / monthlyDays);
      const expectedDailyNew = Math.floor(annualAmount / annualDays);
      expect(result.dailyOldRate).toBe(expectedDailyOld);
      expect(result.dailyNewRate).toBe(expectedDailyNew);
      expect(result.creditAmount).toBe(Math.floor(expectedDailyOld * result.daysRemaining));
      expect(result.chargeAmount).toBe(Math.floor(expectedDailyNew * result.daysRemaining));
    });

    it('handles annual plan cancel on first day', () => {
      const cycleStart = new Date('2026-01-01');
      const changeDate = new Date('2026-01-01');
      const cycleEnd = new Date('2027-01-01');

      const result = calculateProration(50000, 0, cycleStart, changeDate, cycleEnd);
      expect(result.daysInPeriod).toBe(365);
      expect(result.daysRemaining).toBe(365);
      expect(result.creditAmount).toBeGreaterThan(0);
    });

    it('handles annual plan cancel on day 364', () => {
      const cycleStart = new Date('2026-01-01');
      const changeDate = new Date('2026-12-31');
      const cycleEnd = new Date('2027-01-01');

      const result = calculateProration(50000, 0, cycleStart, changeDate, cycleEnd);
      expect(result.daysInPeriod).toBe(365);
      expect(result.daysRemaining).toBe(1);
      expect(result.creditAmount).toBeGreaterThan(0);
    });
  });
});
