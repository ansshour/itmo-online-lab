import { Lab6Laboratory } from './lab6-laboratory';
import { withMathRandomValues } from './lab6.physics.spec.utils';

const equipmentLayout = [
  { kind: 'compressor', tileX: 0, tileY: 3 },
  { kind: 'receiver', tileX: 5, tileY: 3 },
  { kind: 'chamber', tileX: 13, tileY: 2 },
  { kind: 'nozzle', tileX: 17, tileY: 3 },
  { kind: 'chamber', tileX: 20, tileY: 2 },
  { kind: 'valve', tileX: 24, tileY: 3 },
  { kind: 'flowmeter', tileX: 27, tileY: 4 },
] as const;

export function createRunningLaboratory(): Lab6Laboratory {
  const laboratory = new Lab6Laboratory();

  createAssembly(laboratory);
  advanceToInstruments(laboratory);
  installManometers(laboratory);
  advanceToRunning(laboratory);

  return laboratory;
}

function createAssembly(laboratory: Lab6Laboratory): void {
  for (const item of equipmentLayout) {
    createEquipment(laboratory, item.kind, item.tileX, item.tileY);
  }
}

function advanceToInstruments(laboratory: Lab6Laboratory): void {
  const assemblyResult = laboratory.advance(0);

  if (!assemblyResult.valid) {
    throw new Error('Failed to advance laboratory to instruments stage');
  }
}

function installManometers(laboratory: Lab6Laboratory): void {
  const chambers = laboratory.snapshot().items.filter((item) => item.kind === 'chamber');

  for (const chamber of chambers) {
    const installResult = laboratory.install('manometer', chamber.id, 'manometer');

    if (!installResult.ok) {
      throw new Error('Failed to install manometer');
    }
  }
}

function advanceToRunning(laboratory: Lab6Laboratory): void {
  const runningResult = withMathRandomValues([0, 0], () => laboratory.advance(0));

  if (!runningResult.valid) {
    throw new Error('Failed to advance laboratory to running stage');
  }
}

function createEquipment(laboratory: Lab6Laboratory, kind: Parameters<Lab6Laboratory['create']>[0], tileX: number, tileY: number): void {
  const created = laboratory.create(kind, { tileX, tileY });

  if (!created) {
    throw new Error(`Failed to create ${kind}`);
  }
}