import type { Lab6Config } from './lab6.types';

export const LAB6_CONFIG: Lab6Config = {
  gridTileSize: 16,
  planeOffsetX: 16,
  planeOffsetY: 16,
  workspaceTilesWidth: 40,
  workspaceTilesHeight: 28,
  chain: ['compressor', 'receiver', 'chamber', 'nozzle', 'chamber', 'valve', 'flowmeter'],
  equipment: {
    compressor: {
      kind: 'compressor',
      label: 'Компрессор',
      maxCount: 1,
      tileWidth: 5,
      tileHeight: 5,
      ports: [{ id: 'out', tileX: 5, tileY: 2 }],
      sensorSlots: [],
    },
    receiver: {
      kind: 'receiver',
      label: 'Ресивер',
      maxCount: 1,
      tileWidth: 8,
      tileHeight: 4,
      ports: [
        { id: 'in', tileX: 0, tileY: 2 },
        { id: 'out', tileX: 8, tileY: 2 },
      ],
      sensorSlots: [],
    },
    chamber: {
      kind: 'chamber',
      label: 'Камера',
      maxCount: 2,
      tileWidth: 4,
      tileHeight: 6,
      ports: [
        { id: 'in', tileX: 0, tileY: 3 },
        { id: 'out', tileX: 4, tileY: 3 },
      ],
      sensorSlots: [{ id: 'manometer', kind: 'manometer', tileX: 4, tileY: 1 }],
    },
    nozzle: {
      kind: 'nozzle',
      label: 'Сопло',
      maxCount: 1,
      tileWidth: 3,
      tileHeight: 4,
      ports: [
        { id: 'in', tileX: 0, tileY: 2 },
        { id: 'out', tileX: 3, tileY: 2 },
      ],
      sensorSlots: [],
    },
    valve: {
      kind: 'valve',
      label: 'Вентиль',
      maxCount: 1,
      tileWidth: 3,
      tileHeight: 4,
      ports: [
        { id: 'in', tileX: 0, tileY: 2 },
        { id: 'out', tileX: 3, tileY: 2 },
      ],
      sensorSlots: [],
    },
    flowmeter: {
      kind: 'flowmeter',
      label: 'Расходомер',
      maxCount: 1,
      tileWidth: 4,
      tileHeight: 3,
      ports: [{ id: 'in', tileX: 0, tileY: 1 }],
      sensorSlots: [],
    },
  },
  sensors: {
    manometer: {
      kind: 'manometer',
      label: 'Манометр',
      maxCount: 2,
    },
    temperatureSensor: {
      kind: 'temperatureSensor',
      label: 'Термодатчик',
      maxCount: 0,
    },
  },
};