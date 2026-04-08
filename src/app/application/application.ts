import { APPLICATION_CLASS_NAMES, APPLICATION_LABELS, APPLICATION_TEXTS } from './application.consts';
import type {
  ApplicationElements,
  ConnectionSession,
  PaletteDragSession,
  ValveDragSession,
  WorkspaceDragSession,
} from './application.types';
import { LAB6_CONFIG } from '../../config/lab6/lab6.config';
import type { EquipmentKind, SensorKind } from '../../config/lab6/lab6.types';
import type { GridPoint, PixelPoint } from '../../domain/grid/grid.types';
import { LAB6_GASES } from '../../domain/lab6/lab6-gases';
import { Lab6Laboratory } from '../../domain/lab6/lab6-laboratory';
import type { ConnectionFailureReason, SensorInstallFailureReason } from '../../domain/lab6/lab6-laboratory.types';
import { CanvasRenderer } from '../../rendering/canvas/canvas-renderer';
import type { ConnectionPreview, PlacementPreview, SensorPreview } from '../../rendering/canvas/canvas-renderer.types';

type ToastKind = 'success' | 'error';

type ToastMessage = {
  id: number;
  kind: ToastKind;
  message: string;
  expiresAt: number;
};

export class Application {
  private readonly rootElement: HTMLDivElement;

  private readonly laboratory: Lab6Laboratory;

  private readonly renderer: CanvasRenderer;

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

  public constructor(rootElement: HTMLDivElement) {
    this.rootElement = rootElement;
    this.rootElement.innerHTML = this.template();
    this.rootElement.className = APPLICATION_CLASS_NAMES.root;
    this.laboratory = new Lab6Laboratory();
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
  }

  public start(): void {
    this.bind();
    this.refresh();
    this.loop();
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
        this.notify(this.successToast(stage), 'success');
      }

