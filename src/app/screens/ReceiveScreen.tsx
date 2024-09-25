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
    utxosData,
    networkId,
    feeEstimates,
    accounts,
    faucetURL,
    getNextReceiveDescriptorWithIndex,
    fetchOutputHistory
  } = useWallet();
  if (!utxosData)
    throw new Error('SetUpVaultScreen cannot be called with unset utxos');
  if (!accounts)
    throw new Error('SetUpVaultScreen cannot be called with unset accounts');
  if (!networkId)
    throw new Error('SetUpVaultScreen cannot be called with unset networkId');
  if (!feeEstimates)
    throw new Error(
      'SetUpVaultScreen cannot be called with unset feeEstimates'
    );
  const network = networkMapping[networkId];

  useEffect(() => {
    if (receiveDescriptorWithIndex) {
      const checkForReceivedFunds = async () => {
        for (let i = 0; i < DETECT_RETRY_MAX; i++) {
          try {
            const txHistory = await fetchOutputHistory({
              ...receiveDescriptorWithIndex
            });
            if (txHistory) break;
            await new Promise(resolve =>
              setTimeout(resolve, DETECTION_INTERVAL)
            );
          } catch (error) {
            console.warn(error);
          }
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
        await getNextReceiveDescriptorWithIndex();
      setReceiveDescriptorWithIndex(receiveDescriptorWithIndex);
    };
    f();
  }, [getNextReceiveDescriptorWithIndex, network]);

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

  return (
    <KeyboardAwareScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="items-center pt-5 px-5"
    >
      {receiveAddress ? (
        <View
          className="w-full max-w-screen-sm mx-4 gap-8"
          style={containerStyle}
        >
          <Text>{t('receive.intro')}</Text>
          <View className="items-center">
            <QRCode value={receiveAddress} size={200} />
          </View>
          <View className="items-center">
            {canShare ? (
              <View className="gap-2">
                <Text className="self-center" onPress={onClipboard}>
                  {receiveAddress}
                </Text>
                <View className="mt-4 gap-6 flex-row justify-center self-center">
                  <Button
                    mode="text"
                    onPress={onClipboard}
                    iconRight={clipboardIcon}
                  >
                    {t('receive.copyAddress')}
                  </Button>
                  <Text className="text-gray-500">|</Text>
                  <Button mode="text" onPress={onShare} iconRight={shareIcon}>
                    {t('receive.shareAddress')}
                  </Button>
                </View>
              </View>
            ) : (
              <Button
                mode="text"
                iconRight={clipboardIcon}
                onPress={onClipboard}
              >
                {receiveAddress}
              </Button>
            )}
          </View>
          <Button onPress={goBack}>{t('receive.doneButton')}</Button>
          {requestTokensURL && networkName && (
            <View className="mt-4 p-4 bg-gray-50 shadow rounded-lg items-center">
              <View className="flex-row items-center mb-2">
                <Text className="text-center">{t('receive.faucetIntro')}</Text>
                <Button mode="text" onPress={onFaucet} className="ml-2">
                  {t('receive.requestTokens')}
                </Button>
              </View>
              <Text className="text-xs text-slate-600 mt-2">
                {t('receive.faucetNote', { networkName })}
              </Text>
            </View>
          )}
        </View>
      ) : (
        <View className="flex-1 justify-center">
          <ActivityIndicator size={'large'} />
        </View>
      )}
    </KeyboardAwareScrollView>
  );
}
