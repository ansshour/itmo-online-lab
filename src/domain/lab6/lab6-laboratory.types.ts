import type { EquipmentKind, SensorKind } from '../../config/lab6/lab6.types';
import type { GridArea, GridPoint } from '../grid/grid.types';
import type { Lab6Measurements } from './lab6-measurements.types';

export type LaboratoryStage = 'assembly' | 'instruments' | 'running';

export type InstalledSensor = {
  slotId: string;
  kind: SensorKind;
};

export type EquipmentPlacement = GridArea & {
  id: string;
  kind: EquipmentKind;
  ordinal: number;
  sensors: InstalledSensor[];
};

export type PortReference = {
  equipmentId: string;
  portId: string;
};

export type ConnectionPlacement = {
  id: string;
  from: PortReference;
  to: PortReference;
  path: GridPoint[];
};

export type PaletteEntry = {
  kind: EquipmentKind | SensorKind;
  label: string;
  remaining: number;
  category: 'equipment' | 'sensor';
};

export type LaboratorySnapshot = {
  stage: LaboratoryStage;
  items: EquipmentPlacement[];
  connections: ConnectionPlacement[];
  measurements: Lab6Measurements | null;
  status: string;
  primaryLabel: string;
  palette: PaletteEntry[];
};

export type ValidationResult = {
  valid: boolean;
  message: string;
};

export type ConnectionFailureReason = 'stage' | 'self' | 'duplicate' | 'portBusy' | 'invalidTarget' | 'invalidRoute';

export type SensorInstallFailureReason = 'stage' | 'limit' | 'wrongPoint' | 'wrongSensorType' | 'occupied';

export type InteractionResult<TReason extends string> =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: TReason;
    };