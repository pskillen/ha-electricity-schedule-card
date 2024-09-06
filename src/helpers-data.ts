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
    EnabledEntityConfig,
    RowProps
} from "./types-card";
import {getOctopusRatesSensor, getSensorState, parseTimeEntity} from "./helpers-ha";


export function generateColumnData(hass: HomeAssistant, columnConfig: ColumnConfig): ColumnData {
    const isColumnActive = (column: ColumnConfig) => {
        if (column.disabled) return false;

        const isEnabledEntityActive = (entity: EnabledEntityConfig) => {
            const state = getSensorState(hass, entity.entity_name);
            return state?.state === entity.enabled_value;
        };

        const isTimeEntityActive = (entityName: string) => {
            const {start, end} = parseTimeEntity(hass, entityName);
            return start.getTime() !== end.getTime();
        };

        // handle explicit enabled entities
        // When we parse the config, a single enabled_entity is moved to the enabled_entities array
        if (column.enabled_entities) {
            // when we parse the config, we convert everything to EnabledEntityConfig
            if (column.enabled_entities.some(te => !isEnabledEntityActive(te as EnabledEntityConfig)))
                return false;
        }

        // handle multiple time entities
        // When we parse the config, a single time_entity is moved to the time_entities array
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
    const activeTimes = columnConfig.time_entities?.map(entityName => parseTimeEntity(hass, entityName));

    return {
        ...columnConfig,
        enabled,
        maxPrice, minPrice,
        maxExportPrice, minExportPrice,
        activeTimes,
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
            else if (col.minPrice == null && col.maxPrice == null)
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

        function calculateRowTotals(cells: CellProps[]): { totalPower: number; cost: number } {
            const totalPower = cells.map((cell, n) => {
                if (!cell.cellActive) return 0;
                return columns[n].power ?? 0;
            }).reduce((acc, val) => acc + val);


            let cost: number;
            // NB: div by 20 below because price in GBP, power in W, time in 30 mins
            // GBP * 100 = p, W / 1000 = kW, hour / 2 = 30 mins -> 100/1000/2
            if (totalPower > 0) {
                cost = importRate?.value_inc_vat != null
                    ? totalPower * importRate.value_inc_vat / 20
                    : 0;
            } else if (totalPower < 0) {
                cost = exportRate?.value_inc_vat != null
                    ? totalPower * exportRate.value_inc_vat / 20
                    : 0;
            } else {
                cost = 0;
            }

            return {totalPower, cost}
        }

        const cells: CellProps[] = columns.map(generateCellData);
        const {totalPower, cost} = calculateRowTotals(cells);

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
