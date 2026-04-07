import { LAB6_PARAMETERS, LAB6_SUBVARIANTS_COUNT } from '../../config/lab6/lab6-parameters.config';
import { getLab6Gas } from './lab6-gases';
import type { Lab6Measurements } from './lab6-measurements.types';

export class Lab6Physics {
  private readonly epsilon = 1e-9;

  public choose(): number {
    return Math.floor(Math.random() * LAB6_PARAMETERS.length);
  }

  public calculate(variantIndex: number, valvePosition: number, stopwatchSeconds: number, gasId: string): Lab6Measurements {
    const variant = LAB6_PARAMETERS[variantIndex];
    const safePosition = Math.min(Math.max(valvePosition, 0), LAB6_SUBVARIANTS_COUNT - 1);
    const row = variant[safePosition] ?? variant[0];
    const gas = getLab6Gas(gasId);

    const pressureHighAbsolute = this.absolute(row.p1, row.B);
    const pressureLowAbsolute = pressureHighAbsolute * row.b;
    const pressureHighAbsoluteVaried = this.vary(pressureHighAbsolute, 0, 3);
    const pressureLowAbsoluteVaried = this.vary(pressureLowAbsolute, 3, 0);
    const volume = this.volume(row.p1, row.b, row.D, gasId);
    const pressureHigh = this.relative(pressureHighAbsoluteVaried, row.B);
    const pressureLow = this.relative(pressureLowAbsoluteVaried, row.B);
    const pressureHighDisplay = pressureHighAbsoluteVaried / 100;
    const pressureLowDisplay = pressureLowAbsoluteVaried / 100;
    const pressureRatio = pressureLowAbsolute / Math.max(pressureHighAbsolute, this.epsilon);
    const velocity = this.velocity(volume, row.D);
    const volumeVaried = this.vary(volume, 3, 3);

    return {
      barometer: row.B,
      pressureHigh,
      pressureLow,
      pressureHighDisplay,
      pressureLowDisplay,
      pressureHighAbsolute: pressureHighAbsoluteVaried,
      pressureLowAbsolute: pressureLowAbsoluteVaried,
      pressureRatio,
      velocity,
      volume: volumeVaried,
      gasId: gas.id,
      gasLabel: gas.label,
      gasModel: gas.model,
      valvePosition: safePosition,
      stopwatchSeconds,
      updatedAtSeconds: stopwatchSeconds,
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

  private volume(pressureHighRelative: number, ratio: number, diameter: number, gasId: string): number {
    const gas = getLab6Gas(gasId);
    const area = (Math.PI * diameter * diameter) / 4;
    const referenceTemperature = 293.15;
    const z = this.compressibility(gasId, this.absolute(pressureHighRelative, 758) * 1000, referenceTemperature);
    const effectiveGasConstant = gas.specificGasConstant / Math.max(z, this.epsilon);
    const criticalRatio = this.criticalRatio(gas.adiabaticIndex);

    if (ratio > criticalRatio) {
      return (
        Math.sqrt(
          ((2 * gas.adiabaticIndex) / (gas.adiabaticIndex - 1)) *
            effectiveGasConstant *
            referenceTemperature *
            (1 - Math.pow(ratio, (gas.adiabaticIndex - 1) / gas.adiabaticIndex)),
        ) * area
      );
    }

    return Math.sqrt(((2 * gas.adiabaticIndex) / (gas.adiabaticIndex - 1)) * effectiveGasConstant * referenceTemperature) * area;
  }

  private velocity(volume: number, diameter: number): number {
    const area = (Math.PI * diameter * diameter) / 4;

    return volume / Math.max(area, this.epsilon);
  }

  private criticalRatio(adiabaticIndex: number): number {
    return Math.pow(2 / (adiabaticIndex + 1), adiabaticIndex / (adiabaticIndex - 1));
  }

  private compressibility(gasId: string, pressurePascal: number, temperatureKelvin: number): number {
    const gas = getLab6Gas(gasId);

    if (gas.model === 'ideal') {
      return 1;
    }

    const universalGasConstant = 8.314462618;
    const reducedTemperature = temperatureKelvin / gas.criticalTemperature;
    const kappa =
      0.37464 +
      1.54226 * gas.acentricFactor -
      0.26992 * gas.acentricFactor * gas.acentricFactor;
    const alpha = Math.pow(1 + kappa * (1 - Math.sqrt(reducedTemperature)), 2);
    const a =
      0.45724 *
      ((universalGasConstant * universalGasConstant * gas.criticalTemperature * gas.criticalTemperature) / gas.criticalPressure);
    const b = 0.0778 * ((universalGasConstant * gas.criticalTemperature) / gas.criticalPressure);
    const aAlpha = a * alpha;
    const A = (aAlpha * pressurePascal) / (universalGasConstant * universalGasConstant * temperatureKelvin * temperatureKelvin);
    const B = (b * pressurePascal) / (universalGasConstant * temperatureKelvin);
    const coefficients = {
      quadratic: -(1 - B),
      linear: A - 3 * B * B - 2 * B,
      constant: -(A * B - B * B - B * B * B),
    };
    const roots = this.solveCompressibilityCubic(coefficients.quadratic, coefficients.linear, coefficients.constant);
    const vaporRoots = roots.filter((root) => Number.isFinite(root) && root > B + this.epsilon);

    if (vaporRoots.length > 0) {
      return Math.max(...vaporRoots);
    }

    const fallback = this.refineCompressibilityRoot(Math.max(1, B + this.epsilon), coefficients);

    return Number.isFinite(fallback) && fallback > B ? fallback : 1;
  }

  private solveCompressibilityCubic(quadratic: number, linear: number, constant: number): number[] {
    const depressedLinear = linear - (quadratic * quadratic) / 3;
    const depressedConstant = (2 * quadratic * quadratic * quadratic) / 27 - (quadratic * linear) / 3 + constant;
    const halfQ = depressedConstant / 2;
    const thirdP = depressedLinear / 3;
    const discriminant = halfQ * halfQ + thirdP * thirdP * thirdP;

    if (discriminant > this.epsilon) {
      const sqrtDiscriminant = Math.sqrt(discriminant);
      const u = Math.cbrt(-halfQ + sqrtDiscriminant);
      const v = Math.cbrt(-halfQ - sqrtDiscriminant);
      const root = u + v - quadratic / 3;

      return [this.refineCompressibilityRoot(root, { quadratic, linear, constant })];
    }

    if (Math.abs(discriminant) <= this.epsilon) {
      const u = Math.cbrt(-halfQ);
      const first = 2 * u - quadratic / 3;
      const second = -u - quadratic / 3;

      return this.uniqueRoots([
        this.refineCompressibilityRoot(first, { quadratic, linear, constant }),
        this.refineCompressibilityRoot(second, { quadratic, linear, constant }),
      ]);
    }

    const radius = 2 * Math.sqrt(-thirdP);
    const denominator = Math.sqrt(-thirdP * thirdP * thirdP);
    const ratio = this.clamp(-halfQ / denominator, -1, 1);
    const angle = Math.acos(ratio);

    return this.uniqueRoots(
      [0, 1, 2].map((index) =>
        this.refineCompressibilityRoot(
          radius * Math.cos((angle + 2 * Math.PI * index) / 3) - quadratic / 3,
          { quadratic, linear, constant },
        ),
      ),
    );
  }

  private refineCompressibilityRoot(
    initialGuess: number,
    coefficients: { quadratic: number; linear: number; constant: number },
  ): number {
    let current = initialGuess;

    for (let iteration = 0; iteration < 8; iteration += 1) {
      const value = this.compressibilityPolynomial(current, coefficients);
      const derivative = this.compressibilityPolynomialDerivative(current, coefficients);

      if (Math.abs(derivative) <= this.epsilon) {
        break;
      }

      const next = current - value / derivative;

      if (!Number.isFinite(next)) {
        break;
      }

      if (Math.abs(next - current) <= this.epsilon * Math.max(1, Math.abs(current))) {
        current = next;

        break;
      }

      current = next;
    }

    return current;
  }

  private compressibilityPolynomial(
    value: number,
    coefficients: { quadratic: number; linear: number; constant: number },
  ): number {
    return ((value + coefficients.quadratic) * value + coefficients.linear) * value + coefficients.constant;
  }

  private compressibilityPolynomialDerivative(
    value: number,
    coefficients: { quadratic: number; linear: number; constant: number },
  ): number {
    void coefficients.constant;

    return 3 * value * value + 2 * coefficients.quadratic * value + coefficients.linear;
  }

  private uniqueRoots(roots: number[]): number[] {
    return roots
      .filter((root) => Number.isFinite(root))
      .sort((left, right) => left - right)
      .filter((root, index, values) => index === 0 || Math.abs(root - values[index - 1]) > 1e-7);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
