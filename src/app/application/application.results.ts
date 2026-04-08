import { APPLICATION_CLASS_NAMES, APPLICATION_LABELS } from './application.consts';
import { ApplicationLatex } from './application.latex';
import { GasModelKind } from '../../config/lab6/gases/lab6.gases.types';
import type { Lab6MeasurementRecord } from '../../domain/lab6/lab6.measurements.types';

export class ApplicationResults {
  private readonly latex: ApplicationLatex;

  public constructor(latex: ApplicationLatex) {
    this.latex = latex;
  }

  public preview(props: {
    readonly records: readonly Lab6MeasurementRecord[];
    readonly gasLabel: string;
    readonly hasOtherMeasurements: boolean;
  }): string {
    const chartMarkup = props.records.length > 0
      ? this.chart(props.records, true)
      : this.emptyPreview(props.gasLabel, props.hasOtherMeasurements);

    return `
      <section class="${APPLICATION_CLASS_NAMES.resultsSection}">
        <h3 class="${APPLICATION_CLASS_NAMES.panelTitle}">${this.velocityChartTitle()}</h3>
        <div class="${APPLICATION_CLASS_NAMES.chart}" data-element="results-chart">${chartMarkup}</div>
      </section>
    `;
  }

  public velocityChartTitle(): string {
    return `${APPLICATION_LABELS.velocityChart} от ${this.latex.inline(String.raw`\frac{p_{2\mathrm{abs}}}{p_{1\mathrm{abs}}}`)}`;
  }

