import React, { useState, useEffect } from 'react';
import { View, Text, Linking } from 'react-native';
import type { HistoryData, HistoryDataItem } from '../lib/vaults';
import { Locale } from '~/i18n-locales/init';
import { TFunction } from 'i18next';
import { BlockStatus } from '@bitcoinerlab/explorer';
import { useSettings } from '../hooks/useSettings';
import { useTranslation } from 'react-i18next';
import { Svg } from 'react-native-svg';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Entypo from '@expo/vector-icons/Entypo';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import FreezeIcon from './FreezeIcon';
import UnfreezeIcon from './UnfreezeIcon';
import ReceiveIcon from './ReceiveIcon';
import HotIcon from './HotIcon';
import SendIcon from './SendIcon';
import { Currency, SubUnit } from '../lib/settings';
import { formatBalance } from '../lib/format';
import { Button } from '~/common/ui';

const RawTransaction = ({
  tipStatus,
  locale,
  t,
  item,
  fetchBlockTime,
  btcFiat,
  currency,
  mode,
  blockExplorerURL,
  vaultOutValue
  //triggerOutValue
}: {
  tipStatus: BlockStatus | undefined;
  locale: Locale;
  t: TFunction;
  item: HistoryDataItem;
  fetchBlockTime: (fetchBlockTime: number) => Promise<number | undefined>;
  btcFiat: number | undefined;
  currency: Currency;
  mode: 'Fiat' | SubUnit;
  blockExplorerURL: string | undefined;
  /** if this tx is associated with a vaultId, then pass the output value
   * of the inital vault tx and also the output value of the trigger tx
   * (if they exist)
   */
  vaultOutValue: number | undefined;
  //triggerOutValue: number | undefined;
}) => {
  const [blockTime, setBlockTime] = useState<number | undefined>(
    'blockTime' in item ? item.blockTime : undefined
  );
  const tipHeight = tipStatus?.blockHeight;

  const [scheduledNow, setScheduledNow] = useState<number>(Date.now() / 1000);
  //update now every 1 minute...
  useEffect(() => {
    const interval = setInterval(
      () => {
        setScheduledNow(Date.now() / 1000);
      },
      1 * 60 * 1000
    );
    return () => clearInterval(interval);
  }, []);
  //if rendered for whatever other reason, get the newest time
  const now = Math.max(scheduledNow, Date.now() / 1000);

  const formatDate = (time: number) => {
    const date = new Date(time * 1000);

    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short', // Abbreviated month in letters
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };

    // If the date is in the current year, delete the year to the options
    if (date.getFullYear() === new Date().getFullYear()) delete options.year;
    return date.toLocaleString(locale, options);
  };
  const formatTime = () => {
    if (item.blockHeight === 0) {
      if ('pushTime' in item) {
        const relTime = now - item.pushTime;
        return relTime < 60 * 60
          ? t('transaction.pushedMinsAgo', {
              count: Math.round(relTime / 60)
            })
          : t('transaction.pushedOnDate', { date: formatDate(item.pushTime) });
      } else return t('transaction.recentlyPushed');
    } else {
      if (!tipHeight && !blockTime)
        return t('transaction.confirmedOnBlock', { block: item.blockHeight });
      else {
        const relTime = blockTime
          ? now - blockTime
          : !tipHeight //tipHeight should be defined if !blockHeight (see the early return above)
            ? undefined
            : (tipHeight - item.blockHeight) * 10 * 60;
        if (!relTime)
          throw new Error(
            `Could not estimate translated time for tx: ${item.txId}`
          );
        return relTime < 60 * 60
          ? t('transaction.confirmedMinsAgo', {
              count: Math.round(relTime / 60)
            })
          : t('transaction.confirmedOnDate', {
              date: formatDate(now - relTime)
            });
      }
    }
  };

  //We don't really care if fetchBlockTime fails (should never happen anyway).
  //So no need for displaying error or whatever...
  //Just render using the blockHeight info.
  useEffect(() => {
    if (blockTime === undefined && item.blockHeight) {
      const fetchTime = async () => {
        try {
          const time = await fetchBlockTime(item.blockHeight);
          setBlockTime(time);
        } catch (error) {
          console.warn('Failed to fetch block time:', error);
        }
      };
      fetchTime();
    }
  }, [blockTime, item.blockHeight, fetchBlockTime]);

  /**
   * types:
   * type:
   * SENT, RECEIVED, CONSOLIDATED, RECEIVED_AND_SENT
   * vaultTxType:
   * TRIGGER_EXTERNAL' | 'RESCUE' | 'VAULT' | 'TRIGGER_HOT_WALLET'
   */

  let header;
  let detailsStr;
  let coldReceived = 0;
  if ('vaultTxType' in item) {
    if (!('outValue' in item))
      throw new Error('outValue should be set for vaultTxType');
    if (!('vaultNumber' in item))
      throw new Error('vaultNumber should be set for vaultTxType');
    const vaultNumber = item.vaultNumber;
    const outValueStr = formatBalance({
      satsBalance: item.outValue,
      btcFiat,
      currency,
      locale,
      mode,
      appendSubunit: true
    });
    //Vault related tx
    if (item.vaultTxType === 'VAULT') {
      header = (
        <View className="flex-row items-center flex-1">
          <Svg className="fill-primary w-5 h-5" viewBox="0 0 24 24">
            <FreezeIcon />
          </Svg>
          <Text className="font-semibold ml-2">
            {t('transaction.header.vault', { vaultNumber })}
          </Text>
        </View>
      );
      detailsStr = t('transaction.details.vault', { amount: outValueStr });
      coldReceived = item.outValue;
    } else if (
      item.vaultTxType === 'TRIGGER_EXTERNAL' ||
      item.vaultTxType === 'TRIGGER_HOT_WALLET'
    ) {
      header = (
        <View className="flex-row items-center flex-1">
          <Svg className="fill-primary w-5 h-5" viewBox="0 0 24 24">
            <UnfreezeIcon />
          </Svg>
          <Text className="font-semibold ml-2">
            {t('transaction.header.trigger', { vaultNumber })}
          </Text>
        </View>
      );
      if (item.vaultTxType === 'TRIGGER_EXTERNAL') {
        if (item.spentAsPanic) {
          //Either awaiting or panicked
          if (item.spentAsPanic === 'CONFIRMING')
            detailsStr = t('transaction.details.triggerConfirmingPanic', {
              amount: outValueStr
            });
          else
            detailsStr = t('transaction.details.triggerConfirmedPanic', {
              amount: outValueStr
            });
          if (vaultOutValue !== undefined)
            //it should be defined, in fact
            coldReceived = -vaultOutValue;
        } else {
          if (vaultOutValue !== undefined)
            //it should be defined, in fact
            coldReceived = item.outValue - vaultOutValue;
          detailsStr = t('transaction.details.triggerWaiting', {
            amount: outValueStr
          });
        }
      } else {
        detailsStr = t('transaction.details.triggerHotWallet');
        if (vaultOutValue !== undefined)
          //it should be defined, in fact
          coldReceived = -vaultOutValue;
      }
    } else if (item.vaultTxType === 'RESCUE') {
      header = (
        <View className="flex-row items-center flex-1">
          <MaterialCommunityIcons name="alarm-light" size={20} color="red" />
          <Text className="font-semibold ml-2">
            {t('transaction.header.rescue', { vaultNumber })}
          </Text>
        </View>
      );
      if (item.blockHeight === 0)
        detailsStr = t('transaction.details.rescuedConfirming', {
          amount: outValueStr
        });
      else
        detailsStr = t('transaction.details.rescued', { amount: outValueStr });
    } else throw new Error(`Unknown vaultTxType ${item.vaultTxType}`);
  } else if (item.type === 'CONSOLIDATED') {
    header = (
      <View className="flex-row items-center flex-1">
        <Entypo name="merge" size={16} className="rotate-90" />
        <Text className="font-semibold ml-2">
          {t('transaction.header.consolidated')}
        </Text>
      </View>
    );
  } else if (item.type === 'RECEIVED_AND_SENT') {
    header = (
      <View className="flex-row items-center flex-1">
        <MaterialIcons name="swap-horiz" size={20} />
        <Text className="font-semibold ml-2">
          {t('transaction.header.receivedAndSent')}
        </Text>
      </View>
    );
  } else if (item.type === 'RECEIVED') {
    header = (
      <View className="flex-row items-center flex-1">
        <Svg
          className="stroke-green-500 stroke-2 fill-none w-5 h-5"
          viewBox="0 0 24 24"
        >
          <ReceiveIcon />
        </Svg>
        <Text className="font-semibold ml-2">
          {t('transaction.header.received')}
        </Text>
      </View>
    );
  } else if (item.type === 'SENT') {
    header = (
      <View className="flex-row items-center flex-1">
        <Svg
          className="stroke-red-500 stroke-2 fill-none w-5 h-5 -rotate-45"
          viewBox="0 0 24 24"
        >
          <SendIcon />
        </Svg>
        <Text className="font-semibold ml-2">
          {t('transaction.header.sent')}
        </Text>
      </View>
    );
  } else {
    throw new Error(
      `Unsupported tx type: ${item.type} - ${'vaultTxType' in item && item.vaultTxType}`
    );
  }

  return (
    <View className="overflow-hidden p-4">
      <View className="flex-row justify-between items-start">
        {header}
        <View className="items-end">
          {'netReceived' in item && (
            <View className="flex-row justify-end items-center">
              <Svg className="fill-yellow-400 w-5 h-5" viewBox="0 0 24 24">
                <HotIcon />
              </Svg>
              <Text
                className={`ml-2 ${item.netReceived >= 0 ? 'text-green-700' : 'text-red-700'}`}
              >
                {item.netReceived > 0 ? '+' : ''}
                {formatBalance({
                  satsBalance: item.netReceived,
                  btcFiat,
                  currency,
                  locale,
                  mode,
                  appendSubunit: true
                })}
              </Text>
            </View>
          )}
          {coldReceived !== 0 && (
            <View className="flex-row justify-end mt-0.5 items-center">
              <Svg className="fill-primary w-4 h-4" viewBox="0 0 24 24">
                <FreezeIcon />
              </Svg>
              <Text
                className={`ml-2 ${coldReceived >= 0 ? 'text-green-700' : 'text-red-700'}`}
              >
                {coldReceived > 0 ? '+' : ''}
                {formatBalance({
                  satsBalance: coldReceived,
                  btcFiat,
                  currency,
                  locale,
                  mode,
                  appendSubunit: true
                })}
              </Text>
            </View>
          )}
        </View>
      </View>
      <View className="gap-2 mt-3">
        {detailsStr && <Text>{detailsStr}</Text>}
        {blockExplorerURL && (
          <Button
            iconRight={{ family: 'FontAwesome5', name: 'external-link-alt' }}
            mode="text"
            containerClassName="self-start"
            onPress={() => Linking.openURL(`${blockExplorerURL}/${item.txId}`)}
          >
            {t('transaction.details.openBlockExplorer')}
          </Button>
        )}
        <Text className="text-slate-600 text-right ">{formatTime()}</Text>
      </View>
    </View>
  );
};

