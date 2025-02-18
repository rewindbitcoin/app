import React, { useCallback, useState } from 'react';

import { Text, View, Pressable, Platform } from 'react-native';
import { Modal, Divider, InfoButton, Switch } from '../../common/ui';
import type { Engine as StorageEngine } from '../../common/lib/storage';
import Password from './Password';
import { useTranslation } from 'react-i18next';
import { LayoutAnimation } from 'react-native';
import AntDesign from '@expo/vector-icons/AntDesign';
import type { NetworkId } from '../lib/network';
import NetworksModal from './NetworksModal';
import { MaterialCommunityIcons } from '@expo/vector-icons';
export type AdvancedSettings = {
  signersStorageEngine: StorageEngine;
  signersPassword?: string | undefined;
  encryption: 'NONE' | 'SEED_DERIVED';
  networkId: NetworkId;
};
import { cssInterop } from 'nativewind';
cssInterop(MaterialCommunityIcons, {
  className: {
    target: 'style',
    nativeStyleToProp: { color: true, fontSize: 'size' }
  }
});

export type AvancedSettings = {
  signersStorageEngine: StorageEngine;
  signersPassword?: string | undefined;
  encryption: 'NONE' | 'SEED_DERIVED';
  networkId: NetworkId;
};

export default function WalletAdvancedSettings({
  canUseSecureStorage,
  advancedSettings,
  onAdvancedSettings
}: {
  canUseSecureStorage: boolean;
  advancedSettings: AdvancedSettings;
  onAdvancedSettings: (advancedSettings: AdvancedSettings) => void;
}) {
  const { t } = useTranslation();
  const [passwordRequest, setPasswordRequest] = useState<boolean>(false);
  const [networkRequest, setNetworkRequest] = useState<boolean>(false);
  const [advanced, setAdvanced] = useState<boolean>(false);
  const [biometricalHelp, showBiometricalHelp] = useState<boolean>(false);
  const [passwordHelp, showPasswordHelp] = useState<boolean>(false);
  const [dataEncryptionHelp, showDataEncryptionHelp] = useState<boolean>(false);
  const [networktHelp, showNetworkHelp] = useState<boolean>(false);

  const onPasswordSwitch = useCallback(
    (value: boolean) => {
      if (value)
        //requestAnimationFrame: We allow the Switch element to
        //transition from false to true.
        //This is useful in android to prevent
        //a glitch showing "greenish" default color in the switches
        //for a fraction of a second. Don't show the modal in this
        //same execution context because React Native will not call
        //the inner Switch with the new color props we set in the
        //internal Switch
        //Also this helps with the autoFocus in the TextInput of
        //the password. It was sometimes not poping the keyboard
        //automatically before requestAnimationFrame
        requestAnimationFrame(() => setPasswordRequest(true));
      else {
        if (advancedSettings.signersPassword)
          onAdvancedSettings({
            ...advancedSettings,
            signersPassword: undefined
          });
      }
    },
    [advancedSettings, onAdvancedSettings]
  );
  const onPasswordCancel = useCallback(() => setPasswordRequest(false), []);
  const onPassword = useCallback(
    (password: string) => {
      setPasswordRequest(false);
      onAdvancedSettings({
        ...advancedSettings,
        signersPassword: password
      });
    },
    [advancedSettings, onAdvancedSettings]
  );

  const onNetworkRequest = useCallback(() => {
    setNetworkRequest(true);
  }, []);
  const onNetworkSelect = useCallback(
    (networkId: NetworkId) => {
      if (advancedSettings.networkId !== networkId)
        onAdvancedSettings({
          ...advancedSettings,
          networkId
        });
      setNetworkRequest(false);
    },
    [advancedSettings, onAdvancedSettings]
  );
  const onNetworkClose = useCallback(() => setNetworkRequest(false), []);

  const onEncryptSwitch = useCallback(
    (value: boolean) => {
      if (value && advancedSettings.encryption === 'NONE')
        onAdvancedSettings({ ...advancedSettings, encryption: 'SEED_DERIVED' });
      if (!value && advancedSettings.encryption === 'SEED_DERIVED')
        onAdvancedSettings({ ...advancedSettings, encryption: 'NONE' });
    },
    [advancedSettings, onAdvancedSettings]
  );
  const capitalizedNetworkId =
    advancedSettings.networkId.charAt(0).toUpperCase() +
    advancedSettings.networkId.slice(1).toLowerCase();
  return (
    <>
      <Pressable
        onPress={() => {
          setAdvanced(!advanced);
          LayoutAnimation.configureNext({
            duration: 150,
            update: {
              type: LayoutAnimation.Types.linear,
              property: LayoutAnimation.Properties.opacity
            }
          });
        }}
      >
        <View
          className={`overflow-hidden p-2 flex-row items-center ${advanced ? 'justify-start' : 'bg-white justify-between rounded-xl'}`}
        >
          <Text
            className={
              advanced
                ? 'font-bold uppercase text-slate-600 pl-4 mb-2 text-sm'
                : 'ml-2 py-0.5 font-normal text-black text-base'
            }
          >
            {t('wallet.advancedOptionsTitle')}
          </Text>
          <AntDesign
            className={advanced ? '!text-primary ml-2 mb-2' : '!text-gray-400'}
            name={advanced ? 'close' : 'right'}
          />
        </View>
      </Pressable>
      <View className={advanced ? 'overflow-hidden rounded-xl bg-white' : ''}>
        {advanced && (
          <>
            {canUseSecureStorage && (
              <>
                <View className="flex-row p-2 items-center active:bg-gray-200">
                  <View className="flex-1 flex-row items-center ml-3">
                    <Text className="pr-2 text-base truncate">
                      {t('wallet.biometricEncryptionTitle')}
                    </Text>
                    <InfoButton onPress={() => showBiometricalHelp(true)} />
                  </View>
                  <Switch
                    className="ml-2"
                    value={
                      advancedSettings.signersStorageEngine === 'SECURESTORE'
                    }
                    onValueChange={value =>
                      onAdvancedSettings({
                        ...advancedSettings,
                        signersStorageEngine: value
                          ? 'SECURESTORE'
                          : Platform.OS === 'web'
                            ? 'IDB'
                            : 'MMKV'
                      })
                    }
                  />
                </View>
                <Divider className="ml-3" />
              </>
            )}
            <View className="flex-row p-2 items-center active:bg-gray-200">
              <View className="flex-1 flex-row items-center ml-3">
                <Text className="pr-2 text-base truncate">
                  {t('wallet.usePasswordTitle')}
                </Text>
                <InfoButton onPress={() => showPasswordHelp(true)} />
              </View>
              <Switch
                className="ml-2"
                value={!!advancedSettings.signersPassword || passwordRequest}
                onValueChange={onPasswordSwitch}
              />
              <Password
                mode="FORCED_SET"
                isVisible={passwordRequest}
                onPassword={onPassword}
                onCancel={onPasswordCancel}
              />
            </View>
            <Divider className="ml-3" />
            <View className="flex-row p-2 items-center active:bg-gray-200">
              <View className="flex-1 flex-row items-center ml-3">
                <Text className="pr-2 text-base truncate">
                  {t('wallet.encryptAppDataTitle')}
                </Text>
                <InfoButton onPress={() => showDataEncryptionHelp(true)} />
              </View>
              <Switch
                className="ml-2"
                value={advancedSettings.encryption === 'SEED_DERIVED'}
                onValueChange={onEncryptSwitch}
              />
            </View>
            <Divider className="ml-3" />
            <View className="flex-row p-2 items-center active:bg-gray-200">
              <View className="flex-1 ml-3 flex-row items-center">
                <Text className="mr-2 text-base truncate">
                  {t('network.testOrRealTitle')}
                </Text>
                <InfoButton onPress={() => showNetworkHelp(true)} />
              </View>
              <Pressable
                onPress={onNetworkRequest}
                hitSlop={{ top: 10, bottom: 10, right: 10 }}
                className="ml-2 flex-row items-center active:scale-95 active:opacity-90 hover:opacity-90 max-w-[50%]"
              >
                <Text className="text-primary text-base flex-1 text-right">
                  {advancedSettings.networkId === 'BITCOIN'
                    ? t('network.realBitcoin')
                    : t('network.testOn', {
                        networkId: capitalizedNetworkId
                      })}
                </Text>
                <AntDesign
                  name="right"
                  size={12}
                  className="pl-4 !text-primary"
                />
              </Pressable>
              <NetworksModal
                isVisible={networkRequest}
                networkId={advancedSettings.networkId}
                onSelect={onNetworkSelect}
                onClose={onNetworkClose}
              />
            </View>
          </>
        )}
      </View>
      <Modal
        title={t('wallet.biometricEncryptionTitle')}
        icon={{ family: 'Ionicons', name: 'finger-print' }}
        isVisible={biometricalHelp}
        onClose={() => showBiometricalHelp(false)}
        closeButtonText={t('understoodButton')}
      >
        <Text className="pl-2 pr-2 text-base">{t('help.biometric')}</Text>
      </Modal>
      <Modal
        title={t('wallet.passwordProtectionTitle')}
        icon={{
          family: 'MaterialCommunityIcons',
          name: 'form-textbox-password'
        }}
        isVisible={passwordHelp}
        onClose={() => showPasswordHelp(false)}
        closeButtonText={t('understoodButton')}
      >
        <Text className="pl-2 pr-2 text-base">{t('help.password')}</Text>
        {canUseSecureStorage && (
          <Text className="pt-4 pl-2 pr-2 text-base">
            {t('help.passwordWithBiometric')}
          </Text>
        )}
      </Modal>
      <Modal
        title={t('wallet.encryptAppDataTitle')}
        icon={{
          family: 'Ionicons',
          name: 'document-lock'
        }}
        isVisible={dataEncryptionHelp}
        onClose={() => showDataEncryptionHelp(false)}
        closeButtonText={t('understoodButton')}
      >
        <Text className="pl-2 pr-2 text-base">{t('help.encryptAppData')}</Text>
      </Modal>
      <Modal
        title={t('network.testOrRealTitle')}
        icon={{
          family: 'FontAwesome5',
          name: 'bitcoin'
        }}
        isVisible={networktHelp}
        onClose={() => showNetworkHelp(false)}
        closeButtonText={t('understoodButton')}
      >
        <Text className="pl-2 pr-2 text-base">{t('help.network')}</Text>
      </Modal>
    </>
  );
}
