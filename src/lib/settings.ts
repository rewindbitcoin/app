export type SubUnit = 'btc' | 'sat' | 'mbit' | 'bit';
export type Currency = 'USD' | 'EUR' | 'GBP';
export type Locale = 'en-US' | 'es-ES';

export interface Settings {
  GAP_LIMIT: number;
  SERVICE_FEE_RATE: number;
  MIN_FEE_RATE: number;
  MIN_LOCK_BLOCKS: number;
  MAX_LOCK_BLOCKS: number;
  INITIAL_LOCK_BLOCKS: number;
  SAMPLES: number;
  PRESIGNED_FEE_RATE_CEILING: number;
  INITIAL_CONFIRMATION_TIME: number;
  MIN_RECOVERABLE_RATIO: number;
  SUB_UNIT: SubUnit;
  LOCALE: Locale;
  CURRENCY: Currency;
  BTC_FIAT_REFRESH_INTERVAL_MS: number;
  BTC_FEE_ESTIMATES_REFRESH_INTERVAL_MS: number;
}

// Default values for the context
export const defaultSettings: Settings = {
  GAP_LIMIT: 20,
  SERVICE_FEE_RATE: 0.0004,
  MIN_FEE_RATE: 1,
  MIN_LOCK_BLOCKS: 1,
  MAX_LOCK_BLOCKS: 30 * 24 * 6,
  INITIAL_LOCK_BLOCKS: 7 * 24 * 6,
  //TODO: set it to larger values in production
  SAMPLES: 60, //This corresponds to (PRESIGNED_FEE_RATE_CEILING ^ (1/SAMPLES) - 1) * 100 / 2 = 8% expected increase in fees wrt to ideal case, which is perfectly fine
  //TODO: this should be 5 * 1000; I set it to 10 for testnet tests
  //PRESIGNED_FEE_RATE_CEILING: 5 * 1000, //22-dec-2017 fee rates were 1000. TODO: Set this to 5000 which is 5x 22-dec-2017
  //https://twitter.com/KLoaec/status/1733880025017978914
  //PRESIGNED_FEE_RATE_CEILING: 2,
  PRESIGNED_FEE_RATE_CEILING: 1000, //TODO should be 10000
  // 2 hours
  INITIAL_CONFIRMATION_TIME: 2 * 60 * 60,
  //TODO: set it to 2/3 in the production case
  //MIN_RECOVERABLE_RATIO: '2/3' // express it in string so that it can be printed. Must be 0 > MIN_RECOVERABLE_RATIO > 1
  MIN_RECOVERABLE_RATIO: 1 / 3, //TODO should be 2/3
  SUB_UNIT: 'btc',
  LOCALE: 'en-US',
  CURRENCY: 'USD',
  BTC_FIAT_REFRESH_INTERVAL_MS: 600000, //10 minutes
  BTC_FEE_ESTIMATES_REFRESH_INTERVAL_MS: 600000 // 10 minutes
};
