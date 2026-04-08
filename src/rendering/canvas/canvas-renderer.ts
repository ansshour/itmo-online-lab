import { LAB6_CONFIG } from '../../config/lab6/lab6.config';
import type { SensorKind } from '../../config/lab6/lab6.types';
import { Grid } from '../../domain/grid/grid';
import type { GridPoint, PixelPoint } from '../../domain/grid/grid.types';
import type { EquipmentPlacement, PortReference } from '../../domain/lab6/lab6-laboratory.types';
import type { RenderState } from './canvas-renderer.types';

export class CanvasRenderer {
  private readonly context: CanvasRenderingContext2D;

  private readonly grid: Grid;

  private readonly canvas: HTMLCanvasElement;

  private readonly viewportWidth: number;

  private readonly viewportHeight: number;

  private readonly pixelRatio: number;

  private badgeBounds: Array<{ x: number; y: number; width: number; height: number }>;

  public constructor(canvas: HTMLCanvasElement, grid: Grid) {
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas context is not available.');
    }

    this.context = context;
    this.grid = grid;
    this.canvas = canvas;
    this.viewportWidth = this.grid.widthPixels();
    this.viewportHeight = this.grid.heightPixels();
    this.pixelRatio = typeof window === 'undefined' ? 1 : Math.max(window.devicePixelRatio || 1, 1);
    this.badgeBounds = [];
    this.canvas.width = Math.round(this.viewportWidth * this.pixelRatio);
    this.canvas.height = Math.round(this.viewportHeight * this.pixelRatio);
    this.context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
  }

  public render(state: RenderState): void {
    this.badgeBounds = [];
    this.clear();
    this.gridDots();
    this.connections(state);
    this.previewConnection(state);
    this.equipment(state);
    this.previewPlacement(state);
    this.previewSensor(state);
  }

  private clear(): void {
    this.context.fillStyle = '#f8f7f2';
    this.context.fillRect(0, 0, this.viewportWidth, this.viewportHeight);
  }

  private gridDots(): void {
    const tileSize = this.grid.getTileSize();

    this.context.fillStyle = 'rgba(99, 90, 64, 0.22)';

    for (let tileY = 0; tileY < LAB6_CONFIG.workspaceTilesHeight; tileY += 1) {
      for (let tileX = 0; tileX < LAB6_CONFIG.workspaceTilesWidth; tileX += 1) {
        const point = this.grid.point({ tileX, tileY });

        this.context.beginPath();
        this.context.arc(point.x, point.y, tileSize * 0.06, 0, Math.PI * 2);
        this.context.fill();
      }
    }
  }

  private connections(state: RenderState): void {
    const running = state.snapshot.stage === 'running';

    for (const connection of state.snapshot.connections) {
      const flowPath = this.flowPath(connection.path, connection.from, connection.to, state.snapshot.items);
      const selected = state.selectedConnectionId === connection.id;

      this.pipe(connection.path, running, flowPath, selected);
    }
  }

  private previewConnection(state: RenderState): void {
    if (!state.connectionPreview || state.connectionPreview.path.length < 2) {
      return;
    }

    const pixels = this.pathPixels(state.connectionPreview.path);
    const diameter = Math.max(this.grid.getTileSize() * 0.62, 8);
    const cornerRadius = Math.min(this.grid.getTileSize() * 0.52, diameter * 0.72);
    const time = this.animationTime();

    this.context.save();
    this.context.lineCap = 'round';
    this.context.lineJoin = 'round';
    this.strokeRoundedPolyline(pixels, diameter + 2, 'rgba(143, 90, 6, 0.16)', cornerRadius);
    this.context.setLineDash([diameter * 0.9, diameter * 0.7]);
    this.context.lineDashOffset = -(time / 75);
    this.strokeRoundedPolyline(pixels, diameter, 'rgba(243, 179, 77, 0.9)', cornerRadius);
    this.context.setLineDash([]);
    this.strokeRoundedPolyline(pixels, Math.max(diameter * 0.28, 2), 'rgba(255, 250, 224, 0.9)', cornerRadius);
    this.context.restore();
  }

  private equipment(state: RenderState): void {
    for (const item of state.snapshot.items) {
      const selected = state.selectedItemId === item.id;
      const hovered = state.hoveredItem?.id === item.id;

      this.shape(item, selected, hovered, state);
    }

    for (const item of state.snapshot.items) {
      this.sensors(item, state, false);
    }

    if (state.snapshot.stage === 'running' && state.snapshot.measurements) {
      for (const item of state.snapshot.items) {
        this.sensors(item, state, true);
      }
    }

    this.ports(state.snapshot.items, state.visiblePortEquipmentIds, state.hoveredPort, state.connectionSource);
  }

  private previewPlacement(state: RenderState): void {
    if (!state.placementPreview) {
      return;
    }

    const definition = LAB6_CONFIG.equipment[state.placementPreview.kind];
    const pixel = this.grid.point(state.placementPreview.point);
    const tileSize = this.grid.getTileSize();
    const width = definition.tileWidth * tileSize;
    const height = definition.tileHeight * tileSize;

    this.context.save();
    this.context.fillStyle = state.placementPreview.valid ? 'rgba(81, 153, 112, 0.14)' : 'rgba(191, 82, 82, 0.14)';
    this.context.strokeStyle = state.placementPreview.valid ? '#519970' : '#bf5252';
    this.context.lineWidth = 2;
    this.context.setLineDash([8, 6]);
    this.roundedRect(pixel.x, pixel.y, width, height, 10);
    this.context.fill();
    this.context.stroke();
    this.context.restore();
  }

  private previewSensor(state: RenderState): void {
    if (!state.sensorPreview || state.snapshot.stage !== 'instruments') {
      return;
    }

    const pixel = this.grid.point(state.sensorPreview.point);

    this.context.save();
    this.context.fillStyle = '#f3b34d';
    this.context.strokeStyle = '#8f5a06';
    this.context.lineWidth = 1.5;
    this.context.beginPath();
    this.context.arc(pixel.x, pixel.y, 7, 0, Math.PI * 2);
    this.context.fill();
    this.context.stroke();
    this.context.restore();
  }

  private shape(item: EquipmentPlacement, selected: boolean, hovered: boolean, state: RenderState): void {
    const point = this.grid.point({ tileX: item.tileX, tileY: item.tileY });
    const tileSize = this.grid.getTileSize();
    const width = item.tileWidth * tileSize;
    const height = item.tileHeight * tileSize;
    const running = state.snapshot.stage === 'running';
    const measurements = state.snapshot.measurements;
    const time = this.animationTime();
    const active = running;
    const strokeColor = active ? '#855d18' : '#394047';
    const accentColor = active ? '#d59b35' : '#6d7c86';

    this.context.save();
    this.context.lineWidth = 2;
    this.context.strokeStyle = strokeColor;

    if (selected || hovered) {
      this.context.save();
      this.context.shadowColor = selected ? 'rgba(95, 162, 255, 0.35)' : 'rgba(217, 163, 67, 0.28)';
      this.context.shadowBlur = selected ? 18 : 12;
      this.context.strokeStyle = selected ? '#5fa2ff' : '#d9a343';
      this.context.lineWidth = 3;
      this.roundedRect(point.x - 4, point.y - 4, width + 8, height + 8, 14);
      this.context.stroke();
      this.context.restore();
    }

    switch (item.kind) {
      case 'compressor':
        this.drawCompressor(point.x, point.y, width, height, running, time);
        break;
      case 'receiver':
        this.drawReceiver(point.x, point.y, width, height, running, time);
        break;
      case 'chamber':
        this.drawChamber(point.x, point.y, width, height, accentColor, running, time, item.ordinal, measurements);
        break;
      case 'nozzle':
        this.drawNozzle(point.x, point.y, width, height, accentColor, running, time);
        break;
      case 'valve':
        this.drawValve(point.x, point.y, width, height, running, time, measurements?.valvePosition ?? 0);
        break;
      case 'flowmeter':
        this.drawFlowmeter(point.x, point.y, width, height, running, time, measurements?.volume ?? 0);
        break;
      default:
        break;
    }

    this.context.restore();
  }

  private drawCompressor(x: number, y: number, width: number, height: number, running: boolean, time: number): void {
    const skidX = x + width * 0.04;
    const skidY = y + height * 0.8;
    const skidWidth = width * 0.92;
    const skidHeight = height * 0.12;
    const bodyX = x + width * 0.18;
    const bodyY = y + height * 0.46;
    const bodyWidth = width * 0.42;
    const bodyHeight = height * 0.2;
    const bodyRadius = bodyHeight * 0.5;
    const intakeRadius = bodyHeight * 0.62;
    const intakeCenterX = bodyX + bodyHeight * 0.08;
    const intakeCenterY = bodyY + bodyHeight * 0.5;
    const outletCenterX = x + width;
    const outletCenterY = y + height * 0.40;
    const outletStubWidth = width * 0.16;
    const outletStubHeight = bodyHeight * 0.72;
    const outletStubX = outletCenterX - outletStubWidth;
    const outletStubY = outletCenterY - outletStubHeight * 0.5;
    const outletCapRadius = outletStubHeight * 0.5;
    const chamberX = bodyX + bodyWidth * 0.18;
    const chamberY = y + height * 0.14;
    const chamberWidth = width * 0.22;
    const chamberHeight = height * 0.28;
    const chamberCapHeight = height * 0.04;
    const pipeWidth = width * 0.08;
    const pipeX = bodyX + bodyWidth * 0.08;
    const pipeTopY = chamberY + chamberHeight * 0.18;
    const pipeBottomY = bodyY + bodyHeight * 0.08;
    const panelX = x + width * 0.66;
    const panelY = y + height * 0.28;
    const panelWidth = width * 0.22;
    const panelHeight = height * 0.38;
    const gaugeBaseY = panelY - height * 0.06;
    const gaugeRadius = width * 0.045;
    const gaugeCenters = [panelX + panelWidth * 0.18, panelX + panelWidth * 0.5, panelX + panelWidth * 0.82];
    const impellerAngle = running ? time / 140 : Math.PI / 10;
    const vibration = running ? Math.sin(time / 95) * height * 0.006 : 0;
    const pulse = running ? (Math.sin(time / 240) + 1) / 2 : 0;
    const flowOffset = running ? (time / 18) % (bodyWidth * 0.34) : 0;

    this.context.save();
    this.context.translate(0, vibration);

    this.roundedRect(skidX, skidY, skidWidth, skidHeight, skidHeight * 0.18);
    this.context.fillStyle = this.linearGradient(skidX, skidY, skidX, skidY + skidHeight, ['#2f353a', '#111417']);
    this.context.fill();
    this.context.stroke();

    this.context.fillStyle = '#1f252a';
    this.context.fillRect(skidX + skidWidth * 0.08, skidY + skidHeight * 0.18, skidWidth * 0.84, skidHeight * 0.18);

    this.context.fillStyle = '#0f1418';
    this.context.fillRect(bodyX + bodyWidth * 0.08, skidY + skidHeight * 0.02, width * 0.04, height * 0.02);
    this.context.fillRect(panelX + panelWidth * 0.18, skidY + skidHeight * 0.02, width * 0.04, height * 0.02);

    this.context.fillStyle = '#0f1418';
    this.context.fillRect(bodyX + bodyWidth * 0.18, bodyY + bodyHeight, width * 0.04, height * 0.14);
    this.context.fillRect(bodyX + bodyWidth * 0.72, bodyY + bodyHeight, width * 0.04, height * 0.14);
    this.context.fillRect(panelX + panelWidth * 0.18, panelY + panelHeight, width * 0.035, height * 0.14);
    this.context.fillRect(panelX + panelWidth * 0.72, panelY + panelHeight, width * 0.035, height * 0.14);

    this.context.fillStyle = this.linearGradient(bodyX, bodyY, bodyX + bodyWidth, bodyY + bodyHeight, ['#1f8df0', '#0f6fc8', '#2aa2ff']);
    this.roundedRect(bodyX, bodyY, bodyWidth, bodyHeight, bodyRadius);
    this.context.fill();
    this.context.stroke();

    this.context.beginPath();
    this.context.arc(intakeCenterX, intakeCenterY, intakeRadius, 0, Math.PI * 2);
    this.context.fillStyle = this.linearGradient(intakeCenterX - intakeRadius, intakeCenterY - intakeRadius, intakeCenterX + intakeRadius, intakeCenterY + intakeRadius, ['#0f6fc8', '#2aa2ff']);
    this.context.fill();
    this.context.stroke();

    this.roundedRect(outletStubX, outletStubY, outletStubWidth, outletStubHeight, outletStubHeight * 0.34);
    this.context.fillStyle = this.linearGradient(
      outletStubX,
      outletStubY,
      outletStubX + outletStubWidth,
      outletStubY + outletStubHeight,
      ['#8f99a1', '#d8e0e5', '#6f7981'],
    );
    this.context.fill();
    this.context.stroke();

    this.context.beginPath();
    this.context.arc(outletCenterX, outletCenterY, outletCapRadius, 0, Math.PI * 2);
    this.context.fillStyle = this.linearGradient(
      outletCenterX - outletCapRadius,
      outletCenterY - outletCapRadius,
      outletCenterX + outletCapRadius,
      outletCenterY + outletCapRadius,
      ['#dce3e8', '#8b959d', '#5f6971'],
    );
    this.context.fill();
    this.context.stroke();

    this.context.fillStyle = '#4f5961';
    this.context.beginPath();
    this.context.arc(outletCenterX, outletCenterY, outletCapRadius * 0.42, 0, Math.PI * 2);
    this.context.fill();

    this.context.save();
    this.context.beginPath();
    this.context.arc(intakeCenterX, intakeCenterY, intakeRadius * 0.72, 0, Math.PI * 2);
    this.context.clip();
    this.context.fillStyle = 'rgba(255, 255, 255, 0.14)';
    this.context.fillRect(intakeCenterX - intakeRadius * 0.18, intakeCenterY - intakeRadius, intakeRadius * 0.28, intakeRadius * 2);
    this.context.restore();

    this.context.strokeStyle = running ? '#d7f1ff' : 'rgba(255, 255, 255, 0.28)';
    this.context.lineWidth = 1.4;
    for (let index = 0; index < 5; index += 1) {
      const angle = (Math.PI * 2 * index) / 5 + impellerAngle;

      this.context.beginPath();
      this.context.moveTo(intakeCenterX, intakeCenterY);
      this.context.lineTo(
        intakeCenterX + Math.cos(angle) * intakeRadius * 0.58,
        intakeCenterY + Math.sin(angle) * intakeRadius * 0.58,
      );
      this.context.stroke();
    }

    this.context.fillStyle = '#083f73';
    this.context.beginPath();
    this.context.arc(intakeCenterX, intakeCenterY, intakeRadius * 0.14, 0, Math.PI * 2);
    this.context.fill();

    this.roundedRect(chamberX, chamberY, chamberWidth, chamberHeight, width * 0.02);
    this.context.fillStyle = this.linearGradient(chamberX, chamberY, chamberX + chamberWidth, chamberY + chamberHeight, ['#1f8df0', '#0f6fc8']);
    this.context.fill();
    this.context.stroke();

    this.roundedRect(chamberX - width * 0.01, chamberY - chamberCapHeight * 0.7, chamberWidth + width * 0.02, chamberCapHeight, chamberCapHeight * 0.3);
    this.context.fillStyle = '#0f6fc8';
    this.context.fill();
    this.context.stroke();

    this.roundedRect(pipeX, pipeTopY, pipeWidth, pipeBottomY - pipeTopY, pipeWidth * 0.35);
    this.context.fillStyle = this.linearGradient(pipeX, pipeTopY, pipeX + pipeWidth, pipeBottomY, ['#f5d11f', '#d8a900']);
    this.context.fill();
    this.context.stroke();

    this.roundedRect(pipeX - width * 0.005, pipeTopY - height * 0.02, pipeWidth * 1.7, height * 0.06, height * 0.02);
    this.context.fillStyle = this.linearGradient(pipeX, pipeTopY, pipeX + pipeWidth * 1.7, pipeTopY, ['#f5d11f', '#d8a900']);
    this.context.fill();
    this.context.stroke();

    this.context.fillStyle = '#0f6fc8';
    this.roundedRect(bodyX + bodyWidth * 0.72, bodyY + bodyHeight * 0.08, width * 0.12, height * 0.16, height * 0.03);
    this.context.fill();
    this.context.stroke();

    this.roundedRect(panelX, panelY, panelWidth, panelHeight, width * 0.02);
    this.context.fillStyle = this.linearGradient(panelX, panelY, panelX + panelWidth, panelY + panelHeight, ['#f2f3f1', '#cfd3d0']);
    this.context.fill();
    this.context.stroke();

    this.context.strokeStyle = '#9aa19d';
    this.context.lineWidth = 1;
    this.context.beginPath();
    this.context.moveTo(panelX + panelWidth * 0.5, panelY + panelHeight * 0.08);
    this.context.lineTo(panelX + panelWidth * 0.5, panelY + panelHeight * 0.92);
    this.context.moveTo(panelX + panelWidth * 0.08, panelY + panelHeight * 0.52);
    this.context.lineTo(panelX + panelWidth * 0.92, panelY + panelHeight * 0.52);
    this.context.stroke();

    this.roundedRect(panelX + panelWidth * 0.18, panelY + panelHeight * 0.58, panelWidth * 0.26, panelHeight * 0.16, 4);
    this.context.fillStyle = '#4f5a5f';
    this.context.fill();
    this.context.stroke();

    const buttonRadius = width * 0.012;
    const buttonRows = [panelY + panelHeight * 0.66, panelY + panelHeight * 0.8];
    const buttonColumns = [panelX + panelWidth * 0.58, panelX + panelWidth * 0.7, panelX + panelWidth * 0.82];

    for (const row of buttonRows) {
      for (const column of buttonColumns) {
        this.context.fillStyle = column === buttonColumns[2] && row === buttonRows[0] ? '#c75146' : '#6f8f95';
        this.context.beginPath();
        this.context.arc(column, row, buttonRadius, 0, Math.PI * 2);
        this.context.fill();
        this.context.stroke();
      }
    }

    this.context.strokeStyle = '#1f8df0';
    this.context.lineWidth = 2;
    for (const gaugeCenterX of gaugeCenters) {
      this.context.beginPath();
      this.context.moveTo(gaugeCenterX, panelY);
      this.context.lineTo(gaugeCenterX, gaugeBaseY + gaugeRadius * 0.9);
      this.context.stroke();

      this.context.fillStyle = this.linearGradient(gaugeCenterX - gaugeRadius, gaugeBaseY - gaugeRadius, gaugeCenterX + gaugeRadius, gaugeBaseY + gaugeRadius, ['#1f8df0', '#0f6fc8']);
      this.context.beginPath();
      this.context.arc(gaugeCenterX, gaugeBaseY, gaugeRadius, 0, Math.PI * 2);
      this.context.fill();
      this.context.stroke();

      this.context.fillStyle = '#f7fafb';
      this.context.beginPath();
      this.context.arc(gaugeCenterX, gaugeBaseY, gaugeRadius * 0.72, 0, Math.PI * 2);
      this.context.fill();
      this.context.stroke();

      const gaugeAngle = -Math.PI * 0.72 + pulse * Math.PI * 0.44 + gaugeCenterX * 0.002;
      this.context.strokeStyle = '#6f7d87';
      this.context.lineWidth = 1.2;
      this.context.beginPath();
      this.context.moveTo(gaugeCenterX, gaugeBaseY);
      this.context.lineTo(gaugeCenterX + Math.cos(gaugeAngle) * gaugeRadius * 0.48, gaugeBaseY + Math.sin(gaugeAngle) * gaugeRadius * 0.48);
      this.context.stroke();
    }

    this.context.save();
    this.roundedRect(bodyX + bodyWidth * 0.04, bodyY + bodyHeight * 0.08, bodyWidth * 0.9, bodyHeight * 0.84, bodyRadius * 0.8);
    this.context.clip();
    this.context.fillStyle = 'rgba(255, 255, 255, 0.12)';
    this.context.fillRect(bodyX - bodyWidth * 0.2 + flowOffset, bodyY + bodyHeight * 0.08, bodyWidth * 0.16, bodyHeight * 0.84);
    this.context.restore();

    if (running) {
      this.context.save();
      this.context.strokeStyle = `rgba(111, 201, 255, ${0.18 + pulse * 0.18})`;
      this.context.lineWidth = 2;
      this.context.setLineDash([width * 0.05, width * 0.04]);
      this.context.lineDashOffset = -(time / 16);
      this.context.beginPath();
      this.context.moveTo(bodyX + bodyWidth * 0.18, bodyY + bodyHeight * 0.5);
      this.context.lineTo(outletCenterX - outletCapRadius * 0.2, bodyY + bodyHeight * 0.5);
      this.context.stroke();
      this.context.setLineDash([]);
      this.context.restore();
    }

    this.context.fillStyle = 'rgba(255, 255, 255, 0.18)';
    this.context.fillRect(chamberX + chamberWidth * 0.08, chamberY + chamberHeight * 0.08, chamberWidth * 0.12, chamberHeight * 0.84);
    this.context.fillRect(panelX + panelWidth * 0.06, panelY + panelHeight * 0.06, panelWidth * 0.08, panelHeight * 0.88);

    this.context.restore();
  }

  private drawReceiver(x: number, y: number, width: number, height: number, running: boolean, time: number): void {
    const vesselX = x + width * 0.04;
    const vesselY = y + height * 0.22;
    const vesselHeight = height * 0.56;
    const vesselRadius = vesselHeight * 0.45;
    const pulse = running ? (Math.sin(time / 420) + 1) / 2 : 0.3;
    const outletPulse = running ? (Math.sin(time / 180) + 1) / 2 : 0;

    this.roundedRect(vesselX, vesselY, width * 0.92, vesselHeight, vesselRadius);
    this.context.fillStyle = this.linearGradient(vesselX, vesselY, vesselX + width, vesselY + vesselHeight, ['#f9fbfc', '#d9e1e5', '#c4ced4', '#eef2f4']);
    this.context.fill();
    this.context.stroke();

    if (running) {
      this.context.save();
      this.roundedRect(vesselX + 1.5, vesselY + 1.5, width * 0.92 - 3, vesselHeight - 3, vesselRadius * 0.9);
      this.context.clip();
      this.context.fillStyle = `rgba(117, 192, 255, ${0.08 + pulse * 0.08})`;
      this.context.fillRect(vesselX + width * 0.16, vesselY + vesselHeight * (0.55 - pulse * 0.16), width * 0.62, vesselHeight * (0.16 + pulse * 0.08));
      this.context.fillStyle = 'rgba(255, 255, 255, 0.22)';
      this.context.fillRect(vesselX - width * 0.18 + ((time / 18) % (width * 1.24)), vesselY + 2, width * 0.14, vesselHeight - 4);
      this.context.restore();
    }

    this.context.strokeStyle = '#8c999f';
    this.context.lineWidth = 1.5;
    this.context.beginPath();
    this.context.moveTo(x + width * 0.18, y + height * 0.5);
    this.context.lineTo(x + width * 0.82, y + height * 0.5);
    this.context.stroke();

    this.context.save();
    this.context.fillStyle = '#5f6f79';
    this.context.beginPath();
    this.context.arc(x + width * 0.5, y + height * 0.5, height * 0.06, 0, Math.PI * 2);
    this.context.fill();
    this.context.restore();

    if (running) {
      const outletX = x + width * 0.43;
      const outletY = y + height * 0.06;
      const jetHeight = height * (0.12 + outletPulse * 0.16);
      const jetWidth = width * (0.06 + outletPulse * 0.03);

      this.context.save();
      this.context.fillStyle = `rgba(111, 201, 255, ${0.18 + outletPulse * 0.18})`;
      this.context.beginPath();
      this.context.moveTo(outletX - jetWidth * 0.5, outletY);
      this.context.quadraticCurveTo(outletX - jetWidth, outletY - jetHeight * 0.45, outletX, outletY - jetHeight);
      this.context.quadraticCurveTo(outletX + jetWidth, outletY - jetHeight * 0.45, outletX + jetWidth * 0.5, outletY);
      this.context.closePath();
      this.context.fill();

      this.context.strokeStyle = `rgba(255, 255, 255, ${0.2 + outletPulse * 0.22})`;
      this.context.lineWidth = 1.1;
      this.context.beginPath();
      this.context.moveTo(outletX, outletY - jetHeight * 0.08);
      this.context.quadraticCurveTo(outletX + jetWidth * 0.18, outletY - jetHeight * 0.42, outletX, outletY - jetHeight * 0.82);
      this.context.stroke();
      this.context.restore();
    }

    this.context.fillStyle = '#75838d';
    this.context.fillRect(x + width * 0.2, y + height * 0.78, width * 0.1, height * 0.12);
    this.context.fillRect(x + width * 0.68, y + height * 0.78, width * 0.1, height * 0.12);
    this.context.fillStyle = '#51606b';
    this.context.fillRect(x + width * 0.34, y + height * 0.12, width * 0.08, height * 0.1);
    this.context.fillRect(x + width * 0.42, y + height * 0.06, width * 0.02, height * 0.08);

    if (running) {
      const gaugeX = x + width * 0.38;
      const gaugeY = y + height * 0.08;
      const gaugeWidth = width * 0.18;
      const gaugeHeight = height * 0.06;

      this.context.save();
      this.roundedRect(gaugeX, gaugeY, gaugeWidth, gaugeHeight, gaugeHeight * 0.45);
      this.context.fillStyle = 'rgba(236, 244, 247, 0.95)';
      this.context.fill();
      this.context.strokeStyle = 'rgba(92, 111, 121, 0.35)';
      this.context.lineWidth = 1;
      this.context.stroke();
      this.context.fillStyle = `rgba(31, 122, 106, ${0.45 + pulse * 0.35})`;
      this.roundedRect(gaugeX + 1.5, gaugeY + 1.5, (gaugeWidth - 3) * (0.72 + pulse * 0.18), gaugeHeight - 3, gaugeHeight * 0.35);
      this.context.fill();
      this.context.restore();
    }
  }

  private drawChamber(
    x: number,
    y: number,
    width: number,
    height: number,
    accentColor: string,
    running: boolean,
    time: number,
    ordinal: number,
    measurements: RenderState['snapshot']['measurements'],
  ): void {
    const bodyX = x + width * 0.18;
    const bodyWidth = width * 0.64;
    const sideWidth = width * 0.14;
    const pressure = ordinal === 1 ? measurements?.pressureHigh ?? 0 : measurements?.pressureLow ?? 0;
    const glow = running ? this.normalize(pressure, 0, 140) : 0;
    const pulse = running ? (Math.sin(time / 320 + ordinal) + 1) / 2 : 0;

    this.roundedRect(bodyX, y + height * 0.04, bodyWidth, height * 0.92, bodyWidth * 0.22);
    this.context.fillStyle = this.linearGradient(bodyX, y, bodyX + bodyWidth, y + height, ['#fafcfc', '#d8e1e5', '#bfc9d0', '#eff3f5']);
    this.context.fill();
    this.context.stroke();

    if (running) {
      this.context.save();
      this.roundedRect(bodyX + 1.5, y + height * 0.06, bodyWidth - 3, height * 0.88, bodyWidth * 0.18);
      this.context.clip();
      this.context.fillStyle = `rgba(125, 205, 255, ${0.08 + glow * 0.14})`;
      this.context.fillRect(bodyX + bodyWidth * 0.12, y + height * (0.62 - pulse * 0.09), bodyWidth * 0.76, height * (0.18 + glow * 0.08));
      this.context.strokeStyle = `rgba(255, 255, 255, ${0.12 + glow * 0.12})`;
      this.context.lineWidth = 1.2;
      for (let index = 0; index < 3; index += 1) {
        const stripeY = y + height * (0.18 + ((time / 1100 + index * 0.19) % 0.54));

        this.context.beginPath();
        this.context.moveTo(bodyX + bodyWidth * 0.16, stripeY);
        this.context.lineTo(bodyX + bodyWidth * 0.84, stripeY - height * 0.03);
        this.context.stroke();
      }
      this.context.restore();
    }

    this.context.fillStyle = this.linearGradient(x, y, x + sideWidth, y + height, ['#d69d39', '#8d6024']);
    this.roundedRect(x + width * 0.01, y + height * 0.12, sideWidth, height * 0.76, 6);
    this.context.fill();
    this.context.stroke();
    this.roundedRect(x + width * 0.85, y + height * 0.12, sideWidth, height * 0.76, 6);
    this.context.fill();
    this.context.stroke();

    this.context.strokeStyle = accentColor;
    this.context.lineWidth = 1.5;
    for (let index = 0; index < 3; index += 1) {
      const seamY = y + height * (0.22 + index * 0.22);

      this.context.beginPath();
      this.context.moveTo(bodyX + width * 0.06, seamY);
      this.context.lineTo(bodyX + bodyWidth - width * 0.06, seamY);
      this.context.stroke();
    }

    this.context.fillStyle = '#6c7881';
    this.context.beginPath();
    this.context.arc(x + width * 0.5, y + height * 0.22, width * 0.08, 0, Math.PI * 2);
    this.context.fill();
  }

  private drawNozzle(x: number, y: number, width: number, height: number, accentColor: string, running: boolean, time: number): void {
    const leftFlangeWidth = width * 0.18;
    const rightFlangeWidth = width * 0.18;

    this.context.fillStyle = '#64717a';
    this.roundedRect(x, y + height * 0.24, leftFlangeWidth, height * 0.52, 4);
    this.context.fill();
    this.context.stroke();
    this.roundedRect(x + width - rightFlangeWidth, y + height * 0.32, rightFlangeWidth, height * 0.36, 4);
    this.context.fill();
    this.context.stroke();

    this.context.beginPath();
    this.context.moveTo(x + leftFlangeWidth, y + height * 0.26);
    this.context.lineTo(x + width * 0.48, y + height * 0.38);
    this.context.lineTo(x + width - rightFlangeWidth, y + height * 0.44);
    this.context.lineTo(x + width - rightFlangeWidth, y + height * 0.56);
    this.context.lineTo(x + width * 0.48, y + height * 0.62);
    this.context.lineTo(x + leftFlangeWidth, y + height * 0.74);
    this.context.closePath();
    this.context.fillStyle = this.linearGradient(x, y, x + width, y + height, ['#edf2f4', '#c3cdd3', '#f7fafb']);
    this.context.fill();
    this.context.stroke();

    this.context.strokeStyle = accentColor;
    this.context.lineWidth = 1.5;
    this.context.beginPath();
    this.context.moveTo(x + width * 0.28, y + height * 0.5);
    this.context.lineTo(x + width * 0.72, y + height * 0.5);
    this.context.stroke();

    if (running) {
      this.context.save();
      this.context.beginPath();
      this.context.moveTo(x + leftFlangeWidth, y + height * 0.26);
      this.context.lineTo(x + width * 0.48, y + height * 0.38);
      this.context.lineTo(x + width - rightFlangeWidth, y + height * 0.44);
      this.context.lineTo(x + width - rightFlangeWidth, y + height * 0.56);
      this.context.lineTo(x + width * 0.48, y + height * 0.62);
      this.context.lineTo(x + leftFlangeWidth, y + height * 0.74);
      this.context.closePath();
      this.context.clip();
      this.context.fillStyle = 'rgba(108, 214, 255, 0.2)';
      this.context.fillRect(x + width * 0.22, y + height * 0.38, width * 0.56, height * 0.24);
      for (let index = 0; index < 3; index += 1) {
        const streakX = x + width * 0.18 + (((time / 15) + index * width * 0.16) % (width * 0.44));

        this.context.fillStyle = 'rgba(255, 255, 255, 0.35)';
        this.context.fillRect(streakX, y + height * 0.45, width * 0.08, height * 0.1);
      }
      this.context.restore();
    }
  }

  private drawValve(x: number, y: number, width: number, height: number, running: boolean, time: number, valvePosition: number): void {
    const minPosition = 0;
    const maxPosition = 10;
    const openness = this.normalize(valvePosition, minPosition, maxPosition);
    const centerX = x + width * 0.5;
    const centerY = y + height * 0.18;
    const dialRadius = width * 0.24;
    const pointerAngle = -Math.PI * 0.75 + openness * Math.PI * 1.5 + (running ? Math.sin(time / 480) * 0.03 : 0);

    this.context.fillStyle = '#64717a';
    this.context.fillRect(x, y + height * 0.46, width * 0.18, height * 0.08);
    this.context.fillRect(x + width * 0.82, y + height * 0.46, width * 0.18, height * 0.08);

    this.context.beginPath();
    this.context.moveTo(x + width * 0.18, y + height * 0.26);
    this.context.lineTo(x + width * 0.5, y + height * 0.5);
    this.context.lineTo(x + width * 0.18, y + height * 0.74);
    this.context.closePath();
    this.context.fillStyle = this.linearGradient(x, y, x + width * 0.5, y + height, ['#eef3f5', '#bfcad0']);
    this.context.fill();
    this.context.stroke();

    this.context.beginPath();
    this.context.moveTo(x + width * 0.82, y + height * 0.26);
    this.context.lineTo(x + width * 0.5, y + height * 0.5);
    this.context.lineTo(x + width * 0.82, y + height * 0.74);
    this.context.closePath();
    this.context.fillStyle = this.linearGradient(x + width * 0.5, y, x + width, y + height, ['#d5dee2', '#f6fafb']);
    this.context.fill();
    this.context.stroke();

    this.context.fillStyle = running ? 'rgba(110, 210, 255, 0.18)' : 'rgba(91, 108, 118, 0.08)';
    this.context.fillRect(
      x + width * 0.46,
      y + height * (0.56 - openness * 0.18),
      width * 0.08,
      height * (0.14 + openness * 0.18),
    );

    this.context.strokeStyle = '#5f6c76';
    this.context.beginPath();
    this.context.moveTo(centerX, y + height * 0.24);
    this.context.lineTo(centerX, y + height * (0.4 - openness * 0.05));
    this.context.stroke();

    this.context.save();
    this.context.fillStyle = 'rgba(255, 255, 255, 0.92)';
    this.context.strokeStyle = running ? '#8f5a06' : '#5f6c76';
    this.context.lineWidth = 1.6;
    this.context.beginPath();
    this.context.arc(centerX, centerY, dialRadius, 0, Math.PI * 2);
    this.context.fill();
    this.context.stroke();

    for (let index = minPosition; index <= maxPosition; index += 1) {
      const ratio = index / maxPosition;
      const angle = -Math.PI * 0.75 + ratio * Math.PI * 1.5;
      const outerRadius = dialRadius - 1;
      const innerRadius = index === valvePosition ? dialRadius * 0.48 : dialRadius * 0.64;

      this.context.strokeStyle = index === valvePosition ? '#d59b35' : '#8e9aa0';
      this.context.lineWidth = index === valvePosition ? 2.2 : 1.1;
      this.context.beginPath();
      this.context.moveTo(centerX + Math.cos(angle) * innerRadius, centerY + Math.sin(angle) * innerRadius);
      this.context.lineTo(centerX + Math.cos(angle) * outerRadius, centerY + Math.sin(angle) * outerRadius);
      this.context.stroke();
    }

    this.context.strokeStyle = '#d59b35';
    this.context.lineWidth = 2.4;
    this.context.beginPath();
    this.context.moveTo(centerX, centerY);
    this.context.lineTo(centerX + Math.cos(pointerAngle) * dialRadius * 0.72, centerY + Math.sin(pointerAngle) * dialRadius * 0.72);
    this.context.stroke();
    this.context.fillStyle = running ? '#d59b35' : '#7d878e';
    this.context.beginPath();
    this.context.arc(centerX, centerY, dialRadius * 0.16, 0, Math.PI * 2);
    this.context.fill();
    this.context.restore();

    if (running) {
      this.measure({ x: centerX, y: y - 2 }, `Положение ${valvePosition}/10`, ['top', 'left', 'right']);
    }
  }

  private drawFlowmeter(x: number, y: number, width: number, height: number, running: boolean, time: number, volume: number): void {
    const pipeCenterY = y + height / 3;
    const stubHeight = height * 0.18;
    const flowLevel = this.clamp(volume * 8, 0, 1);
    const floatTravel = running ? flowLevel : 0.22;
    const floatY = y + height * (0.72 - floatTravel * 0.42) + (running ? Math.sin(time / 170) * height * 0.02 : 0);

    this.context.fillStyle = '#64717a';
    this.roundedRect(x, pipeCenterY - stubHeight / 2, width * 0.16, stubHeight, 4);
    this.context.fill();
    this.context.stroke();

    this.roundedRect(x + width * 0.16, y + height * 0.08, width * 0.68, height * 0.84, height * 0.22);
    this.context.fillStyle = this.linearGradient(x, y, x + width, y + height, ['#f5f8f9', '#dce4e8', '#c8d1d7']);
    this.context.fill();
    this.context.stroke();

    this.roundedRect(x + width * 0.4, y + height * 0.12, width * 0.18, height * 0.74, 8);
    this.context.fillStyle = this.linearGradient(x, y, x, y + height, ['rgba(159, 214, 255, 0.7)', 'rgba(238, 249, 255, 0.95)', 'rgba(140, 197, 245, 0.72)']);
    this.context.fill();
    this.context.stroke();

    this.context.save();
    this.roundedRect(x + width * 0.41, y + height * 0.13, width * 0.16, height * 0.72, 7);
    this.context.clip();
    this.context.fillStyle = 'rgba(126, 205, 255, 0.26)';
    this.context.fillRect(x + width * 0.42, floatY, width * 0.14, y + height * 0.85 - floatY);
    this.context.restore();

    this.context.strokeStyle = '#8b979e';
    this.context.lineWidth = 1;
    for (let index = 0; index < 4; index += 1) {
      const markY = y + height * (0.2 + index * 0.15);

      this.context.beginPath();
      this.context.moveTo(x + width * 0.6, markY);
      this.context.lineTo(x + width * 0.72, markY);
      this.context.stroke();
    }

    this.context.fillStyle = running ? '#d59b35' : '#7f8b93';
    this.context.beginPath();
    this.context.arc(x + width * 0.49, floatY, width * 0.05, 0, Math.PI * 2);
    this.context.fill();

    this.context.fillStyle = '#64717a';
    this.roundedRect(x + width * 0.84, pipeCenterY - stubHeight / 2, width * 0.16, stubHeight, 4);
    this.context.fill();
    this.context.stroke();
  }

  private ports(
    items: EquipmentPlacement[],
    visibleEquipmentIds: string[],
    hoveredPort: PortReference | null,
    connectionSource: PortReference | null,
  ): void {
    if (visibleEquipmentIds.length === 0 && !hoveredPort && !connectionSource) {
      return;
    }

    const visible = new Set(visibleEquipmentIds);
    const rendered = new Set<string>();

    for (const item of items) {
      const shouldRenderItem = visible.has(item.id) || hoveredPort?.equipmentId === item.id || connectionSource?.equipmentId === item.id;

      if (!shouldRenderItem) {
        continue;
      }

      const definition = LAB6_CONFIG.equipment[item.kind];

      for (const port of definition.ports) {
        const absolutePoint = {
          tileX: item.tileX + port.tileX,
          tileY: item.tileY + port.tileY,
        };
        const key = `${absolutePoint.tileX}:${absolutePoint.tileY}`;

        if (rendered.has(key)) {
          continue;
        }

        rendered.add(key);
        const point = this.grid.point(absolutePoint);
        const isHovered = hoveredPort?.equipmentId === item.id && hoveredPort.portId === port.id;
        const isSource = connectionSource?.equipmentId === item.id && connectionSource.portId === port.id;
        const radius = isHovered ? 7 : isSource ? 6.2 : 5;

        this.context.save();

        if (isHovered || isSource) {
          this.context.fillStyle = isHovered ? 'rgba(95, 162, 255, 0.18)' : 'rgba(243, 179, 77, 0.18)';
          this.context.beginPath();
          this.context.arc(point.x, point.y, radius + 5, 0, Math.PI * 2);
          this.context.fill();
        }

        this.context.fillStyle = isHovered ? '#5fa2ff' : isSource ? '#f3b34d' : '#2f7ed8';
        this.context.strokeStyle = isHovered ? '#245d96' : isSource ? '#8f5a06' : '#1d4d85';
        this.context.lineWidth = isHovered ? 2 : 1.5;
        this.context.beginPath();
        this.context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        this.context.fill();
        this.context.stroke();
        this.context.restore();
      }
    }
  }

  private sensors(item: EquipmentPlacement, state: RenderState, renderValues: boolean): void {
    const definition = LAB6_CONFIG.equipment[item.kind];
    const running = state.snapshot.stage === 'running';

    for (const slot of definition.sensorSlots) {
      const point = this.grid.point({ tileX: item.tileX + slot.tileX, tileY: item.tileY + slot.tileY });
      const installed = item.sensors.find((sensor) => sensor.slotId === slot.id);
      const measurementValue = state.snapshot.measurements ? this.sensorValue(item, slot.kind, state.snapshot.measurements) : null;

      if (state.snapshot.stage === 'instruments' && !installed) {
        this.context.strokeStyle = slot.kind === 'manometer' ? '#2f7ed8' : '#d88608';
        this.context.lineWidth = 1.5;
        this.context.beginPath();
        this.context.arc(point.x, point.y, 7, 0, Math.PI * 2);
        this.context.stroke();
      }

      if (!installed) {
        continue;
      }

      if (installed.kind === 'manometer') {
        this.gauge(point, measurementValue, running);
      }

      if (renderValues && state.snapshot.measurements) {
        this.values(item, slot.kind, point, state.snapshot.measurements);
      }
    }

    if (renderValues && state.snapshot.measurements && item.kind === 'flowmeter') {
      const point = this.grid.point({ tileX: item.tileX + Math.floor(item.tileWidth / 2), tileY: item.tileY });
      const litersPerMinute = state.snapshot.measurements.volume * 1000 * 60;
      const value = `${litersPerMinute.toFixed(2)} л/м`;

      this.measure(point, value, ['top', 'right', 'left', 'bottom']);
    }
  }

  private values(item: EquipmentPlacement, kind: SensorKind, point: PixelPoint, measurements: RenderState['snapshot']['measurements']): void {
    if (!measurements) {
      return;
    }

    const reading = this.sensorValue(item, kind, measurements);
    const value = `${reading.toFixed(2)} бар`;
    const offsetX = 10;
    const offsetY = -6;

    const preferredSides: Array<'top' | 'right' | 'bottom' | 'left'> = ['right', 'left', 'top', 'bottom'];

    this.measure({ x: point.x + offsetX, y: point.y + offsetY }, value, preferredSides);
  }

  private sensorValue(
    item: EquipmentPlacement,
    _kind: SensorKind,
    measurements: NonNullable<RenderState['snapshot']['measurements']>,
  ): number {
    const highChamber = item.ordinal === 1;

    return highChamber ? measurements.pressureHighDisplay : measurements.pressureLowDisplay;
  }

  private measure(point: PixelPoint, value: string, preferredSides: Array<'top' | 'right' | 'bottom' | 'left'> = ['right', 'left', 'top', 'bottom']): void {
    const paddingX = 8;
    const paddingY = 6;
    const fontSize = 12;
    const height = 24;
    const gap = 10;
    const ringGap = height + 8;

    this.context.save();
    this.context.font = `600 ${fontSize}px Georgia, serif`;
    const width = this.context.measureText(value).width + paddingX * 2;
    const anchorX = point.x;
    const anchorY = point.y;
    const candidates = preferredSides.flatMap((side) =>
      [gap, gap + ringGap, gap + ringGap * 2].map((distance) => {
        if (side === 'right') {
          return { x: anchorX + distance, y: anchorY - height / 2 };
        }

        if (side === 'left') {
          return { x: anchorX - width - distance, y: anchorY - height / 2 };
        }

        if (side === 'top') {
          return { x: anchorX - width / 2, y: anchorY - height - distance };
        }

        return { x: anchorX - width / 2, y: anchorY + distance };
      }),
    );
    const placements = candidates.map((candidate) => ({
      x: Math.min(Math.max(candidate.x, 8), this.viewportWidth - width - 8),
      y: Math.min(Math.max(candidate.y, 8), this.viewportHeight - height - 8),
    }));
    const placement = placements.find(({ x, y }) => !this.badgeOverlaps(x, y, width, height)) ?? placements[0] ?? { x: anchorX + gap, y: anchorY - height / 2 };
    const x = placement.x;
    const y = placement.y;
    const attachX = this.clamp(anchorX, x, x + width);
    const attachY = this.clamp(anchorY, y, y + height);
    this.context.strokeStyle = 'rgba(124, 136, 145, 0.55)';
    this.context.lineWidth = 1.2;
    this.context.beginPath();
    this.context.moveTo(anchorX, anchorY);
    this.context.lineTo(attachX, attachY);
    this.context.stroke();
    this.context.fillStyle = 'rgba(124, 136, 145, 0.78)';
    this.context.beginPath();
    this.context.arc(anchorX, anchorY, 2.1, 0, Math.PI * 2);
    this.context.fill();
    this.context.fillStyle = 'rgba(255, 255, 255, 0.95)';
    this.context.strokeStyle = '#b5bdc2';
    this.context.lineWidth = 1;
    this.context.shadowColor = 'rgba(87, 84, 74, 0.12)';
    this.context.shadowBlur = 10;
    this.roundedRect(x, y, width, height, 8);
    this.context.fill();
    this.context.shadowBlur = 0;
    this.context.stroke();
    this.context.fillStyle = '#394047';
    this.context.fillText(value, x + paddingX, y + height - paddingY - 2);
    this.context.restore();
    this.badgeBounds.push({ x, y, width, height });
  }

  private badgeOverlaps(x: number, y: number, width: number, height: number): boolean {
    const padding = 6;

    return this.badgeBounds.some((bounds) => {
      const horizontal = x < bounds.x + bounds.width + padding && x + width + padding > bounds.x;
      const vertical = y < bounds.y + bounds.height + padding && y + height + padding > bounds.y;

      return horizontal && vertical;
    });
  }

  private gauge(point: PixelPoint, value: number | null, running: boolean): void {
    const time = this.animationTime();
    const reading = value ?? 0;
    const sweep = this.clamp(reading / 140, 0, 1);
    const angle = -Math.PI * 0.82 + sweep * Math.PI * 0.64 + (running ? Math.sin(time / 320 + point.x * 0.02) * 0.03 : 0);

    this.context.save();
    this.context.fillStyle = '#ffffff';
    this.context.strokeStyle = '#3a4248';
    this.context.lineWidth = 1.5;
    this.context.beginPath();
    this.context.arc(point.x, point.y, 7, 0, Math.PI * 2);
    this.context.fill();
    this.context.stroke();
    this.context.strokeStyle = '#8e9aa0';
    this.context.lineWidth = 1;
    this.context.beginPath();
    this.context.arc(point.x, point.y, 5.2, Math.PI * 1.05, Math.PI * 1.95);
    this.context.stroke();
    for (let index = 0; index < 4; index += 1) {
      const tickAngle = Math.PI * (1.06 + index * 0.29);

      this.context.beginPath();
      this.context.moveTo(point.x + Math.cos(tickAngle) * 3.9, point.y + Math.sin(tickAngle) * 3.9);
      this.context.lineTo(point.x + Math.cos(tickAngle) * 5.1, point.y + Math.sin(tickAngle) * 5.1);
      this.context.stroke();
    }
    this.context.strokeStyle = '#d59b35';
    this.context.lineWidth = 1.5;
    this.context.beginPath();
    this.context.moveTo(point.x, point.y);
    this.context.lineTo(point.x + Math.cos(angle) * 4.5, point.y + Math.sin(angle) * 4.5);
    this.context.stroke();
    this.context.fillStyle = running ? '#d59b35' : '#7d878e';
    this.context.beginPath();
    this.context.arc(point.x, point.y, 1.3, 0, Math.PI * 2);
    this.context.fill();
    this.context.restore();
  }


  private pipe(path: GridPoint[], flowing: boolean, flowPath: GridPoint[] = path, selected = false): void {
    if (path.length < 2) {
      return;
    }

    const pixels = this.pathPixels(path);
    const bounds = this.pathBounds(pixels);
    const diameter = Math.max(this.grid.getTileSize() * 0.72, 10);
    const cornerRadius = Math.min(this.grid.getTileSize() * 0.56, diameter * 0.62);
    const shellGradient = this.linearGradient(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, [
      '#58626a',
      '#a4afb6',
      '#d3dce0',
      '#6c7780',
    ]);
    const boreGradient = this.linearGradient(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, [
      'rgba(228, 237, 241, 0.94)',
      'rgba(250, 252, 253, 0.98)',
      'rgba(185, 198, 206, 0.88)',
    ]);

    this.context.save();
    this.context.lineCap = 'round';
    this.context.lineJoin = 'round';

    if (selected) {
      this.strokeRoundedPolyline(pixels, diameter + 8, 'rgba(95, 162, 255, 0.24)', cornerRadius);
    }

    this.strokeRoundedPolyline(pixels, diameter + 4, 'rgba(66, 73, 78, 0.18)', cornerRadius);
    this.strokeRoundedPolyline(pixels, diameter + 1.5, '#485159', cornerRadius);
    this.strokeRoundedPolyline(pixels, diameter, shellGradient, cornerRadius);
    this.strokeRoundedPolyline(pixels, diameter * 0.56, boreGradient, cornerRadius);
    this.strokeRoundedPolyline(pixels, Math.max(diameter * 0.12, 1.5), 'rgba(255, 255, 255, 0.52)', cornerRadius);
    this.pipeJoints(pixels, diameter);

    if (flowing) {
      this.flow(this.pathPixels(flowPath), bounds, diameter, cornerRadius);
    }

    this.context.restore();
  }

  private flowPath(
    path: GridPoint[],
    from: { equipmentId: string; portId: string },
    to: { equipmentId: string; portId: string },
    items: EquipmentPlacement[],
  ): GridPoint[] {
    const fromDirection = this.portDirection(from.portId);
    const toDirection = this.portDirection(to.portId);

    if (fromDirection === 'out' && toDirection === 'in') {
      return path;
    }

    if (fromDirection === 'in' && toDirection === 'out') {
      return [...path].reverse();
    }

    const fromItem = items.find((item) => item.id === from.equipmentId);
    const toItem = items.find((item) => item.id === to.equipmentId);

    if (!fromItem || !toItem) {
      return path;
    }

    return this.flowRank(fromItem) <= this.flowRank(toItem) ? path : [...path].reverse();
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

  private flowRank(item: EquipmentPlacement): number {
    switch (item.kind) {
      case 'compressor':
        return 0;
      case 'receiver':
        return 1;
      case 'chamber':
        return item.ordinal === 1 ? 2 : 4;
      case 'nozzle':
        return 3;
      case 'valve':
        return 5;
      case 'flowmeter':
        return 6;
      default:
        return 99;
    }
  }

  private flow(
    pixels: PixelPoint[],
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    diameter: number,
    cornerRadius: number,
  ): void {
    const time = this.animationTime();
    const glowGradient = this.linearGradient(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, [
      'rgba(69, 188, 255, 0.18)',
      'rgba(129, 225, 255, 0.92)',
      'rgba(226, 250, 255, 0.74)',
    ]);

    this.context.save();
    this.context.setLineDash([diameter * 0.58, diameter * 0.92]);
    this.context.lineDashOffset = -(time / 48);
    this.strokeRoundedPolyline(pixels, diameter * 0.22, glowGradient, cornerRadius);
    this.context.setLineDash([diameter * 0.18, diameter * 1.1]);
    this.context.lineDashOffset = -(time / 22);
    this.strokeRoundedPolyline(pixels, Math.max(diameter * 0.1, 1.4), 'rgba(255, 255, 255, 0.95)', cornerRadius);
    this.context.setLineDash([]);
    this.context.restore();
  }

  private pipeJoints(pixels: PixelPoint[], diameter: number): void {
    const joints: PixelPoint[] = [];

    if (pixels.length > 0) {
      joints.push(pixels[0]);
    }

    for (let index = 1; index < pixels.length - 1; index += 1) {
      const previous = pixels[index - 1];
      const current = pixels[index];
      const next = pixels[index + 1];
      const horizontalBefore = previous.y === current.y;
      const horizontalAfter = current.y === next.y;

      if (horizontalBefore !== horizontalAfter) {
        joints.push(current);
      }
    }

    if (pixels.length > 1) {
      joints.push(pixels[pixels.length - 1]);
    }

    for (const joint of joints) {
      this.context.fillStyle = '#d6dde1';
      this.context.strokeStyle = '#556069';
      this.context.lineWidth = 1;
      this.context.beginPath();
      this.context.arc(joint.x, joint.y, diameter * 0.16, 0, Math.PI * 2);
      this.context.fill();
      this.context.stroke();
    }
  }

  private pathPixels(path: GridPoint[]): PixelPoint[] {
    return path.map((point) => this.grid.point(point));
  }

  private pathBounds(path: PixelPoint[]): { minX: number; minY: number; maxX: number; maxY: number } {
    return path.reduce(
      (bounds, point) => ({
        minX: Math.min(bounds.minX, point.x),
        minY: Math.min(bounds.minY, point.y),
        maxX: Math.max(bounds.maxX, point.x),
        maxY: Math.max(bounds.maxY, point.y),
      }),
      {
        minX: path[0]?.x ?? 0,
        minY: path[0]?.y ?? 0,
        maxX: path[0]?.x ?? 0,
        maxY: path[0]?.y ?? 0,
      },
    );
  }

  private strokeRoundedPolyline(
    path: PixelPoint[],
    lineWidth: number,
    strokeStyle: string | CanvasGradient,
    radius: number,
  ): void {
    this.context.lineWidth = lineWidth;
    this.context.strokeStyle = strokeStyle;
    this.traceRoundedPolyline(path, radius);
    this.context.stroke();
  }

  private traceRoundedPolyline(path: PixelPoint[], radius: number): void {
    this.context.beginPath();

    if (path.length === 0) {
      return;
    }

    this.context.moveTo(path[0].x, path[0].y);

    if (path.length === 1) {
      return;
    }

    if (path.length === 2) {
      this.context.lineTo(path[1].x, path[1].y);

      return;
    }

    for (let index = 1; index < path.length - 1; index += 1) {
      const previous = path[index - 1];
      const current = path[index];
      const next = path[index + 1];
      const inVector = { x: current.x - previous.x, y: current.y - previous.y };
      const outVector = { x: next.x - current.x, y: next.y - current.y };
      const inLength = Math.hypot(inVector.x, inVector.y);
      const outLength = Math.hypot(outVector.x, outVector.y);
      const straight = (inVector.x === 0 && outVector.x === 0) || (inVector.y === 0 && outVector.y === 0);

      if (inLength === 0 || outLength === 0 || straight) {
        this.context.lineTo(current.x, current.y);

        continue;
      }

      const cornerRadius = Math.min(radius, inLength / 2, outLength / 2);
      const start = {
        x: current.x - (inVector.x / inLength) * cornerRadius,
        y: current.y - (inVector.y / inLength) * cornerRadius,
      };
      const end = {
        x: current.x + (outVector.x / outLength) * cornerRadius,
        y: current.y + (outVector.y / outLength) * cornerRadius,
      };

      this.context.lineTo(start.x, start.y);
      this.context.quadraticCurveTo(current.x, current.y, end.x, end.y);
    }

    const last = path[path.length - 1];

    this.context.lineTo(last.x, last.y);
  }

  private animationTime(): number {
    return typeof performance === 'undefined' ? Date.now() : performance.now();
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private normalize(value: number, min: number, max: number): number {
    if (max <= min) {
      return 0;
    }

    return this.clamp((value - min) / (max - min), 0, 1);
  }

  private roundedRect(x: number, y: number, width: number, height: number, radius: number): void {
    this.context.beginPath();
    this.context.moveTo(x + radius, y);
    this.context.arcTo(x + width, y, x + width, y + height, radius);
    this.context.arcTo(x + width, y + height, x, y + height, radius);
    this.context.arcTo(x, y + height, x, y, radius);
    this.context.arcTo(x, y, x + width, y, radius);
    this.context.closePath();
  }

  private linearGradient(x0: number, y0: number, x1: number, y1: number, stops: string[]): CanvasGradient {
    const gradient = this.context.createLinearGradient(x0, y0, x1, y1);

    for (const [index, color] of stops.entries()) {
      gradient.addColorStop(index / Math.max(stops.length - 1, 1), color);
    }

    return gradient;
  }
}