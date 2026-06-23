// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

const DETECTION_INTERVAL = 4000;
const DETECT_RETRY_MAX = 5;
import { useTranslation } from 'react-i18next';
import React, { useCallback, useState, useMemo, useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import { View, Text, Linking, Share, Platform } from 'react-native';
import type { Account } from '@bitcoinerlab/discovery';
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
import { computeOutput } from '../lib/vaultDescriptors';
import NoteEditorWithHelp from '../components/NoteEditorWithHelp';
import {
  AddressScriptPickerModal,
  type AddressScriptSelection
} from '../components/AddressScriptPicker';
import { getWalletLabelText } from '../lib/labels';

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
  const [hasCustomReceiveAddress, setHasCustomReceiveAddress] = useState(false);
  const [isAddressPickerVisible, setIsAddressPickerVisible] = useState(false);

  const {
    networkId,
    faucetURL,
    accounts,
    labels,
    getReceiveDescriptorWithNextIndex,
    getPreferredAccount,
    fetchOutputHistory,
    setWalletLabelText,
    trackAccount
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
          } catch {}
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
    if (hasCustomReceiveAddress) return;
    const f = async () => {
      const receiveDescriptorWithIndex =
        await getReceiveDescriptorWithNextIndex(accounts);
      setReceiveDescriptorWithIndex(receiveDescriptorWithIndex);
    };
    f();
  }, [
    getReceiveDescriptorWithNextIndex,
    network,
    accounts,
    hasCustomReceiveAddress
  ]);

  const receiveAddress = useMemo(
    () =>
      receiveDescriptorWithIndex &&
      computeOutput(receiveDescriptorWithIndex, network).getAddress(),
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

  const handleConfirmAddressPicker = useCallback(
    (selection: AddressScriptSelection) => {
      setHasCustomReceiveAddress(true);
      setReceiveDescriptorWithIndex({
        descriptor: selection.descriptor,
        index: selection.index
      });
      setIsAddressPickerVisible(false);
      const account = selection.descriptor.replace(
        /\/[01]\/\*/g,
        '/0/*'
      ) as Account;
      trackAccount(account).catch(error => {
        console.warn('Failed to track selected receive account', error);
        toast.show(t('addressPicker.trackError'), { type: 'warning' });
      });
    },
    [t, toast, trackAccount]
  );

  const onClipboard = useCallback(() => {
    if (!receiveAddress) throw new Error('receiveAddress does not exist');
    Clipboard.setStringAsync(receiveAddress);
    toast.show(t('receive.clipboard'), {
      type: 'success',
      duration: 2000
    });
  }, [toast, t, receiveAddress]);

  const receiveLabel = receiveAddress
    ? getWalletLabelText(labels, 'addr', receiveAddress)
    : '';
  const handleSaveReceiveLabel = useCallback(
    (label: string) => {
      if (!receiveAddress) throw new Error('receiveAddress does not exist');
      return setWalletLabelText({ type: 'addr', ref: receiveAddress, label });
    },
    [receiveAddress, setWalletLabelText]
  );

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
  const pickerAccount = (receiveDescriptorWithIndex?.descriptor.replace(
    /\/1\/\*/g,
    '/0/*'
  ) ?? getPreferredAccount(accounts)) as Account;
  const pickerChange: 0 | 1 = receiveDescriptorWithIndex?.descriptor.includes(
    '/1/*'
  )
    ? 1
    : 0;

  return receiveAddress ? (
    <KeyboardAwareScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="items-center pt-5 px-5"
    >
      <View
        className="w-full max-w-screen-sm mx-4 gap-4"
        style={containerStyle}
      >
        <Text className="text-base text-center text-slate-700">
          {t('receive.intro')}
        </Text>
        <View className="rounded-3xl bg-white px-4 py-5 android:elevation ios:shadow web:shadow gap-5">
          <View className="items-center pt-4">
            <QRCode value={`bitcoin:${receiveAddress}`} size={200} />
          </View>
          <Text
            className="rounded-2xl bg-slate-100 px-3 py-3 text-center text-xs leading-5 text-slate-700"
            onPress={onClipboard}
          >
            {receiveAddress}
          </Text>
          {canShare ? (
            <View className="gap-x-4 gap-y-3 flex-row flex-wrap justify-center self-center">
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
          ) : (
            <Button mode="text" iconRight={clipboardIcon} onPress={onClipboard}>
              {t('receive.copyAddress')}
            </Button>
          )}
          <Button
            mode="text"
            containerClassName="self-center !min-w-0"
            textClassName="!text-xs"
            onPress={() => setIsAddressPickerVisible(true)}
          >
            {t('receive.advancedAddressOptions')}
          </Button>
        </View>

        <AddressScriptPickerModal
          isVisible={isAddressPickerVisible}
          initialAccount={pickerAccount}
          initialChange={pickerChange}
          initialIndex={receiveDescriptorWithIndex?.index ?? 0}
          allowChangeSelection={true}
          confirmText={t('addressPicker.useReceiveAddress')}
          introText={t('addressPicker.receiveIntro')}
          onCancel={() => setIsAddressPickerVisible(false)}
          onConfirm={handleConfirmAddressPicker}
        />

        <View className="rounded-2xl bg-gray-50 p-4 android:elevation ios:shadow web:shadow gap-2">
          <View>
            <Text className="text-base font-bold text-slate-900">
              {t('receive.addressNoteTitle')}
            </Text>
            <Text className="mt-1 text-sm text-slate-600">
              {t('receive.addressNoteIntro')}
            </Text>
          </View>
          <View>
            <NoteEditorWithHelp
              label={receiveLabel}
              placeholder={t('receive.labelPlaceholder')}
              disabled={!labels}
              addActionText={t('receive.addAddressNote')}
              editActionText={t('receive.editAddressNote')}
              helpToggleText={t('transaction.noteHelpToggle')}
              hideHelpText={t('transaction.noteHelpHide')}
              helpText={t('receive.addressNoteHelp')}
              onSave={handleSaveReceiveLabel}
            />
          </View>
        </View>

        {requestTokensURL && networkName && (
          <View className="rounded-2xl bg-blue-50 p-4 android:elevation ios:shadow web:shadow gap-3">
            <View className="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <Text className="text-base font-bold text-slate-900">
                {t('receive.faucetIntro')}
              </Text>
              <Button mode="text" onPress={onFaucet}>
                {t('receive.requestTokens')}
              </Button>
            </View>
            <Text className="text-sm text-slate-600">
              {t('receive.faucetNote', { networkName })}
            </Text>
          </View>
        )}

        <Button onPress={goBack}>{t('receive.doneButton')}</Button>
      </View>
    </KeyboardAwareScrollView>
  ) : (
    <View className="flex-1 justify-center items-center">
      <ActivityIndicator size={'large'} />
    </View>
  );
}
