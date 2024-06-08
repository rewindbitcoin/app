export const subUnits = ['btc', 'bit', 'sat', 'mbit'] as const;
export type SubUnit = (typeof subUnits)[number];
export type Currency = 'USD' | 'EUR' | 'GBP'; //Keep in sync with thunderDenServices/btcRates
import type { Locale } from '../../i18n-locales/init';
export const SETTINGS_GLOBAL_STORAGE = 'SETTINGS_GLOBAL_STORAGE';

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
  FIAT_MODE: boolean;
  LOCALE: Locale;
  CURRENCY: Currency;
  BTC_FIAT_REFRESH_INTERVAL_MS: number;
  BLOCKCHAIN_DATA_REFRESH_INTERVAL_MS: number;
  WALLETS_DATA_VERSION: string;

  MAINNET_SERVICE_ADDRESS_API: string;
  TESTNET_SERVICE_ADDRESS_API: string;
  STORM_SERVICE_ADDRESS_API: string;
  REGTEST_SERVICE_ADDRESS_API: string;

  MAINNET_VAULTS_API: string;
  TESTNET_VAULTS_API: string;
  STORM_VAULTS_API: string;
  REGTEST_VAULTS_API: string;

  BTC_RATES_API: string;

  MAINNET_VAULTS_SECONDARY_API: string;
  TESTNET_VAULTS_SECONDARY_API: string;
  STORM_VAULTS_SECONDARY_API: string;
  REGTEST_VAULTS_SECONDARY_API: string;

  MAINNET_ESPLORA_API: string;
  TESTNET_ESPLORA_API: string;
  STORM_ESPLORA_API: string;
  REGTEST_ESPLORA_API: string;

  STORM_FAUCET_API: string;
  REGTEST_FAUCET_API: string;
}

// Default values for the context
export const defaultSettings: Settings = {
  GAP_LIMIT: 20,
  SERVICE_FEE_RATE: 0.0004,
  MIN_FEE_RATE: 1,
  MIN_LOCK_BLOCKS: 1,
  MAX_LOCK_BLOCKS: 3 * 30 * 24 * 6,
  INITIAL_LOCK_BLOCKS: 7 * 24 * 6,
  //TODO: set it to larger values in production
  SAMPLES: 60, //This corresponds to (PRESIGNED_FEE_RATE_CEILING ^ (1/SAMPLES) - 1) * 100 / 2 = 8% expected increase in fees wrt to ideal case, which is perfectly fine
  //TODO: this should be 5 * 1000; I set it to 10 for testnet tests
  //PRESIGNED_FEE_RATE_CEILING: 5 * 1000, //22-dec-2017 fee rates were 1000. TODO: Set this to 5000 which is 5x 22-dec-2017
  //https://twitter.com/KLoaec/status/1733880025017978914
  //PRESIGNED_FEE_RATE_CEILING: 2,
  PRESIGNED_FEE_RATE_CEILING: 10000, //TODO should be 10000
  // 2 hours
  INITIAL_CONFIRMATION_TIME: 2 * 60 * 60,
  //TODO: set it to 2/3 in the production case
  //MIN_RECOVERABLE_RATIO: '2/3' // express it in string so that it can be printed. Must be 0 > MIN_RECOVERABLE_RATIO > 1
  MIN_RECOVERABLE_RATIO: 1 / 2, //TODO should be 2/3
  SUB_UNIT: 'btc',
  FIAT_MODE: false, //whether the user prefers using fiat than SUB_UNIT
  LOCALE: 'en-US',
  CURRENCY: 'USD',
  BTC_FIAT_REFRESH_INTERVAL_MS: 600000, //10 minutes
  BLOCKCHAIN_DATA_REFRESH_INTERVAL_MS: 60000, // 1 minute
  WALLETS_DATA_VERSION: '1.0.0', //This does not define the version of the App, but keeps track of the changes in the signature of the Wallet

  //IMPORTANT - these variables below must correspond to those in services.env
  //They must be kept manually synchronized
  MAINNET_SERVICE_ADDRESS_API: 'https://api.thunderden.com/service-address',
  TESTNET_SERVICE_ADDRESS_API:
    'https://api.thunderden.com/testnet/service-address',
  STORM_SERVICE_ADDRESS_API: 'https://api.thunderden.com/storm/service-address',
  REGTEST_SERVICE_ADDRESS_API: 'http://localhost:3323',

  MAINNET_VAULTS_API: 'https://api.thunderden.com/vaults',
  TESTNET_VAULTS_API: 'https://api.thunderden.com/testnet/vaults',
  STORM_VAULTS_API: 'https://api.thunderden.com/storm/vaults',
  REGTEST_VAULTS_API: 'http://localhost:3124',

  BTC_RATES_API: 'https://api.thunderden.com/btc-rates',

  MAINNET_VAULTS_SECONDARY_API: 'https://api-proxy.thunderden.com/vaults',
  TESTNET_VAULTS_SECONDARY_API:
    'https://api-proxy.thunderden.com/testnet/vaults',
  STORM_VAULTS_SECONDARY_API: 'https://api-proxy.thunderden.com/storm/vaults',
  REGTEST_VAULTS_SECONDARY_API: 'http://localhost:3325',

  MAINNET_ESPLORA_API: 'https://blockstream.info/api',
  TESTNET_ESPLORA_API: 'https://blockstream.info/testnet/api',
  STORM_ESPLORA_API: 'https://storm.thunderden.com/api',
  REGTEST_ESPLORA_API: 'http://localhost:31002',

  STORM_FAUCET_API: 'https://storm.thunderden.com/faucet',
  REGTEST_FAUCET_API: 'http://localhost:4123/faucet'

  //GET_SERVICE_ADDRESS_URL_TEMPLATE:
  //  'https://api.thunderden.com/:network?/service-address/get',
  //PUSH_VAULT_URL_TEMPLATE:
  //  'https://api.thunderden.com/:network?/vaults/:vaultId',
  //CHECK_VAULT_URL_TEMPLATE:
  //  'https://api.thunderden.com/:network?/vaults/:vaultId/check',
  //GET_VAULT_URL_TEMPLATE:
  //  'https://api-proxy.thunderden.com/:network?/vaults/:vaultId/get'
};
