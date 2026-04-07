import { APPLICATION_CLASS_NAMES, APPLICATION_LABELS, APPLICATION_NUMBERS, APPLICATION_TEXTS } from './application.consts';
import type {
  ApplicationElements,
  ConnectionSession,
  PaletteDragSession,
  WorkspaceDragSession,
} from './application.types';
import { LAB6_CONFIG } from '../../config/lab6/lab6.config';
import type { EquipmentKind, SensorKind } from '../../config/lab6/lab6.types';
import type { GridPoint, PixelPoint } from '../../domain/grid/grid.types';
import { Lab6Laboratory } from '../../domain/lab6/lab6-laboratory';
import { CanvasRenderer } from '../../rendering/canvas/canvas-renderer';
import type { ConnectionPreview, PlacementPreview, SensorPreview } from '../../rendering/canvas/canvas-renderer.types';

export class Application {
  private readonly rootElement: HTMLDivElement;

  private readonly laboratory: Lab6Laboratory;

  private readonly renderer: CanvasRenderer;

  private readonly elements: ApplicationElements;

  private paletteDrag: PaletteDragSession | null;

  private workspaceDrag: WorkspaceDragSession | null;

  private connection: ConnectionSession | null;

  private placementPreview: PlacementPreview | null;

  private sensorPreview: SensorPreview | null;

  private connectionPreview: ConnectionPreview | null;

  private selectedItemId: string;

  private selectedConnectionId: string;

  private hoveredItemId: string;

  private hoveredPort: ConnectionSession | null;

  public constructor(rootElement: HTMLDivElement) {
    this.rootElement = rootElement;
    this.rootElement.innerHTML = this.template();
    this.rootElement.className = APPLICATION_CLASS_NAMES.root;
    this.laboratory = new Lab6Laboratory();
    this.elements = this.resolve();
    this.renderer = new CanvasRenderer(this.elements.canvas, this.laboratory.getGrid());
    this.paletteDrag = null;
    this.workspaceDrag = null;
    this.connection = null;
    this.placementPreview = null;
    this.sensorPreview = null;
    this.connectionPreview = null;
    this.selectedItemId = '';
    this.selectedConnectionId = '';
    this.hoveredItemId = '';
    this.hoveredPort = null;
  }

  public start(): void {
    this.bind();
    this.refresh();
    this.loop();
  }

  private bind(): void {
    this.bindPrimary();
    this.bindCanvas();
    this.bindWindow();
    this.bindValve();
  }

  private bindPrimary(): void {
    this.elements.primaryButton.addEventListener('click', () => {
      this.laboratory.advance(performance.now());
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
      if (event.button !== 0) {
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

        if (targetPort && !this.samePort(this.connection, targetPort)) {
          this.laboratory.connect(this.connection.equipmentId, this.connection.portId, targetPort.equipmentId, targetPort.portId);
        }
      }

      if (stage === 'instruments' && this.paletteDrag?.category === 'sensor') {
        const slot = this.laboratory.sensor(point);

        if (slot && slot.kind === this.paletteDrag.kind) {
          this.laboratory.install(this.paletteDrag.kind as SensorKind, slot.equipmentId, slot.slotId);
        }
      }

      this.workspaceDrag = null;
      this.connection = null;
      this.placementPreview = null;
      this.sensorPreview = null;
      this.connectionPreview = null;
      this.hoveredPort = stage === 'assembly' ? this.portAtEvent(event) : null;
      this.refresh();
    });

    this.elements.canvas.addEventListener('pointerleave', () => {
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
      this.elements.dragGhost.style.opacity = '0';
      this.refresh();
    });
  }

  private bindValve(): void {
    this.elements.valveOpenButton.addEventListener('click', () => {
      this.laboratory.valve(APPLICATION_NUMBERS.valveStep);
      this.refresh();
    });

    this.elements.valveCloseButton.addEventListener('click', () => {
      this.laboratory.valve(-APPLICATION_NUMBERS.valveStep);
      this.refresh();
    });
  }

  private loop(): void {
    this.laboratory.tick(performance.now());
    this.refresh();
    window.requestAnimationFrame(() => this.loop());
  }

