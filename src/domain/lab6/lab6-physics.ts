import { LAB6_PARAMETERS, LAB6_SUBVARIANTS_COUNT } from '../../config/lab6/lab6-parameters.config';
import type { Lab6ParameterRow } from '../../config/lab6/lab6-parameters.types';
import type { Lab6Measurements } from './lab6-measurements.types';

export class Lab6Physics {
  private readonly adiabaticIndex: number;

  private readonly gasConstant: number;

  private readonly criticalRatio: number;

  public constructor() {
    this.adiabaticIndex = 1.4;
    this.gasConstant = 280.5;
    this.criticalRatio = 0.528;
  }

  public choose(): number {
    return Math.floor(Math.random() * LAB6_PARAMETERS.length);
  }

  public calculate(variantIndex: number, valvePosition: number, stopwatchSeconds: number): Lab6Measurements {
    const variant = LAB6_PARAMETERS[variantIndex];
    const safePosition = Math.min(Math.max(valvePosition, 0), LAB6_SUBVARIANTS_COUNT - 1);
    const row = variant[safePosition] ?? variant[0];

    const pressureHighAbsolute = this.absolute(row.p1, row.B);
    const pressureLowAbsolute = pressureHighAbsolute * row.b;
    const temperatureLow = this.temperature(row);
    const volume = this.volume(row);
    const pressureHigh = this.relative(this.vary(pressureHighAbsolute, 0, 3), row.B);
    const pressureLow = this.relative(this.vary(pressureLowAbsolute, 3, 0), row.B);
    const temperatureHigh = row.t1;
    const temperatureLowVaried = this.vary(temperatureLow, 5, 5);
    const volumeVaried = this.vary(volume, 3, 3);

    return {
      barometer: row.B,
      pressureHigh,
      pressureLow,
      temperatureHigh,
      temperatureLow: temperatureLowVaried,
      volume: volumeVaried,
      valvePosition: safePosition,
      stopwatchSeconds,
    };
  }

  private absolute(relative: number, barometer: number): number {
    return relative + (barometer / 750) * 100;
  }

  private relative(absolute: number, barometer: number): number {
    return absolute - (barometer / 750) * 100;
  }

  private vary(value: number, lowerDeviation: number, upperDeviation: number): number {
    const deviation = (upperDeviation + lowerDeviation) * Math.random() - lowerDeviation;

    return value * (1 + deviation * 0.01);
  }

  private temperature(row: Lab6ParameterRow): number {
    const numerator = 1 / row.b;
    const exponent = (1 - this.adiabaticIndex) / this.adiabaticIndex;
    const kelvin = row.t1 + 273.15;

    return Math.pow(numerator, exponent) * kelvin - 273.15;
  }

  private volume(row: Lab6ParameterRow): number {
    const area = (Math.PI * row.D * row.D) / 4;
    const kelvin = row.t1 + 273.15;
    const ratioFactor = (2 * this.adiabaticIndex) / (this.adiabaticIndex - 1);

    if (row.b > this.criticalRatio) {
      const inner = 1 - Math.pow(row.b, (this.adiabaticIndex - 1) / this.adiabaticIndex);

      return Math.sqrt(ratioFactor * this.gasConstant * kelvin * inner) * area;
    }

    return Math.sqrt(ratioFactor * this.gasConstant * kelvin) * area;
  }
}