import { LAB6_CONFIG } from '../../config/lab6/lab6.config';
import type { EquipmentDefinition, EquipmentKind, SensorKind } from '../../config/lab6/lab6.types';
import { Grid } from '../grid/grid';
import type { GridPoint } from '../grid/grid.types';
import { LAB6_NUMBERS, LAB6_STAGE_LABELS, LAB6_STATUS_LABELS } from './lab6-laboratory.consts';
import { Lab6Physics } from './lab6-physics';
import { Lab6Validator } from './lab6-validator';
import type {
  ConnectionPlacement,
  EquipmentPlacement,
  LaboratorySnapshot,
  LaboratoryStage,
  PaletteEntry,
  ValidationResult,
} from './lab6-laboratory.types';
import type { Lab6Measurements } from './lab6-measurements.types';

export class Lab6Laboratory {
  private readonly config = LAB6_CONFIG;

  private readonly grid: Grid;

  private readonly physics: Lab6Physics;

  private readonly validator: Lab6Validator;

  private stage: LaboratoryStage;

  private items: EquipmentPlacement[];

  private connections: ConnectionPlacement[];

  private measurements: Lab6Measurements | null;

  private equipmentIdentifier: number;

  private connectionIdentifier: number;

  private status: string;

  private variantIndex: number;

  private valvePosition: number;

  private startedAt: number;

  public constructor() {
    this.grid = new Grid(
      this.config.gridTileSize,
      this.config.planeOffsetX,
      this.config.planeOffsetY,
      this.config.workspaceTilesWidth,
      this.config.workspaceTilesHeight,
    );
    this.physics = new Lab6Physics();
    this.validator = new Lab6Validator(this.config);
    this.stage = 'assembly';
    this.items = [];
    this.connections = [];
    this.measurements = null;
    this.equipmentIdentifier = LAB6_NUMBERS.firstIdentifier;
    this.connectionIdentifier = LAB6_NUMBERS.firstIdentifier;
    this.status = LAB6_STATUS_LABELS.assembly;
    this.variantIndex = 0;
    this.valvePosition = LAB6_NUMBERS.closedValvePosition;
    this.startedAt = 0;
  }

  public snapshot(): LaboratorySnapshot {
    return {
      stage: this.stage,
      items: [...this.items],
      connections: [...this.connections],
      measurements: this.measurements,
      status: this.status,
      primaryLabel: LAB6_STAGE_LABELS[this.stage],
      palette: this.palette(),
    };
  }

  public getGrid(): Grid {
    return this.grid;
  }

  public stageValue(): LaboratoryStage {
    return this.stage;
  }

  public create(kind: EquipmentKind, point: GridPoint): boolean {
    if (this.stage !== 'assembly') {
      return false;
    }

    const definition = this.config.equipment[kind];
    const remaining = this.remainingEquipment(kind);

    if (remaining <= 0) {
      return false;
    }

    const placement = this.placement(definition, point);

    if (!this.grid.fit(placement) || this.collides(placement, '')) {
      return false;
    }

    this.items = [...this.items, placement];
    this.status = LAB6_STATUS_LABELS.assembly;

    return true;
  }

  public move(identifier: string, point: GridPoint): boolean {
    if (this.stage !== 'assembly') {
      return false;
    }

    const current = this.items.find((item) => item.id === identifier);

    if (!current) {
      return false;
    }

    const moved: EquipmentPlacement = {
      ...current,
      tileX: point.tileX,
      tileY: point.tileY,
    };

    if (current.tileX === moved.tileX && current.tileY === moved.tileY) {
      return true;
    }

    if (!this.grid.fit(moved) || this.collides(moved, identifier)) {
      return false;
    }

    this.items = this.items.map((item) => (item.id === identifier ? moved : item));
    this.connections = this.connections.map((connection) => this.route(connection));

    return true;
  }

  public remove(identifier: string): void {
    this.items = this.items.filter((item) => item.id !== identifier);
    this.connections = this.connections.filter(
      (connection) => connection.from.equipmentId !== identifier && connection.to.equipmentId !== identifier,
    );

    this.status = LAB6_STATUS_LABELS.assembly;
  }

