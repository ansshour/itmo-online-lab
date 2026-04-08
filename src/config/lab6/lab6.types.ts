export enum EquipmentKind {
  Compressor = 'compressor',
  Receiver = 'receiver',
  Chamber = 'chamber',
  Nozzle = 'nozzle',
  Valve = 'valve',
  Flowmeter = 'flowmeter',
}

export enum SensorKind {
  Manometer = 'manometer',
  TemperatureSensor = 'temperatureSensor',
}

export interface PortDefinition {
  readonly id: string;
  readonly tileX: number;
  readonly tileY: number;
}

export interface SensorSlotDefinition {
  readonly id: string;
  readonly kind: SensorKind;
  readonly tileX: number;
  readonly tileY: number;
}

export interface EquipmentDefinition {
  readonly kind: EquipmentKind;
  readonly label: string;
  readonly maxCount: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly ports: readonly PortDefinition[];
  readonly sensorSlots: readonly SensorSlotDefinition[];
}

export interface SensorDefinition {
  readonly kind: SensorKind;
  readonly label: string;
  readonly maxCount: number;
}

export interface Lab6Config {
  readonly gridTileSize: number;
  readonly planeOffsetX: number;
  readonly planeOffsetY: number;
  readonly workspaceTilesWidth: number;
  readonly workspaceTilesHeight: number;
  readonly equipment: Record<EquipmentKind, EquipmentDefinition>;
  readonly sensors: Record<SensorKind, SensorDefinition>;
  readonly chain: readonly EquipmentKind[];
}