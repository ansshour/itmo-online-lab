export interface GridPoint {
  readonly tileX: number;
  readonly tileY: number;
}

export interface GridArea extends GridPoint {
  readonly tileWidth: number;
  readonly tileHeight: number;
}

export interface PixelPoint {
  readonly x: number;
  readonly y: number;
}

export interface GridProps {
  readonly tileSize: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly width: number;
  readonly height: number;
}