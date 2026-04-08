import type { EquipmentKind, SensorKind } from '../../config/lab6/lab6.types';
import type { GridPoint } from '../../domain/grid/grid.types';
import type { PaletteCategory } from '../../domain/lab6/lab6.laboratory.types';

export enum ToastKind {
  Success = 'success',
  Error = 'error',
}

export interface PaletteDragSession {
  kind: EquipmentKind | SensorKind;
  category: PaletteCategory;
  pageX: number;
  pageY: number;
}

export interface WorkspaceDragSession {
  equipmentId: string;
  offset: GridPoint;
}

export interface ValveDragSession {
  equipmentId: string;
  pointerId: number;
}

export interface ConnectionSession {
  equipmentId: string;
  portId: string;
}

export interface ToastMessage {
  id: number;
  kind: ToastKind;
  message: string;
  expiresAt: number;
}

export interface ApplicationElements {
  canvas: HTMLCanvasElement;
  sidebarHeader: HTMLHeadingElement;
  sidebarCaption: HTMLParagraphElement;
  sidebarList: HTMLDivElement;
  gasSelect: HTMLSelectElement;
  gasControl: HTMLLabelElement;
  gasHint: HTMLParagraphElement;
  captureButton: HTMLButtonElement;
  resultsPreview: HTMLDivElement;
  resultsPreviewButton: HTMLButtonElement;
  resultsPanel: HTMLDivElement;
  resultsModal: HTMLDivElement;
  resultsModalBackdrop: HTMLDivElement;
  resultsModalClose: HTMLButtonElement;
  modalResultsTabs: HTMLDivElement;
  modalResultsTable: HTMLDivElement;
  modalResultsChart: HTMLDivElement;
  primaryButton: HTMLButtonElement;
  workspaceMeta: HTMLDivElement;
  barometerValue: HTMLDivElement;
  toastStack: HTMLDivElement;
  dragGhost: HTMLDivElement;
}
