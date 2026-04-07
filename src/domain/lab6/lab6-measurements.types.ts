export type Lab6Measurements = {
  barometer: number;
  pressureHigh: number;
  pressureLow: number;
  temperatureHigh: number;
  temperatureLow: number;
  volume: number;
  gasId: string;
  gasLabel: string;
  gasModel: 'ideal' | 'real';
  valvePosition: number;
  stopwatchSeconds: number;
  updatedAtSeconds: number;
};
