import type { Lab6Config } from '../../config/lab6/lab6.types';
import type { ConnectionPlacement, EquipmentPlacement, ValidationResult } from './lab6-laboratory.types';
import { LAB6_NUMBERS, LAB6_STATUS_LABELS } from './lab6-laboratory.consts';

export class Lab6Validator {
  private readonly config: Lab6Config;

  public constructor(config: Lab6Config) {
    this.config = config;
  }

  public assembly(items: EquipmentPlacement[], connections: ConnectionPlacement[]): ValidationResult {
    const countsValid = this.counts(items);

    if (!countsValid) {
      return { valid: false, message: LAB6_STATUS_LABELS.assemblyError };
    }

    const graphValid = this.graph(items, connections);

    if (!graphValid) {
      return { valid: false, message: LAB6_STATUS_LABELS.assemblyError };
    }

    return { valid: true, message: LAB6_STATUS_LABELS.instruments };
  }

  public sensors(items: EquipmentPlacement[]): ValidationResult {
    const chambers = items.filter((item) => item.kind === 'chamber');

    if (chambers.length !== LAB6_NUMBERS.requiredSensorCountPerKind) {
      return { valid: false, message: LAB6_STATUS_LABELS.sensorError };
    }

    const sensorsValid = chambers.every((item) => {
      const hasManometer = item.sensors.some((sensor) => sensor.kind === 'manometer');
      const hasTemperature = item.sensors.some((sensor) => sensor.kind === 'temperatureSensor');

      return hasManometer && hasTemperature;
    });

    if (!sensorsValid) {
      return { valid: false, message: LAB6_STATUS_LABELS.sensorError };
    }

    return { valid: true, message: LAB6_STATUS_LABELS.running };
  }

  private counts(items: EquipmentPlacement[]): boolean {
    return Object.values(this.config.equipment).every((definition) => {
      const count = items.filter((item) => item.kind === definition.kind).length;

      return count === definition.maxCount;
    });
  }

  private graph(items: EquipmentPlacement[], connections: ConnectionPlacement[]): boolean {
    const requiredCount = this.config.chain.length - 1;
    const nodeById = new Map(items.map((item) => [item.id, item]));
    const adjacency = new Map<string, Set<string>>();

    for (const item of items) {
      adjacency.set(item.id, new Set<string>());
    }

    for (const connection of connections) {
      const from = adjacency.get(connection.from.equipmentId);
      const to = adjacency.get(connection.to.equipmentId);

      if (!from || !to) {
        return false;
      }

      from.add(connection.to.equipmentId);
      to.add(connection.from.equipmentId);
    }

    for (const connection of this.implicitConnections(items)) {
      const from = adjacency.get(connection.fromEquipmentId);
      const to = adjacency.get(connection.toEquipmentId);

      if (!from || !to) {
        return false;
      }

      from.add(connection.toEquipmentId);
      to.add(connection.fromEquipmentId);
    }

    const connectionCount = [...adjacency.values()].reduce((count, neighbours) => count + neighbours.size, 0) / 2;

    if (connectionCount !== requiredCount) {
      return false;
    }

    const compressor = items.find((item) => item.kind === 'compressor');

    if (!compressor) {
      return false;
    }

    const path = this.walk(compressor.id, adjacency);

    if (path.length !== this.config.chain.length) {
      return false;
    }

    const chainKinds = path.map((identifier) => nodeById.get(identifier)?.kind ?? 'compressor');

    return chainKinds.every((kind, index) => kind === this.config.chain[index]);
  }

  private walk(startId: string, adjacency: Map<string, Set<string>>): string[] {
    const route: string[] = [];
    const visited = new Set<string>();
    let current = startId;
    let previous = '';

    while (!visited.has(current)) {
      route.push(current);
      visited.add(current);

      const neighbours = [...(adjacency.get(current) ?? new Set<string>())];
      const next = neighbours.find((identifier) => identifier !== previous);

      if (!next) {
        break;
      }

      previous = current;
      current = next;
    }

    return route;
  }

  private implicitConnections(items: EquipmentPlacement[]): Array<{ fromEquipmentId: string; toEquipmentId: string }> {
    const connections: Array<{ fromEquipmentId: string; toEquipmentId: string }> = [];

    for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
      const left = items[leftIndex];

      for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
        const right = items[rightIndex];

        if (!this.itemsTouchByPorts(left, right)) {
          continue;
        }

        connections.push({ fromEquipmentId: left.id, toEquipmentId: right.id });
      }
    }

    return connections;
  }

  private itemsTouchByPorts(left: EquipmentPlacement, right: EquipmentPlacement): boolean {
    const leftDefinition = this.config.equipment[left.kind];
    const rightDefinition = this.config.equipment[right.kind];

    for (const leftPort of leftDefinition.ports) {
      const leftPoint = this.absolutePort(left, leftPort.id);

      if (!leftPoint) {
        continue;
      }

      for (const rightPort of rightDefinition.ports) {
        if (!this.portDirectionsCompatible(leftPort.id, rightPort.id)) {
          continue;
        }

        const rightPoint = this.absolutePort(right, rightPort.id);

        if (!rightPoint) {
          continue;
        }

        if (leftPoint.tileX === rightPoint.tileX && leftPoint.tileY === rightPoint.tileY) {
          return true;
        }
      }
    }

    return false;
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

  private absolutePort(item: EquipmentPlacement, portId: string): { tileX: number; tileY: number } | null {
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