  public connect(fromEquipmentId: string, fromPortId: string, toEquipmentId: string, toPortId: string): boolean {
    if (this.stage !== 'assembly') {
      return false;
    }

    if (fromEquipmentId === toEquipmentId) {
      return false;
    }

    const sameConnection = this.connections.some((connection) => {
      const direct =
        connection.from.equipmentId === fromEquipmentId &&
        connection.from.portId === fromPortId &&
        connection.to.equipmentId === toEquipmentId &&
        connection.to.portId === toPortId;
      const reverse =
        connection.from.equipmentId === toEquipmentId &&
        connection.from.portId === toPortId &&
        connection.to.equipmentId === fromEquipmentId &&
        connection.to.portId === fromPortId;

      return direct || reverse;
    });

    if (sameConnection || this.portBusy(fromEquipmentId, fromPortId) || this.portBusy(toEquipmentId, toPortId)) {
      return false;
    }

    const connection: ConnectionPlacement = {
      id: `connection-${this.connectionIdentifier}`,
      from: { equipmentId: fromEquipmentId, portId: fromPortId },
      to: { equipmentId: toEquipmentId, portId: toPortId },
      path: this.routePointsBetweenPorts(fromEquipmentId, fromPortId, toEquipmentId, toPortId),
    };

    if (connection.path.length < 2) {
      return false;
    }

    this.connectionIdentifier += 1;
    this.connections = [...this.connections, connection];

    return true;
  }

  public disconnect(identifier: string): void {
    this.connections = this.connections.filter((connection) => connection.id !== identifier);
  }

  public previewConnectionPath(from: GridPoint, to: GridPoint): GridPoint[] {
    return this.routePoints(from, to);
  }

  public previewConnectionBetweenPorts(
    fromEquipmentId: string,
    fromPortId: string,
    toEquipmentId: string,
    toPortId: string,
  ): GridPoint[] {
    return this.routePointsBetweenPorts(fromEquipmentId, fromPortId, toEquipmentId, toPortId);
  }

  public install(kind: SensorKind, equipmentId: string, slotId: string): boolean {
    if (this.stage !== 'instruments') {
      return false;
    }

    if (this.remainingSensor(kind) <= 0) {
      return false;
    }

    const equipment = this.items.find((item) => item.id === equipmentId);
    const definition = equipment ? this.config.equipment[equipment.kind] : null;
    const slot = definition?.sensorSlots.find((entry) => entry.id === slotId);

    if (!equipment || !slot || slot.kind !== kind) {
      return false;
    }

    const occupied = equipment.sensors.some((sensor) => sensor.slotId === slotId);

    if (occupied) {
      return false;
    }

    this.items = this.items.map((item) => {
      if (item.id !== equipmentId) {
        return item;
      }

      return {
        ...item,
        sensors: [...item.sensors, { kind, slotId }],
      };
    });

    this.status = LAB6_STATUS_LABELS.instruments;

    return true;
  }

  public advance(now: number): ValidationResult {
    if (this.stage === 'assembly') {
      const validation = this.validator.assembly(this.items, this.connections);

      if (!validation.valid) {
        this.status = validation.message;

        return validation;
      }

      this.stage = 'instruments';
      this.status = validation.message;

      return validation;
    }

    if (this.stage === 'instruments') {
      const validation = this.validator.sensors(this.items);

      if (!validation.valid) {
        this.status = validation.message;

        return validation;
      }

      this.stage = 'running';
      this.variantIndex = this.physics.choose();
      this.valvePosition = LAB6_NUMBERS.closedValvePosition;
      this.startedAt = now;
      this.measurements = this.physics.calculate(this.variantIndex, this.valvePosition, 0);
      this.status = validation.message;

      return validation;
    }

    this.stage = 'assembly';
    this.measurements = null;
    this.startedAt = 0;
    this.status = LAB6_STATUS_LABELS.runningStopped;

    return { valid: true, message: this.status };
  }

  public tick(now: number): void {
    if (this.stage !== 'running' || !this.measurements) {
      return;
    }

    const seconds = Math.max(0, Math.floor((now - this.startedAt) / 1000));

    this.measurements = this.physics.calculate(this.variantIndex, this.valvePosition, seconds);
  }

  public valve(step: number): void {
    if (this.stage !== 'running') {
      return;
    }

    const next = Math.min(Math.max(this.valvePosition + step, LAB6_NUMBERS.closedValvePosition), LAB6_NUMBERS.openedValvePosition);

    this.valvePosition = next;

    if (this.measurements) {
      this.measurements = this.physics.calculate(this.variantIndex, this.valvePosition, this.measurements.stopwatchSeconds);
    }
  }

