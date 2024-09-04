import {css, CSSResultGroup, html, LitElement, PropertyValues, TemplateResult} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {
  ActionHandlerEvent,
  getLovelace,
  handleAction,
  hasAction,
  hasConfigOrEntityChanged,
  HomeAssistant,
  LovelaceCardEditor,
} from 'custom-card-helpers';
import {HassEntity} from "home-assistant-js-websocket";
import moment from "moment";

import {CardConfig, CellProps, ColumnConfig, ColumnData, DisplayData, RowProps} from './types-card';
import {OctopusRate, OctopusRatesEntryAttributes} from "./types-sensors";
import {actionHandler} from './action-handler-directive';
import {localize} from './localize/localize';
import {version as CARD_VERSION} from '../package.json';

/* eslint no-console: 0 */
console.info(
  `%c  ELECTRICITY-SCHEDULE-CARD \n%c  ${localize('common.version')} ${CARD_VERSION}    `,
  'color: orange; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: dimgray',
);

// This puts your card into the UI card picker dialog
(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: 'electricity-schedule-card',
  name: 'Electricity Schedule Card',
  description: 'A Lovelace card for Home Assistant, which displays the scheduled of your high power devices (EV charging, heating, hot water, etc) in a timeline',
});

@customElement('electricity-schedule-card')
export class ElectricityScheduleCard extends LitElement {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import('./editor');
    // @ts-ignore
    return document.createElement('electricity-schedule-card-editor');
  }

  public static getStubConfig(): Record<string, unknown> {
    return {};
  }

  // TODO Add any properties that should cause your element to re-render here
  // https://lit.dev/docs/components/properties/

  @property({attribute: false}) public hass!: HomeAssistant;

  @state() private config!: CardConfig;

  private now: Date = new Date();

  private readonly defaultConfig: CardConfig = {
    type: 'custom:electricity-schedule-card',
    name: 'Electricity schedule',
    color_config: {
      default: 'DarkSlateGray',
      charging: 'DarkGreen',
      discharging: 'Crimson',
      paused: 'CornflowerBlue',
    },
    show_past: false,
    show_future: true,
    card_refresh_interval_seconds: 60,
    columns: [],
  }

  // https://lit.dev/docs/components/properties/#accessors-custom
  public setConfig(config: CardConfig): void {
    // TODO Check for required fields and that they are of the proper format
    if (!config) {
      throw new Error(localize('common.invalid_configuration'));
    }

    if (config.test_gui) {
      getLovelace().setEditMode(true);
    }

    this.config = {
      ...this.defaultConfig,
      ...config,
      ...{
        color_config: {
          ...this.defaultConfig.color_config,
          ...config.color_config ?? {}
        }
      }
    };
  }

  // https://lit.dev/docs/components/lifecycle/#reactive-update-cycle-performing
  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (!this.config) {
      return false;
    }

    return hasConfigOrEntityChanged(this, changedProps, false);
  }

  private color(name?: string): string {
    if (!this.config?.color_config)
      return '';

    return this.config.color_config[name ?? 'default'] ?? '';
  }

  private parseTimeEntity(entityName: string): { start: Date, end: Date } {
    let startDate: Date, endDate: Date;

    function parseHHMMformat(t: string): Date {
      const d = new Date();
      const time = t.match(/(\d+)(?::(\d\d))?\s*(p?)/);
      if (time) {
        d.setHours(parseInt(time[1]) + (time[3] ? 12 : 0));
        d.setMinutes(parseInt(time[2]) || 0);
      } else {
        d.setHours(0);
        d.setMinutes(0);
      }

      // second/millis are always zero
      d.setSeconds(0);
      d.setMilliseconds(0);
      return d;
    }

    const state = this.getSensorState(entityName);
    if (!state) return {start: this.now, end: this.now};

    if ('after' in state.attributes && 'before' in state.attributes) {
      startDate = new Date(Date.parse(state.attributes.after));
      endDate = new Date(Date.parse(state.attributes.before));
    } else if ('start' in state.attributes && 'end' in state.attributes) {
      // this is to handle HH:mm format - if we need others, we'll need some regex
      const start = parseHHMMformat(state.attributes.start);
      const end = parseHHMMformat(state.attributes.end);

      // Since there's no date field, end < start it means end is after midnight
      if (end < start) {
        end.setDate(end.getDate() + 1);
      } else if (end < this.now) {
        // this event is in the past, let's do tomorrow's
        start.setDate(start.getDate() + 1);
        end.setDate(end.getDate() + 1);
      }

      startDate = start;
      endDate = end;
    } else {
      throw new Error(`Cannot determine type of time entity ${entityName} - not start/end, not before/after`);
    }

    return {start: startDate, end: endDate};
  }

  private isColumnActive = (column: ColumnConfig) => {
    if (column.disabled) return false;

    const isTimeEntityActive = (entryName: string) => {
      const {start, end} = this.parseTimeEntity(entryName);
      return start.getTime() !== end.getTime();
    };

    // handle single time entity
    if (column.time_entity) {
      if (!isTimeEntityActive(column.time_entity))
        return false;
    }

    // handle multiple time entities
    if (column.time_entities) {
      if (!column.time_entities.some(te => isTimeEntityActive(te)))
        return false;
    }

    return true;
  };

  private getSensorState(entityName?: string): HassEntity | undefined {
    if (!entityName) return undefined;
    if (!(entityName in this.hass.states))
      throw new Error(`entity ${entityName} not found`);

    return this.hass.states[entityName];
  }

  private getOctopusRatesSensor(entityName?: string): OctopusRatesEntryAttributes | undefined {
    const state = this.getSensorState(entityName);
    if (!state) return undefined;

    if (!('rates' in state.attributes))
      throw new Error(`entity ${entityName} is not a valid Octopus rates entity (no 'rates' attribute)`);

    return state.attributes as OctopusRatesEntryAttributes;
  }

  private combineAndFilterRateArrays(rateAttributes: (OctopusRatesEntryAttributes | undefined)[]): OctopusRate[] {
    let combinedRates: OctopusRate[] = [];
    const now = moment();

    // combine all the rates
    for (const rateAttribute of rateAttributes) {
      if (!rateAttribute) continue;
      rateAttribute.rates.forEach(rate => combinedRates.push(rate));
    }

    // parse strings to dates
    combinedRates.forEach(rate => {
      rate.startDate = moment(rate.start);
      rate.endDate = moment(rate.end);
    })

    // apply filters
    combinedRates = combinedRates.filter(rate => {
      if (!this.config.show_past && rate.endDate!.isBefore(now))
        return false;
      if (!this.config.show_future && rate.startDate!.isAfter(now))
        return false;
      return true;
    })

    // sort by date
    combinedRates.sort((a, b) => a.startDate!.diff(b.startDate!));

    return combinedRates;
  }

  private generateColumnData = (columnConfig: ColumnConfig): ColumnData => {
    const generateColumnHeader = (colName: string, maxPrice?: number, minPrice?: number) => {
      if (minPrice && maxPrice)
        return `${colName}<br>&gt;${minPrice}, &lt;${maxPrice}`;
      if (minPrice)
        return `${colName}<br>&gt;${minPrice}`;
      if (maxPrice)
        return `${colName}<br>&lt;${maxPrice}`;

      return `${colName}`;
    };

    let maxPrice: number | undefined;
    let minPrice: number | undefined;
    let maxExportPrice: number | undefined;
    let minExportPrice: number | undefined;

    if (columnConfig.max_price_entity) {
      const state = this.getSensorState(columnConfig.max_price_entity)?.state;
      if (state)
        maxPrice = parseFloat(state);
    }
    if (columnConfig.min_price_entity) {
      const state = this.getSensorState(columnConfig.min_price_entity)?.state;
      if (state)
        minPrice = parseFloat(state);
    }
    if (columnConfig.max_export_price_entity) {
      const state = this.getSensorState(columnConfig.max_export_price_entity)?.state;
      if (state)
        maxExportPrice = parseFloat(state);
    }
    if (columnConfig.min_export_price_entity) {
      const state = this.getSensorState(columnConfig.min_export_price_entity)?.state;
      if (state)
        minExportPrice = parseFloat(state);
    }

    const enabled = this.isColumnActive(columnConfig);
    const headerText = generateColumnHeader(columnConfig.name, maxPrice, minPrice);

    const timeEntities = columnConfig.time_entity
      ? [columnConfig.time_entity]
      : columnConfig.time_entities;

    const activeTimes = timeEntities?.map(entityName => {
      const {start, end} = this.parseTimeEntity(entityName);
      return {start: moment(start), end: moment(end)};
    });

    return {
      ...columnConfig,
      enabled,
      headerText,
      maxPrice, minPrice,
      maxExportPrice, minExportPrice,
      time_entity: undefined, time_entities: timeEntities, activeTimes,
    };
  };

  private calculateTableData(importRates: OctopusRate[], exportRates?: OctopusRate[]): DisplayData {

    function generateTimeSlotRow(time: moment.Moment, columns: ColumnData[], importRate?: OctopusRate): RowProps {
      const cells: CellProps[] = columns.map(col => {

        const isActiveTime = col.activeTimes?.some(slot => slot.start <= time && time < slot.end);
        let isActiveCost: boolean;
        if (!importRate || importRate.value_inc_vat == null)
          isActiveCost = false;
        else if (col.minPrice != null && col.maxPrice != null)
          isActiveCost = col.minPrice <= importRate.value_inc_vat && importRate.value_inc_vat <= col.maxPrice;
        else if (col.minPrice != null)
          isActiveCost = col.minPrice <= importRate.value_inc_vat;
        else if (col.maxPrice != null)
          isActiveCost = importRate.value_inc_vat <= col.maxPrice;
        else
          isActiveCost = false;

        const cell: CellProps = {
          isActiveTime,
          isActiveCost,
          text: 'meep', // todo: figure out what the text should be
        };

        return cell;
      });

      const totalPower = cells.map((cell, n) => {
        if (!cell.isActiveCost || !cell.isActiveTime) return 0;
        return columns[n].power ?? 0;
      }).reduce((acc, val) => acc + val);

      const cost = importRate?.value_inc_vat != null
        ? totalPower * importRate?.value_inc_vat / 1000 / 2
        : 0;

      return {
        startTime: time,
        cells,
        totalPower,
        cost
      };
    }

    const columns = this.config.columns
      .map(this.generateColumnData)
      .filter(col => col.enabled);

    let timeSlots: moment.Moment[] = [];
    if (importRates)
      timeSlots.push(...importRates.map(r => r.startDate!));
    if (exportRates)
      timeSlots.push(...exportRates.map(r => r.startDate!));
    timeSlots = [...new Set(timeSlots)];

    const rows = timeSlots.map(slot => {
      const importRate = importRates.find(r => r.startDate === slot);
      // const exportRate = exportRates?.find(r => r.startDate === slot);

      return generateTimeSlotRow(slot, columns, importRate);
    });

    return {rows, columns}
  }

  private renderTableHeaderRow(data: DisplayData): TemplateResult {
    return html`
      <tr>
        <td>Time</td>
        ${data.columns.map(col => html`
          <th>${col.headerText}</th>`
        )}
      </tr>`
  }

  private renderTableRow(data: DisplayData, rowNum: number): TemplateResult {
    const row = data.rows[rowNum];
    const time = row.startTime;

    return html`
      <tr>
        <td>${time.format('HH:mm')}</td>

        ${row.cells.map((cell, n) => {
            const col = data.columns[n];
            const bgColor = cell.isActiveTime || cell.isActiveCost
              ? this.color(col.active_color)
              : this.color(col.inactive_color);

            return html`
              <td style="background-color: ${bgColor}">${cell.text}</td>`;
          }
        )}
      </tr>`
  }

  private renderTable(data: DisplayData): TemplateResult {
    return html`
      <table>
        <thead>
        ${this.renderTableHeaderRow(data)}
        </thead>

        <tbody>
        ${data.rows.map((_, n) => this.renderTableRow(data, n))}
        </tbody>
      </table>`
  }

  // https://lit.dev/docs/components/rendering/
  protected render(): TemplateResult {
    // TODO Check for stateObj or other necessary things and render a warning if missing
    if (!this.hass || !this.config) {
      return this._showWarning('Not initialized');
    }

    const config = this.config;
    this.now = new Date();

    if (config.show_warning) {
      return this._showWarning(localize('common.show_warning'));
    }

    if (config.show_error) {
      return this._showError(localize('common.show_error'));
    }

    // Grab the rates which are stored as an attribute of the sensor
    const pastImportRates = this.getOctopusRatesSensor(config.past_rates_entity);
    const currentImportRates = this.getOctopusRatesSensor(config.current_rates_entity);
    const futureImportRates = this.getOctopusRatesSensor(config.future_rates_entity);
    const combinedImportRates = this.combineAndFilterRateArrays([pastImportRates, currentImportRates, futureImportRates]);

    const pastExportRates = this.getOctopusRatesSensor(config.past_export_rates_entity);
    const currentExportRates = this.getOctopusRatesSensor(config.current_export_rates_entity);
    const futureExportRates = this.getOctopusRatesSensor(config.future_export_rates_entity);
    const combinedExportRates = this.combineAndFilterRateArrays([pastExportRates, currentExportRates, futureExportRates]);

    const displayData = this.calculateTableData(combinedImportRates, combinedExportRates);

    return html`
      <ha-card
        .header=${config.name}
        @action=${this._handleAction}
        .actionHandler=${actionHandler({
          hasHold: hasAction(config.hold_action),
          hasDoubleClick: hasAction(config.double_tap_action),
        })}
        tabindex="0"
        .label=${`Electricity Schedule Card: ${config.entity || 'No Entity Defined'}`}
      >
        ${this.renderTable(displayData)}
      </ha-card>
    `;
  }

  private _handleAction(ev: ActionHandlerEvent): void {
    if (this.hass && this.config && ev.detail.action) {
      handleAction(this, this.hass, this.config, ev.detail.action);
    }
  }

  private _showWarning(warning: string): TemplateResult {
    return html`
      <hui-warning>${warning}</hui-warning> `;
  }

  private _showError(error: string): TemplateResult {
    const errorCard = document.createElement('hui-error-card');
    errorCard.setConfig({
      type: 'error',
      error,
      origConfig: this.config,
    });

    return html` ${errorCard} `;
  }

  // https://lit.dev/docs/components/styles/
  static get styles(): CSSResultGroup {
    return css``;
  }

}
