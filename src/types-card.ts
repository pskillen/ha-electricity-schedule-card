import {ActionConfig, LovelaceCardConfig} from "custom-card-helpers";

export interface CardConfig extends LovelaceCardConfig {
  name?: string;
  card_refresh_interval_seconds?: number;
  show_past?: boolean;
  show_future?: boolean;

  import_meter: ElectricitySupplyConfig;
  export_meter?: ElectricitySupplyConfig;

  columns: ColumnConfig[];
  color_config?: ColorConfig;

  price_decimals?: number;
  power_decimals?: number;
  price_unit?: string;

  test_gui?: boolean;
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
}

export interface ElectricitySupplyConfig {
  past_rates_entity?: string;
  current_rates_entity?: string;
  future_rates_entity?: string;
  high_cost: number;
  low_cost: number;
}

export interface EnabledEntityConfig {
  entity_name: string;
  enabled_value?: string;
}

export interface ColumnConfig {
  name: string;
  group?: string;
  enabled_entity?: string | EnabledEntityConfig;
  enabled_entities?: (string | EnabledEntityConfig)[];
  time_entity?: string;
  time_entities?: string[];
  active_color?: string;
  active_text?: string;
  inactive_color?: string;
  inactive_text?: string;
  disabled?: boolean;
  max_price_entity?: string;
  min_price_entity?: string;
  max_export_price_entity?: string;
  min_export_price_entity?: string;
  power?: number;
}

export interface ColumnData extends ColumnConfig {
  enabled: boolean;
  maxPrice?: number;
  minPrice?: number;
  maxExportPrice?: number;
  minExportPrice?: number;
  // headerText: string;
  activeTimes?: { start: Date, end: Date } [];
}

export type ColorConfig = { [k: string]: string };

export type DisplayData = {
  columns: ColumnData[];
  rows: RowProps[];
}

export type RowProps = {
  startTime: Date;
  importPrice?: number;
  exportPrice?: number;
  cells: CellProps[];
  totalPower: number;
  cost: number;
}

export type CellProps = {
  isActiveTime?: boolean;
  isActiveCost?: boolean;
  cellActive: boolean;
}
