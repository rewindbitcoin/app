// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

const DETECTION_INTERVAL = 4000;
const DETECT_RETRY_MAX = 5;
import { useTranslation } from 'react-i18next';
import React, { useCallback, useState, useMemo, useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import { View, Text, Linking, Share, Platform } from 'react-native';
import {
  ActivityIndicator,
  Button,
  IconType,
  KeyboardAwareScrollView,
  useToast
} from '../../common/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { networkMapping } from '../lib/network';
import { useWallet } from '../hooks/useWallet';
import { computeReceiveOutput } from '../lib/vaultDescriptors';

import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';

export default function Receive() {
  const insets = useSafeAreaInsets();
  const containerStyle = useMemo(
    () => ({ marginBottom: insets.bottom / 4 + 16 }),
    [insets.bottom]
  );
  const navigation = useNavigation();
  const goBack = useCallback(() => {
    //goBack will unmount this screen as per react-navigation docs.
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);

  const [receiveDescriptorWithIndex, setReceiveDescriptorWithIndex] = useState<{
    descriptor: string;
    index: number;
  }>();

  const {
    networkId,
    faucetURL,
    accounts,
    getNextReceiveDescriptorWithIndex,
    fetchOutputHistory
  } = useWallet();
  if (!networkId)
    throw new Error('ReceiveScreen cannot be called with unset networkId');
  if (!accounts)
    throw new Error('ReceiveScreen cannot be called with unset accounts');
  const network = networkMapping[networkId];

  useEffect(() => {
    if (receiveDescriptorWithIndex) {
      const checkForReceivedFunds = async () => {
        for (let i = 0; i < DETECT_RETRY_MAX; i++) {
          try {
            const txHistory = await fetchOutputHistory({
              ...receiveDescriptorWithIndex
            });
            if (txHistory?.length) break;
            await new Promise(resolve =>
              setTimeout(resolve, DETECTION_INTERVAL)
            );
          } catch (error) {}
        }
      };

      const unsubscribe = navigation.addListener('beforeRemove', () => {
        if (receiveDescriptorWithIndex) {
          checkForReceivedFunds();
        }
      });
      return unsubscribe;
    }
    return;
  }, [navigation, receiveDescriptorWithIndex, fetchOutputHistory]);

  useEffect(() => {
    const f = async () => {
      const receiveDescriptorWithIndex =
        await getNextReceiveDescriptorWithIndex(accounts);
      setReceiveDescriptorWithIndex(receiveDescriptorWithIndex);
    };
    f();
  }, [getNextReceiveDescriptorWithIndex, network, accounts]);

  const receiveAddress = useMemo(
    () =>
      receiveDescriptorWithIndex &&
      computeReceiveOutput(receiveDescriptorWithIndex, network).getAddress(),
    [receiveDescriptorWithIndex, network]
  );

  const onShare = useCallback(() => {
    if (receiveAddress) {
      Share.share({
        message: `bitcoin:${receiveAddress}`
      });
    }
  }, [receiveAddress]);

  const { t } = useTranslation();
  const toast = useToast();

  const onClipboard = useCallback(() => {
    if (!receiveAddress) throw new Error('receiveAddress does not exist');
    Clipboard.setStringAsync(receiveAddress);
    toast.show(t('receive.clipboard'), {
      type: 'success',
      duration: 2000
    });
  }, [toast, t, receiveAddress]);

  const requestTokensURL =
    faucetURL && receiveAddress ? `${faucetURL}/?addr=${receiveAddress}` : null;
  const networkName =
    networkId === 'TAPE' ? 'Tape' : networkId === 'REGTEST' ? 'Regtest' : null;

  const onFaucet = useCallback(() => {
    if (requestTokensURL) Linking.openURL(requestTokensURL);
  }, [requestTokensURL]);

  const shareIcon = useMemo<IconType>(
    () => ({
      family: 'FontAwesome6',
      name: 'share-square'
    }),
    []
  );
  const clipboardIcon = useMemo<IconType>(
    () => ({
      family: 'FontAwesome6',
      name: 'copy'
    }),
    []
  );

  const canShare = Platform.OS === 'ios' || Platform.OS === 'android';

  return receiveAddress ? (
    <KeyboardAwareScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="items-center pt-5 px-5"
    >
      <View
        className="w-full max-w-screen-sm mx-4 gap-8"
        style={containerStyle}
      >
        <Text className="text-base">{t('receive.intro')}</Text>
        <View className="items-center">
          <QRCode value={`bitcoin:${receiveAddress}`} size={200} />
        </View>
        <View className="items-center">
          {canShare ? (
            <View className="gap-2">
              <Text className="self-center" onPress={onClipboard}>
                {receiveAddress}
              </Text>
              <View className="mt-4 gap-x-6 gap-y-4 8 flex-row flex-wrap justify-center self-center">
                <Button
                  mode="text"
                  onPress={onClipboard}
                  iconRight={clipboardIcon}
                >
                  {t('receive.copyAddress')}
                </Button>
                <Button mode="text" onPress={onShare} iconRight={shareIcon}>
                  {t('receive.shareAddress')}
                </Button>
              </View>
            </View>
          ) : (
            <Button
              mode="text"
              textClassName="break-words break-all"
              iconRight={clipboardIcon}
              onPress={onClipboard}
            >
              {receiveAddress}
            </Button>
          )}
        </View>
        <Button onPress={goBack}>{t('receive.doneButton')}</Button>
        {requestTokensURL && networkName && (
          <View className="mt-4 p-4 bg-gray-50 android:elevation ios:shadow web:shadow rounded-lg items-center">
            <View className="flex-row flex-wrap items-center mb-2 gap-2">
              <Text className="text-base text-center">
                {t('receive.faucetIntro')}
              </Text>
              <Button mode="text" onPress={onFaucet}>
                {t('receive.requestTokens')}
              </Button>
            </View>
            <Text className="text-sm text-slate-600 mt-2">
              {t('receive.faucetNote', { networkName })}
            </Text>
          </View>
        )}
      </View>
    </KeyboardAwareScrollView>
  ) : (
    <View className="flex-1 justify-center items-center">
      <ActivityIndicator size={'large'} />
    </View>
  );
}