  public port(point: GridPoint): { equipmentId: string; portId: string } | null {
    for (const item of this.items) {
      const definition = this.config.equipment[item.kind];

      for (const port of definition.ports) {
        const tileX = item.tileX + port.tileX;
        const tileY = item.tileY + port.tileY;

        if (point.tileX === tileX && point.tileY === tileY) {
          return { equipmentId: item.id, portId: port.id };
        }
      }
    }

    return null;
  }

  public item(point: GridPoint): EquipmentPlacement | null {
    for (const item of [...this.items].reverse()) {
      const withinX = point.tileX >= item.tileX && point.tileX < item.tileX + item.tileWidth;
      const withinY = point.tileY >= item.tileY && point.tileY < item.tileY + item.tileHeight;

      if (withinX && withinY) {
        return item;
      }
    }

    return null;
  }

  public sensor(point: GridPoint): { equipmentId: string; slotId: string; kind: SensorKind } | null {
    for (const item of this.items) {
      const definition = this.config.equipment[item.kind];

      for (const slot of definition.sensorSlots) {
        const tileX = item.tileX + slot.tileX;
        const tileY = item.tileY + slot.tileY;

        if (point.tileX === tileX && point.tileY === tileY) {
          return { equipmentId: item.id, slotId: slot.id, kind: slot.kind };
        }
      }
    }

    return null;
  }

  public connection(point: GridPoint): ConnectionPlacement | null {
    for (const connection of this.connections) {
      const hit = connection.path.some((pathPoint) => pathPoint.tileX === point.tileX && pathPoint.tileY === point.tileY);

      if (hit) {
        return connection;
      }
    }

    return null;
  }

  public canPlace(kind: EquipmentKind, point: GridPoint): boolean {
    const definition = this.config.equipment[kind];
    const placement = this.preview(definition, point);

    if (this.remainingEquipment(kind) <= 0) {
      return false;
    }

    return this.grid.fit(placement) && !this.collides(placement, '');
  }

  public canMove(identifier: string, point: GridPoint): boolean {
    const item = this.items.find((entry) => entry.id === identifier);

    if (!item) {
      return false;
    }

    const moved: EquipmentPlacement = {
      ...item,
      tileX: point.tileX,
      tileY: point.tileY,
    };

    return this.grid.fit(moved) && !this.collides(moved, identifier);
  }

  private palette(): PaletteEntry[] {
    if (this.stage === 'assembly') {
      return Object.values(this.config.equipment).map((definition) => ({
        kind: definition.kind,
        label: definition.label,
        remaining: this.remainingEquipment(definition.kind),
        category: 'equipment',
      }));
    }

    if (this.stage === 'instruments') {
      return Object.values(this.config.sensors).map((definition) => ({
        kind: definition.kind,
        label: definition.label,
        remaining: this.remainingSensor(definition.kind),
        category: 'sensor',
      }));
    }

    return [];
  }

  private remainingEquipment(kind: EquipmentKind): number {
    const current = this.items.filter((item) => item.kind === kind).length;

    return this.config.equipment[kind].maxCount - current;
  }

  private remainingSensor(kind: SensorKind): number {
    const current = this.items.flatMap((item) => item.sensors).filter((sensor) => sensor.kind === kind).length;

    return this.config.sensors[kind].maxCount - current;
  }

  private placement(definition: EquipmentDefinition, point: GridPoint): EquipmentPlacement {
    const ordinal = this.items.filter((item) => item.kind === definition.kind).length + 1;

    return {
      id: `equipment-${this.equipmentIdentifier++}`,
      kind: definition.kind,
      ordinal,
      tileX: point.tileX,
      tileY: point.tileY,
      tileWidth: definition.tileWidth,
      tileHeight: definition.tileHeight,
      sensors: [],
    };
  }

  private preview(definition: EquipmentDefinition, point: GridPoint): EquipmentPlacement {
    return {
      id: 'preview',
      kind: definition.kind,
      ordinal: 1,
      tileX: point.tileX,
      tileY: point.tileY,
      tileWidth: definition.tileWidth,
      tileHeight: definition.tileHeight,
      sensors: [],
    };
  }

  private collides(candidate: EquipmentPlacement, selfId: string): boolean {
    return this.items.some((item) => {
      if (item.id === selfId) {
        return false;
      }

      return this.grid.overlap(candidate, item);
    });
  }