      this.refresh();
    });
  }

  private bindGasSelection(): void {
    this.elements.gasSelect.addEventListener('change', () => {
      this.laboratory.setGas(this.elements.gasSelect.value);
      this.refresh();
    });
  }

  private bindCaptureMeasurement(): void {
    this.elements.captureButton.addEventListener('click', () => {
      this.laboratory.captureMeasurement();
      this.refresh();
    });
  }

  private bindResultsModal(): void {
    this.elements.resultsPreviewButton.addEventListener('click', () => {
      this.resultsModalOpen = true;
      this.refresh();
    });

    this.elements.resultsModalClose.addEventListener('click', () => {
      this.resultsModalOpen = false;
      this.refresh();
    });

    this.elements.resultsModalBackdrop.addEventListener('click', () => {
      this.resultsModalOpen = false;
      this.refresh();
    });
  }

  private bindCanvas(): void {
    this.elements.canvas.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }

      const point = this.gridPoint(event);
      const stage = this.laboratory.stageValue();

      if (stage === 'assembly') {
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

          this.refresh();

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
          this.refresh();

          return;
        }

        const connection = this.laboratory.connection(point);

        if (connection) {
          this.selectedConnectionId = connection.id;
          this.selectedItemId = '';
          this.connectionPreview = null;
          this.refresh();

          return;
        }
      }

      if (stage === 'running') {
        const item = this.laboratory.item(point);

        if (item?.kind === 'valve') {
          const currentPosition = this.laboratory.snapshot().measurements?.valvePosition ?? 0;
          const nextPosition = (currentPosition + 1) % 11;

          this.laboratory.setValvePosition(nextPosition);
          this.selectedItemId = item.id;
          this.selectedConnectionId = '';
          this.connectionPreview = null;
          this.refresh();

          return;
        }
      }

      this.selectedItemId = '';
      this.selectedConnectionId = '';
      this.connectionPreview = null;
      this.refresh();
    });

    this.elements.canvas.addEventListener('pointermove', (event) => {

      const point = this.gridPoint(event);
      const hovered = this.laboratory.item(point);
      const hoveredPort = this.laboratory.stageValue() === 'assembly' ? this.portAtEvent(event) : null;

      this.hoveredPort = hoveredPort;
      this.hoveredItemId = hovered?.id ?? hoveredPort?.equipmentId ?? '';

      if (this.workspaceDrag) {
        const target = {
          tileX: point.tileX - this.workspaceDrag.offset.tileX,
          tileY: point.tileY - this.workspaceDrag.offset.tileY,
        };

        const equipment = this.laboratory.snapshot().items.find((item) => item.id === this.workspaceDrag?.equipmentId);

        if (equipment) {
          this.placementPreview = {
            kind: equipment.kind,
            point: target,
            valid: this.laboratory.canMove(equipment.id, target),
          };
        }
      }

      if (this.connection) {
        const from = this.connection;
        const origin = this.absolutePort(from.equipmentId, from.portId);
        const targetPort = hoveredPort && !this.samePort(from, hoveredPort) ? hoveredPort : null;

        if (origin) {
          const target = targetPort ? this.absolutePort(targetPort.equipmentId, targetPort.portId) ?? point : point;
          const path = targetPort
            ? this.laboratory.previewConnectionBetweenPorts(from.equipmentId, from.portId, targetPort.equipmentId, targetPort.portId)
            : this.laboratory.previewConnectionPath(origin, target);

          this.connectionPreview = {
            path: path.length > 0 ? path : [origin, target],
          };
        }
      }

      this.refresh();
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

      if (stage === 'assembly' && this.connection) {
        const targetPort = this.portAtEvent(event);

        if (!targetPort) {
          this.notify(APPLICATION_LABELS.connectionInvalidError, 'error');
        } else {
          const result = this.laboratory.connect(
            this.connection.equipmentId,
            this.connection.portId,
            targetPort.equipmentId,
            targetPort.portId,
          );

          if (!result.ok) {
            this.notify(this.connectionToast(result.reason), 'error');
          }
        }
      }

      this.workspaceDrag = null;
      this.connection = null;
      this.placementPreview = null;
      this.sensorPreview = null;
      this.connectionPreview = null;
      this.clearSelection();
      this.hoveredPort = stage === 'assembly' ? this.portAtEvent(event) : null;
      this.refresh();
    });

    this.elements.canvas.addEventListener('pointerleave', () => {
      if (this.valveDrag) {
        return;
      }

      this.hoveredItemId = '';
      this.hoveredPort = null;

      if (this.connection) {
        this.connectionPreview = null;
      }

      this.refresh();
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
        this.previewFromPalette(event);
      }

      this.refresh();
    });

    window.addEventListener('keydown', (event) => {
      if (!this.isDeleteShortcut(event) || this.laboratory.stageValue() !== 'assembly') {
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
        this.refresh();

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
      this.refresh();
    });

    window.addEventListener('pointerup', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }

      if (this.paletteDrag?.category === 'equipment') {
        this.dropEquipment(event);
      }

      if (this.paletteDrag?.category === 'sensor') {
        this.dropSensor(event);
      }

      this.paletteDrag = null;
      this.placementPreview = null;
      this.sensorPreview = null;
      this.clearSelection();
      this.elements.dragGhost.style.opacity = '0';
      this.refresh();
    });
  }

  private loop(): void {
    const now = performance.now();

    this.laboratory.tick(now);
    this.pruneToasts(now);
    this.refresh();
    window.requestAnimationFrame(() => this.loop());
  }

  private refresh(): void {
    const snapshot = this.laboratory.snapshot();
    const running = snapshot.stage === 'running';
    const canAdvance = this.laboratory.canAdvance();

    this.elements.sidebarHeader.textContent = this.sidebarTitle(snapshot.stage);
    this.elements.sidebarCaption.textContent = this.sidebarHelper(snapshot.stage);
    this.elements.gasSelect.value = snapshot.selectedGasId;
    this.elements.gasHint.textContent = this.gasHint(snapshot);
    this.elements.primaryButton.textContent = snapshot.primaryLabel;
    this.elements.primaryButton.disabled = !running && !canAdvance.valid;
    this.elements.primaryButton.classList.toggle(APPLICATION_CLASS_NAMES.primaryButtonSecondary, running);
    this.elements.canvas.style.cursor = this.canvasCursor(snapshot);
    this.elements.barometerValue.textContent = snapshot.measurements
      ? `${snapshot.measurements.barometer.toFixed(0)} ${APPLICATION_TEXTS.barometerUnit}`
      : `0 ${APPLICATION_TEXTS.barometerUnit}`;
    this.elements.runtimePanel.hidden = !running;
    this.elements.sidebarList.hidden = running;
    this.elements.resultsPreview.hidden = !running;
    this.elements.resultsModal.hidden = !running || !this.resultsModalOpen;
    this.palette(snapshot);
    this.renderResultsPreview(snapshot);
    this.renderResultsModal(snapshot);
    this.renderToasts();
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

  private palette(snapshot: ReturnType<Lab6Laboratory['snapshot']>): void {
    if (snapshot.stage === 'running') {
      this.elements.sidebarList.innerHTML = '';

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

  private previewFromPalette(event: PointerEvent): void {
    if (!this.paletteDrag) {
      return;
    }

    const point = this.canvasPoint(event);

    if (!point) {
      this.placementPreview = null;
      this.sensorPreview = null;

      return;
    }

    if (this.paletteDrag.category === 'equipment') {
      const kind = this.paletteDrag.kind as EquipmentKind;

      this.placementPreview = {
        kind,
        point,
        valid: this.laboratory.canPlace(kind, point),
      };
    }

    if (this.paletteDrag.category === 'sensor') {
      this.sensorPreview = {
        kind: this.paletteDrag.kind as SensorKind,
        point,
      };
    }
  }

  private dropEquipment(event: PointerEvent): void {
    const point = this.canvasPoint(event);

    if (!point || !this.paletteDrag || this.paletteDrag.category !== 'equipment') {
      return;
    }

    this.laboratory.create(this.paletteDrag.kind as EquipmentKind, point);
  }

  private dropSensor(event: PointerEvent): void {
    const point = this.canvasPoint(event);

    if (!point || !this.paletteDrag || this.paletteDrag.category !== 'sensor') {
      return;
    }

    const slot = this.laboratory.sensor(point);

    if (!slot) {
      this.notify(APPLICATION_LABELS.sensorWrongPointError, 'error');

      return;
    }

    const result = this.laboratory.install(this.paletteDrag.kind as SensorKind, slot.equipmentId, slot.slotId);

    if (!result.ok) {
      this.notify(this.sensorToast(result.reason), 'error');
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
    const gasHint = this.rootElement.querySelector<HTMLParagraphElement>('[data-element="gas-hint"]');
    const runtimePanel = this.rootElement.querySelector<HTMLDivElement>('[data-element="runtime-panel"]');
    const captureButton = this.rootElement.querySelector<HTMLButtonElement>('[data-element="capture-button"]');
    const resultsPreview = this.rootElement.querySelector<HTMLDivElement>('[data-element="results-preview"]');
    const resultsPreviewButton = this.rootElement.querySelector<HTMLButtonElement>('[data-element="results-preview-button"]');
    const resultsPanel = this.rootElement.querySelector<HTMLDivElement>('[data-element="results-panel"]');
    const resultsModal = this.rootElement.querySelector<HTMLDivElement>('[data-element="results-modal"]');
    const resultsModalBackdrop = this.rootElement.querySelector<HTMLDivElement>('[data-element="results-modal-backdrop"]');
    const resultsModalClose = this.rootElement.querySelector<HTMLButtonElement>('[data-element="results-modal-close"]');
    const modalResultsTable = this.rootElement.querySelector<HTMLDivElement>('[data-element="modal-results-table"]');
    const modalResultsChart = this.rootElement.querySelector<HTMLDivElement>('[data-element="modal-results-chart"]');
    const primaryButton = this.rootElement.querySelector<HTMLButtonElement>('[data-element="primary-button"]');
    const barometerValue = this.rootElement.querySelector<HTMLDivElement>('[data-element="barometer-value"]');
    const toastStack = this.rootElement.querySelector<HTMLDivElement>('[data-element="toast-stack"]');
    const dragGhost = this.rootElement.querySelector<HTMLDivElement>('[data-element="drag-ghost"]');

    if (
      !canvas ||
      !sidebarHeader ||
      !sidebarCaption ||
      !sidebarList ||
      !gasSelect ||
      !gasHint ||
      !runtimePanel ||
      !captureButton ||
      !resultsPreview ||
      !resultsPreviewButton ||
      !resultsPanel ||
      !resultsModal ||
      !resultsModalBackdrop ||
      !resultsModalClose ||
      !modalResultsTable ||
      !modalResultsChart ||
      !primaryButton ||
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
      gasHint,
      runtimePanel,
      captureButton,
      resultsPreview,
      resultsPreviewButton,
      resultsPanel,
      resultsModal,
      resultsModalBackdrop,
      resultsModalClose,
      modalResultsTable,
      modalResultsChart,
      primaryButton,
      barometerValue,
      toastStack,
      dragGhost,
    };
  }

  private template(): string {
    return `
      <div class="${APPLICATION_CLASS_NAMES.frame}">
        <section class="${APPLICATION_CLASS_NAMES.workspace}">
          <div class="${APPLICATION_CLASS_NAMES.workspaceTitle}">${APPLICATION_LABELS.title}</div>
          <div class="${APPLICATION_CLASS_NAMES.canvasShell}">
            <canvas data-element="canvas"></canvas>
          </div>
          <button class="${APPLICATION_CLASS_NAMES.primaryButton}" data-element="primary-button" type="button"></button>
        </section>
        <aside class="${APPLICATION_CLASS_NAMES.sidebar}">
          <section>
            <h2 class="${APPLICATION_CLASS_NAMES.panelTitle}" data-element="sidebar-header"></h2>
            <p class="${APPLICATION_CLASS_NAMES.panelCaption}" data-element="sidebar-caption"></p>
            <label class="${APPLICATION_CLASS_NAMES.gasControl}">
              <span class="${APPLICATION_CLASS_NAMES.gasControlLabel}">${APPLICATION_LABELS.gasLabel}</span>
              <select class="${APPLICATION_CLASS_NAMES.gasSelect}" data-element="gas-select">
                ${this.gasSelectOptions()}
              </select>
            </label>
            <p class="${APPLICATION_CLASS_NAMES.gasHint}" data-element="gas-hint"></p>
            <div class="${APPLICATION_CLASS_NAMES.sidebarList}" data-element="sidebar-list"></div>
          </section>
          <div class="${APPLICATION_CLASS_NAMES.runtimePanel}" data-element="runtime-panel" hidden>
            <section class="${APPLICATION_CLASS_NAMES.widget}">
              <div class="${APPLICATION_CLASS_NAMES.widgetLabel}">${APPLICATION_LABELS.barometer}</div>
              <div class="${APPLICATION_CLASS_NAMES.widgetValue}" data-element="barometer-value"></div>
            </section>
            <div class="${APPLICATION_CLASS_NAMES.runtimeActions}">
              <button class="${APPLICATION_CLASS_NAMES.secondaryButton}" data-element="capture-button" type="button">${APPLICATION_LABELS.captureMeasurement}</button>
            </div>
          </div>
          <div class="${APPLICATION_CLASS_NAMES.resultsPreview}" data-element="results-preview" hidden>
            <div class="${APPLICATION_CLASS_NAMES.resultsPanel}" data-element="results-panel"></div>
            <button class="${APPLICATION_CLASS_NAMES.resultsPreviewButton}" data-element="results-preview-button" type="button">${APPLICATION_LABELS.openResults}</button>
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
              <section class="${APPLICATION_CLASS_NAMES.resultsSection}">
                <h3 class="${APPLICATION_CLASS_NAMES.panelTitle}">${APPLICATION_LABELS.measurementsTable}</h3>
                <div class="${APPLICATION_CLASS_NAMES.resultsTable}" data-element="modal-results-table"></div>
              </section>
              <section class="${APPLICATION_CLASS_NAMES.resultsSection}">
                <h3 class="${APPLICATION_CLASS_NAMES.panelTitle}">${APPLICATION_LABELS.velocityChart}</h3>
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
    if (stage === 'assembly') {
      return APPLICATION_LABELS.assemblyConfirmedToast;
    }

    if (stage === 'instruments') {
      return APPLICATION_LABELS.runningStartedToast;
    }

    return APPLICATION_LABELS.runningStoppedToast;
  }

  private connectionToast(reason: ConnectionFailureReason): string {
    if (reason === 'self') {
      return APPLICATION_LABELS.connectionSelfError;
    }

    if (reason === 'duplicate') {
      return APPLICATION_LABELS.connectionDuplicateError;
    }

    if (reason === 'portBusy') {
      return APPLICATION_LABELS.connectionBusyError;
    }

    if (reason === 'invalidTarget') {
      return APPLICATION_LABELS.connectionInvalidError;
    }

    return APPLICATION_LABELS.connectionInvalidError;
  }

  private sensorToast(reason: SensorInstallFailureReason): string {
    if (reason === 'occupied') {
      return APPLICATION_LABELS.sensorOccupiedError;
    }

    if (reason === 'wrongSensorType') {
      return APPLICATION_LABELS.sensorWrongTypeError;
    }

    return APPLICATION_LABELS.sensorWrongPointError;
  }

  private sidebarHelper(stage: ReturnType<Lab6Laboratory['stageValue']>): string {
    if (stage === 'assembly') {
      return APPLICATION_LABELS.assemblyHelper;
    }

    if (stage === 'instruments') {
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

  private pruneToasts(now: number): void {
    this.toasts = this.toasts.filter((toast) => toast.expiresAt > now);
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
        node.className = `${APPLICATION_CLASS_NAMES.toast} application__toast--entering ${toast.kind === 'error' ? APPLICATION_CLASS_NAMES.toastError : APPLICATION_CLASS_NAMES.toastSuccess}`;
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
    const records = snapshot.measurementRecords;
    const previewRecords = records.slice(-4);

    this.elements.resultsPanel.innerHTML = `
      <section class="${APPLICATION_CLASS_NAMES.resultsSection}">
        <h3 class="${APPLICATION_CLASS_NAMES.panelTitle}">${APPLICATION_LABELS.measurementsTable}</h3>
        <div class="${APPLICATION_CLASS_NAMES.resultsTable}" data-element="results-table">${this.resultsTableMarkup(previewRecords)}</div>
      </section>
      <section class="${APPLICATION_CLASS_NAMES.resultsSection}">
        <h3 class="${APPLICATION_CLASS_NAMES.panelTitle}">${APPLICATION_LABELS.velocityChart}</h3>
        <div class="${APPLICATION_CLASS_NAMES.chart}" data-element="results-chart">${this.resultsChartMarkup(records, true)}</div>
      </section>
    `;
  }

  private renderResultsModal(snapshot: ReturnType<Lab6Laboratory['snapshot']>): void {
    const records = snapshot.measurementRecords;

    this.elements.modalResultsTable.innerHTML = this.resultsTableMarkup(records);
    this.elements.modalResultsChart.innerHTML = this.resultsChartMarkup(records, false);
  }

  private resultsTableMarkup(records: ReturnType<Lab6Laboratory['snapshot']>['measurementRecords']): string {
    if (records.length === 0) {
      return `<div class="${APPLICATION_CLASS_NAMES.chartEmpty}">${APPLICATION_LABELS.emptyMeasurements}</div>`;
    }

    return `
      <table>
        <thead>
          <tr>
            <th>№</th>
            <th>Газ</th>
            <th>p1, бар</th>
            <th>p2, бар</th>
            <th>Q, л/м</th>
          </tr>
        </thead>
        <tbody>
          ${records
            .map(
              (record) => `
                <tr>
                  <td>${record.index}</td>
                  <td>
                    <span class="${APPLICATION_CLASS_NAMES.gasBadge} ${this.gasBadgeClassName(record.gasModel)}">${record.gasLabel}</span>
                  </td>
                  <td>${record.pressureHighBar.toFixed(2)}</td>
                  <td>${record.pressureLowBar.toFixed(2)}</td>
                  <td>${record.flowLitersPerMinute.toFixed(2)}</td>
                </tr>
              `,
            )
            .join('')}
        </tbody>
      </table>
    `;
  }

  private resultsChartMarkup(
    records: ReturnType<Lab6Laboratory['snapshot']>['measurementRecords'],
    compact: boolean,
  ): string {
    if (records.length === 0) {
      return `<div class="${APPLICATION_CLASS_NAMES.chartEmpty}">${APPLICATION_LABELS.emptyMeasurements}</div>`;
    }

    const sorted = [...records].sort((left, right) => left.pressureRatio - right.pressureRatio);
    const width = compact ? 320 : 640;
    const height = compact ? 180 : 320;
    const paddingLeft = compact ? 24 : 72;
    const paddingRight = compact ? 24 : 28;
    const paddingTop = compact ? 24 : 20;
    const paddingBottom = compact ? 24 : 56;
    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;
    const minX = compact ? Math.min(...sorted.map((record) => record.pressureRatio)) : 0.2;
    const maxX = compact ? Math.max(...sorted.map((record) => record.pressureRatio)) : 0.95;
    const minY = compact ? Math.min(...sorted.map((record) => record.velocity)) : 40;
    const maxY = compact ? Math.max(...sorted.map((record) => record.velocity)) : 320;
    const axisY = height - paddingBottom;
    const axisX = paddingLeft;
    const pointRadius = compact ? 4 : 6;
    const strokeWidth = compact ? 2.5 : 3;
    const labelFontSize = compact ? 11 : 14;
    const tickFontSize = compact ? 10 : 12;
    const xTickValues = compact ? null : [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    const yTickValues = compact ? null : [50, 100, 150, 200, 250, 300];
    const xTicks = xTickValues?.length ?? 5;
    const yTicks = yTickValues?.length ?? 5;
    const gasPalette = this.gasPalette(records);
    const groupedRecords = Array.from(
      records.reduce((groups, record) => {
        const current = groups.get(record.gasId) ?? [];

        current.push(record);
        groups.set(record.gasId, current);

        return groups;
      }, new Map<string, typeof records>()),
    );

    const coordinatesByGas = groupedRecords.map(([gasId, gasRecords]) => {
      const gasSorted = [...gasRecords].sort((left, right) => left.pressureRatio - right.pressureRatio);

      return {
        gasId,
        gasLabel: gasSorted[0]?.gasLabel ?? gasId,
        gasModel: gasSorted[0]?.gasModel ?? 'real',
        color: gasPalette.get(gasId) ?? '#1f7a6a',
        points: gasSorted.map((record) => {
          const clampedPressureRatio = Math.min(Math.max(record.pressureRatio, minX), maxX);
          const clampedVelocity = Math.min(Math.max(record.velocity, minY), maxY);
          const x = paddingLeft + ((clampedPressureRatio - minX) / Math.max(maxX - minX, 1e-6)) * plotWidth;
          const y = axisY - ((clampedVelocity - minY) / Math.max(maxY - minY, 1e-6)) * plotHeight;

          return {
            x,
            y,
            record,
          };
        }),
      };
    });

    const xTickMarks = Array.from({ length: xTicks }, (_, index) => {
      const value = xTickValues ? xTickValues[index] : minX + (maxX - minX) * (xTicks === 1 ? 0 : index / (xTicks - 1));
      const ratio = (value - minX) / Math.max(maxX - minX, 1e-6);
      const x = axisX + plotWidth * ratio;

      return `
        <g>
          <line x1="${x.toFixed(1)}" y1="${paddingTop}" x2="${x.toFixed(1)}" y2="${axisY}" stroke="rgba(102,123,134,0.22)" stroke-width="1" />
          <line x1="${x.toFixed(1)}" y1="${axisY}" x2="${x.toFixed(1)}" y2="${(axisY + 6).toFixed(1)}" stroke="rgba(102,123,134,0.45)" stroke-width="1" />
          <text x="${x.toFixed(1)}" y="${(axisY + 24).toFixed(1)}" text-anchor="middle" font-size="${tickFontSize}" fill="#667b86">${value.toFixed(1).replace('.', ',')}</text>
        </g>
      `;
    }).join('');
    const yTickMarks = Array.from({ length: yTicks }, (_, index) => {
      const value = yTickValues ? yTickValues[index] : maxY - (maxY - minY) * (yTicks === 1 ? 0 : index / (yTicks - 1));
      const ratio = (value - minY) / Math.max(maxY - minY, 1e-6);
      const y = axisY - plotHeight * ratio;

      return `
        <g>
          <line x1="${axisX}" y1="${y.toFixed(1)}" x2="${(width - paddingRight).toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(102,123,134,0.22)" stroke-width="1" />
          <line x1="${(axisX - 6).toFixed(1)}" y1="${y.toFixed(1)}" x2="${axisX}" y2="${y.toFixed(1)}" stroke="rgba(102,123,134,0.45)" stroke-width="1" />
          <text x="${(axisX - 10).toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="${tickFontSize}" fill="#667b86">${Math.round(value)}</text>
        </g>
      `;
    }).join('');
    const legendMarkup = coordinatesByGas
      .map(
        ({ gasLabel, gasModel, color }) => `
          <div class="${APPLICATION_CLASS_NAMES.chartLegendItem}">
            <span class="${APPLICATION_CLASS_NAMES.chartLegendSwatch}" style="--legend-color: ${color}"></span>
            <span class="${APPLICATION_CLASS_NAMES.gasBadge} ${this.gasBadgeClassName(gasModel)}">${gasLabel}</span>
          </div>
        `,
      )
      .join('');

    return `
      <div class="${APPLICATION_CLASS_NAMES.chartLegend}">${legendMarkup}</div>
      <svg viewBox="0 0 ${width} ${height}" class="${APPLICATION_CLASS_NAMES.chart}" aria-label="${APPLICATION_LABELS.velocityChart}">
        <line x1="${axisX}" y1="${axisY}" x2="${width - paddingRight}" y2="${axisY}" stroke="rgba(102,123,134,0.45)" stroke-width="1.5" />
        <line x1="${axisX}" y1="${paddingTop}" x2="${axisX}" y2="${axisY}" stroke="rgba(102,123,134,0.45)" stroke-width="1.5" />
        ${xTickMarks}
        ${yTickMarks}
        ${coordinatesByGas
          .map(({ color, points }) => {
            const polylinePoints = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');

            if (points.length < 2) {
              return '';
            }

            return `<polyline fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" points="${polylinePoints}" />`;
          })
          .join('')}
        ${coordinatesByGas
          .map(
            ({ color, points }) => points
              .map(
                ({ x, y, record }) => `
                  <g>
                    <title>${record.gasLabel}: скорость ${record.velocity.toFixed(2)} м/с; отношение ${record.pressureRatio.toFixed(3)}</title>
                    <rect x="${(x - pointRadius).toFixed(1)}" y="${(y - pointRadius).toFixed(1)}" width="${(pointRadius * 2).toFixed(1)}" height="${(pointRadius * 2).toFixed(1)}" rx="1" fill="none" stroke="${color}" stroke-width="2" />
                  </g>
                `,
              )
              .join(''),
          )
          .join('')}
        <text x="${(paddingLeft + plotWidth / 2).toFixed(1)}" y="${(height - 12).toFixed(1)}" text-anchor="middle" font-size="${labelFontSize}" fill="#111">Beta</text>
        <text x="${compact ? 12 : 22}" y="${compact ? 18 : 24}" text-anchor="start" font-size="${labelFontSize}" fill="#111">w, м/с</text>
      </svg>
    `;
  }

  private sidebarTitle(stage: ReturnType<Lab6Laboratory['stageValue']>): string {
    if (stage === 'assembly') {
      return APPLICATION_LABELS.equipmentPanel;
    }

    if (stage === 'instruments') {
      return APPLICATION_LABELS.sensorsPanel;
    }

    return APPLICATION_LABELS.runtimePanel;
  }

  private gasSelectOptions(): string {
    return LAB6_GASES
      .map((gas) => `<option value="${gas.id}">${gas.label}</option>`)
      .join('');
  }

  private gasHint(snapshot: ReturnType<Lab6Laboratory['snapshot']>): string {
    const gas = snapshot.gasOptions.find((entry) => entry.id === snapshot.selectedGasId);

    if (!gas) {
      return '';
    }

    if (gas.model === 'ideal') {
      return 'Расчёт без поправки на сжимаемость: Z = 1.';
    }

    return 'Для реального газа учитывается сжимаемость по уравнению Пенга–Робинсона.';
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
    if (snapshot.stage !== 'assembly') {
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

    if (snapshot.stage === 'running' && hovered?.kind === 'valve') {
      return 'grab';
    }

    return 'default';
  }

  private clearSelection(): void {
    this.selectedItemId = '';
    this.selectedConnectionId = '';
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

  private gasBadgeClassName(model: 'ideal' | 'real'): string {
    return model === 'ideal' ? APPLICATION_CLASS_NAMES.gasBadgeIdeal : APPLICATION_CLASS_NAMES.gasBadgeReal;
  }

  private gasPalette(records: ReturnType<Lab6Laboratory['snapshot']>['measurementRecords']): Map<string, string> {
    const palette = ['#1f7a6a', '#2f7ed8', '#d88608', '#8f5a06', '#7b61ff', '#c75146', '#0f9d8a', '#5f6c76'];
    const gasIds = [...new Set(records.map((record) => record.gasId))];

    return new Map(gasIds.map((gasId, index) => [gasId, palette[index % palette.length]]));
  }
}
