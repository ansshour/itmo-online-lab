import { LAB6_GAS_DEFINITIONS } from '../../../config/lab6/gases/lab6.gases.config';
import { LAB6_DEFAULT_GAS_ID, LAB6_UNIVERSAL_GAS_CONSTANT } from '../../../config/lab6/gases/lab6.gases.consts';
import type { Lab6Gas, Lab6GasDefinition } from '../../../config/lab6/gases/lab6.gases.types';

export class Lab6Gases {
  public all(): readonly Lab6Gas[] {
    return LAB6_GAS_DEFINITIONS.map((definition) => this.gas(definition));
  }

  public get(gasId: string): Lab6Gas {
    const definition = LAB6_GAS_DEFINITIONS.find((entry) => entry.id === gasId) ?? this.defaultDefinition();

    return this.gas(definition);
  }

  private gas(definition: Lab6GasDefinition): Lab6Gas {
    return {
      ...definition,
      specificGasConstant: LAB6_UNIVERSAL_GAS_CONSTANT / definition.molarMass,
    };
  }

  private defaultDefinition(): Lab6GasDefinition {
    return LAB6_GAS_DEFINITIONS.find((entry) => entry.id === LAB6_DEFAULT_GAS_ID) ?? LAB6_GAS_DEFINITIONS[0];
  }
}