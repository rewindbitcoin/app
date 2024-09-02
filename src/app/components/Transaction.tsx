import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import type { HistoryDataItem } from '../lib/vaults';
import { Locale } from '~/i18n-locales/init';
import { TFunction } from 'i18next';
import { BlockStatus } from '@bitcoinerlab/explorer';
const Transaction = ({
  tipStatus,
  locale,
  t,
  item,
  fetchBlockTime
}: {
  tipStatus: BlockStatus | undefined;
  locale: Locale;
  t: TFunction;
  item: HistoryDataItem;
  fetchBlockTime: (fetchBlockTime: number) => Promise<number | undefined>;
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
    const now = new Date();

    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short', // Abbreviated month in letters
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };

    // If the date is in the current year, delete the year to the options
    if (date.getFullYear() === now.getFullYear()) delete options.year;
    return date.toLocaleString(locale, options);
  };
  const formatRelTime = (relativeTime: number) => {
    if (relativeTime < 60) {
      return t('TODO: seconds ago - ' + Math.max(1, Math.round(relativeTime)));
    }
    if (relativeTime < 60 * 60) {
      return t('TODO: minutes ago - ' + Math.round(relativeTime / 60));
    } else {
      return t('TODO: on ' + formatDate(now - relativeTime));
    }
  };
  const formatTime = () => {
    if (item.blockHeight === 0) {
      if ('pushTime' in item)
        return t(
          'TODO: confirming, pushed on/since' +
            formatRelTime(now - item.pushTime)
        );
      else return t('TODO: confirming...');
    }
    if (!tipHeight && !blockTime)
      return t('TODO: on block - ' + item.blockHeight);
    const timeAgo = blockTime
      ? now - blockTime
      : !tipHeight //tipHeight should be defined if !blockHeight (see the early return above)
        ? undefined
        : (tipHeight - item.blockHeight) * 10 * 60;
    if (!timeAgo)
      throw new Error(
        `Could not estimate translated time for tx: ${item.txId}`
      );
    return formatRelTime(timeAgo);
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

  console.log({ item });
  return (
    <View className="flex-col p-4">
      <Text>{formatTime()}</Text>
      <Text>{item.txId}</Text>
      {'type' in item && <Text>{item.type}</Text>}
      {'vaultNumber' in item && <Text>VaultId: {item.vaultNumber}</Text>}
      {'vaultTxType' in item && <Text>{item.vaultTxType}</Text>}
      {'netReceived' in item && <Text>Net received: {item.netReceived}</Text>}
      {'outValue' in item && <Text>outValue: {item.outValue}</Text>}
    </View>
  );
};

export default React.memo(Transaction);
