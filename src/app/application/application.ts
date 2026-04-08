import { APPLICATION_CLASS_NAMES, APPLICATION_LABELS, APPLICATION_TEXTS } from './application.consts';
import { ApplicationLatex } from './application.latex';
import { ApplicationResults } from './application.results';
import { ToastKind } from './application.types';
import type {
  ApplicationElements,
  ConnectionSession,
  PaletteDragSession,
  ToastMessage,
  ValveDragSession,
  WorkspaceDragSession,
} from './application.types';
import { LAB6_CONFIG } from '../../config/lab6/lab6.config';
import { GasModelKind } from '../../config/lab6/gases/lab6.gases.types';
import { EquipmentKind, SensorKind } from '../../config/lab6/lab6.types';
import type { GridPoint, PixelPoint } from '../../domain/grid/grid.types';
import { Lab6Laboratory } from '../../domain/lab6/lab6.laboratory';
import type { GasOption, LaboratorySnapshot } from '../../domain/lab6/lab6.laboratory.types';
import {
  ConnectionFailureReason,
  LaboratoryStage,
  PaletteCategory,
  SensorInstallFailureReason,
} from '../../domain/lab6/lab6.laboratory.types';
import { CanvasRenderer } from '../../rendering/canvas/canvas.renderer';
import type { ConnectionPreview, PlacementPreview, SensorPreview } from '../../rendering/canvas/canvas.renderer.types';

export class Application {
  private readonly rootElement: HTMLDivElement;

  private readonly laboratory: Lab6Laboratory;

  private readonly renderer: CanvasRenderer;

  private readonly latex: ApplicationLatex;

  private readonly results: ApplicationResults;

  private readonly elements: ApplicationElements;

  private paletteDrag: PaletteDragSession | null;

  private workspaceDrag: WorkspaceDragSession | null;

  private valveDrag: ValveDragSession | null;

  private connection: ConnectionSession | null;

  private placementPreview: PlacementPreview | null;

  private sensorPreview: SensorPreview | null;

  private connectionPreview: ConnectionPreview | null;

  private selectedItemId: string;

  private selectedConnectionId: string;

  private hoveredItemId: string;

  private hoveredPort: ConnectionSession | null;

  private toasts: ToastMessage[];

  private toastIdentifier: number;

  private readonly toastNodes: Map<number, HTMLDivElement>;

  private readonly leavingToastIds: Set<number>;

  private resultsModalOpen: boolean;

  private resultsModalGasFilterId: string | null;

  private renderedGasHint: string;

  private renderedResultsPreviewMarkup: string;

  private renderedResultsTabsMarkup: string;

  private renderedResultsTableMarkup: string;

  private renderedResultsChartMarkup: string;

  private domDirty: boolean;

  private canvasDirty: boolean;

  private frameScheduled: boolean;

  public constructor(rootElement: HTMLDivElement) {
    this.rootElement = rootElement;
    this.laboratory = new Lab6Laboratory();
    this.latex = new ApplicationLatex();
    this.results = new ApplicationResults(this.latex);
    this.rootElement.innerHTML = this.template(this.laboratory.snapshot());
    this.rootElement.className = APPLICATION_CLASS_NAMES.root;
    this.elements = this.resolve();
    this.renderer = new CanvasRenderer(this.elements.canvas, this.laboratory.getGrid());
    this.paletteDrag = null;
    this.workspaceDrag = null;
    this.valveDrag = null;
    this.connection = null;
    this.placementPreview = null;
    this.sensorPreview = null;
    this.connectionPreview = null;
    this.selectedItemId = '';
    this.selectedConnectionId = '';
    this.hoveredItemId = '';
    this.hoveredPort = null;
    this.toasts = [];
    this.toastIdentifier = 1;
    this.toastNodes = new Map();
    this.leavingToastIds = new Set();
    this.resultsModalOpen = false;
    this.resultsModalGasFilterId = null;
    this.renderedGasHint = '';
    this.renderedResultsPreviewMarkup = '';
    this.renderedResultsTabsMarkup = '';
    this.renderedResultsTableMarkup = '';
    this.renderedResultsChartMarkup = '';
    this.domDirty = true;
    this.canvasDirty = true;
    this.frameScheduled = false;
  }

  public start(): void {
    this.bind();
    this.refresh();
  }

  private bind(): void {
    this.bindPrimary();
    this.bindGasSelection();
    this.bindCaptureMeasurement();
    this.bindResultsModal();
    this.bindCanvas();
    this.bindWindow();
  }

  private bindPrimary(): void {
    this.elements.primaryButton.addEventListener('click', () => {
      const stage = this.laboratory.stageValue();
      const validation = this.laboratory.advance(performance.now());

      if (validation.valid) {
        this.notify(this.successToast(stage), ToastKind.Success);
      }

      this.refresh(true, true);
    });
  }

  private bindGasSelection(): void {
    this.elements.gasSelect.addEventListener('change', () => {
      this.laboratory.setGas(this.elements.gasSelect.value);
      this.refresh(true, true);
    });
  }

  private bindCaptureMeasurement(): void {
    this.elements.captureButton.addEventListener('click', () => {
      this.laboratory.captureMeasurement();
      this.refresh(true, true);
    });
  }

