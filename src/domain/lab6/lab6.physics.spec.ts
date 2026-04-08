import { describe, expect, it } from 'vitest';

import { LAB6_SUBVARIANTS_COUNT } from '../../config/lab6/lab6-parameters.config';
import { LAB6_GASES } from './lab6-gases';
import { Lab6Physics } from './lab6-physics';
import {
  calculationCases,
  createExpectedMeasurement,
  createStableRandomValues,
  withMathRandomValues,
} from './lab6.physics.spec.utils';

describe(Lab6Physics.name, () => {
  describe('#choose', () => {
    describe('when random value is at the beginning of the range', () => {
      it('should return the first variant index', () => {
        const physics = new Lab6Physics();

        const result = withMathRandomValues([0], () => physics.choose());

        expect(result).toBe(0);
      });
    });

    describe('when random value is at the end of the range', () => {
      it('should return the last variant index', () => {
        const physics = new Lab6Physics();

        const result = withMathRandomValues([0.999999999], () => physics.choose());

        expect(result).toBe(1);
      });
    });
  });

  describe('#calculate', () => {
    describe('when deterministic random values are used for every parameter row', () => {
      it.each(calculationCases)(
        'should calculate expected measurements for variant $variantIndex valve $valvePosition',
        ({ variantIndex, valvePosition }) => {
          const physics = new Lab6Physics();
          const randomValues = createStableRandomValues(valvePosition);
          const expected = createExpectedMeasurement({
            variantIndex,
            valvePosition,
            stopwatchSeconds: 17,
            gasId: 'ideal-gas',
            randomValues,
          });

          const result = withMathRandomValues(randomValues, () =>
            physics.calculate(variantIndex, valvePosition, 17, 'ideal-gas'),
          );

          expect(result.barometer).toBe(expected.barometer);
          expect(result.pressureHigh).toBeCloseTo(expected.pressureHigh, 12);
          expect(result.pressureLow).toBeCloseTo(expected.pressureLow, 12);
          expect(result.pressureHighDisplay).toBeCloseTo(expected.pressureHighDisplay, 12);
          expect(result.pressureLowDisplay).toBeCloseTo(expected.pressureLowDisplay, 12);
          expect(result.pressureHighAbsolute).toBeCloseTo(expected.pressureHighAbsolute, 12);
          expect(result.pressureLowAbsolute).toBeCloseTo(expected.pressureLowAbsolute, 12);
          expect(result.pressureRatio).toBeCloseTo(expected.pressureRatio, 12);
          expect(result.velocity).toBeCloseTo(expected.velocity, 12);
          expect(result.volume).toBeCloseTo(expected.volume, 12);
          expect(result.gasId).toBe(expected.gasId);
          expect(result.gasLabel).toBe(expected.gasLabel);
          expect(result.gasModel).toBe(expected.gasModel);
          expect(result.valvePosition).toBe(expected.valvePosition);
          expect(result.stopwatchSeconds).toBe(17);
          expect(result.updatedAtSeconds).toBe(17);
        },
      );
    });

    describe('when valve position is outside the allowed range', () => {
      it('should clamp to the first subvariant', () => {
        const physics = new Lab6Physics();
        const expected = createExpectedMeasurement({
          variantIndex: 0,
          valvePosition: 0,
          stopwatchSeconds: 9,
          gasId: 'ideal-gas',
          randomValues: [0],
        });

        const result = withMathRandomValues([0], () => physics.calculate(0, -100, 9, 'ideal-gas'));

        expect(result.valvePosition).toBe(0);
        expect(result.volume).toBe(expected.volume);
        expect(result.velocity).toBe(expected.velocity);
        expect(result.pressureRatio).toBe(expected.pressureRatio);
      });

      it('should clamp to the last subvariant', () => {
        const physics = new Lab6Physics();
        const expected = createExpectedMeasurement({
          variantIndex: 1,
          valvePosition: LAB6_SUBVARIANTS_COUNT - 1,
          stopwatchSeconds: 11,
          gasId: 'ideal-gas',
          randomValues: [0, 1, 0.5],
        });

        const result = withMathRandomValues([0, 1, 0.5], () =>
          physics.calculate(1, 100, 11, 'ideal-gas'),
        );

        expect(result.valvePosition).toBe(LAB6_SUBVARIANTS_COUNT - 1);
        expect(result.pressureLowAbsolute).toBeCloseTo(expected.pressureLowAbsolute, 12);
        expect(result.volume).toBeCloseTo(expected.volume, 12);
        expect(result.velocity).toBeCloseTo(expected.velocity, 12);
      });
    });

    describe('when random variation is not neutral', () => {
      it('should apply configured deviations to pressure and volume', () => {
        const physics = new Lab6Physics();
        const randomValues = [0.25, 0.5, 0.75];
        const expected = createExpectedMeasurement({
          variantIndex: 0,
          valvePosition: 3,
          stopwatchSeconds: 21,
          gasId: 'ideal-gas',
          randomValues,
        });

        const result = withMathRandomValues(randomValues, () =>
          physics.calculate(0, 3, 21, 'ideal-gas'),
        );

        expect(result.pressureHighAbsolute).toBeCloseTo(expected.pressureHighAbsolute, 12);
        expect(result.pressureLowAbsolute).toBeCloseTo(expected.pressureLowAbsolute, 12);
        expect(result.volume).toBeCloseTo(expected.volume, 12);
        expect(result.velocity).toBeCloseTo(expected.velocity, 12);
      });
    });

    describe('when each gas model is used', () => {
      it.each(LAB6_GASES)('should calculate stable measurements for $id', (gas) => {
        const physics = new Lab6Physics();
        const randomValues = [0, 1, 0.5];
        const expected = createExpectedMeasurement({
          variantIndex: 0,
          valvePosition: 5,
          stopwatchSeconds: 13,
          gasId: gas.id,
          randomValues,
        });

        const result = withMathRandomValues(randomValues, () =>
          physics.calculate(0, 5, 13, gas.id),
        );

        expect(result.gasId).toBe(gas.id);
        expect(result.gasModel).toBe(gas.model);
        expect(result.pressureRatio).toBeCloseTo(expected.pressureRatio, 12);
        expect(result.volume).toBeCloseTo(expected.volume, 12);
        expect(result.velocity).toBeCloseTo(expected.velocity, 12);
      });
    });
  });
});