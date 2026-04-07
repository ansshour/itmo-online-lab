import type { EquipmentKind, SensorKind } from '../../config/lab6/lab6.types';
import type { GridPoint } from '../../domain/grid/grid.types';

export type PaletteDragSession = {
  kind: EquipmentKind | SensorKind;
  category: 'equipment' | 'sensor';
  pageX: number;
  pageY: number;
};

export type WorkspaceDragSession = {
  equipmentId: string;
  offset: GridPoint;
};

export type ConnectionSession = {
  equipmentId: string;
  portId: string;
};

export type ApplicationElements = {
  canvas: HTMLCanvasElement;
  sidebarHeader: HTMLHeadingElement;
  sidebarCaption: HTMLParagraphElement;
  sidebarList: HTMLDivElement;
  status: HTMLParagraphElement;
  primaryButton: HTMLButtonElement;
  barometerValue: HTMLDivElement;
  stopwatchValue: HTMLDivElement;
  valveControls: HTMLDivElement;
  valveOpenButton: HTMLButtonElement;
  valveCloseButton: HTMLButtonElement;
  dragGhost: HTMLDivElement;
};