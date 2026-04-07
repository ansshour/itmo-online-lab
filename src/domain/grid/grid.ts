import type { GridArea, GridPoint, PixelPoint } from './grid.types';

export class Grid {
  private readonly tileSize: number;

  private readonly offsetX: number;

  private readonly offsetY: number;

  private readonly width: number;

  private readonly height: number;

  public constructor(tileSize: number, offsetX: number, offsetY: number, width: number, height: number) {
    this.tileSize = tileSize;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    this.width = width;
    this.height = height;
  }

  public snap(point: PixelPoint): GridPoint {
    const tileX = Math.floor((point.x - this.offsetX) / this.tileSize);
    const tileY = Math.floor((point.y - this.offsetY) / this.tileSize);

    return { tileX, tileY };
  }

  public point(point: GridPoint): PixelPoint {
    const x = point.tileX * this.tileSize + this.offsetX;
    const y = point.tileY * this.tileSize + this.offsetY;

    return { x, y };
  }

  public fit(area: GridArea): boolean {
    const withinLeft = area.tileX >= 0;
    const withinTop = area.tileY >= 0;
    const withinRight = area.tileX + area.tileWidth <= this.width;
    const withinBottom = area.tileY + area.tileHeight <= this.height;

    return withinLeft && withinTop && withinRight && withinBottom;
  }

  public inside(point: GridPoint): boolean {
    const withinLeft = point.tileX >= 0;
    const withinTop = point.tileY >= 0;
    const withinRight = point.tileX < this.width;
    const withinBottom = point.tileY < this.height;

    return withinLeft && withinTop && withinRight && withinBottom;
  }

  public overlap(left: GridArea, right: GridArea): boolean {
    const separateHorizontally = left.tileX + left.tileWidth <= right.tileX || right.tileX + right.tileWidth <= left.tileX;
    const separateVertically = left.tileY + left.tileHeight <= right.tileY || right.tileY + right.tileHeight <= left.tileY;

    return !separateHorizontally && !separateVertically;
  }

  public widthPixels(): number {
    return this.width * this.tileSize + this.offsetX * 2;
  }

  public heightPixels(): number {
    return this.height * this.tileSize + this.offsetY * 2;
  }

  public getTileSize(): number {
    return this.tileSize;
  }
}