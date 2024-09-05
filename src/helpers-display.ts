import {html, TemplateResult} from "lit";
import moment from "moment";
import {CardConfig, DisplayData} from "./types-card";
import {localize} from "./localize/localize";

function color(config: CardConfig, name?: string): string {
  if (!config?.color_config)
    return '';

  return config.color_config[name ?? 'default'] ?? '';
}


function renderTableHeaderRow(config: CardConfig, data: DisplayData): TemplateResult {
  function generateColumnHeader(colName: string, maxPrice?: number, minPrice?: number) {
    if (minPrice && maxPrice)
      return html`${colName}<br/>
      &gt;${minPrice}${config.price_unit}, &lt;${maxPrice}${config.price_unit}`;
    if (minPrice)
      return html`${colName}<br/>
      &gt;${minPrice}${config.price_unit}`;
    if (maxPrice)
      return html`${colName}<br/>
      &lt;${maxPrice}${config.price_unit}`;

    return html`${colName}`;
  }

  return html`
    <tr>
      <td>${localize("headers.time")}</td>
      <td>${localize("headers.import")}</td>
      <td>${localize("headers.export")}</td>

      ${data.columns.map(col => {
        const headerText = generateColumnHeader(col.name, col.maxPrice, col.minPrice)
          
        return html`
            <th>${headerText}</th>`;
        }
      )}

    </tr>`
}

function renderTableRow(config: CardConfig, data: DisplayData, rowNum: number): TemplateResult {
  const row = data.rows[rowNum];
  const time = moment(row.startTime);

  const importRateP = row.importPrice ? (row.importPrice * 100.0) : undefined;
  const importRateText = importRateP ? importRateP.toFixed(config.price_decimals) : undefined;
  const importColor = importRateP == null
    ? undefined
    : importRateP <= config.import_meter.low_cost
      ? color(config, 'low')
      : importRateP < config.import_meter.high_cost
        ? color(config, 'high')
        : color(config, 'peak');

  // TODO: Handle negatives

  const exportRateP = row.exportPrice ? (row.exportPrice * 100.0) : undefined;
  const exportRateText = exportRateP ? exportRateP.toFixed(config.price_decimals) : undefined;
  const exportColor = exportRateP == null || config.export_meter == null
    ? undefined
    : exportRateP <= config.export_meter.low_cost
      ? color(config, 'peak')
      : exportRateP <= config.export_meter.high_cost
        ? color(config, 'high')
        : color(config, 'low');


  return html`
    <tr>
      <td>${time.format('HH:mm')}</td>
      <td style="background-color: ${importColor}">${importRateText ?? '--'}${config.price_unit}</td>
      <td style="background-color: ${exportColor}">${exportRateText ?? '--'}${config.price_unit}</td>

      ${row.cells.map((cell, n) => {
          const col = data.columns[n];
          const bgColor = cell.cellActive
            ? color(config, col.active_color)
            : color(config, col.inactive_color);

          return html`
            <td style="background-color: ${bgColor}">${cell.text}</td>`;
        }
      )}
    </tr>`
}

export function renderTable(config: CardConfig, data: DisplayData): TemplateResult {
  return html`
    <table class="electricity-schedule-card">
      <thead>
      ${renderTableHeaderRow(config, data)}
      </thead>

      <tbody>
      ${data.rows.map((_, n) => renderTableRow(config, data, n))}
      </tbody>
    </table>`
}
