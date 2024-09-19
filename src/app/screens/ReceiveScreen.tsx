import { useTranslation } from 'react-i18next';
import React, { useCallback, useState, useMemo } from 'react';
import { useNavigation } from '@react-navigation/native';
import { View } from 'react-native';
import { Button, KeyboardAwareScrollView } from '../../common/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { networkMapping } from '../lib/network';
import { useSettings } from '../hooks/useSettings';
import { useWallet } from '../hooks/useWallet';

export default function Send() {
  const insets = useSafeAreaInsets();
  const containerStyle = useMemo(
    () => ({ marginBottom: insets.bottom / 4 + 16 }),
    [insets.bottom]
  );
  const navigation = useNavigation();

  const { utxosData, networkId, feeEstimates, accounts } = useWallet();
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

  const { settings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );
  const { t } = useTranslation();

  //TODO
  //
  //
  //
  //Use this function:   const fetchOutputHistory = useCallback(
  //
  //
  //
  //
  //

  return (
    <KeyboardAwareScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="items-center pt-5 px-5"
    >
      <View
        className="w-full max-w-screen-sm mx-4"
        style={containerStyle}
      ></View>
    </KeyboardAwareScrollView>
  );
}