const Transaction = React.memo(RawTransaction);

const Transactions = ({
  btcFiat,
  tipStatus,
  historyData,
  fetchBlockTime,
  blockExplorerURL
}: {
  btcFiat: number | undefined;
  tipStatus: BlockStatus | undefined;
  historyData: HistoryData | undefined;
  fetchBlockTime: (fetchBlockTime: number) => Promise<number | undefined>;
  blockExplorerURL: string | undefined;
}) => {
  const { settings } = useSettings();
  if (!settings) throw new Error('settings not yet set');
  const mode =
    settings.FIAT_MODE && typeof btcFiat === 'number'
      ? 'Fiat'
      : settings.SUB_UNIT;
  const locale = settings.LOCALE;
  const { t } = useTranslation();
  return (
    <View className="rounded-3xl bg-white gap-y-2">
      {historyData && historyData.length ? (
        [...historyData].reverse().map((item, index) => {
          // Compute vaultOutValue and triggerOutValue, that is, if this tx
          // is associated to a vaultId, then for this vaultId, compute which
          // was the output value when vaulting and the output value when
          // triggering the unvault
          let vaultOutValue; //if known
          //let triggerOutValue; //if known
          const vaultHistoryDataItem = historyData.find(
            vaultHistoryDataItem =>
              'vaultTxType' in vaultHistoryDataItem &&
              vaultHistoryDataItem.vaultTxType === 'VAULT' &&
              'vaultId' in vaultHistoryDataItem &&
              'vaultId' in item &&
              vaultHistoryDataItem.vaultId === item.vaultId
          );
          if (vaultHistoryDataItem && 'outValue' in vaultHistoryDataItem)
            vaultOutValue = vaultHistoryDataItem.outValue;
          //const triggerHistoryDataItem = historyData.find(
          //  triggerHistoryDataItem =>
          //    'vaultTxType' in triggerHistoryDataItem &&
          //    (triggerHistoryDataItem.vaultTxType === 'TRIGGER_EXTERNAL' ||
          //      triggerHistoryDataItem.vaultTxType === 'TRIGGER_HOT_WALLET') &&
          //    'vaultId' in triggerHistoryDataItem &&
          //    'vaultId' in item &&
          //    triggerHistoryDataItem.vaultId === item.vaultId
          //);
          //if (triggerHistoryDataItem && 'outValue' in triggerHistoryDataItem)
          //  triggerOutValue = triggerHistoryDataItem.outValue;

          //      triggerOutValue={triggerOutValue}
          return (
            <React.Fragment key={item.txId}>
              <Transaction
                tipStatus={tipStatus}
                locale={locale}
                t={t}
                item={item}
                mode={mode}
                btcFiat={btcFiat}
                vaultOutValue={vaultOutValue}
                currency={settings.CURRENCY}
                fetchBlockTime={fetchBlockTime}
                blockExplorerURL={blockExplorerURL}
              />
              {index < historyData.length - 1 && (
                <View className="h-px bg-slate-300" />
              )}
            </React.Fragment>
          );
        })
      ) : (
        <Text>TODO: retrieving txs... or no txs yet...</Text>
      )}
    </View>
  );
};

export default React.memo(Transactions);
