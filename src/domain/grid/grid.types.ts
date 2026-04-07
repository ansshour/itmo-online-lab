export type GridPoint = {
  tileX: number;
  tileY: number;
};

export type GridArea = GridPoint & {
  tileWidth: number;
  tileHeight: number;
};

export type PixelPoint = {
  x: number;
  y: number;
};