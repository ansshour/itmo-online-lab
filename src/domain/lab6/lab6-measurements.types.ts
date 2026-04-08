export type Lab6Measurements = {
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
  gasModel: 'ideal' | 'real';
  valvePosition: number;
  stopwatchSeconds: number;
  updatedAtSeconds: number;
};

export type Lab6MeasurementRecord = {
  index: number;
  gasId: string;
  gasLabel: string;
  gasModel: 'ideal' | 'real';
  pressureHighBar: number;
  pressureLowBar: number;
  flowLitersPerMinute: number;
  pressureRatio: number;
  velocity: number;
};