  public table(records: readonly Lab6MeasurementRecord[]): string {
    if (records.length === 0) {
      return `<div class="${APPLICATION_CLASS_NAMES.chartEmpty}">${APPLICATION_LABELS.emptyMeasurements}</div>`;
    }

    return `
      <table>
        <thead>
          <tr>
            <th>№</th>
            <th>Газ</th>
            <th>${this.latex.inline(String.raw`p_1,\,\text{бар}`)}</th>
            <th>${this.latex.inline(String.raw`p_2,\,\text{бар}`)}</th>
            <th>${this.latex.inline(String.raw`Q,\,\text{л/м}`)}</th>
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

  public chart(records: readonly Lab6MeasurementRecord[], compact: boolean): string {
    if (records.length === 0) {
      return `<div class="${APPLICATION_CLASS_NAMES.chartEmpty}">${APPLICATION_LABELS.emptyMeasurements}</div>`;
    }

    const sorted = [...records].sort((left, right) => left.pressureRatio - right.pressureRatio);
    const plotWidth = compact ? 320 : 640;
    const plotHeight = compact ? 180 : 320;
    const pressureValues = sorted.map((record) => record.pressureRatio);
    const [minCompactX, maxCompactX] = this.compactRange(pressureValues, { minSpan: 0.08, paddingRatio: 0.14, floor: 0, ceiling: 1 });
    const minX = compact ? minCompactX : 0.2;
    const maxX = compact ? maxCompactX : 0.95;
    const velocityValues = sorted.map((record) => record.velocity);
    const rawMinY = Math.min(...velocityValues);
    const rawMaxY = Math.max(...velocityValues);
    const [minCompactY, maxCompactY] = this.compactRange(velocityValues, { minSpan: 20, paddingRatio: 0.18, floor: 0 });
    const minY = compact ? minCompactY : Math.min(40, Math.floor(rawMinY / 50) * 50);
    const maxY = compact ? maxCompactY : Math.max(320, Math.ceil(rawMaxY / 50) * 50);
    const pointRadius = compact ? 4 : 6;
    const strokeWidth = compact ? 2.5 : 3;
    const xTickValues = compact
      ? Array.from({ length: 5 }, (_, index) => minX + (maxX - minX) * (index / 4))
      : [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    const yTickValues = compact
      ? Array.from({ length: 5 }, (_, index) => maxY - (maxY - minY) * (index / 4))
      : Array.from({ length: Math.floor((maxY - minY) / 50) + 1 }, (_, index) => maxY - index * 50);
    const gasPalette = this.palette(records);
    const groupedRecords = Array.from(
      records.reduce((groups, record) => {
        const current = groups.get(record.gasId) ?? [];

        current.push(record);
        groups.set(record.gasId, current);

        return groups;
      }, new Map<string, Lab6MeasurementRecord[]>()),
    );

    const coordinatesByGas = groupedRecords.map(([gasId, gasRecords]) => {
      const gasSorted = [...gasRecords].sort((left, right) => left.pressureRatio - right.pressureRatio);

      return {
        gasId,
        gasLabel: gasSorted[0]?.gasLabel ?? gasId,
        gasModel: gasSorted[0]?.gasModel ?? GasModelKind.Real,
        color: gasPalette.get(gasId) ?? '#1f7a6a',
        points: gasSorted.map((record) => {
          const clampedPressureRatio = Math.min(Math.max(record.pressureRatio, minX), maxX);
          const clampedVelocity = Math.min(Math.max(record.velocity, minY), maxY);
          const x = ((clampedPressureRatio - minX) / Math.max(maxX - minX, 1e-6)) * plotWidth;
          const y = plotHeight - ((clampedVelocity - minY) / Math.max(maxY - minY, 1e-6)) * plotHeight;

          return {
            x,
            y,
            record,
          };
        }),
      };
    });

    const xTicks = xTickValues.map((value) => ({
      label: value.toFixed(1).replace('.', ','),
      position: ((value - minX) / Math.max(maxX - minX, 1e-6)) * plotWidth,
    }));
    const yTicks = yTickValues.map((value) => ({
      label: String(Math.round(value)),
      position: plotHeight - ((value - minY) / Math.max(maxY - minY, 1e-6)) * plotHeight,
    }));
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
    const shouldRenderLegend = coordinatesByGas.length > 1;

    return `
      ${shouldRenderLegend ? `<div class="${APPLICATION_CLASS_NAMES.chartLegend}">${legendMarkup}</div>` : ''}
      <div class="${APPLICATION_CLASS_NAMES.chartPlot}">
        <div class="${APPLICATION_CLASS_NAMES.chartMain}">
          <div class="${APPLICATION_CLASS_NAMES.chartYAxis}">
            <div class="${APPLICATION_CLASS_NAMES.chartAxisLabel} ${APPLICATION_CLASS_NAMES.chartAxisLabelY}">${this.latex.inline(String.raw`w,\,\text{м/с}`)}</div>
            <div class="${APPLICATION_CLASS_NAMES.chartYAxisTicks}">
              ${yTicks.map(({ label }) => `<span class="${APPLICATION_CLASS_NAMES.chartYAxisTick}">${label}</span>`).join('')}
            </div>
          </div>
          <div class="${APPLICATION_CLASS_NAMES.chartStage}">
            <svg viewBox="0 0 ${plotWidth} ${plotHeight}" class="${APPLICATION_CLASS_NAMES.chartSvg}" aria-label="${APPLICATION_LABELS.velocityChart}">
              ${xTicks
                .filter(({ position }) => position > 0 && position < plotWidth)
                .map(
                  ({ position }) => `<line x1="${position.toFixed(1)}" y1="0" x2="${position.toFixed(1)}" y2="${plotHeight}" stroke="rgba(102,123,134,0.22)" stroke-width="1" />`,
                )
                .join('')}
              ${yTicks
                .filter(({ position }) => position > 0 && position < plotHeight)
                .map(
                  ({ position }) => `<line x1="0" y1="${position.toFixed(1)}" x2="${plotWidth}" y2="${position.toFixed(1)}" stroke="rgba(102,123,134,0.22)" stroke-width="1" />`,
                )
                .join('')}
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
                          <title>${record.gasLabel}: скорость ${record.velocity.toFixed(2)} м/с; отношение давлений ${record.pressureRatio.toFixed(3)}</title>
                          <rect x="${(x - pointRadius).toFixed(1)}" y="${(y - pointRadius).toFixed(1)}" width="${(pointRadius * 2).toFixed(1)}" height="${(pointRadius * 2).toFixed(1)}" rx="1" fill="none" stroke="${color}" stroke-width="2" />
                        </g>
                      `,
                    )
                    .join(''),
                )
                .join('')}
            </svg>
          </div>
        </div>
        <div class="${APPLICATION_CLASS_NAMES.chartXAxisRow}">
          <div class="${APPLICATION_CLASS_NAMES.chartAxisCorner}" aria-hidden="true"></div>
          <div class="${APPLICATION_CLASS_NAMES.chartXAxis}">
            <div class="${APPLICATION_CLASS_NAMES.chartXAxisTicks}">
              ${xTicks.map(({ label }) => `<span class="${APPLICATION_CLASS_NAMES.chartXAxisTick}">${label}</span>`).join('')}
            </div>
            <div class="${APPLICATION_CLASS_NAMES.chartAxisLabel} ${APPLICATION_CLASS_NAMES.chartAxisLabelX}">${this.latex.inline(String.raw`\beta = \frac{p_{2\mathrm{abs}}}{p_{1\mathrm{abs}}}`)}</div>
          </div>
        </div>
      </div>
    `;
  }