  private portBusy(equipmentId: string, portId: string): boolean {
    const explicitConnection = this.connections.some((connection) => {
      const fromBusy = connection.from.equipmentId === equipmentId && connection.from.portId === portId;
      const toBusy = connection.to.equipmentId === equipmentId && connection.to.portId === portId;

      return fromBusy || toBusy;
    });

    if (explicitConnection) {
      return true;
    }

    return this.implicitPortConnection(equipmentId, portId) !== null;
  }

  private implicitPortConnection(equipmentId: string, portId: string): { equipmentId: string; portId: string } | null {
    const origin = this.absolutePort(equipmentId, portId);

    if (!origin) {
      return null;
    }

    for (const item of this.items) {
      if (item.id === equipmentId) {
        continue;
      }

      const definition = this.config.equipment[item.kind];

      for (const port of definition.ports) {
        if (!this.portDirectionsCompatible(portId, port.id)) {
          continue;
        }

        const point = {
          tileX: item.tileX + port.tileX,
          tileY: item.tileY + port.tileY,
        };

        if (origin.tileX === point.tileX && origin.tileY === point.tileY) {
          return {
            equipmentId: item.id,
            portId: port.id,
          };
        }
      }
    }

    return null;
  }

  private portDirectionsCompatible(leftPortId: string, rightPortId: string): boolean {
    const leftDirection = this.portDirection(leftPortId);
    const rightDirection = this.portDirection(rightPortId);

    return (leftDirection === 'in' && rightDirection === 'out') || (leftDirection === 'out' && rightDirection === 'in');
  }

  private portDirection(portId: string): 'in' | 'out' | 'other' {
    if (portId === 'in') {
      return 'in';
    }

    if (portId === 'out') {
      return 'out';
    }

    return 'other';
  }

  private route(connection: ConnectionPlacement): ConnectionPlacement {
    const from = this.absolutePort(connection.from.equipmentId, connection.from.portId);
    const to = this.absolutePort(connection.to.equipmentId, connection.to.portId);

    if (!from || !to) {
      return connection;
    }

    const path = this.routePoints(from, to);

    if (path.length < 2) {
      return connection;
    }

    return {
      ...connection,
      path,
    };
  }

  private routePointsBetweenPorts(
    fromEquipmentId: string,
    fromPortId: string,
    toEquipmentId: string,
    toPortId: string,
  ): GridPoint[] {
    const from = this.absolutePort(fromEquipmentId, fromPortId);
    const to = this.absolutePort(toEquipmentId, toPortId);

    if (!from || !to) {
      return [];
    }

    const fromLead = this.portLeadPoint(fromEquipmentId, fromPortId) ?? from;
    const toLead = this.portLeadPoint(toEquipmentId, toPortId) ?? to;
    const middle = this.routePoints(fromLead, toLead);

    if (middle.length === 0) {
      return [];
    }

    return this.normalizeRoute(this.mergeRouteSegments([
      [from, fromLead],
      middle,
      [toLead, to],
    ]));
  }