  private refresh(): void {
    const snapshot = this.laboratory.snapshot();

    this.elements.sidebarHeader.textContent = this.sidebarTitle(snapshot.stage);
    this.elements.sidebarCaption.textContent = this.sidebarCaption(snapshot.stage);
    this.elements.status.textContent = snapshot.status;
    this.elements.primaryButton.textContent = snapshot.primaryLabel;
    this.elements.barometerValue.textContent = snapshot.measurements
      ? `${snapshot.measurements.barometer.toFixed(0)} ${APPLICATION_TEXTS.barometerUnit}`
      : `0 ${APPLICATION_TEXTS.barometerUnit}`;
    this.elements.stopwatchValue.textContent = snapshot.measurements
      ? snapshot.measurements.stopwatchSeconds.toString().padStart(2, '0')
      : '00';
    this.elements.valveControls.hidden = snapshot.stage !== 'running';

    this.palette(snapshot);
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

    if (!slot || slot.kind !== this.paletteDrag.kind) {
      return;
    }

    this.laboratory.install(this.paletteDrag.kind as SensorKind, slot.equipmentId, slot.slotId);
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
    const status = this.rootElement.querySelector<HTMLParagraphElement>('[data-element="status"]');
    const primaryButton = this.rootElement.querySelector<HTMLButtonElement>('[data-element="primary-button"]');
    const barometerValue = this.rootElement.querySelector<HTMLDivElement>('[data-element="barometer-value"]');
    const stopwatchValue = this.rootElement.querySelector<HTMLDivElement>('[data-element="stopwatch-value"]');
    const valveControls = this.rootElement.querySelector<HTMLDivElement>('[data-element="valve-controls"]');
    const valveOpenButton = this.rootElement.querySelector<HTMLButtonElement>('[data-element="valve-open"]');
    const valveCloseButton = this.rootElement.querySelector<HTMLButtonElement>('[data-element="valve-close"]');
    const dragGhost = this.rootElement.querySelector<HTMLDivElement>('[data-element="drag-ghost"]');

    if (
      !canvas ||
      !sidebarHeader ||
      !sidebarCaption ||
      !sidebarList ||
      !status ||
      !primaryButton ||
      !barometerValue ||
      !stopwatchValue ||
      !valveControls ||
      !valveOpenButton ||
      !valveCloseButton ||
      !dragGhost
    ) {
      throw new Error('Application layout is incomplete.');
    }

    return {
      canvas,
      sidebarHeader,
      sidebarCaption,
      sidebarList,
      status,
      primaryButton,
      barometerValue,
      stopwatchValue,
      valveControls,
      valveOpenButton,
      valveCloseButton,
      dragGhost,
    };
  }

  private template(): string {
    return `
      <div class="${APPLICATION_CLASS_NAMES.frame}">
        <section class="${APPLICATION_CLASS_NAMES.workspace}">
          <canvas data-element="canvas"></canvas>
          <div class="${APPLICATION_CLASS_NAMES.toolbar}">
            <button class="${APPLICATION_CLASS_NAMES.primaryButton}" data-element="primary-button" type="button"></button>
          </div>
          <p class="${APPLICATION_CLASS_NAMES.status}" data-element="status">${APPLICATION_LABELS.initialStatus}</p>
        </section>
        <aside class="${APPLICATION_CLASS_NAMES.sidebar}">
          <header class="${APPLICATION_CLASS_NAMES.sidebarHeader}">
            <div>
              <p class="${APPLICATION_CLASS_NAMES.panelCaption}">${APPLICATION_LABELS.subtitle}</p>
              <h1 class="${APPLICATION_CLASS_NAMES.panelTitle}">${APPLICATION_LABELS.title}</h1>
            </div>
          </header>
          <section>
            <h2 class="${APPLICATION_CLASS_NAMES.panelTitle}" data-element="sidebar-header"></h2>
            <p class="${APPLICATION_CLASS_NAMES.panelCaption}" data-element="sidebar-caption"></p>
            <div class="${APPLICATION_CLASS_NAMES.sidebarList}" data-element="sidebar-list"></div>
          </section>
          <section class="${APPLICATION_CLASS_NAMES.widget}">
            <div class="${APPLICATION_CLASS_NAMES.widgetLabel}">${APPLICATION_LABELS.barometer}</div>
            <div class="${APPLICATION_CLASS_NAMES.widgetValue}" data-element="barometer-value"></div>
          </section>
          <section class="${APPLICATION_CLASS_NAMES.widget}">
            <div class="${APPLICATION_CLASS_NAMES.widgetLabel}">${APPLICATION_LABELS.stopwatch}</div>
            <div class="${APPLICATION_CLASS_NAMES.widgetValue}" data-element="stopwatch-value"></div>
          </section>
          <section class="${APPLICATION_CLASS_NAMES.valveControls}" data-element="valve-controls" hidden>
            <button class="${APPLICATION_CLASS_NAMES.valveButton}" data-element="valve-close" type="button">${APPLICATION_LABELS.valveClose}</button>
            <button class="${APPLICATION_CLASS_NAMES.valveButton}" data-element="valve-open" type="button">${APPLICATION_LABELS.valveOpen}</button>
          </section>
        </aside>
        <div class="${APPLICATION_CLASS_NAMES.dragGhost}" data-element="drag-ghost"></div>
      </div>
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

  private sidebarCaption(stage: ReturnType<Lab6Laboratory['stageValue']>): string {
    if (stage === 'assembly') {
      return '';
    }

    if (stage === 'instruments') {
      return 'Перенесите датчики на валидные точки камер.';
    }

    return 'Показания обновляются по формулам Lab6.';
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