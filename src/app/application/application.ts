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
import type { ConnectionFailureReason, EquipmentPlacement, SensorInstallFailureReason } from '../../domain/lab6/lab6-laboratory.types';
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
  }

  public start(): void {
    this.bind();
    this.refresh();
    this.loop();
  }

  private bind(): void {
    this.bindPrimary();
    this.bindGasSelection();
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

  private bindCanvas(): void {
    this.elements.canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) {
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
          this.valveDrag = {
            equipmentId: item.id,
            pointerId: event.pointerId,
          };
          this.selectedItemId = item.id;
          this.selectedConnectionId = '';
          this.connectionPreview = null;
          this.elements.canvas.setPointerCapture(event.pointerId);
          this.updateValveFromPointer(item, event);
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
      if (this.valveDrag) {
        const item = this.laboratory.snapshot().items.find((entry) => entry.id === this.valveDrag?.equipmentId) ?? null;

        this.hoveredPort = null;
        this.hoveredItemId = item?.id ?? '';

        if (item) {
          this.updateValveFromPointer(item, event);
        }

        this.refresh();

        return;
      }

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
      if (event.button !== 0) {
        return;
      }

      if (this.valveDrag && event.pointerId === this.valveDrag.pointerId) {
        if (this.elements.canvas.hasPointerCapture(event.pointerId)) {
          this.elements.canvas.releasePointerCapture(event.pointerId);
        }

        this.valveDrag = null;
        this.clearSelection();
        this.refresh();

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
    this.elements.stopwatchValue.textContent = snapshot.measurements
      ? snapshot.measurements.stopwatchSeconds.toString().padStart(2, '0')
      : '00';
    this.elements.runtimePanel.hidden = !running;
    this.elements.sidebarList.hidden = running;
    this.palette(snapshot);
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
    const primaryButton = this.rootElement.querySelector<HTMLButtonElement>('[data-element="primary-button"]');
    const barometerValue = this.rootElement.querySelector<HTMLDivElement>('[data-element="barometer-value"]');
    const stopwatchValue = this.rootElement.querySelector<HTMLDivElement>('[data-element="stopwatch-value"]');
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
      !primaryButton ||
      !barometerValue ||
      !stopwatchValue ||
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
      primaryButton,
      barometerValue,
      stopwatchValue,
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
            <section class="${APPLICATION_CLASS_NAMES.widget}">
              <div class="${APPLICATION_CLASS_NAMES.widgetLabel}">${APPLICATION_LABELS.stopwatch}</div>
              <div class="${APPLICATION_CLASS_NAMES.widgetValue}" data-element="stopwatch-value"></div>
            </section>
          </div>
        </aside>
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

  private updateValveFromPointer(item: EquipmentPlacement, event: PointerEvent): void {
    const position = this.valvePositionFromPointer(item, this.relative(event));

    this.laboratory.setValvePosition(position);
  }

  private valvePositionFromPointer(item: EquipmentPlacement, point: PixelPoint): number {
    const tileSize = this.laboratory.getGrid().getTileSize();
    const origin = this.laboratory.getGrid().point({ tileX: item.tileX, tileY: item.tileY });
    const width = item.tileWidth * tileSize;
    const height = item.tileHeight * tileSize;
    const centerX = origin.x + width * 0.5;
    const centerY = origin.y + height * 0.18;
    const angle = Math.atan2(point.y - centerY, point.x - centerX);
    const minAngle = -Math.PI * 0.75;
    const maxAngle = Math.PI * 0.75;
    const clampedAngle = Math.min(Math.max(angle, minAngle), maxAngle);
    const ratio = (clampedAngle - minAngle) / (maxAngle - minAngle);

    return Math.round(ratio * 10);
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
}
