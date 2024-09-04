import {LovelaceCard, LovelaceCardEditor} from 'custom-card-helpers';

declare global {
  interface HTMLElementTagNameMap {
    'electricity-schedule-card-editor': LovelaceCardEditor;
    'hui-error-card': LovelaceCard;
  }
}

