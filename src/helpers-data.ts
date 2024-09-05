import {HomeAssistant} from "custom-card-helpers";
import moment from "moment/moment";
import {OctopusRate, OctopusRatesEntryAttributes} from "./types-sensors";
import {CardConfig, CellProps, ColumnConfig, ColumnData, DisplayData, RowProps} from "./types-card";
import {getOctopusRatesSensor, getSensorState, parseTimeEntity} from "./helpers-ha";
import {localize} from "./localize/localize";


export function generateColumnData(hass: HomeAssistant, columnConfig: ColumnConfig): ColumnData {
  const isColumnActive = (column: ColumnConfig) => {
    if (column.disabled) return false;

    const isTimeEntityActive = (entryName: string) => {
      const {start, end} = parseTimeEntity(hass, entryName);
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

  function generateColumnHeader(colName: string, maxPrice?: number, minPrice?: number) {
    if (minPrice && maxPrice)
      return `${colName}<br>&gt;${minPrice}, &lt;${maxPrice}`;
    if (minPrice)
      return `${colName}<br>&gt;${minPrice}`;
    if (maxPrice)
      return `${colName}<br>&lt;${maxPrice}`;

    return `${colName}`;
  }

  let maxPrice: number | undefined;
  let minPrice: number | undefined;
  let maxExportPrice: number | undefined;
  let minExportPrice: number | undefined;

  if (columnConfig.max_price_entity) {
    const state = getSensorState(hass, columnConfig.max_price_entity)?.state;
    if (state)
      maxPrice = parseFloat(state);
  }
  if (columnConfig.min_price_entity) {
    const state = getSensorState(hass, columnConfig.min_price_entity)?.state;
    if (state)
      minPrice = parseFloat(state);
  }
  if (columnConfig.max_export_price_entity) {
    const state = getSensorState(hass, columnConfig.max_export_price_entity)?.state;
    if (state)
      maxExportPrice = parseFloat(state);
  }
  if (columnConfig.min_export_price_entity) {
    const state = getSensorState(hass, columnConfig.min_export_price_entity)?.state;
    if (state)
      minExportPrice = parseFloat(state);
  }

  const enabled = isColumnActive(columnConfig);
  const headerText = generateColumnHeader(columnConfig.name, maxPrice, minPrice);

  const timeEntities = columnConfig.time_entity
    ? [columnConfig.time_entity]
    : columnConfig.time_entities;

  const activeTimes = timeEntities?.map(entityName => {
    const {start, end} = parseTimeEntity(hass, entityName);
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
}

function combineAndFilterRateArrays(rateAttributes: (OctopusRatesEntryAttributes | undefined)[], includePast: boolean, includeFuture: boolean): OctopusRate[] {
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
    if (!includePast && rate.endDate!.isBefore(now))
      return false;
    if (!includeFuture && rate.startDate!.isAfter(now))
      return false;
    return true;
  })

  // sort by date
  combinedRates.sort((a, b) => a.startDate!.diff(b.startDate!));

  return combinedRates;
}

export function calculateTableData(hass: HomeAssistant, config: CardConfig): DisplayData {

  function generateTimeSlotRow(time: moment.Moment, columns: ColumnData[], importRate?: OctopusRate, exportRate?: OctopusRate): RowProps {
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

      let text: string;
      if (isActiveCost || isActiveTime) {
        if (col.active_text)
          text = col.active_text;
        if (col.power != null)
          text = `${(col.power / 1000).toFixed(1)} kW`;
        else
          text = localize('states.active');
      } else {
        if (col.inactive_text)
          text = col.inactive_text;
        else
          text = '';
      }

      const cell: CellProps = {
        isActiveTime,
        isActiveCost,
        text: text,
      };

      return cell;
    });

    const totalPower = cells.map((cell, n) => {
      if (!cell.isActiveCost || !cell.isActiveTime) return 0;
      return columns[n].power ?? 0;
    }).reduce((acc, val) => acc + val);

    // TODO: If this is export, work it out using export rate
    const cost = importRate?.value_inc_vat != null
      ? totalPower * importRate?.value_inc_vat / 1000 / 2
      : 0;

    return {
      startTime: time,
      cells,
      totalPower,
      cost,
      importPrice: importRate?.value_inc_vat,
      exportPrice: exportRate?.value_inc_vat,
    };
  }

  // Grab the rates which are stored as an attribute of the sensor
  const pastImportRates = getOctopusRatesSensor(hass, config.past_rates_entity);
  const currentImportRates = getOctopusRatesSensor(hass, config.current_rates_entity);
  const futureImportRates = getOctopusRatesSensor(hass, config.future_rates_entity);
  const combinedImportRates = combineAndFilterRateArrays([pastImportRates, currentImportRates, futureImportRates], !!config.show_past, !!config.show_future);

  const pastExportRates = getOctopusRatesSensor(hass, config.past_export_rates_entity);
  const currentExportRates = getOctopusRatesSensor(hass, config.current_export_rates_entity);
  const futureExportRates = getOctopusRatesSensor(hass, config.future_export_rates_entity);
  const combinedExportRates = combineAndFilterRateArrays([pastExportRates, currentExportRates, futureExportRates], !!config.show_past, !!config.show_future);


  const columns = config.columns
    .map(col => generateColumnData(hass, col))
    .filter(col => col.enabled);

  let timeSlots: moment.Moment[] = [];
  if (combinedImportRates)
    timeSlots.push(...combinedImportRates.map(r => r.startDate!));
  if (combinedExportRates)
    timeSlots.push(...combinedExportRates.map(r => r.startDate!));
  timeSlots = [...new Set(timeSlots)];

  const rows = timeSlots.map(slot => {
    const importRate = combinedImportRates.find(r => r.startDate === slot);
    const exportRate = combinedExportRates?.find(r => r.startDate === slot);

    return generateTimeSlotRow(slot, columns, importRate, exportRate);
  });

  return {rows, columns}
}
