export type EquipmentKind =
  | 'compressor'
  | 'receiver'
  | 'chamber'
  | 'nozzle'
  | 'valve'
  | 'flowmeter';

export type SensorKind = 'manometer' | 'temperatureSensor';

export type PortDefinition = {
  id: string;
  tileX: number;
  tileY: number;
};

export type SensorSlotDefinition = {
  id: string;
  kind: SensorKind;
  tileX: number;
  tileY: number;
};

export type EquipmentDefinition = {
  kind: EquipmentKind;
  label: string;
  maxCount: number;
  tileWidth: number;
  tileHeight: number;
  ports: PortDefinition[];
  sensorSlots: SensorSlotDefinition[];
};

export type SensorDefinition = {
  kind: SensorKind;
  label: string;
  maxCount: number;
};

export type Lab6Config = {
  gridTileSize: number;
  planeOffsetX: number;
  planeOffsetY: number;
  workspaceTilesWidth: number;
  workspaceTilesHeight: number;
  equipment: Record<EquipmentKind, EquipmentDefinition>;
  sensors: Record<SensorKind, SensorDefinition>;
  chain: EquipmentKind[];
};