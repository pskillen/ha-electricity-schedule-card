import {ActionConfig, LovelaceCardConfig} from "custom-card-helpers";
import moment from "moment";

export interface ColumnConfig {
  name: string;
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
  headerText: string;
  activeTimes?: { start: moment.Moment, end: moment.Moment } [];
}

export type ColorConfig = { [k: string]: string };

export interface CardConfig extends LovelaceCardConfig {
  name?: string;
  card_refresh_interval_seconds?: number;
  past_rates_entity?: string;
  current_rates_entity?: string;
  future_rates_entity?: string;
  past_export_rates_entity?: string;
  current_export_rates_entity?: string;
  future_export_rates_entity?: string;
  show_past?: boolean;
  show_future?: boolean;

  columns: ColumnConfig[];
  color_config?: ColorConfig;

  test_gui?: boolean;
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
}

export type DisplayData = {
  columns: ColumnData[];
  rows: RowProps[];
}

export type RowProps = {
  startTime: moment.Moment;
  importPrice?: number;
  exportPrice?: number;
  cells: CellProps[];
  totalPower: number;
  cost: number;
}

export type CellProps = {
  isActiveTime?: boolean;
  isActiveCost?: boolean;
  text?: string;

  // color?: string;
  // text?: string;
}
