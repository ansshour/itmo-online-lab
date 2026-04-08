import { APPLICATION_CLASS_NAMES, APPLICATION_LABELS } from './application.consts';
import { GasModelKind } from '../../config/lab6/gases/lab6.gases.types';
import type { Lab6MeasurementRecord } from '../../domain/lab6/lab6.measurements.types';

export class ApplicationResults {
  public preview(records: readonly Lab6MeasurementRecord[]): string {
    const previewRecords = records.slice(-4);

    return `
      <section class="${APPLICATION_CLASS_NAMES.resultsSection}">
        <h3 class="${APPLICATION_CLASS_NAMES.panelTitle}">${APPLICATION_LABELS.measurementsTable}</h3>
        <div class="${APPLICATION_CLASS_NAMES.resultsTable}" data-element="results-table">${this.table(previewRecords)}</div>
      </section>
      <section class="${APPLICATION_CLASS_NAMES.resultsSection}">
        <h3 class="${APPLICATION_CLASS_NAMES.panelTitle}">${APPLICATION_LABELS.velocityChart}</h3>
        <div class="${APPLICATION_CLASS_NAMES.chart}" data-element="results-chart">${this.chart(records, true)}</div>
      </section>
    `;
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
            <th>p1, бар</th>
            <th>p2, бар</th>
            <th>Q, л/м</th>
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
    const width = compact ? 320 : 640;
    const height = compact ? 180 : 320;
    const paddingLeft = compact ? 24 : 72;
    const paddingRight = compact ? 24 : 28;
    const paddingTop = compact ? 24 : 20;
    const paddingBottom = compact ? 24 : 56;
    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;
    const minX = compact ? Math.min(...sorted.map((record) => record.pressureRatio)) : 0.2;
    const maxX = compact ? Math.max(...sorted.map((record) => record.pressureRatio)) : 0.95;
    const velocityValues = sorted.map((record) => record.velocity);
    const rawMinY = Math.min(...velocityValues);
    const rawMaxY = Math.max(...velocityValues);
    const minY = compact ? rawMinY : Math.min(40, Math.floor(rawMinY / 50) * 50);
    const maxY = compact ? rawMaxY : Math.max(320, Math.ceil(rawMaxY / 50) * 50);
    const axisY = height - paddingBottom;
    const axisX = paddingLeft;
    const pointRadius = compact ? 4 : 6;
    const strokeWidth = compact ? 2.5 : 3;
    const labelFontSize = compact ? 11 : 14;
    const tickFontSize = compact ? 10 : 12;
    const xTickValues = compact ? null : [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    const yTickValues = compact
      ? null
      : Array.from({ length: Math.floor((maxY - minY) / 50) + 1 }, (_, index) => minY + index * 50).filter((value) => value > minY);
    const xTicks = xTickValues?.length ?? 5;
    const yTicks = yTickValues?.length ?? 5;
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
          const x = paddingLeft + ((clampedPressureRatio - minX) / Math.max(maxX - minX, 1e-6)) * plotWidth;
          const y = axisY - ((clampedVelocity - minY) / Math.max(maxY - minY, 1e-6)) * plotHeight;

          return {
            x,
            y,
            record,
          };
        }),
      };
    });

    const xTickMarks = Array.from({ length: xTicks }, (_, index) => {
      const value = xTickValues ? xTickValues[index] : minX + (maxX - minX) * (xTicks === 1 ? 0 : index / (xTicks - 1));
      const ratio = (value - minX) / Math.max(maxX - minX, 1e-6);
      const x = axisX + plotWidth * ratio;

      return `
        <g>
          <line x1="${x.toFixed(1)}" y1="${paddingTop}" x2="${x.toFixed(1)}" y2="${axisY}" stroke="rgba(102,123,134,0.22)" stroke-width="1" />
          <line x1="${x.toFixed(1)}" y1="${axisY}" x2="${x.toFixed(1)}" y2="${(axisY + 6).toFixed(1)}" stroke="rgba(102,123,134,0.45)" stroke-width="1" />
          <text x="${x.toFixed(1)}" y="${(axisY + 24).toFixed(1)}" text-anchor="middle" font-size="${tickFontSize}" fill="#667b86">${value.toFixed(1).replace('.', ',')}</text>
        </g>
      `;
    }).join('');
    const yTickMarks = Array.from({ length: yTicks }, (_, index) => {
      const value = yTickValues ? yTickValues[index] : maxY - (maxY - minY) * (yTicks === 1 ? 0 : index / (yTicks - 1));
      const ratio = (value - minY) / Math.max(maxY - minY, 1e-6);
      const y = axisY - plotHeight * ratio;

      return `
        <g>
          <line x1="${axisX}" y1="${y.toFixed(1)}" x2="${(width - paddingRight).toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(102,123,134,0.22)" stroke-width="1" />
          <line x1="${(axisX - 6).toFixed(1)}" y1="${y.toFixed(1)}" x2="${axisX}" y2="${y.toFixed(1)}" stroke="rgba(102,123,134,0.45)" stroke-width="1" />
          <text x="${(axisX - 10).toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="${tickFontSize}" fill="#667b86">${Math.round(value)}</text>
        </g>
      `;
    }).join('');
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

    return `
      <div class="${APPLICATION_CLASS_NAMES.chartLegend}">${legendMarkup}</div>
      <svg viewBox="0 0 ${width} ${height}" class="${APPLICATION_CLASS_NAMES.chart}" aria-label="${APPLICATION_LABELS.velocityChart}">
        <line x1="${axisX}" y1="${axisY}" x2="${width - paddingRight}" y2="${axisY}" stroke="rgba(102,123,134,0.45)" stroke-width="1.5" />
        <line x1="${axisX}" y1="${paddingTop}" x2="${axisX}" y2="${axisY}" stroke="rgba(102,123,134,0.45)" stroke-width="1.5" />
        ${xTickMarks}
        ${yTickMarks}
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
                    <title>${record.gasLabel}: скорость ${record.velocity.toFixed(2)} м/с; отношение ${record.pressureRatio.toFixed(3)}</title>
                    <rect x="${(x - pointRadius).toFixed(1)}" y="${(y - pointRadius).toFixed(1)}" width="${(pointRadius * 2).toFixed(1)}" height="${(pointRadius * 2).toFixed(1)}" rx="1" fill="none" stroke="${color}" stroke-width="2" />
                  </g>
                `,
              )
              .join(''),
          )
          .join('')}
        <text x="${(paddingLeft + plotWidth / 2).toFixed(1)}" y="${(height - 12).toFixed(1)}" text-anchor="middle" font-size="${labelFontSize}" fill="#111">Beta</text>
        <text x="${compact ? 12 : 22}" y="${compact ? 18 : 24}" text-anchor="start" font-size="${labelFontSize}" fill="#111">w, м/с</text>
      </svg>
    `;
  }

  private gasBadgeClassName(model: GasModelKind): string {
    return model === GasModelKind.Ideal ? APPLICATION_CLASS_NAMES.gasBadgeIdeal : APPLICATION_CLASS_NAMES.gasBadgeReal;
  }

  private palette(records: readonly Lab6MeasurementRecord[]): Map<string, string> {
    const colors = ['#1f7a6a', '#2f7ed8', '#d88608', '#8f5a06', '#7b61ff', '#c75146', '#0f9d8a', '#5f6c76'];
    const gasIds = [...new Set(records.map((record) => record.gasId))];

    return new Map(gasIds.map((gasId, index) => [gasId, colors[index % colors.length]]));
  }
}