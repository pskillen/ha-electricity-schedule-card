export type OctopusRate = {
  start: string;
  startDate?: Date;
  end: string;
  endDate?: Date;
  value_inc_vat: number;
  is_capped: boolean;
}

export type OctopusRatesEntryAttributes = {
  event_types: string[];
  event_type: string;
  rates: OctopusRate[];
  min_rate: number;
  max_rate: number;
  average_rate: number;
  mpan: string;
  serial_number: string;
  tariff_code: string;
  friendly_name: string;
}
