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
import type {CardConfig} from './types';
import {actionHandler} from './action-handler-directive';
import {version as CARD_VERSION} from '../package.json';
import {localize} from './localize/localize';

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
      name: 'Electricity Schedule',
      ...config,
    };
  }

  // https://lit.dev/docs/components/lifecycle/#reactive-update-cycle-performing
  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (!this.config) {
      return false;
    }

    return hasConfigOrEntityChanged(this, changedProps, false);
  }

  // https://lit.dev/docs/components/rendering/
  protected render(): TemplateResult | void {
    // TODO Check for stateObj or other necessary things and render a warning if missing
    if (!this.hass || !this.config) {
      return this._showWarning('Not initialized');
    }
    if (this.config.show_warning) {
      return this._showWarning(localize('common.show_warning'));
    }

    if (this.config.show_error) {
      return this._showError(localize('common.show_error'));
    }

    return html`
      <ha-card
        .header=${this.config.name}
        @action=${this._handleAction}
        .actionHandler=${actionHandler({
          hasHold: hasAction(this.config.hold_action),
          hasDoubleClick: hasAction(this.config.double_tap_action),
        })}
        tabindex="0"
        .label=${`Electricity Schedule Card: ${this.config.entity || 'No Entity Defined'}`}
      ></ha-card>
    `;
  }

  private _handleAction(ev: ActionHandlerEvent): void {
    if (this.hass && this.config && ev.detail.action) {
      handleAction(this, this.hass, this.config, ev.detail.action);
    }
  }

  private _showWarning(warning: string): TemplateResult {
    return html`<hui-warning>${warning}</hui-warning> `;
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