  private bindResultsModal(): void {
    this.elements.resultsPreviewButton.addEventListener('click', () => {
      this.resultsModalGasFilterId = null;
      this.resultsModalOpen = true;
      this.refresh(true, true);
    });

    this.elements.resultsModalClose.addEventListener('click', () => {
      this.resultsModalOpen = false;
      this.refresh(true, true);
    });

    this.elements.resultsModalBackdrop.addEventListener('click', () => {
      this.resultsModalOpen = false;
      this.refresh();
    });

    this.elements.modalResultsTabs.addEventListener('click', (event) => {
      const target = event.target;

      if (!(target instanceof HTMLElement)) {
        return;
      }

      const button = target.closest<HTMLButtonElement>('[data-gas-tab]');

      if (!button) {
        return;
      }

      const gasId = button.dataset.gasTab ?? '';
      this.resultsModalGasFilterId = gasId === '__all__' ? null : gasId;
      this.refresh(true, true);
    });
  }

  private bindCanvas(): void {
    this.elements.canvas.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }

      const point = this.gridPoint(event);
      const stage = this.laboratory.stageValue();

      if (stage === LaboratoryStage.Assembly) {
        const port = this.portAtEvent(event);

        if (port) {
          this.connection = port;
          this.hoveredPort = port;
          this.selectedItemId = port.equipmentId;
          this.selectedConnectionId = '';
          const origin = this.absolutePort(port.equipmentId, port.portId) ?? point;

          this.connectionPreview = {
            path: [origin],
          };

          this.refresh(false, true);

          return;
        }

        const item = this.laboratory.item(point);

        if (item) {
          this.workspaceDrag = {
            equipmentId: item.id,
            offset: {
              tileX: point.tileX - item.tileX,
              tileY: point.tileY - item.tileY,
            },
          };
          this.selectedItemId = item.id;
          this.selectedConnectionId = '';
          this.connectionPreview = null;
          this.refresh(false, true);

          return;
        }

        const connection = this.laboratory.connection(point);

        if (connection) {
          this.selectedConnectionId = connection.id;
          this.selectedItemId = '';
          this.connectionPreview = null;
          this.refresh(false, true);

          return;
        }
      }

      if (stage === LaboratoryStage.Running) {
        const item = this.laboratory.item(point);

        if (item?.kind === EquipmentKind.Valve) {
          const currentPosition = this.laboratory.snapshot().measurements?.valvePosition ?? 0;
          const nextPosition = (currentPosition + 1) % 11;

          this.laboratory.setValvePosition(nextPosition);
          this.selectedItemId = item.id;
          this.selectedConnectionId = '';
          this.connectionPreview = null;
          this.refresh(true, true);

          return;
        }
      }

      const shouldRefresh = this.selectedItemId !== '' || this.selectedConnectionId !== '' || this.connectionPreview !== null;

      this.selectedItemId = '';
      this.selectedConnectionId = '';
      this.connectionPreview = null;

