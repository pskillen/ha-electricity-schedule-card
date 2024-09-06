import {HomeAssistant} from "custom-card-helpers";
import moment from "moment/moment";
import {OctopusRate, OctopusRatesEntryAttributes} from "./types-sensors";
import {
  CardConfig,
  CellProps,
  ColumnConfig,
  ColumnData,
  DisplayData,
  ElectricitySupplyConfig,
  RowProps
} from "./types-card";
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
  const timeEntities = columnConfig.time_entity
    ? [columnConfig.time_entity]
    : columnConfig.time_entities;

  const activeTimes = timeEntities?.map(entityName => parseTimeEntity(hass, entityName));

  return {
    ...columnConfig,
    enabled,
    maxPrice, minPrice,
    maxExportPrice, minExportPrice,
    time_entity: undefined, time_entities: timeEntities, activeTimes,
  };
}

export function calculateTableData(hass: HomeAssistant, config: CardConfig): DisplayData {
  const now = new Date();

  function combineAndFilterRateArrays(rateAttributes: (OctopusRatesEntryAttributes | undefined)[], includePast: boolean, includeFuture: boolean): OctopusRate[] {
    let combinedRates: OctopusRate[] = [];

    // combine all the rates
    for (const rateAttribute of rateAttributes) {
      if (!rateAttribute) continue;
      rateAttribute.rates.forEach(rate => combinedRates.push(rate));
    }

    // parse strings to dates
    combinedRates.forEach(rate => {
      rate.startDate = moment(rate.start).toDate();
      rate.endDate = moment(rate.end).toDate();
    })

    // apply filters
    combinedRates = combinedRates.filter(rate => {
      if (!includePast && rate.endDate! < now)
        return false;
      if (!includeFuture && rate.startDate! > now)
        return false;
      return true;
    })

    // sort by date
    combinedRates.sort((a, b) => a.startDate!.getTime() - b.startDate!.getTime());

    return combinedRates;
  }

  function generateTimeSlotRow(time: Date, columns: ColumnData[], importRate?: OctopusRate, exportRate?: OctopusRate): RowProps {

    function generateCellData(col: ColumnData) {

      const isActiveTime = col.activeTimes
        ? col.activeTimes?.some(slot => slot.start <= time && time < slot.end)
        : undefined;
      let isActiveCost: boolean | undefined;

      const importPriceP = importRate ? importRate.value_inc_vat * 100 : undefined;

      // TODO: How do we handle export price here?
      if (importPriceP == null)
        isActiveCost = undefined;
      else if (col.minPrice != null && col.maxPrice != null)
        isActiveCost = col.minPrice <= importPriceP && importPriceP <= col.maxPrice;
      else if (col.minPrice != null)
        isActiveCost = importPriceP >= col.minPrice;
      else if (col.maxPrice != null)
        isActiveCost = importPriceP <= col.maxPrice;
      else
        isActiveCost = false;

      let cellActive: boolean;
      if (isActiveTime == null && isActiveCost == null)
        cellActive = false;
      else if (isActiveTime && isActiveCost)
        cellActive = true;
      else if (isActiveTime == null)
        cellActive = isActiveCost!;
      else if (isActiveCost == null)
        cellActive = isActiveTime!;
      else
        cellActive = false;

      const cell: CellProps = {
        isActiveTime,
        isActiveCost,
        cellActive
      };

      return cell;
    }

    const cells: CellProps[] = columns.map(generateCellData);

    const totalPower = cells.map((cell, n) => {
      if (!cell.cellActive) return 0;
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

  function getRateData(meter: ElectricitySupplyConfig): OctopusRate[] {
    const pastRates = getOctopusRatesSensor(hass, meter.past_rates_entity);
    const currentRates = getOctopusRatesSensor(hass, meter.current_rates_entity);
    const futureRates = getOctopusRatesSensor(hass, meter.future_rates_entity);
    return combineAndFilterRateArrays([pastRates, currentRates, futureRates], !!config.show_past, !!config.show_future);
  }

  // Grab the rates which are stored as an attribute of the sensor
  const combinedImportRates = getRateData(config.import_meter);
  const combinedExportRates = config.export_meter ? getRateData(config.export_meter) : [];

  const columns = config.columns
    .map(col => generateColumnData(hass, col))
    .filter(col => col.enabled);

  let timeSlotsNumber: number[] = [];
  if (combinedImportRates)
    timeSlotsNumber.push(...combinedImportRates.map(r => r.startDate!.getTime()));
  if (combinedExportRates)
    timeSlotsNumber.push(...combinedExportRates.map(r => r.startDate!.getTime()));
  timeSlotsNumber = [...new Set(timeSlotsNumber)].sort();

  const rows = timeSlotsNumber.map(slot => {
    const importRate = combinedImportRates.find(r => r.startDate!.getTime() === slot);
    const exportRate = combinedExportRates?.find(r => r.startDate!.getTime() === slot);

    return generateTimeSlotRow(new Date(slot), columns, importRate, exportRate);
  });

  return {rows, columns}
}
