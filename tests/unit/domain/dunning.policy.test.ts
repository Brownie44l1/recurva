import { describe, it, expect } from 'bun:test';
import { adjustForSalaryCycle } from '../../../src/domain/dunning/dunning.service';

describe('Dunning Policy', () => {
  describe('salary cycle adjustment', () => {
    it('adjusts dates between 24th-27th to 28th', () => {
      const date24th = new Date('2026-01-24');
      const adjusted24th = adjustForSalaryCycle(date24th);
      expect(adjusted24th.getDate()).toBe(28);

      const date27th = new Date('2026-01-27');
      const adjusted27th = adjustForSalaryCycle(date27th);
      expect(adjusted27th.getDate()).toBe(28);
    });

    it('does not adjust dates outside 24th-27th', () => {
      const date23rd = new Date('2026-01-23');
      const adjusted23rd = adjustForSalaryCycle(date23rd);
      expect(adjusted23rd.getDate()).toBe(23);

      const date28th = new Date('2026-01-28');
      const adjusted28th = adjustForSalaryCycle(date28th);
      expect(adjusted28th.getDate()).toBe(28);
    });
  });
});
