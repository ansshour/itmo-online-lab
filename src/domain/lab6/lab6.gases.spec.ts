import { describe, expect, it } from 'vitest';

import { LAB6_DEFAULT_GAS_ID } from '../../config/lab6/gases/lab6.gases.consts';
import { GasModelKind } from '../../config/lab6/gases/lab6.gases.types';
import { Lab6Gases } from './gases/lab6.gases';

const lab6Gases = new Lab6Gases();

describe('LAB6_GASES', () => {
  describe('#specificGasConstant', () => {
    describe('for each gas', () => {
      it.each(lab6Gases.all())('should calculate specific gas constant for $id', (gas) => {
        const expected = 8.314462618 / gas.molarMass;

        const result = gas.specificGasConstant;

        expect(result).toBeCloseTo(expected, 12);
      });
    });
  });
});

describe(Lab6Gases.name, () => {
  describe('#get', () => {
    describe('when gas id exists', () => {
      it('should return matching gas', () => {
        const gasId = 'oxygen';

        const result = lab6Gases.get(gasId);

        expect(result.id).toBe('oxygen');
        expect(result.label).toBe('Кислород');
        expect(result.model).toBe(GasModelKind.Real);
      });
    });

    describe('when gas id is unknown', () => {
      it('should return default gas', () => {
        const gasId = 'unknown-gas';

        const result = lab6Gases.get(gasId);

        expect(result.id).toBe(LAB6_DEFAULT_GAS_ID);
        expect(result).toEqual(lab6Gases.all()[0]);
      });
    });
  });
});