export type Lab6Measurements = {
  barometer: number;
  pressureHigh: number;
  pressureLow: number;
  pressureHighDisplay: number;
  pressureLowDisplay: number;
  volume: number;
  gasId: string;
  gasLabel: string;
  gasModel: 'ideal' | 'real';
  valvePosition: number;
  stopwatchSeconds: number;
  updatedAtSeconds: number;
};
