import type { GasModelKind } from '../../config/lab6/gases/lab6.gases.types';

export interface Lab6Measurements {
  barometer: number;
  pressureHigh: number;
  pressureLow: number;
  pressureHighDisplay: number;
  pressureLowDisplay: number;
  pressureHighAbsolute: number;
  pressureLowAbsolute: number;
  pressureRatio: number;
  velocity: number;
  volume: number;
  gasId: string;
  gasLabel: string;
  gasModel: GasModelKind;
  valvePosition: number;
  stopwatchSeconds: number;
  updatedAtSeconds: number;
}

export interface Lab6MeasurementRecord {
  index: number;
  gasId: string;
  gasLabel: string;
  gasModel: GasModelKind;
  pressureHighBar: number;
  pressureLowBar: number;
  flowLitersPerMinute: number;
  pressureRatio: number;
  velocity: number;
}
