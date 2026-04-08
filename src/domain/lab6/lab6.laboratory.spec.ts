import { describe, expect, it } from 'vitest';

import { Lab6LaboratorySpecUtils } from './lab6.laboratory.spec.utils';
import { Lab6PhysicsSpecUtils } from './lab6.physics.spec.utils';

describe('Lab6Laboratory', () => {
  describe('#captureMeasurement', () => {
    describe('when the laboratory is running', () => {
      it('should convert flow to liters per minute and keep measured physics values', () => {
        const laboratory = Lab6LaboratorySpecUtils.createRunningLaboratory();

        Lab6PhysicsSpecUtils.withMathRandomValues([0, 1, 0.5], () => laboratory.setValvePosition(5));
        const measurement = laboratory.snapshot().measurements;
        laboratory.captureMeasurement();
        const records = laboratory.snapshot().measurementRecords;

        expect(measurement).not.toBeNull();
        expect(records).toHaveLength(1);
        expect(records[0].index).toBe(1);
        expect(records[0].gasId).toBe(measurement?.gasId);
        expect(records[0].gasLabel).toBe(measurement?.gasLabel);
        expect(records[0].gasModel).toBe(measurement?.gasModel);
        expect(records[0].pressureHighBar).toBe(measurement?.pressureHighDisplay);
        expect(records[0].pressureLowBar).toBe(measurement?.pressureLowDisplay);
        expect(records[0].flowLitersPerMinute).toBeCloseTo((measurement?.volume ?? 0) * 1000 * 60, 12);
        expect(records[0].pressureRatio).toBe(measurement?.pressureRatio);
        expect(records[0].velocity).toBe(measurement?.velocity);
      });
    });

    describe('when multiple measurements are captured', () => {
      it('should increment record index for each measurement', () => {
        const laboratory = Lab6LaboratorySpecUtils.createRunningLaboratory();

        Lab6PhysicsSpecUtils.withMathRandomValues([0, 1, 0.5], () => laboratory.setValvePosition(4));
        laboratory.captureMeasurement();
        Lab6PhysicsSpecUtils.withMathRandomValues([0.25, 0.75, 0.5], () => laboratory.setValvePosition(6));
        laboratory.captureMeasurement();
        const records = laboratory.snapshot().measurementRecords;

        expect(records).toHaveLength(2);
        expect(records[0].index).toBe(1);
        expect(records[1].index).toBe(2);
      });
    });
  });
});