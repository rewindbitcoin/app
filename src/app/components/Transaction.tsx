import React, { useState, useEffect, useCallback } from 'react';
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
  const now = Math.max(scheduledNow, Date.now());

  const formatTime = () => {
    if (item.blockHeight === 0) {
      if ('pushTime' in item)
        return t('TODO: ' + dateOrTime(now - item.pushTime));
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
    if (blockTime) return t('TODO: blocktime -' + blockTime);
    else if (tipHeight) {
      return t('TODO: blocks ago -' + (tipHeight - item.blockHeight));
    } else {
      throw new Error('Could not format time');
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