      if (shouldRefresh) {
        this.refresh(false, true);
      }
    });

    this.elements.canvas.addEventListener('pointermove', (event) => {
      const point = this.gridPoint(event);
      const hovered = this.laboratory.item(point);
      const nextHoveredPort = this.laboratory.stageValue() === LaboratoryStage.Assembly ? this.portAtEvent(event) : null;
      const nextHoveredItemId = hovered?.id ?? nextHoveredPort?.equipmentId ?? '';
      let domChanged = !this.sameHoverPort(this.hoveredPort, nextHoveredPort) || this.hoveredItemId !== nextHoveredItemId;
      let canvasChanged = domChanged;

      this.hoveredPort = nextHoveredPort;
      this.hoveredItemId = nextHoveredItemId;

      if (this.workspaceDrag) {
        const target = {
          tileX: point.tileX - this.workspaceDrag.offset.tileX,
          tileY: point.tileY - this.workspaceDrag.offset.tileY,
        };

        const equipment = this.laboratory.snapshot().items.find((item) => item.id === this.workspaceDrag?.equipmentId);

        if (equipment) {
          const nextPlacementPreview = {
            kind: equipment.kind,
            point: target,
            valid: this.laboratory.canMove(equipment.id, target),
          };

          if (!this.samePlacementPreview(this.placementPreview, nextPlacementPreview)) {
            this.placementPreview = nextPlacementPreview;
            canvasChanged = true;
          }
        }
      }

      if (this.connection) {
        const from = this.connection;
        const origin = this.absolutePort(from.equipmentId, from.portId);
        const targetPort = nextHoveredPort && !this.samePort(from, nextHoveredPort) ? nextHoveredPort : null;

        if (origin) {
          const target = targetPort ? this.absolutePort(targetPort.equipmentId, targetPort.portId) ?? point : point;
          const path = targetPort
            ? this.laboratory.previewConnectionBetweenPorts(from.equipmentId, from.portId, targetPort.equipmentId, targetPort.portId)
            : this.laboratory.previewConnectionPath(origin, target);
          const nextConnectionPreview = {
            path: path.length > 0 ? path : [origin, target],
          };

          if (!this.sameConnectionPreview(this.connectionPreview, nextConnectionPreview)) {
            this.connectionPreview = nextConnectionPreview;
            canvasChanged = true;
          }
        }
      }

      if (domChanged || canvasChanged) {
        this.refresh(domChanged, canvasChanged);
      }
    });

    this.elements.canvas.addEventListener('pointerup', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }


      const point = this.gridPoint(event);
      const stage = this.laboratory.stageValue();

      if (this.workspaceDrag) {
        const target = {
          tileX: point.tileX - this.workspaceDrag.offset.tileX,
          tileY: point.tileY - this.workspaceDrag.offset.tileY,
        };

        this.laboratory.move(this.workspaceDrag.equipmentId, target);
      }

      if (stage === LaboratoryStage.Assembly && this.connection) {
        const targetPort = this.portAtEvent(event);

        if (!targetPort) {
          this.notify(APPLICATION_LABELS.connectionInvalidError, ToastKind.Error);
        } else {
          const result = this.laboratory.connect(
            this.connection.equipmentId,
            this.connection.portId,
            targetPort.equipmentId,
            targetPort.portId,
          );

          if (!result.ok) {
            this.notify(this.connectionToast(result.reason), ToastKind.Error);
          }
        }
      }

      this.workspaceDrag = null;
      this.connection = null;
      this.placementPreview = null;
      this.sensorPreview = null;
      this.connectionPreview = null;
      this.clearSelection();
      this.hoveredPort = stage === LaboratoryStage.Assembly ? this.portAtEvent(event) : null;
      this.refresh(true, true);
    });

    this.elements.canvas.addEventListener('pointerleave', () => {
      if (this.valveDrag) {
        return;
      }

      const domChanged = this.hoveredItemId !== '' || this.hoveredPort !== null;
      const canvasChanged = domChanged || (this.connection !== null && this.connectionPreview !== null);

      if (!canvasChanged) {
        return;
      }

      this.hoveredItemId = '';
      this.hoveredPort = null;

      if (this.connection) {
        this.connectionPreview = null;
      }

      this.refresh(domChanged, true);
    });
  }

  private bindWindow(): void {
    window.addEventListener('pointermove', (event) => {
      if (this.paletteDrag) {
        this.paletteDrag = {
          ...this.paletteDrag,
          pageX: event.pageX,
          pageY: event.pageY,
        };

        this.dragGhost();
        const previewChanged = this.previewFromPalette(event);

        if (previewChanged) {
          this.refresh(false, true);
        }
      }
    });

    window.addEventListener('keydown', (event) => {
      if (!this.isDeleteShortcut(event) || this.laboratory.stageValue() !== LaboratoryStage.Assembly) {
        return;
      }

      if (this.isEditableTarget(event.target)) {
        return;
      }

      if (this.selectedConnectionId) {
        this.laboratory.disconnect(this.selectedConnectionId);
        this.selectedConnectionId = '';
        this.connection = null;
        this.connectionPreview = null;
        event.preventDefault();
        this.refresh(true, true);

        return;
      }

      if (!this.selectedItemId) {
        return;
      }

      this.laboratory.remove(this.selectedItemId);
      this.selectedItemId = '';
      this.workspaceDrag = null;
      this.connection = null;
      this.connectionPreview = null;
      event.preventDefault();
      this.refresh(true, true);
    });

    window.addEventListener('pointerup', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }

      if (this.paletteDrag?.category === PaletteCategory.Equipment) {
        this.dropEquipment(event);
      }

      if (this.paletteDrag?.category === PaletteCategory.Sensor) {
        this.dropSensor(event);
      }

      this.paletteDrag = null;
      this.placementPreview = null;
      this.sensorPreview = null;
      this.clearSelection();
      this.elements.dragGhost.style.opacity = '0';
      this.refresh(true, true);
    });
  }

  private loop(): void {
    this.frameScheduled = false;

    const now = performance.now();
    const stateChanged = this.laboratory.tick(now);
    const toastsChanged = this.pruneToasts(now);

    if (stateChanged) {
      this.domDirty = true;
      this.canvasDirty = true;
    }

    if (toastsChanged) {
      this.domDirty = true;
    }

    if (!this.domDirty && !this.canvasDirty && !this.shouldAnimateCanvas()) {
      return;
    }

    const snapshot = this.laboratory.snapshot();

    if (this.domDirty) {
      this.renderDom(snapshot);
      this.domDirty = false;
    }

    if (this.canvasDirty || this.shouldAnimateCanvas()) {
      this.renderCanvas(snapshot);
      this.canvasDirty = false;
    }

    if (this.shouldKeepLooping()) {
      this.scheduleFrame();
    }
  }

  private refresh(domChanged = true, canvasChanged = true): void {
    this.domDirty = this.domDirty || domChanged;
    this.canvasDirty = this.canvasDirty || canvasChanged;

    if (!this.domDirty && !this.canvasDirty) {
      return;
    }

    this.scheduleFrame();
  }

  private renderDom(snapshot: ReturnType<Lab6Laboratory['snapshot']>): void {
    const running = snapshot.stage === LaboratoryStage.Running;
    const canAdvance = this.laboratory.canAdvance();
    const gasHintMarkup = this.gasHint(snapshot);

    this.elements.sidebarHeader.textContent = this.sidebarTitle(snapshot.stage);
    this.elements.sidebarCaption.textContent = this.sidebarHelper(snapshot.stage);
    this.elements.gasSelect.value = snapshot.selectedGasId;

    if (gasHintMarkup !== this.renderedGasHint) {
      this.elements.gasHint.innerHTML = gasHintMarkup;
      this.renderedGasHint = gasHintMarkup;
    }

    this.elements.gasControl.hidden = !running;
    this.elements.gasHint.hidden = !running;
    this.elements.primaryButton.textContent = snapshot.primaryLabel;
    this.elements.primaryButton.disabled = !running && !canAdvance.valid;
    this.elements.primaryButton.classList.toggle(APPLICATION_CLASS_NAMES.primaryButtonSecondary, running);
    this.elements.canvas.style.cursor = this.canvasCursor(snapshot);
    this.elements.barometerValue.textContent = snapshot.measurements
      ? `${snapshot.measurements.barometer.toFixed(0)} ${APPLICATION_TEXTS.barometerUnit}`
      : `0 ${APPLICATION_TEXTS.barometerUnit}`;
    this.elements.workspaceMeta.hidden = !running;
    this.elements.captureButton.hidden = !running;
    this.elements.sidebarList.hidden = running;
    this.elements.resultsPreview.hidden = !running;
    this.elements.resultsModal.hidden = !running || !this.resultsModalOpen;
    this.elements.resultsPreviewButton.disabled = snapshot.measurementRecords.length === 0;
    this.palette(snapshot);
    this.renderResultsPreview(snapshot);
    this.renderResultsModal(snapshot);
    this.renderToasts();
  }

  private renderCanvas(snapshot: ReturnType<Lab6Laboratory['snapshot']>): void {
    this.renderer.render({
      snapshot,
      placementPreview: this.placementPreview,
      sensorPreview: this.sensorPreview,
      connectionPreview: this.connectionPreview,
      selectedItemId: this.selectedItemId,
      selectedConnectionId: this.selectedConnectionId,
      hoveredItem: snapshot.items.find((item) => item.id === this.hoveredItemId) ?? null,
      hoveredPort: this.hoveredPort,
      connectionSource: this.connection,
      visiblePortEquipmentIds: this.visiblePortEquipmentIds(snapshot),
    });
  }

  private scheduleFrame(): void {
    if (this.frameScheduled) {
      return;
    }

    this.frameScheduled = true;
    window.requestAnimationFrame(() => this.loop());
  }

  private shouldAnimateCanvas(): boolean {
    return this.laboratory.stageValue() === LaboratoryStage.Running || this.connectionPreview !== null;
  }

  private shouldKeepLooping(): boolean {
    return this.shouldAnimateCanvas() || this.toasts.length > 0;
  }

  private palette(snapshot: ReturnType<Lab6Laboratory['snapshot']>): void {
    if (snapshot.stage === LaboratoryStage.Running) {
      if (this.elements.sidebarList.childElementCount > 0) {
        this.elements.sidebarList.innerHTML = '';
      }

      return;
    }

    this.elements.sidebarList.innerHTML = '';

    for (const entry of snapshot.palette) {
      const button = document.createElement('button');

      button.type = 'button';
      button.className = APPLICATION_CLASS_NAMES.paletteItem;
      button.disabled = entry.remaining <= 0;

      if (entry.remaining <= 0) {
        button.classList.add(APPLICATION_CLASS_NAMES.paletteItemDisabled);
      }

      button.innerHTML = `<strong>${entry.label}</strong><span>${entry.remaining} ${APPLICATION_TEXTS.sensorCount}</span>`;
      button.addEventListener('pointerdown', (event) => {
        this.clearSelection();
        this.connection = null;
        this.connectionPreview = null;
        this.workspaceDrag = null;
        this.valveDrag = null;
        this.paletteDrag = {
          kind: entry.kind,
          category: entry.category,
          pageX: event.pageX,
          pageY: event.pageY,
        };

        this.dragGhost();
      });
      this.elements.sidebarList.append(button);
    }
  }

  private previewFromPalette(event: PointerEvent): boolean {
    if (!this.paletteDrag) {
      return false;
    }

    const point = this.canvasPoint(event);

    if (!point) {
      const changed = this.placementPreview !== null || this.sensorPreview !== null;

      this.placementPreview = null;
      this.sensorPreview = null;

      return changed;
    }

    if (this.paletteDrag.category === PaletteCategory.Equipment) {
      const kind = this.paletteDrag.kind as EquipmentKind;
      const nextPlacementPreview = {
        kind,
        point,
        valid: this.laboratory.canPlace(kind, point),
      };
      const changed = !this.samePlacementPreview(this.placementPreview, nextPlacementPreview) || this.sensorPreview !== null;

      this.placementPreview = nextPlacementPreview;
      this.sensorPreview = null;

      return changed;
    }

    if (this.paletteDrag.category === PaletteCategory.Sensor) {
      const nextSensorPreview = {
        kind: this.paletteDrag.kind as SensorKind,
        point,
      };
      const changed = !this.sameSensorPreview(this.sensorPreview, nextSensorPreview) || this.placementPreview !== null;

      this.sensorPreview = nextSensorPreview;
      this.placementPreview = null;

      return changed;
    }

    return false;
  }

  private dropEquipment(event: PointerEvent): void {
    const point = this.canvasPoint(event);

    if (!point || !this.paletteDrag || this.paletteDrag.category !== PaletteCategory.Equipment) {
      return;
    }

    this.laboratory.create(this.paletteDrag.kind as EquipmentKind, point);
  }

  private dropSensor(event: PointerEvent): void {
    const point = this.canvasPoint(event);

    if (!point || !this.paletteDrag || this.paletteDrag.category !== PaletteCategory.Sensor) {
      return;
    }

    const slot = this.laboratory.sensor(point);

    if (!slot) {
      this.notify(APPLICATION_LABELS.sensorWrongPointError, ToastKind.Error);

      return;
    }

    const result = this.laboratory.install(this.paletteDrag.kind as SensorKind, slot.equipmentId, slot.slotId);

    if (!result.ok) {
      this.notify(this.sensorToast(result.reason), ToastKind.Error);
    }
  }

  private dragGhost(): void {
    if (!this.paletteDrag) {
      return;
    }

    this.elements.dragGhost.style.opacity = '1';
    this.elements.dragGhost.style.transform = `translate(${this.paletteDrag.pageX + 14}px, ${this.paletteDrag.pageY + 14}px)`;
    this.elements.dragGhost.textContent = this.label(this.paletteDrag.kind);
  }

  private resolve(): ApplicationElements {
    const canvas = this.rootElement.querySelector<HTMLCanvasElement>('[data-element="canvas"]');
    const sidebarHeader = this.rootElement.querySelector<HTMLHeadingElement>('[data-element="sidebar-header"]');
    const sidebarCaption = this.rootElement.querySelector<HTMLParagraphElement>('[data-element="sidebar-caption"]');
    const sidebarList = this.rootElement.querySelector<HTMLDivElement>('[data-element="sidebar-list"]');
    const gasSelect = this.rootElement.querySelector<HTMLSelectElement>('[data-element="gas-select"]');
    const gasControl = this.rootElement.querySelector<HTMLLabelElement>('[data-element="gas-control"]');
    const gasHint = this.rootElement.querySelector<HTMLParagraphElement>('[data-element="gas-hint"]');
    const captureButton = this.rootElement.querySelector<HTMLButtonElement>('[data-element="capture-button"]');
    const resultsPreview = this.rootElement.querySelector<HTMLDivElement>('[data-element="results-preview"]');
    const resultsPreviewButton = this.rootElement.querySelector<HTMLButtonElement>('[data-element="results-preview-button"]');
    const resultsPanel = this.rootElement.querySelector<HTMLDivElement>('[data-element="results-panel"]');
    const resultsModal = this.rootElement.querySelector<HTMLDivElement>('[data-element="results-modal"]');
    const resultsModalBackdrop = this.rootElement.querySelector<HTMLDivElement>('[data-element="results-modal-backdrop"]');
    const resultsModalClose = this.rootElement.querySelector<HTMLButtonElement>('[data-element="results-modal-close"]');
    const modalResultsTabs = this.rootElement.querySelector<HTMLDivElement>('[data-element="modal-results-tabs"]');
    const modalResultsTable = this.rootElement.querySelector<HTMLDivElement>('[data-element="modal-results-table"]');
    const modalResultsChart = this.rootElement.querySelector<HTMLDivElement>('[data-element="modal-results-chart"]');
    const primaryButton = this.rootElement.querySelector<HTMLButtonElement>('[data-element="primary-button"]');
    const workspaceMeta = this.rootElement.querySelector<HTMLDivElement>('[data-element="workspace-meta"]');
    const barometerValue = this.rootElement.querySelector<HTMLDivElement>('[data-element="barometer-value"]');
    const toastStack = this.rootElement.querySelector<HTMLDivElement>('[data-element="toast-stack"]');
    const dragGhost = this.rootElement.querySelector<HTMLDivElement>('[data-element="drag-ghost"]');

    if (
      !canvas ||
      !sidebarHeader ||
      !sidebarCaption ||
      !sidebarList ||
      !gasSelect ||
      !gasControl ||
      !gasHint ||
      !captureButton ||
      !resultsPreview ||
      !resultsPreviewButton ||
      !resultsPanel ||
      !resultsModal ||
      !resultsModalBackdrop ||
      !resultsModalClose ||
      !modalResultsTabs ||
      !modalResultsTable ||
      !modalResultsChart ||
      !primaryButton ||
      !workspaceMeta ||
      !barometerValue ||
      !toastStack ||
      !dragGhost
    ) {
      throw new Error('Application layout is incomplete.');
    }

    return {
      canvas,
      sidebarHeader,
      sidebarCaption,
      sidebarList,
      gasSelect,
      gasControl,
      gasHint,
      captureButton,
      resultsPreview,
      resultsPreviewButton,
      resultsPanel,
      resultsModal,
      resultsModalBackdrop,
      resultsModalClose,
      modalResultsTabs,
      modalResultsTable,
      modalResultsChart,
      primaryButton,
      workspaceMeta,
      barometerValue,
      toastStack,
      dragGhost,
    };
  }

  private template(snapshot: ReturnType<Lab6Laboratory['snapshot']>): string {
    return `
      <div class="${APPLICATION_CLASS_NAMES.frame}">
        <section class="${APPLICATION_CLASS_NAMES.workspace}">
          <div class="${APPLICATION_CLASS_NAMES.workspaceTitle}">${APPLICATION_LABELS.title}</div>
          <div class="${APPLICATION_CLASS_NAMES.workspaceMeta}" data-element="workspace-meta" hidden>
            <div class="${APPLICATION_CLASS_NAMES.workspaceMetaItem}">
              <div class="${APPLICATION_CLASS_NAMES.workspaceMetaLabel}">${APPLICATION_LABELS.barometer}</div>
              <div class="${APPLICATION_CLASS_NAMES.workspaceMetaValue}" data-element="barometer-value">0 ${APPLICATION_TEXTS.barometerUnit}</div>
            </div>
          </div>
          <div class="${APPLICATION_CLASS_NAMES.canvasShell}">
            <canvas data-element="canvas"></canvas>
          </div>
          <div class="${APPLICATION_CLASS_NAMES.workspaceControls}">
            <button class="${APPLICATION_CLASS_NAMES.primaryButton}" data-element="primary-button" type="button"></button>
          </div>
          <div class="${APPLICATION_CLASS_NAMES.workspaceActions}">
            <button class="${APPLICATION_CLASS_NAMES.secondaryButton}" data-element="capture-button" type="button" hidden>${APPLICATION_LABELS.captureMeasurement}</button>
          </div>
        </section>
        <aside class="${APPLICATION_CLASS_NAMES.sidebar}">
          <section class="${APPLICATION_CLASS_NAMES.sidebarMain}">
            <h2 class="${APPLICATION_CLASS_NAMES.panelTitle}" data-element="sidebar-header"></h2>
            <p class="${APPLICATION_CLASS_NAMES.panelCaption}" data-element="sidebar-caption"></p>
            <label class="${APPLICATION_CLASS_NAMES.gasControl}" data-element="gas-control">
              <span class="${APPLICATION_CLASS_NAMES.gasControlLabel}">${APPLICATION_LABELS.gasLabel}</span>
              <select class="${APPLICATION_CLASS_NAMES.gasSelect}" data-element="gas-select">
                ${this.gasSelectOptions(snapshot)}
              </select>
            </label>
            <p class="${APPLICATION_CLASS_NAMES.gasHint}" data-element="gas-hint"></p>
            <div class="${APPLICATION_CLASS_NAMES.sidebarList}" data-element="sidebar-list"></div>
          </section>
          <div class="${APPLICATION_CLASS_NAMES.resultsPreview}" data-element="results-preview" hidden>
            <div class="${APPLICATION_CLASS_NAMES.resultsPanel}" data-element="results-panel"></div>
            <div class="${APPLICATION_CLASS_NAMES.resultsPreviewActions}">
              <button class="${APPLICATION_CLASS_NAMES.resultsPreviewButton}" data-element="results-preview-button" type="button">${APPLICATION_LABELS.openResults}</button>
            </div>
          </div>
        </aside>
        <div class="${APPLICATION_CLASS_NAMES.modal}" data-element="results-modal" hidden>
          <div class="${APPLICATION_CLASS_NAMES.modalBackdrop}" data-element="results-modal-backdrop"></div>
          <div class="${APPLICATION_CLASS_NAMES.modalDialog}" role="dialog" aria-modal="true" aria-label="${APPLICATION_LABELS.resultsPanel}">
            <div class="${APPLICATION_CLASS_NAMES.modalHeader}">
              <h2 class="${APPLICATION_CLASS_NAMES.panelTitle}">${APPLICATION_LABELS.resultsPanel}</h2>
              <button class="${APPLICATION_CLASS_NAMES.modalClose}" data-element="results-modal-close" type="button">${APPLICATION_LABELS.closeResults}</button>
            </div>
            <div class="${APPLICATION_CLASS_NAMES.modalBody}">
              <div class="${APPLICATION_CLASS_NAMES.modalTabs}" data-element="modal-results-tabs"></div>
              <section class="${APPLICATION_CLASS_NAMES.resultsSection}">
                <h3 class="${APPLICATION_CLASS_NAMES.panelTitle}">${APPLICATION_LABELS.measurementsTable}</h3>
                <div class="${APPLICATION_CLASS_NAMES.resultsTable}" data-element="modal-results-table"></div>
              </section>
              <section class="${APPLICATION_CLASS_NAMES.resultsSection}">
                <h3 class="${APPLICATION_CLASS_NAMES.panelTitle}">${this.results.velocityChartTitle()}</h3>
                <div class="${APPLICATION_CLASS_NAMES.chart}" data-element="modal-results-chart"></div>
              </section>
            </div>
          </div>
        </div>
        <div class="${APPLICATION_CLASS_NAMES.toastStack}" data-element="toast-stack"></div>
        <div class="${APPLICATION_CLASS_NAMES.dragGhost}" data-element="drag-ghost"></div>
      </div>
    `;
  }

  private successToast(stage: ReturnType<Lab6Laboratory['stageValue']>): string {
    if (stage === LaboratoryStage.Assembly) {
      return APPLICATION_LABELS.assemblyConfirmedToast;
    }

    if (stage === LaboratoryStage.Instruments) {
      return APPLICATION_LABELS.runningStartedToast;
    }

    return APPLICATION_LABELS.runningStoppedToast;
  }

  private connectionToast(reason: ConnectionFailureReason): string {
    if (reason === ConnectionFailureReason.Self) {
      return APPLICATION_LABELS.connectionSelfError;
    }

    if (reason === ConnectionFailureReason.Duplicate) {
      return APPLICATION_LABELS.connectionDuplicateError;
    }

    if (reason === ConnectionFailureReason.PortBusy) {
      return APPLICATION_LABELS.connectionBusyError;
    }

    if (reason === ConnectionFailureReason.InvalidTarget) {
      return APPLICATION_LABELS.connectionInvalidError;
    }

    return APPLICATION_LABELS.connectionInvalidError;
  }

  private sensorToast(reason: SensorInstallFailureReason): string {
    if (reason === SensorInstallFailureReason.Occupied) {
      return APPLICATION_LABELS.sensorOccupiedError;
    }

    if (reason === SensorInstallFailureReason.WrongSensorType) {
      return APPLICATION_LABELS.sensorWrongTypeError;
    }

    return APPLICATION_LABELS.sensorWrongPointError;
  }

  private sidebarHelper(stage: ReturnType<Lab6Laboratory['stageValue']>): string {
    if (stage === LaboratoryStage.Assembly) {
      return APPLICATION_LABELS.assemblyHelper;
    }

    if (stage === LaboratoryStage.Instruments) {
      return APPLICATION_LABELS.instrumentsHelper;
    }

    return APPLICATION_LABELS.runningHelper;
  }

  private notify(message: string, kind: ToastKind): void {
    this.toasts = [
      ...this.toasts,
      {
        id: this.toastIdentifier,
        kind,
        message,
        expiresAt: performance.now() + 4000,
      },
    ];
    this.toastIdentifier += 1;
  }

  private pruneToasts(now: number): boolean {
    const nextToasts = this.toasts.filter((toast) => toast.expiresAt > now);
    const changed = nextToasts.length !== this.toasts.length;

    this.toasts = nextToasts;

    return changed;
  }

  private renderToasts(): void {
    const activeIds = new Set(this.toasts.map((toast) => toast.id));

    for (const [toastId, node] of this.toastNodes) {
      if (activeIds.has(toastId) || this.leavingToastIds.has(toastId)) {
        continue;
      }

      this.leavingToastIds.add(toastId);
      node.classList.add('application__toast--leaving');
      window.setTimeout(() => {
        node.remove();
        this.toastNodes.delete(toastId);
        this.leavingToastIds.delete(toastId);
      }, 220);
    }

    for (const toast of this.toasts) {
      let node = this.toastNodes.get(toast.id);

      if (!node) {
        node = document.createElement('div');
        node.className = `${APPLICATION_CLASS_NAMES.toast} application__toast--entering ${toast.kind === ToastKind.Error ? APPLICATION_CLASS_NAMES.toastError : APPLICATION_CLASS_NAMES.toastSuccess}`;
        node.textContent = toast.message;
        node.dataset.toastId = toast.id.toString();
        this.toastNodes.set(toast.id, node);
        this.elements.toastStack.append(node);
        window.requestAnimationFrame(() => {
          node?.classList.remove('application__toast--entering');
        });

        continue;
      }

      node.textContent = toast.message;

      if (this.elements.toastStack.children[this.toasts.indexOf(toast)] !== node) {
        this.elements.toastStack.insertBefore(node, this.elements.toastStack.children[this.toasts.indexOf(toast)] ?? null);
      }
    }
  }

  private renderResultsPreview(snapshot: ReturnType<Lab6Laboratory['snapshot']>): void {
    const activeGasRecords = this.recordsByGas(snapshot.measurementRecords, snapshot.selectedGasId);
    const activeGasOption = this.activeGasOption(snapshot);
    const markup = this.results.preview({
      records: activeGasRecords,
      gasLabel: activeGasOption?.label ?? snapshot.selectedGasId,
      hasOtherMeasurements: snapshot.measurementRecords.length > activeGasRecords.length,
    });

    if (markup === this.renderedResultsPreviewMarkup) {
      return;
    }

    this.elements.resultsPanel.innerHTML = markup;
    this.renderedResultsPreviewMarkup = markup;
  }

  private renderResultsModal(snapshot: ReturnType<Lab6Laboratory['snapshot']>): void {
    const availableTabs = this.modalTabs(snapshot);
    const activeFilter = this.normalizeModalFilter(availableTabs);
    const tabsMarkup = this.renderModalTabsMarkup(availableTabs, activeFilter);
    const records = activeFilter === null
      ? snapshot.measurementRecords
      : this.recordsByGas(snapshot.measurementRecords, activeFilter);
    const tableMarkup = this.results.table(records);
    const chartMarkup = this.results.chart(records, false);

    if (tabsMarkup !== this.renderedResultsTabsMarkup) {
      this.elements.modalResultsTabs.innerHTML = tabsMarkup;
      this.renderedResultsTabsMarkup = tabsMarkup;
    }

    if (tableMarkup !== this.renderedResultsTableMarkup) {
      this.elements.modalResultsTable.innerHTML = tableMarkup;
      this.renderedResultsTableMarkup = tableMarkup;
    }

    if (chartMarkup !== this.renderedResultsChartMarkup) {
      this.elements.modalResultsChart.innerHTML = chartMarkup;
      this.renderedResultsChartMarkup = chartMarkup;
    }
  }

  private recordsByGas(records: readonly import('../../domain/lab6/lab6.measurements.types').Lab6MeasurementRecord[], gasId: string) {
    return records.filter((record) => record.gasId === gasId);
  }

  private activeGasOption(snapshot: LaboratorySnapshot): GasOption | undefined {
    return snapshot.gasOptions.find((option) => option.id === snapshot.selectedGasId);
  }

  private modalTabs(snapshot: LaboratorySnapshot): readonly GasOption[] {
    const measuredGasIds = new Set(snapshot.measurementRecords.map((record) => record.gasId));

    return snapshot.gasOptions.filter((option) => measuredGasIds.has(option.id));
  }

  private normalizeModalFilter(availableTabs: readonly GasOption[]): string | null {
    if (this.resultsModalGasFilterId === null) {
      return null;
    }

    if (availableTabs.some((option) => option.id === this.resultsModalGasFilterId)) {
      return this.resultsModalGasFilterId;
    }

    this.resultsModalGasFilterId = null;

    return null;
  }

  private renderModalTabsMarkup(availableTabs: readonly GasOption[], activeFilter: string | null): string {
    const allTab = `
      <button
        class="${APPLICATION_CLASS_NAMES.modalTab} ${activeFilter === null ? APPLICATION_CLASS_NAMES.modalTabActive : ''}"
        type="button"
        data-gas-tab="__all__"
        aria-pressed="${activeFilter === null}"
      >
        ${APPLICATION_LABELS.modalScopeAll}
      </button>
    `;
    const gasTabs = availableTabs
      .map((option) => `
        <button
          class="${APPLICATION_CLASS_NAMES.modalTab} ${activeFilter === option.id ? APPLICATION_CLASS_NAMES.modalTabActive : ''}"
          type="button"
          data-gas-tab="${option.id}"
          aria-pressed="${activeFilter === option.id}"
        >
          ${option.label}
        </button>
      `)
      .join('');

    return `${allTab}${gasTabs}`;
  }

  private sidebarTitle(stage: ReturnType<Lab6Laboratory['stageValue']>): string {
    if (stage === LaboratoryStage.Assembly) {
      return APPLICATION_LABELS.equipmentPanel;
    }

    if (stage === LaboratoryStage.Instruments) {
      return APPLICATION_LABELS.sensorsPanel;
    }

    return APPLICATION_LABELS.runtimePanel;
  }

  private gasSelectOptions(snapshot: ReturnType<Lab6Laboratory['snapshot']>): string {
    return snapshot.gasOptions
      .map((gas) => `<option value="${gas.id}">${gas.label}</option>`)
      .join('');
  }

  private gasHint(snapshot: ReturnType<Lab6Laboratory['snapshot']>): string {
    const gas = snapshot.gasOptions.find((entry) => entry.id === snapshot.selectedGasId);

    if (!gas) {
      return '';
    }

    if (gas.model === GasModelKind.Ideal) {
      return `Расчёт без поправки на сжимаемость: ${this.latex.inline(String.raw`Z = 1`)}.`;
    }

    return `Для реального газа учитывается коэффициент сжимаемости ${this.latex.inline(String.raw`Z`)} по уравнению Пенга–Робинсона.`;
  }

  private label(kind: EquipmentKind | SensorKind): string {

    if (kind in LAB6_CONFIG.equipment) {
      return LAB6_CONFIG.equipment[kind as EquipmentKind].label;
    }

    return LAB6_CONFIG.sensors[kind as SensorKind].label;
  }

  private gridPoint(event: PointerEvent): GridPoint {
    const point = this.relative(event);

    return this.laboratory.getGrid().snap(point);
  }


  private canvasPoint(event: PointerEvent): GridPoint | null {
    const point = this.relative(event);
    const gridPoint = this.laboratory.getGrid().snap(point);

    if (!this.laboratory.getGrid().inside(gridPoint)) {
      return null;
    }

    return gridPoint;
  }

  private relative(event: PointerEvent): PixelPoint {
    const rect = this.elements.canvas.getBoundingClientRect();
    const scaleX = this.laboratory.getGrid().widthPixels() / rect.width;
    const scaleY = this.laboratory.getGrid().heightPixels() / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  private absolutePort(equipmentId: string, portId: string): GridPoint | null {
    const item = this.laboratory.snapshot().items.find((entry) => entry.id === equipmentId);

    if (!item) {
      return null;
    }

    const definition = LAB6_CONFIG.equipment[item.kind];
    const port = definition.ports.find((entry) => entry.id === portId);

    if (!port) {
      return null;
    }

    return {
      tileX: item.tileX + port.tileX,
      tileY: item.tileY + port.tileY,
    };
  }

  private portAtEvent(event: PointerEvent): { equipmentId: string; portId: string } | null {
    const cursor = this.relative(event);
    const tileSize = this.laboratory.getGrid().getTileSize();
    const radius = Math.max(tileSize * 0.9, 12);
    let nearest: { equipmentId: string; portId: string; distance: number } | null = null;

    for (const item of this.laboratory.snapshot().items) {
      const definition = LAB6_CONFIG.equipment[item.kind];

      for (const port of definition.ports) {
        const absolute = this.laboratory.getGrid().point({
          tileX: item.tileX + port.tileX,
          tileY: item.tileY + port.tileY,
        });
        const distance = Math.hypot(cursor.x - absolute.x, cursor.y - absolute.y);

        if (distance > radius) {
          continue;
        }

        if (!nearest || distance < nearest.distance) {
          nearest = {
            equipmentId: item.id,
            portId: port.id,
            distance,
          };
        }
      }
    }

    if (!nearest) {
      return null;
    }

    return {
      equipmentId: nearest.equipmentId,
      portId: nearest.portId,
    };
  }

  private visiblePortEquipmentIds(snapshot: ReturnType<Lab6Laboratory['snapshot']>): string[] {
    if (snapshot.stage !== LaboratoryStage.Assembly) {
      return [];
    }

    if (this.connection) {
      return snapshot.items.map((item) => item.id);
    }

    const visible = new Set<string>();

    if (this.hoveredItemId) {
      visible.add(this.hoveredItemId);
    }

    if (this.selectedItemId) {
      visible.add(this.selectedItemId);
    }

    if (this.hoveredPort) {
      visible.add(this.hoveredPort.equipmentId);
    }

    return [...visible];
  }

  private canvasCursor(snapshot: ReturnType<Lab6Laboratory['snapshot']>): string {
    if (this.valveDrag) {
      return 'grabbing';
    }

    const hovered = snapshot.items.find((item) => item.id === this.hoveredItemId) ?? null;

    if (snapshot.stage === LaboratoryStage.Running && hovered?.kind === EquipmentKind.Valve) {
      return 'grab';
    }

    return 'default';
  }

  private clearSelection(): void {
    this.selectedItemId = '';
    this.selectedConnectionId = '';
  }

  private samePlacementPreview(left: PlacementPreview | null, right: PlacementPreview | null): boolean {
    if (left === right) {
      return true;
    }

    if (!left || !right) {
      return false;
    }

    return left.kind === right.kind
      && left.valid === right.valid
      && left.point.tileX === right.point.tileX
      && left.point.tileY === right.point.tileY;
  }

  private sameSensorPreview(left: SensorPreview | null, right: SensorPreview | null): boolean {
    if (left === right) {
      return true;
    }

    if (!left || !right) {
      return false;
    }

    return left.kind === right.kind
      && left.point.tileX === right.point.tileX
      && left.point.tileY === right.point.tileY;
  }

  private sameConnectionPreview(left: ConnectionPreview | null, right: ConnectionPreview | null): boolean {
    if (left === right) {
      return true;
    }

    if (!left || !right || left.path.length !== right.path.length) {
      return false;
    }

    return left.path.every(
      (point, index) => point.tileX === right.path[index]?.tileX && point.tileY === right.path[index]?.tileY,
    );
  }

  private sameHoverPort(left: ConnectionSession | null, right: ConnectionSession | null): boolean {
    if (left === right) {
      return true;
    }

    if (!left || !right) {
      return false;
    }

    return this.samePort(left, right);
  }

  private samePort(left: ConnectionSession, right: ConnectionSession): boolean {
    return left.equipmentId === right.equipmentId && left.portId === right.portId;
  }

  private isDeleteShortcut(event: KeyboardEvent): boolean {
    return event.key === 'Delete' || event.key === 'Backspace';
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  }

}