  private routePoints(from: GridPoint, to: GridPoint): GridPoint[] {
    if (from.tileX === to.tileX && from.tileY === to.tileY) {
      return [from];
    }

    type Direction = 'up' | 'right' | 'down' | 'left';
    type RouteState = {
      point: GridPoint;
      direction: Direction | null;
      cost: number;
      score: number;
      previous: string | null;
    };

    const directions: Array<{ direction: Direction; offset: GridPoint }> = [
      { direction: 'right', offset: { tileX: 1, tileY: 0 } },
      { direction: 'down', offset: { tileX: 0, tileY: 1 } },
      { direction: 'left', offset: { tileX: -1, tileY: 0 } },
      { direction: 'up', offset: { tileX: 0, tileY: -1 } },
    ];
    const open: string[] = [];
    const states = new Map<string, RouteState>();
    const startKey = this.routeStateKey(from, null);

    states.set(startKey, {
      point: from,
      direction: null,
      cost: 0,
      score: this.routeHeuristic(from, to),
      previous: null,
    });
    open.push(startKey);

    while (open.length > 0) {
      let bestIndex = 0;

      for (let index = 1; index < open.length; index += 1) {
        const candidate = states.get(open[index]);
        const best = states.get(open[bestIndex]);

        if (candidate && best && candidate.score < best.score) {
          bestIndex = index;
        }
      }

      const currentKey = open.splice(bestIndex, 1)[0];
      const current = states.get(currentKey);

      if (!current) {
        continue;
      }

      if (current.point.tileX === to.tileX && current.point.tileY === to.tileY) {
        return this.normalizeRoute(this.restoreRoute(currentKey, states));
      }

      for (const entry of directions) {
        const next: GridPoint = {
          tileX: current.point.tileX + entry.offset.tileX,
          tileY: current.point.tileY + entry.offset.tileY,
        };

        if (!this.routeInsideBounds(next) || this.routeBlocked(current.point, next)) {
          continue;
        }

        const turnPenalty = current.direction && current.direction !== entry.direction ? 0.35 : 0;
        const proximityPenalty = this.routeProximityPenalty(current.point, next, from, to);
        const nextCost = current.cost + 1 + turnPenalty + proximityPenalty;
        const nextKey = this.routeStateKey(next, entry.direction);
        const bestState = states.get(nextKey);

        if (bestState && bestState.cost <= nextCost) {
          continue;
        }

        states.set(nextKey, {
          point: next,
          direction: entry.direction,
          cost: nextCost,
          score: nextCost + this.routeHeuristic(next, to),
          previous: currentKey,
        });

        if (!open.includes(nextKey)) {
          open.push(nextKey);
        }
      }
    }

    return [];
  }

  private mergeRouteSegments(segments: GridPoint[][]): GridPoint[] {
    const merged: GridPoint[] = [];

    for (const segment of segments) {
      for (const point of segment) {
        const previous = merged[merged.length - 1];

        if (previous && previous.tileX === point.tileX && previous.tileY === point.tileY) {
          continue;
        }

        merged.push(point);
      }
    }

    return merged;
  }

  private normalizeRoute(path: GridPoint[]): GridPoint[] {
    if (path.length < 3) {
      return path;
    }

    const normalized: GridPoint[] = [path[0]];

    for (let index = 1; index < path.length - 1; index += 1) {
      const previous = normalized[normalized.length - 1];
      const current = path[index];
      const next = path[index + 1];
      const horizontal = previous.tileY === current.tileY && current.tileY === next.tileY;
      const vertical = previous.tileX === current.tileX && current.tileX === next.tileX;

      if (!horizontal && !vertical) {
        normalized.push(current);
      }
    }

    normalized.push(path[path.length - 1]);

    return normalized;
  }

  private restoreRoute(
    endKey: string,
    states: Map<string, { point: GridPoint; previous: string | null }>,
  ): GridPoint[] {
    const path: GridPoint[] = [];
    let currentKey: string | null = endKey;

    while (currentKey) {
      const state = states.get(currentKey);

      if (!state) {
        break;
      }

      path.push(state.point);
      currentKey = state.previous;
    }

    return path.reverse();
  }

  private routeStateKey(point: GridPoint, direction: string | null): string {
    return `${point.tileX}:${point.tileY}:${direction ?? 'start'}`;
  }

  private routeHeuristic(from: GridPoint, to: GridPoint): number {
    return Math.abs(to.tileX - from.tileX) + Math.abs(to.tileY - from.tileY);
  }

  private routeInsideBounds(point: GridPoint): boolean {
    const withinLeft = point.tileX >= 0;
    const withinTop = point.tileY >= 0;
    const withinRight = point.tileX <= this.config.workspaceTilesWidth;
    const withinBottom = point.tileY <= this.config.workspaceTilesHeight;

    return withinLeft && withinTop && withinRight && withinBottom;
  }

  private routeBlocked(from: GridPoint, to: GridPoint): boolean {
    const horizontal = from.tileY === to.tileY;
    const segmentX = Math.min(from.tileX, to.tileX);
    const segmentY = Math.min(from.tileY, to.tileY);

    return this.items.some((item) => {
      if (this.routeEndpointExit(item, from, to) || this.routeEndpointExit(item, to, from)) {
        return false;
      }

      if (horizontal) {
        const withinVerticalInterior = from.tileY >= item.tileY && from.tileY <= item.tileY + item.tileHeight;
        const withinHorizontalSpan = segmentX >= item.tileX && segmentX < item.tileX + item.tileWidth;

        return withinVerticalInterior && withinHorizontalSpan;
      }

      const withinHorizontalInterior = from.tileX >= item.tileX && from.tileX <= item.tileX + item.tileWidth;
      const withinVerticalSpan = segmentY >= item.tileY && segmentY < item.tileY + item.tileHeight;

      return withinHorizontalInterior && withinVerticalSpan;
    });
  }

