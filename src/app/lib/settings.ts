//uses react-native-dotenv from bable.config.js and @rewindbitcoin/env
import {
  VERSION,
  PUBLIC_PROTOCOL,
  PUBLIC_API_SERVER_NAME,
  PUBLIC_MAINNET_SERVICE_ADDRESS_LOCATION,
  PUBLIC_TESTNET_SERVICE_ADDRESS_LOCATION,
  PUBLIC_TAPE_SERVICE_ADDRESS_LOCATION,
  LOCAL_PROTOCOL,
  REGTEST_HOST_NAME,
  LOCAL_REGTEST_SERVICE_ADDRESS_PORT,
  PUBLIC_MAINNET_VAULTS_WRITER_LOCATION,
  PUBLIC_TESTNET_VAULTS_WRITER_LOCATION,
  PUBLIC_TAPE_VAULTS_WRITER_LOCATION,
  LOCAL_REGTEST_VAULTS_WRITER_PORT,
  LOCAL_REGTEST_ESPLORA_API_PORT,
  LOCAL_COMMUNITY_BACKUPS_PORT,
  PUBLIC_BTC_RATES_LOCATION,
  PUBLIC_COMMUNITY_BACKUPS_SERVER_NAME,
  PUBLIC_TAPE_SERVER_NAME,
  PUBLIC_TAPE_WEB_LOCATION,
  LOCAL_REGTEST_WEB_PORT,
  PUBLIC_TAPE_ESPLORA_API_LOCATION,
  PUBLIC_TAPE_BLOCK_EXPLORER_LOCATION,
  LOCAL_REGTEST_BLOCK_EXPLORER_PORT,
  LOCAL_REGTEST_ELECTRUM_SERVER_PORT,
  ELECTRUM_PUBLIC_PROTOCOL,
  ELECTRUM_LOCAL_PROTOCOL,
  PUBLIC_TAPE_ELECTRUM_PORT
  // @ts-expect-error @env is defined in bable.config.js
} from '@env';
import { getLocales } from 'expo-localization';
if (Number(VERSION) !== 32)
  throw new Error(
    `This is still running version: ${VERSION}.

You must manually change the version check on settings.ts everytime env is updated.

This is because expo/metro/babel caches using the file (settings.ts) that is the entry point to @env and caches it.

Also make sure to clear the cache in metro: npx expo start --clear

So, manually change the version in settings.ts so that this does not throw`
  );

export const subUnits = ['btc', 'bit', 'sat', 'mbit'] as const;
export type SubUnit = (typeof subUnits)[number];
export const currencyCodes = [
  'USD',
  'EUR',
  'JPY',
  'GBP',
  'CNY',
  'KRW',
  'CAD',
  'AUD',
  'CHF',
  'INR'
] as const; //Keep in sync with ~/../btcRates
export type Currency = (typeof currencyCodes)[number];
export const SETTINGS_GLOBAL_STORAGE = 'SETTINGS_GLOBAL_STORAGE';

export interface Settings {
  NETWORK_TIMEOUT: number;
  GAP_LIMIT: number;
  SERVICE_FEE_RATE: number;
  MIN_FEE_RATE: number;
  MIN_LOCK_BLOCKS: number;
  MAX_LOCK_BLOCKS: number;
  INITIAL_LOCK_BLOCKS: number;
  SAMPLES: number;
  PRESIGNED_FEE_RATE_CEILING: number;
  MAX_PRESIGNED_FEE_RATE_CEILING: number;
  INITIAL_CONFIRMATION_TIME: number;
  MIN_RECOVERABLE_RATIO: number;
  SUB_UNIT: SubUnit;
  FIAT_MODE: boolean;
  LOCALE: string;
  CURRENCY: Currency;
  BTC_FIAT_REFRESH_INTERVAL_MS: number;
  BLOCKCHAIN_DATA_REFRESH_INTERVAL_MS: number;
  WALLETS_DATA_VERSION: string;
  WATCH_TOWER_API: string;

  REGTEST_API_BASE: string;

  MAINNET_SERVICE_ADDRESS_API: string;
  TESTNET_SERVICE_ADDRESS_API: string;
  TAPE_SERVICE_ADDRESS_API: string;
  REGTEST_SERVICE_ADDRESS_API_SUFFIX: string;

  MAINNET_COMMUNITY_BACKUPS_WRITER_API: string;
  TESTNET_COMMUNITY_BACKUPS_WRITER_API: string;
  TAPE_COMMUNITY_BACKUPS_WRITER_API: string;
  REGTEST_COMMUNITY_BACKUPS_WRITER_API_SUFFIX: string;

