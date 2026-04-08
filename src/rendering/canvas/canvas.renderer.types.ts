import type { EquipmentKind, SensorKind } from '../../config/lab6/lab6.types';
import type { EquipmentPlacement, LaboratorySnapshot, PortReference } from '../../domain/lab6/lab6.laboratory.types';
import type { GridPoint } from '../../domain/grid/grid.types';

export interface PlacementPreview {
  kind: EquipmentKind;
  point: GridPoint;
  valid: boolean;
}

export interface SensorPreview {
  kind: SensorKind;
  point: GridPoint;
}

export interface ConnectionPreview {
  path: GridPoint[];
}

export interface RenderState {
  snapshot: LaboratorySnapshot;
  placementPreview: PlacementPreview | null;
  sensorPreview: SensorPreview | null;
  connectionPreview: ConnectionPreview | null;
  selectedItemId: string;
  selectedConnectionId: string;
  hoveredItem: EquipmentPlacement | null;
  hoveredPort: PortReference | null;
  connectionSource: PortReference | null;
  visiblePortEquipmentIds: string[];
}