import type { EquipmentKind, SensorKind } from '../../config/lab6/lab6.types';
import type { EquipmentPlacement, LaboratorySnapshot, PortReference } from '../../domain/lab6/lab6-laboratory.types';
import type { GridPoint } from '../../domain/grid/grid.types';

export type PlacementPreview = {
  kind: EquipmentKind;
  point: GridPoint;
  valid: boolean;
};

export type SensorPreview = {
  kind: SensorKind;
  point: GridPoint;
};

export type ConnectionPreview = {
  path: GridPoint[];
};

export type RenderState = {
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
};