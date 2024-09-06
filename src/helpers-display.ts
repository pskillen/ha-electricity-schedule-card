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
          <th colspan="3">&nbsp;</th>

          ${(() => {
              const groupedHeaders: TemplateResult[] = [];
              let currentGroup: string | undefined = '';
              let colspan = 0;

              data.columns.forEach((col, index) => {
                  if (col.group === currentGroup) {
                      colspan++; // Increment the colspan for the same group
                  } else {
                      if (colspan > 0) {
                          groupedHeaders.push(html`<th colspan="${colspan}">${currentGroup}</th>`);
                      }
                      currentGroup = col.group;
                      colspan = 1; // Start new colspan
                  }

                  // Handle the last column group
                  if (index === data.columns.length - 1) {
                      groupedHeaders.push(html`<th colspan="${colspan}">${currentGroup}</th>`);
                  }
              });

              return groupedHeaders;
          })()}
          
          <th colspan="2">Total</th>
      </tr>
      <tr>
          <th>${localize("headers.time")}</th>
          <th>${localize("headers.import")}</th>
          <th>${localize("headers.export")}</th>

          ${data.columns.map(col => {
              const headerText = generateColumnHeader(col.name, col.maxPrice, col.minPrice)

              return html`
                  <th>${headerText}</th>`;
              }
          )}
          
          <th>Power</th>
          <th>Cost</th>
      </tr>
  `
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

          let text: TemplateResult | string;
          if (cell.cellActive) {
            if (col.power != null && col.active_text)
              text = html`${col.active_text} ${(col.power / 1000).toFixed(config.power_decimals)} kW`;
            else if (col.active_text)
              text = col.active_text;
            else if (col.power != null)
              text = `${(col.power / 1000).toFixed(config.power_decimals)} kW`;
            else
              text = localize('states.active');
          } else {
            if (col.inactive_text)
              text = col.inactive_text;
            else
              // text = `iac=${isActiveCost}, iat=${isActiveTime}, colMin=${col.minPrice}, colMax=${col.maxPrice}`;
              text = localize('states.inactive');
          }


          return html`
            <td style="background-color: ${bgColor}">${text}</td>`;
        }
      )}

        <td style="color: ${color(config, row.totalPower > 0 ? 'high' : 'negative')}">${(row.totalPower/ 1000).toFixed(config.power_decimals)}kW</td>
        <td style="color: ${color(config, row.cost > 0 ? 'high' : 'negative')}">${row.cost.toFixed(config.price_decimals)}${config.price_unit}</td>
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
