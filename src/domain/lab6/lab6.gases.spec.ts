import { describe, expect, it } from 'vitest';

import { getLab6Gas, LAB6_DEFAULT_GAS_ID, LAB6_GASES } from './lab6-gases';

describe('LAB6_GASES', () => {
  describe('#specificGasConstant', () => {
    describe('for each gas', () => {
      it.each(LAB6_GASES)('should calculate specific gas constant for $id', (gas) => {
        const expected = 8.314462618 / gas.molarMass;

        const result = gas.specificGasConstant;

        expect(result).toBeCloseTo(expected, 12);
      });
    });
  });
});

describe('getLab6Gas', () => {
  describe('#call', () => {
    describe('when gas id exists', () => {
      it('should return matching gas', () => {
        const gasId = 'oxygen';

        const result = getLab6Gas(gasId);

        expect(result.id).toBe('oxygen');
        expect(result.label).toBe('Кислород');
        expect(result.model).toBe('real');
      });
    });

    describe('when gas id is unknown', () => {
      it('should return default gas', () => {
        const gasId = 'unknown-gas';

        const result = getLab6Gas(gasId);

        expect(result.id).toBe(LAB6_DEFAULT_GAS_ID);
        expect(result).toBe(LAB6_GASES[0]);
      });
    });
  });
});