  private routeEndpointExit(item: EquipmentPlacement, point: GridPoint, next: GridPoint): boolean {
    if (point.tileX === item.tileX && point.tileY >= item.tileY && point.tileY <= item.tileY + item.tileHeight) {
      return next.tileX < point.tileX;
    }

    if (point.tileX === item.tileX + item.tileWidth && point.tileY >= item.tileY && point.tileY <= item.tileY + item.tileHeight) {
      return next.tileX > point.tileX;
    }

    if (point.tileY === item.tileY && point.tileX >= item.tileX && point.tileX <= item.tileX + item.tileWidth) {
      return next.tileY < point.tileY;
    }

    if (point.tileY === item.tileY + item.tileHeight && point.tileX >= item.tileX && point.tileX <= item.tileX + item.tileWidth) {
      return next.tileY > point.tileY;
    }

    return false;
  }

  private routeProximityPenalty(from: GridPoint, to: GridPoint, start: GridPoint, end: GridPoint): number {
    const touchesEndpoint =
      (from.tileX === start.tileX && from.tileY === start.tileY) ||
      (to.tileX === start.tileX && to.tileY === start.tileY) ||
      (from.tileX === end.tileX && from.tileY === end.tileY) ||
      (to.tileX === end.tileX && to.tileY === end.tileY);

    if (touchesEndpoint) {
      return 0;
    }

    const horizontal = from.tileY === to.tileY;
    const segmentX = Math.min(from.tileX, to.tileX);
    const segmentY = Math.min(from.tileY, to.tileY);

    return this.items.reduce((penalty, item) => {
      if (horizontal) {
        const onBoundary =
          (from.tileY === item.tileY || from.tileY === item.tileY + item.tileHeight) &&
          segmentX >= item.tileX &&
          segmentX < item.tileX + item.tileWidth;

        return penalty + (onBoundary ? 0.12 : 0);
      }

      const onBoundary =
        (from.tileX === item.tileX || from.tileX === item.tileX + item.tileWidth) &&
        segmentY >= item.tileY &&
        segmentY < item.tileY + item.tileHeight;

      return penalty + (onBoundary ? 0.12 : 0);
    }, 0);
  }

  private portLeadPoint(equipmentId: string, portId: string): GridPoint | null {
    const port = this.absolutePort(equipmentId, portId);
    const heading = this.portHeading(equipmentId, portId);

    if (!port || !heading) {
      return port;
    }

    const lead = {
      tileX: port.tileX + heading.tileX,
      tileY: port.tileY + heading.tileY,
    };

    if (!this.routeInsideBounds(lead) || this.routeBlocked(port, lead)) {
      return port;
    }

    return lead;
  }

  private portHeading(equipmentId: string, portId: string): GridPoint | null {
    const item = this.items.find((entry) => entry.id === equipmentId);

    if (!item) {
      return null;
    }

    const definition = this.config.equipment[item.kind];
    const port = definition.ports.find((entry) => entry.id === portId);

    if (!port) {
      return null;
    }

    if (port.tileX === 0) {
      return { tileX: -1, tileY: 0 };
    }

    if (port.tileX === definition.tileWidth) {
      return { tileX: 1, tileY: 0 };
    }

    if (port.tileY === 0) {
      return { tileX: 0, tileY: -1 };
    }

    if (port.tileY === definition.tileHeight) {
      return { tileX: 0, tileY: 1 };
    }

    if (portId === 'in') {
      return { tileX: -1, tileY: 0 };
    }

    if (portId === 'out') {
      return { tileX: 1, tileY: 0 };
    }

    return null;
  }

  private absolutePort(equipmentId: string, portId: string): GridPoint | null {
    const item = this.items.find((entry) => entry.id === equipmentId);

    if (!item) {
      return null;
    }

    const definition = this.config.equipment[item.kind];
    const port = definition.ports.find((entry) => entry.id === portId);

    if (!port) {
      return null;
    }

    return {
      tileX: item.tileX + port.tileX,
      tileY: item.tileY + port.tileY,
    };
  }
}