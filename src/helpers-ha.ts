import {HomeAssistant} from "custom-card-helpers";
import {HassEntity} from "home-assistant-js-websocket";

import {OctopusRatesEntryAttributes} from "./types-sensors";

export function getSensorState(hass: HomeAssistant, entityName?: string): HassEntity | undefined {
  if (!entityName) return undefined;
  if (!(entityName in hass.states))
    throw new Error(`entity ${entityName} not found`);

  return hass.states[entityName];
}

export function parseTimeEntity(hass: HomeAssistant, entityName: string): { start: Date, end: Date } {
  let startDate: Date, endDate: Date;
  const now = new Date();

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

  const state = getSensorState(hass, entityName);
  if (!state) return {start: now, end: now};

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
    } else if (end < now) {
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

export function getOctopusRatesSensor(hass: HomeAssistant, entityName?: string): OctopusRatesEntryAttributes | undefined {
  const state = getSensorState(hass, entityName);
  if (!state) return undefined;

  if (!('rates' in state.attributes))
    throw new Error(`entity ${entityName} is not a valid Octopus rates entity (no 'rates' attribute)`);

  return state.attributes as OctopusRatesEntryAttributes;
}
