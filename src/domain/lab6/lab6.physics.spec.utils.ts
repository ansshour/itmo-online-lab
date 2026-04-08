import { LAB6_PARAMETERS } from '../../config/lab6/lab6.parameters.config';
import type { Lab6ParameterRow } from '../../config/lab6/lab6.parameters.types';
import { GasModelKind } from '../../config/lab6/gases/lab6.gases.types';
import type {
  Lab6PhysicsCompressibilityCoefficients,
  Lab6PhysicsExpectedMeasurement,
  Lab6PhysicsExpectedMeasurementProps,
  Lab6PhysicsVariationProps,
} from './lab6.physics.spec.types';
import { Lab6Gases } from './gases/lab6.gases';
import { vi } from 'vitest';

const epsilon = 1e-9;

const lab6Gases = new Lab6Gases();

export class Lab6PhysicsSpecUtils {
  public static readonly calculationCases = LAB6_PARAMETERS.flatMap((variant, variantIndex) =>
    variant.map((row, valvePosition) => ({
      variantIndex,
      valvePosition,
      row,
    })),
  );

  public static withMathRandomValues<Result>(values: readonly number[], action: () => Result): Result {
    const remainingValues = [...values];
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      const nextValue = remainingValues.shift();

      if (nextValue === undefined) {
        throw new Error('Unexpected Math.random call');
      }

      return nextValue;
    });

    try {
      const result = action();

      return result;
    } finally {
      random.mockRestore();
    }
  }

  public static createStableRandomValues(valvePosition: number): readonly number[] {
    if (valvePosition === 0) {
      return [0];
    }

    return [0, 1, 0.5];
  }

  public static createExpectedMeasurement(props: Lab6PhysicsExpectedMeasurementProps): Lab6PhysicsExpectedMeasurement {
    const variant = LAB6_PARAMETERS[props.variantIndex];
    const safePosition = Math.min(Math.max(props.valvePosition, 0), variant.length - 1);
    const row = variant[safePosition] ?? variant[0];
    const gas = lab6Gases.get(props.gasId);
    const randomValues = [...props.randomValues];
    const pressureHighAbsolute = this.calculateAbsolutePressure(row);
    const pressureLowAbsolute = pressureHighAbsolute * row.b;
    const pressureHighAbsoluteVaried = this.applyVariation({
      value: pressureHighAbsolute,
      lowerDeviation: 0,
      upperDeviation: 3,
      randomValue: this.takeRandomValue(randomValues),
    });
    const pressureLowAbsoluteVaried =
      safePosition === 0
        ? pressureHighAbsoluteVaried
        : this.applyVariation({
            value: pressureLowAbsolute,
            lowerDeviation: 3,
            upperDeviation: 0,
            randomValue: this.takeRandomValue(randomValues),
          });
    const pressureRatio = pressureLowAbsoluteVaried / Math.max(pressureHighAbsoluteVaried, epsilon);
    const volume = this.calculateVolume({
      row,
      gasId: props.gasId,
      pressureHighAbsolute: pressureHighAbsoluteVaried,
      ratio: pressureRatio,
    });
    const volumeVaried =
      safePosition === 0
        ? 0
        : this.applyVariation({
            value: volume,
            lowerDeviation: 3,
            upperDeviation: 3,
            randomValue: this.takeRandomValue(randomValues),
          });
    const velocity = this.calculateVelocity({
      volume: volumeVaried,
      diameter: row.D,
    });

    return {
      barometer: row.B,
      pressureHigh: this.calculateRelativePressure({
        absolute: pressureHighAbsoluteVaried,
        barometer: row.B,
      }),
      pressureLow: this.calculateRelativePressure({
        absolute: pressureLowAbsoluteVaried,
        barometer: row.B,
      }),
      pressureHighDisplay: pressureHighAbsoluteVaried / 100,
      pressureLowDisplay: pressureLowAbsoluteVaried / 100,
      pressureHighAbsolute: pressureHighAbsoluteVaried,
      pressureLowAbsolute: pressureLowAbsoluteVaried,
      pressureRatio,
      velocity,
      volume: volumeVaried,
      gasId: gas.id,
      gasLabel: gas.label,
      gasModel: gas.model,
      valvePosition: safePosition,
      stopwatchSeconds: props.stopwatchSeconds,
      updatedAtSeconds: props.stopwatchSeconds,
    };
  }

  private static takeRandomValue(values: number[]): number {
    const nextValue = values.shift();

    if (nextValue === undefined) {
      throw new Error('Expected more random values');
    }

    return nextValue;
  }

  private static calculateAbsolutePressure(row: Lab6ParameterRow): number {
    const barometerOffset = (row.B / 750) * 100;

    return row.p1 + barometerOffset;
  }

  private static calculateRelativePressure(props: { readonly absolute: number; readonly barometer: number }): number {
    const barometerOffset = (props.barometer / 750) * 100;

    return props.absolute - barometerOffset;
  }

  private static applyVariation(props: Lab6PhysicsVariationProps): number {
    const deviation = (props.upperDeviation + props.lowerDeviation) * props.randomValue - props.lowerDeviation;

    return props.value * (1 + deviation * 0.01);
  }

  private static calculateVolume(props: {
    readonly row: Lab6ParameterRow;
    readonly gasId: string;
    readonly pressureHighAbsolute: number;
    readonly ratio: number;
  }): number {
    const gas = lab6Gases.get(props.gasId);
    const area = (Math.PI * props.row.D * props.row.D) / 4;
    const temperatureKelvin = props.row.t1 + 273.15;
    const pressurePascal = props.pressureHighAbsolute * 1000;
    const z = this.calculateCompressibility({
      gasId: props.gasId,
      pressurePascal,
      temperatureKelvin,
    });
    const effectiveGasConstant = gas.specificGasConstant / Math.max(z, epsilon);
    const criticalRatio = this.calculateCriticalRatio(gas.adiabaticIndex);

    if (props.ratio > criticalRatio) {
      return (
        Math.sqrt(
          ((2 * gas.adiabaticIndex) / (gas.adiabaticIndex - 1)) *
            effectiveGasConstant *
            temperatureKelvin *
            (1 - Math.pow(props.ratio, (gas.adiabaticIndex - 1) / gas.adiabaticIndex)),
        ) * area
      );
    }

    return Math.sqrt(((2 * gas.adiabaticIndex) / (gas.adiabaticIndex + 1)) * effectiveGasConstant * temperatureKelvin) * area;
  }

  private static calculateVelocity(props: { readonly volume: number; readonly diameter: number }): number {
    const area = (Math.PI * props.diameter * props.diameter) / 4;

    return props.volume / Math.max(area, epsilon);
  }

  private static calculateCriticalRatio(adiabaticIndex: number): number {
    return Math.pow(2 / (adiabaticIndex + 1), adiabaticIndex / (adiabaticIndex - 1));
  }

  private static calculateCompressibility(props: {
    readonly gasId: string;
    readonly pressurePascal: number;
    readonly temperatureKelvin: number;
  }): number {
    const gas = lab6Gases.get(props.gasId);

    if (gas.model === GasModelKind.Ideal) {
      return 1;
    }

    const universalGasConstant = 8.314462618;
    const reducedTemperature = props.temperatureKelvin / gas.criticalTemperature;
    const kappa = 0.37464 + 1.54226 * gas.acentricFactor - 0.26992 * gas.acentricFactor * gas.acentricFactor;
    const alpha = Math.pow(1 + kappa * (1 - Math.sqrt(reducedTemperature)), 2);
    const a =
      0.45724 *
      ((universalGasConstant * universalGasConstant * gas.criticalTemperature * gas.criticalTemperature) /
        gas.criticalPressure);
    const b = 0.0778 * ((universalGasConstant * gas.criticalTemperature) / gas.criticalPressure);
    const aAlpha = a * alpha;
    const A =
      (aAlpha * props.pressurePascal) /
      (universalGasConstant * universalGasConstant * props.temperatureKelvin * props.temperatureKelvin);
    const B = (b * props.pressurePascal) / (universalGasConstant * props.temperatureKelvin);
    const coefficients = {
      quadratic: -(1 - B),
      linear: A - 3 * B * B - 2 * B,
      constant: -(A * B - B * B - B * B * B),
    };
    const roots = this.solveCompressibilityCubic(coefficients);
    const vaporRoots = roots.filter((root) => Number.isFinite(root) && root > B + epsilon);

    if (vaporRoots.length > 0) {
      return Math.max(...vaporRoots);
    }

    const fallback = this.refineCompressibilityRoot({
      initialGuess: Math.max(1, B + epsilon),
      coefficients,
    });

    return Number.isFinite(fallback) && fallback > B ? fallback : 1;
  }

  private static solveCompressibilityCubic(coefficients: Lab6PhysicsCompressibilityCoefficients): number[] {
    const depressedLinear = coefficients.linear - (coefficients.quadratic * coefficients.quadratic) / 3;
    const depressedConstant =
      (2 * coefficients.quadratic * coefficients.quadratic * coefficients.quadratic) / 27 -
      (coefficients.quadratic * coefficients.linear) / 3 +
      coefficients.constant;
    const halfQ = depressedConstant / 2;
    const thirdP = depressedLinear / 3;
    const discriminant = halfQ * halfQ + thirdP * thirdP * thirdP;

    if (discriminant > epsilon) {
      const sqrtDiscriminant = Math.sqrt(discriminant);
      const u = Math.cbrt(-halfQ + sqrtDiscriminant);
      const v = Math.cbrt(-halfQ - sqrtDiscriminant);
      const root = u + v - coefficients.quadratic / 3;

      return [
        this.refineCompressibilityRoot({
          initialGuess: root,
          coefficients,
        }),
      ];
    }

    if (Math.abs(discriminant) <= epsilon) {
      const u = Math.cbrt(-halfQ);
      const first = 2 * u - coefficients.quadratic / 3;
      const second = -u - coefficients.quadratic / 3;

      return this.uniqueRoots([
        this.refineCompressibilityRoot({
          initialGuess: first,
          coefficients,
        }),
        this.refineCompressibilityRoot({
          initialGuess: second,
          coefficients,
        }),
      ]);
    }

    const radius = 2 * Math.sqrt(-thirdP);
    const denominator = Math.sqrt(-thirdP * thirdP * thirdP);
    const ratio = this.clampValue({
      value: -halfQ / denominator,
      min: -1,
      max: 1,
    });
    const angle = Math.acos(ratio);

    return this.uniqueRoots(
      [0, 1, 2].map((index) =>
        this.refineCompressibilityRoot({
          initialGuess: radius * Math.cos((angle + 2 * Math.PI * index) / 3) - coefficients.quadratic / 3,
          coefficients,
        }),
      ),
    );
  }

  private static refineCompressibilityRoot(props: {
    readonly initialGuess: number;
    readonly coefficients: Lab6PhysicsCompressibilityCoefficients;
  }): number {
    let current = props.initialGuess;

    for (let iteration = 0; iteration < 8; iteration += 1) {
      const value = this.calculateCompressibilityPolynomial({
        value: current,
        coefficients: props.coefficients,
      });
      const derivative = this.calculateCompressibilityPolynomialDerivative({
        value: current,
        coefficients: props.coefficients,
      });

      if (Math.abs(derivative) <= epsilon) {
        break;
      }

      const next = current - value / derivative;

      if (!Number.isFinite(next)) {
        break;
      }

      if (Math.abs(next - current) <= epsilon * Math.max(1, Math.abs(current))) {
        current = next;

        break;
      }

      current = next;
    }

    return current;
  }

  private static calculateCompressibilityPolynomial(props: {
    readonly value: number;
    readonly coefficients: Lab6PhysicsCompressibilityCoefficients;
  }): number {
    return ((props.value + props.coefficients.quadratic) * props.value + props.coefficients.linear) * props.value + props.coefficients.constant;
  }

  private static calculateCompressibilityPolynomialDerivative(props: {
    readonly value: number;
    readonly coefficients: Lab6PhysicsCompressibilityCoefficients;
  }): number {
    void props.coefficients.constant;

    return 3 * props.value * props.value + 2 * props.coefficients.quadratic * props.value + props.coefficients.linear;
  }

  private static uniqueRoots(roots: number[]): number[] {
    return roots
      .filter((root) => Number.isFinite(root))
      .sort((left, right) => left - right)
      .filter((root, index, values) => index === 0 || Math.abs(root - values[index - 1]) > 1e-7);
  }

  private static clampValue(props: { readonly value: number; readonly min: number; readonly max: number }): number {
    return Math.min(Math.max(props.value, props.min), props.max);
  }
}