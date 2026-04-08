export enum GasModelKind {
  Ideal = 'ideal',
  Real = 'real',
}

export interface Lab6GasDefinition {
  readonly id: string;
  readonly label: string;
  readonly model: GasModelKind;
  readonly molarMass: number;
  readonly adiabaticIndex: number;
  readonly criticalTemperature: number;
  readonly criticalPressure: number;
  readonly acentricFactor: number;
}

export interface Lab6Gas extends Lab6GasDefinition {
  readonly specificGasConstant: number;
}