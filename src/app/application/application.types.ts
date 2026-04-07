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

export type ValveDragSession = {
  equipmentId: string;
  pointerId: number;
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
  runtimePanel: HTMLDivElement;
  primaryButton: HTMLButtonElement;
  barometerValue: HTMLDivElement;
  stopwatchValue: HTMLDivElement;
  toastStack: HTMLDivElement;
  dragGhost: HTMLDivElement;
};