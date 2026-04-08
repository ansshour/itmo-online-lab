import type { EquipmentKind, SensorKind } from '../../config/lab6/lab6.types';
import type { GasModelKind } from '../../config/lab6/gases/lab6.gases.types';
import type { GridArea, GridPoint } from '../grid/grid.types';
import type { Lab6Measurements } from './lab6.measurements.types';

export enum LaboratoryStage {
  Assembly = 'assembly',
  Instruments = 'instruments',
  Running = 'running',
}

export enum PaletteCategory {
  Equipment = 'equipment',
  Sensor = 'sensor',
}

export interface InstalledSensor {
  readonly slotId: string;
  readonly kind: SensorKind;
}

export interface EquipmentPlacement extends GridArea {
  readonly id: string;
  readonly kind: EquipmentKind;
  readonly ordinal: number;
  readonly sensors: readonly InstalledSensor[];
}

export interface PortReference {
  readonly equipmentId: string;
  readonly portId: string;
}

export interface ConnectionPlacement {
  readonly id: string;
  readonly from: PortReference;
  readonly to: PortReference;
  readonly path: readonly GridPoint[];
}

export interface PaletteEntry {
  readonly kind: EquipmentKind | SensorKind;
  readonly label: string;
  readonly remaining: number;
  readonly category: PaletteCategory;
}

export interface GasOption {
  readonly id: string;
  readonly label: string;
  readonly model: GasModelKind;
}

export interface LaboratorySnapshot {
  readonly stage: LaboratoryStage;
  readonly items: readonly EquipmentPlacement[];
  readonly connections: readonly ConnectionPlacement[];
  readonly measurements: Lab6Measurements | null;
  readonly measurementRecords: readonly import('./lab6.measurements.types').Lab6MeasurementRecord[];
  readonly selectedGasId: string;
  readonly gasOptions: readonly GasOption[];
  readonly status: string;
  readonly primaryLabel: string;
  readonly palette: readonly PaletteEntry[];
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly message: string;
}

export enum RouteDirection {
  Up = 'up',
  Right = 'right',
  Down = 'down',
  Left = 'left',
}

export interface RouteState {
  readonly point: GridPoint;
  readonly direction: RouteDirection | null;
  readonly cost: number;
  readonly score: number;
  readonly previous: string | null;
}

export enum ConnectionFailureReason {
  Stage = 'stage',
  Self = 'self',
  Duplicate = 'duplicate',
  PortBusy = 'portBusy',
  InvalidTarget = 'invalidTarget',
  InvalidRoute = 'invalidRoute',
}

export enum SensorInstallFailureReason {
  Stage = 'stage',
  Limit = 'limit',
  WrongPoint = 'wrongPoint',
  WrongSensorType = 'wrongSensorType',
  Occupied = 'occupied',
}

export type InteractionResult<TReason extends string> =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: TReason;
    };
