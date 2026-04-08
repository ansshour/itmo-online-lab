import { EquipmentKind, SensorKind } from '../../config/lab6/lab6.types';
import { Lab6Laboratory } from './lab6.laboratory';
import { Lab6PhysicsSpecUtils } from './lab6.physics.spec.utils';

export class Lab6LaboratorySpecUtils {
  private static readonly equipmentLayout = [
    { kind: EquipmentKind.Compressor, tileX: 0, tileY: 3 },
    { kind: EquipmentKind.Receiver, tileX: 5, tileY: 3 },
    { kind: EquipmentKind.Chamber, tileX: 13, tileY: 2 },
    { kind: EquipmentKind.Nozzle, tileX: 17, tileY: 3 },
    { kind: EquipmentKind.Chamber, tileX: 20, tileY: 2 },
    { kind: EquipmentKind.Valve, tileX: 24, tileY: 3 },
    { kind: EquipmentKind.Flowmeter, tileX: 27, tileY: 4 },
  ] as const;

  public static createRunningLaboratory(): Lab6Laboratory {
    const laboratory = new Lab6Laboratory();

    this.createAssembly(laboratory);
    this.advanceToInstruments(laboratory);
    this.installManometers(laboratory);
    this.advanceToRunning(laboratory);

    return laboratory;
  }

  private static createAssembly(laboratory: Lab6Laboratory): void {
    for (const item of this.equipmentLayout) {
      this.createEquipment(laboratory, item);
    }
  }

  private static advanceToInstruments(laboratory: Lab6Laboratory): void {
    const assemblyResult = laboratory.advance(0);

    if (!assemblyResult.valid) {
      throw new Error('Failed to advance laboratory to instruments stage');
    }
  }

  private static installManometers(laboratory: Lab6Laboratory): void {
    const chambers = laboratory.snapshot().items.filter((item) => item.kind === EquipmentKind.Chamber);

    for (const chamber of chambers) {
      const installResult = laboratory.install(SensorKind.Manometer, chamber.id, 'manometer');

      if (!installResult.ok) {
        throw new Error('Failed to install manometer');
      }
    }
  }

  private static advanceToRunning(laboratory: Lab6Laboratory): void {
    const runningResult = Lab6PhysicsSpecUtils.withMathRandomValues([0, 0], () => laboratory.advance(0));

    if (!runningResult.valid) {
      throw new Error('Failed to advance laboratory to running stage');
    }
  }

  private static createEquipment(
    laboratory: Lab6Laboratory,
    item: (typeof Lab6LaboratorySpecUtils.equipmentLayout)[number],
  ): void {
    const created = laboratory.create(item.kind, { tileX: item.tileX, tileY: item.tileY });

    if (!created) {
      throw new Error(`Failed to create ${item.kind}`);
    }
  }
}