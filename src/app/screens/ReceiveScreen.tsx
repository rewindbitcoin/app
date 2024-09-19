//TODO: Add share icon also and share: "bitcoin:address" for example
const DETECTION_INTERVAL = 4000;
const DETECT_RETRY_MAX = 5;
import { useTranslation } from 'react-i18next';
import React, { useCallback, useState, useMemo, useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import { View, Text } from 'react-native';
import { Button, KeyboardAwareScrollView, useToast } from '../../common/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { networkMapping } from '../lib/network';
import { useSettings } from '../hooks/useSettings';
import { useWallet } from '../hooks/useWallet';
import { computeReceiveOutput } from '../lib/vaultDescriptors';

import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';

export default function Send() {
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

  const [receiveDescriptor, setReceiveDescriptor] = useState<string>();

  const {
    utxosData,
    networkId,
    feeEstimates,
    accounts,
    getReceiveDescriptor,
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
    if (receiveDescriptor) {
      const checkForReceivedFunds = async () => {
        for (let i = 0; i < DETECT_RETRY_MAX; i++) {
          try {
            const txHistory = await fetchOutputHistory({
              descriptor: receiveDescriptor
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
        if (receiveDescriptor) {
          checkForReceivedFunds();
        }
      });
      return unsubscribe;
    }
    return;
  }, [navigation, receiveDescriptor, fetchOutputHistory]);

  useEffect(() => {
    const f = async () => {
      const receiveDescriptor = await getReceiveDescriptor();
      setReceiveDescriptor(receiveDescriptor);
    };
    f();
  }, [getReceiveDescriptor, network]);

  const receiveAddress = useMemo(
    () =>
      receiveDescriptor &&
      computeReceiveOutput(receiveDescriptor, network).getAddress(),
    [receiveDescriptor, network]
  );

  const { settings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );
  const { t } = useTranslation();
  const toast = useToast();

  const onClipboard = useCallback(() => {
    if (!receiveAddress) throw new Error('receiveAddress does not exist');
    //TODO: useCallback
    Clipboard.setStringAsync(receiveAddress);
    toast.show(t('receive.clipboard'), {
      type: 'success',
      duration: 2000
    });
  }, [toast, t, receiveAddress]);

  return (
    <KeyboardAwareScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="items-center pt-5 px-5"
    >
      {
        receiveAddress ? (
          <View
            className="w-full max-w-screen-sm mx-4 gap-8"
            style={containerStyle}
          >
            <Text>{t('receive.intro')}</Text>
            <View className="items-center">
              <QRCode value={receiveAddress} size={200} />
            </View>
            <Button mode="text" onPress={onClipboard}>
              {receiveAddress}
            </Button>
            <Button onPress={goBack}>{t('receive.doneButton')}</Button>
          </View>
        ) : null //TODO: loading if no address yet
      }
    </KeyboardAwareScrollView>
  );
}