  //reader: (the p2p node)
  COMMUNITY_BACKUPS_API: string;
  REGTEST_COMMUNITY_BACKUPS_API_SUFFIX: string;

  EXTERNAL_GENERATE_204: string;
  PUBLIC_GENERATE_204_API: string;
  REGTEST_GENERATE_204_API_SUFFIX: string;

  BTC_RATES_API: string;

  MAINNET_ESPLORA_API: string;
  TESTNET_ESPLORA_API: string;
  TAPE_ESPLORA_API: string;
  REGTEST_ESPLORA_API_SUFFIX: string;

  MAINNET_ELECTRUM_API: string;
  TESTNET_ELECTRUM_API: string;
  TAPE_ELECTRUM_API: string;
  REGTEST_ELECTRUM_API: string;

  TAPE_WEB_SERVER: string;
  REGTEST_WEB_SERVER_SUFFIX: string;

  MAINNET_BLOCK_EXPLORER: string;
  TESTNET_BLOCK_EXPLORER: string;
  TAPE_BLOCK_EXPLORER: string;
  REGTEST_BLOCK_EXPLORER_SUFFIX: string;
}

const locales = getLocales();

// Default values for the context
export const defaultSettings: Settings = {
  NETWORK_TIMEOUT: 20000,
  GAP_LIMIT: 20,
  SERVICE_FEE_RATE: 0.004,
  MIN_FEE_RATE: 1,
  MIN_LOCK_BLOCKS: 1,
  MAX_LOCK_BLOCKS: 3 * 30 * 24 * 6,
  INITIAL_LOCK_BLOCKS: 3 * 24 * 6,
  //TODO: set it to larger values in production
  SAMPLES: 60, //This corresponds to (PRESIGNED_FEE_RATE_CEILING ^ (1/SAMPLES) - 1) * 100 / 2 = 8% expected increase in fees wrt to ideal case, which is perfectly fine
  //TODO: this should be 5 * 1000; I set it to 10 for testnet tests
  //PRESIGNED_FEE_RATE_CEILING: 5 * 1000, //22-dec-2017 fee rates were 1000. TODO: Set this to 5000 which is 5x 22-dec-2017
  //https://twitter.com/KLoaec/status/1733880025017978914
  //PRESIGNED_FEE_RATE_CEILING: 2,
  PRESIGNED_FEE_RATE_CEILING: 100, //This is the one used to compute minVaultAmount
  MAX_PRESIGNED_FEE_RATE_CEILING: 10000, //TODO: should be 10000 - This is the one used to compute pressigned txs.
  // 2 hours
  INITIAL_CONFIRMATION_TIME: 2 * 60 * 60,
  MIN_RECOVERABLE_RATIO: 2 / 3,
  SUB_UNIT: 'btc',
  FIAT_MODE: false, //whether the user prefers using fiat than SUB_UNIT
  LOCALE: 'default', //systems default
  //System default (if one of the possible ones):
  CURRENCY:
    locales[0]?.currencyCode &&
    currencyCodes.includes(locales[0].currencyCode as Currency)
      ? (locales[0].currencyCode as Currency)
      : 'USD',
  BTC_FIAT_REFRESH_INTERVAL_MS: 60000, //1 minutes
  BLOCKCHAIN_DATA_REFRESH_INTERVAL_MS: 60000, // 1 minute
  WALLETS_DATA_VERSION: '1.0.0', //This does not define the version of the App, but keeps track of the changes in the signature of the Wallet
  WATCH_TOWER_API: '', // Empty string means disabled by default

  REGTEST_API_BASE: `${LOCAL_PROTOCOL}://${REGTEST_HOST_NAME}`,

  MAINNET_SERVICE_ADDRESS_API: `${PUBLIC_PROTOCOL}://${PUBLIC_API_SERVER_NAME}${PUBLIC_MAINNET_SERVICE_ADDRESS_LOCATION}`,
  TESTNET_SERVICE_ADDRESS_API: `${PUBLIC_PROTOCOL}://${PUBLIC_API_SERVER_NAME}${PUBLIC_TESTNET_SERVICE_ADDRESS_LOCATION}`,
  TAPE_SERVICE_ADDRESS_API: `${PUBLIC_PROTOCOL}://${PUBLIC_API_SERVER_NAME}${PUBLIC_TAPE_SERVICE_ADDRESS_LOCATION}`,
  REGTEST_SERVICE_ADDRESS_API_SUFFIX: `:${LOCAL_REGTEST_SERVICE_ADDRESS_PORT}`,

  MAINNET_COMMUNITY_BACKUPS_WRITER_API: `${PUBLIC_PROTOCOL}://${PUBLIC_API_SERVER_NAME}${PUBLIC_MAINNET_VAULTS_WRITER_LOCATION}`,
  TESTNET_COMMUNITY_BACKUPS_WRITER_API: `${PUBLIC_PROTOCOL}://${PUBLIC_API_SERVER_NAME}${PUBLIC_TESTNET_VAULTS_WRITER_LOCATION}`,
  TAPE_COMMUNITY_BACKUPS_WRITER_API: `${PUBLIC_PROTOCOL}://${PUBLIC_API_SERVER_NAME}${PUBLIC_TAPE_VAULTS_WRITER_LOCATION}`,
  REGTEST_COMMUNITY_BACKUPS_WRITER_API_SUFFIX: `:${LOCAL_REGTEST_VAULTS_WRITER_PORT}`,

  //Vaults reader API:
  COMMUNITY_BACKUPS_API: `${PUBLIC_PROTOCOL}://${PUBLIC_COMMUNITY_BACKUPS_SERVER_NAME}`,
  REGTEST_COMMUNITY_BACKUPS_API_SUFFIX: `:${LOCAL_COMMUNITY_BACKUPS_PORT}`,

  //Other 204 health check endpoints
  EXTERNAL_GENERATE_204: 'https://clients3.google.com/generate_204',
  PUBLIC_GENERATE_204_API: `${PUBLIC_PROTOCOL}://${PUBLIC_API_SERVER_NAME}/generate_204`,
  REGTEST_GENERATE_204_API_SUFFIX: `/generate_204`,

  BTC_RATES_API: `${PUBLIC_PROTOCOL}://${PUBLIC_API_SERVER_NAME}${PUBLIC_BTC_RATES_LOCATION}`,

  MAINNET_ESPLORA_API: 'https://blockstream.info/api',
  TESTNET_ESPLORA_API: 'https://blockstream.info/testnet/api',
  //MAINNET_ESPLORA_API: 'https://mempool.space/api',
  //TESTNET_ESPLORA_API: 'https://mempool.space/testnet/api',
  TAPE_ESPLORA_API: `${PUBLIC_PROTOCOL}://${PUBLIC_TAPE_SERVER_NAME}${PUBLIC_TAPE_ESPLORA_API_LOCATION}`,
  REGTEST_ESPLORA_API_SUFFIX: `:${LOCAL_REGTEST_ESPLORA_API_PORT}`,

  //MAINNET_ELECTRUM_API: 'ssl://electrum.blockstream.info:50002',
  MAINNET_ELECTRUM_API: 'ssl://blockstream.info:700', //https://blog.blockstream.com/en-esplora-and-other-alternatives-to-electrumx/
  TESTNET_ELECTRUM_API: 'ssl://electrum.blockstream.info:60002',
  TAPE_ELECTRUM_API: `${ELECTRUM_PUBLIC_PROTOCOL}://${PUBLIC_TAPE_SERVER_NAME}:${PUBLIC_TAPE_ELECTRUM_PORT}`,
  //Here we default to ELECTRUM_LOCAL_PROTOCOL and REGTEST_HOST_NAME (we dont use _SUFFIX)
  REGTEST_ELECTRUM_API: `${ELECTRUM_LOCAL_PROTOCOL}://${REGTEST_HOST_NAME}:${LOCAL_REGTEST_ELECTRUM_SERVER_PORT}`,

  MAINNET_BLOCK_EXPLORER: 'https://blockstream.info',
  TESTNET_BLOCK_EXPLORER: 'https://blockstream.info/testnet',
  //MAINNET_BLOCK_EXPLORER: 'https://mempool.space/',
  //TESTNET_BLOCK_EXPLORER: 'https://mempool.space/testnet/',
  TAPE_BLOCK_EXPLORER: `${PUBLIC_PROTOCOL}://${PUBLIC_TAPE_SERVER_NAME}${PUBLIC_TAPE_BLOCK_EXPLORER_LOCATION}`,
  REGTEST_BLOCK_EXPLORER_SUFFIX: `:${LOCAL_REGTEST_BLOCK_EXPLORER_PORT}`,

  //Tape Web Server (the faucet entry point + web server with service description)
  TAPE_WEB_SERVER: `${PUBLIC_PROTOCOL}://${PUBLIC_TAPE_SERVER_NAME}${PUBLIC_TAPE_WEB_LOCATION}`,
  REGTEST_WEB_SERVER_SUFFIX: `:${LOCAL_REGTEST_WEB_PORT}`
};