  private gasBadgeClassName(model: GasModelKind): string {
    return model === GasModelKind.Ideal ? APPLICATION_CLASS_NAMES.gasBadgeIdeal : APPLICATION_CLASS_NAMES.gasBadgeReal;
  }

  private emptyPreview(gasLabel: string, hasOtherMeasurements: boolean): string {
    return `
      <div class="${APPLICATION_CLASS_NAMES.emptyState}">
        <div class="${APPLICATION_CLASS_NAMES.emptyStateTitle}">${APPLICATION_LABELS.emptyActiveGasMeasurements}</div>
        <div class="${APPLICATION_CLASS_NAMES.emptyStateText}">
          <p>${APPLICATION_LABELS.emptyActiveGasMeasurementsHint}</p>
          ${hasOtherMeasurements ? `<p>${APPLICATION_LABELS.emptyOtherGasMeasurementsHint}</p>` : ''}
          <p><strong>${gasLabel}</strong></p>
        </div>
      </div>
    `;
  }

  private compactRange(
    values: readonly number[],
    options: {
      readonly minSpan: number;
      readonly paddingRatio: number;
      readonly floor?: number;
      readonly ceiling?: number;
    },
  ): [number, number] {
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const rawSpan = maxValue - minValue;

    if (rawSpan > 1e-6) {
      const padding = rawSpan * options.paddingRatio;

      return [
        this.bound(minValue - padding, options.floor, options.ceiling),
        this.bound(maxValue + padding, options.floor, options.ceiling),
      ];
    }

    const center = minValue;
    const span = Math.max(options.minSpan, Math.abs(center) * options.paddingRatio * 2);
    const halfSpan = span / 2;

    return [
      this.bound(center - halfSpan, options.floor, options.ceiling),
      this.bound(center + halfSpan, options.floor, options.ceiling),
    ];
  }

  private bound(value: number, floor?: number, ceiling?: number): number {
    if (typeof floor === 'number' && value < floor) {
      return floor;
    }

    if (typeof ceiling === 'number' && value > ceiling) {
      return ceiling;
    }

    return value;
  }

  private palette(records: readonly Lab6MeasurementRecord[]): Map<string, string> {
    const colors = ['#1f7a6a', '#2f7ed8', '#d88608', '#8f5a06', '#7b61ff', '#c75146', '#0f9d8a', '#5f6c76'];
    const gasIds = [...new Set(records.map((record) => record.gasId))];

    return new Map(gasIds.map((gasId, index) => [gasId, colors[index % colors.length]]));
  }
}