const UNIVERSAL_GAS_CONSTANT = 8.314462618;

export type GasModelKind = 'ideal' | 'real';

export type Lab6GasDefinition = {
  id: string;
  label: string;
  model: GasModelKind;
  molarMass: number;
  adiabaticIndex: number;
  criticalTemperature: number;
  criticalPressure: number;
  acentricFactor: number;
};

export type Lab6Gas = Lab6GasDefinition & {
  specificGasConstant: number;
};

const createSpecificGasConstant = (molarMass: number): number => UNIVERSAL_GAS_CONSTANT / molarMass;

export const LAB6_GASES: Lab6Gas[] = [
  {
    id: 'ideal-gas',
    label: 'Идеальный газ',
    model: 'ideal',
    molarMass: UNIVERSAL_GAS_CONSTANT / 280.5,
    adiabaticIndex: 1.4,
    criticalTemperature: 132.45,
    criticalPressure: 3_770_000,
    acentricFactor: 0.04,
  },
  {
    id: 'air',
    label: 'Воздух',
    model: 'real',
    molarMass: 0.0289652,
    adiabaticIndex: 1.4,
    criticalTemperature: 132.45,
    criticalPressure: 3_770_000,
    acentricFactor: 0.04,
  },
  {
    id: 'nitrogen',
    label: 'Азот',
    model: 'real',
    molarMass: 0.0280134,
    adiabaticIndex: 1.4,
    criticalTemperature: 126.2,
    criticalPressure: 3_395_800,
    acentricFactor: 0.0372,
  },
  {
    id: 'oxygen',
    label: 'Кислород',
    model: 'real',
    molarMass: 0.031998,
    adiabaticIndex: 1.395,
    criticalTemperature: 154.58,
    criticalPressure: 5_043_000,
    acentricFactor: 0.0222,
  },
  {
    id: 'carbon-dioxide',
    label: 'Углекислый газ',
    model: 'real',
    molarMass: 0.0440095,
    adiabaticIndex: 1.289,
    criticalTemperature: 304.13,
    criticalPressure: 7_377_300,
    acentricFactor: 0.2239,
  },
  {
    id: 'methane',
    label: 'Метан',
    model: 'real',
    molarMass: 0.0160425,
    adiabaticIndex: 1.31,
    criticalTemperature: 190.56,
    criticalPressure: 4_599_000,
    acentricFactor: 0.011,
  },
  {
    id: 'helium',
    label: 'Гелий',
    model: 'real',
    molarMass: 0.0040026,
    adiabaticIndex: 1.66,
    criticalTemperature: 5.19,
    criticalPressure: 227_000,
    acentricFactor: -0.385,
  },
  {
    id: 'argon',
    label: 'Аргон',
    model: 'real',
    molarMass: 0.039948,
    adiabaticIndex: 1.667,
    criticalTemperature: 150.69,
    criticalPressure: 4_863_000,
    acentricFactor: -0.00219,
  },
].map((gas) => ({
  ...gas,
  specificGasConstant: createSpecificGasConstant(gas.molarMass),
})) as Lab6Gas[];

export const LAB6_DEFAULT_GAS_ID = 'ideal-gas';

export const getLab6Gas = (gasId: string): Lab6Gas =>
  LAB6_GASES.find((gas) => gas.id === gasId) ?? LAB6_GASES[0];
