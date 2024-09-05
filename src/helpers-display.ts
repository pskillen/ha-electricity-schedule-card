import {html, TemplateResult} from "lit";
import {CardConfig, DisplayData} from "./types-card";

function color(config: CardConfig, name?: string): string {
  if (!config?.color_config)
    return '';

  return config.color_config[name ?? 'default'] ?? '';
}


function renderTableHeaderRow(data: DisplayData): TemplateResult {
  return html`
    <tr>
      <td>Time</td>
      <td>Import</td>
      <td>Export</td>

      ${data.columns.map(col => html`
        <th>${col.headerText}</th>`
      )}

    </tr>`
}

function renderTableRow(config: CardConfig, data: DisplayData, rowNum: number): TemplateResult {
  const row = data.rows[rowNum];
  const time = row.startTime;

  const importRate = row.importPrice ? (row.importPrice * 100.0).toFixed(2) : undefined;
  const exportRate = row.exportPrice ? (row.exportPrice * 100.0).toFixed(2) : undefined;

  return html`
    <tr>
      <td>${time.format('HH:mm')}</td>
      <td>${importRate ?? '--'}p</td>
      <td>${exportRate ?? '--'}p</td>

      ${row.cells.map((cell, n) => {
          const col = data.columns[n];
          const bgColor = cell.isActiveTime || cell.isActiveCost
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
      ${renderTableHeaderRow(data)}
      </thead>

      <tbody>
      ${data.rows.map((_, n) => renderTableRow(config, data, n))}
      </tbody>
    </table>`
}
