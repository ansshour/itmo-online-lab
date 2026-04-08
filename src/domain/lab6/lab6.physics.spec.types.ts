import type { Lab6Measurements } from './lab6.measurements.types';

export interface Lab6PhysicsExpectedMeasurementProps {
  readonly variantIndex: number;
  readonly valvePosition: number;
  readonly stopwatchSeconds: number;
  readonly gasId: string;
  readonly randomValues: readonly number[];
}

export interface Lab6PhysicsVariationProps {
  readonly value: number;
  readonly lowerDeviation: number;
  readonly upperDeviation: number;
  readonly randomValue: number;
}

export interface Lab6PhysicsCompressibilityCoefficients {
  readonly quadratic: number;
  readonly linear: number;
  readonly constant: number;
}

export interface Lab6PhysicsExpectedMeasurement extends Lab6Measurements {}