import React, { useCallback, useState } from 'react';

import { View, StyleSheet, Pressable, Platform } from 'react-native';
import {
  Modal,
  Text,
  Divider,
  InfoButton,
  Theme,
  Switch,
  useTheme
} from '../../common/ui';
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
  const theme: Theme = useTheme();
  const styles = getStyles(theme);

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
        <View style={[styles.header, advanced ? styles.title : styles.card]}>
          <Text
            {...(advanced
              ? { variant: 'cardTitle', style: styles.cardTitle }
              : {})}
          >
            {t('wallet.advancedOptionsTitle')}
          </Text>
          <AntDesign
            style={{
              ...styles.cardTitle,
              color: advanced
                ? theme.colors.primary
                : theme.colors.cardSecondary
            }}
            name={advanced ? 'close' : 'right'}
          />
        </View>
      </Pressable>
      <View style={advanced ? { ...styles.card } : {}}>
        {advanced && (
          <>
            {canUseSecureStorage && (
              <>
                <View style={{ ...styles.row }}>
                  <View style={styles.textContainer}>
                    <Text>{t('wallet.biometricEncryptionTitle')}</Text>
                    <InfoButton
                      style={{ paddingLeft: 8 }}
                      onPress={() => showBiometricalHelp(true)}
                    />
                  </View>
                  <Switch
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
                <Divider style={styles.lineSeparator} />
              </>
            )}
            <View style={styles.row}>
              <View style={styles.textContainer}>
                <Text>{t('wallet.usePasswordTitle')}</Text>
                <InfoButton
                  style={{ paddingLeft: 8 }}
                  onPress={() => showPasswordHelp(true)}
                />
              </View>
              <Switch
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
            <Divider style={styles.lineSeparator} />
            <View style={styles.row}>
              <View style={styles.textContainer}>
                <Text>{t('wallet.encryptAppDataTitle')}</Text>
                <InfoButton
                  style={{ paddingLeft: 8 }}
                  onPress={() => showDataEncryptionHelp(true)}
                />
              </View>
              <Switch
                value={advancedSettings.encryption === 'SEED_DERIVED'}
                onValueChange={onEncryptSwitch}
              />
            </View>
            <Divider style={styles.lineSeparator} />
            <View style={styles.row}>
              <View style={styles.textContainer}>
                <Text>{t('network.testOrRealTitle')}</Text>
                <InfoButton
                  style={{ paddingLeft: 8 }}
                  onPress={() => showNetworkHelp(true)}
                />
              </View>
              <Pressable
                onPress={onNetworkRequest}
                className="max-w-20 mobmed:max-w-full flex-row -my-2 py-2 items-center active:scale-95 active:opacity-90 hover:opacity-90"
              >
                <MaterialCommunityIcons
                  name="menu-swap-outline"
                  className="text-primary text-sm mobmed:pr-1"
                />
                <Text className="text-primary text-center">
                  {advancedSettings.networkId === 'BITCOIN'
                    ? t('network.realBitcoin')
                    : t('network.testOn', {
                        networkId: capitalizedNetworkId
                      })}
                </Text>
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
        <Text className="pl-2 pr-2">{t('help.biometric')}</Text>
      </Modal>
      <Modal
        title={'Password Protection'}
        icon={{
          family: 'MaterialCommunityIcons',
          name: 'form-textbox-password'
        }}
        isVisible={passwordHelp}
        onClose={() => showPasswordHelp(false)}
        closeButtonText={t('understoodButton')}
      >
        <Text className="pl-2 pr-2">{t('help.password')}</Text>
        {canUseSecureStorage && (
          <Text className="pt-4 pl-2 pr-2">
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
        <Text className="pl-2 pr-2">{t('help.encryptAppData')}</Text>
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
        <Text className="pl-2 pr-2">{t('help.network')}</Text>
      </Modal>
    </>
  );
}

const getStyles = (theme: Theme) => {
  const styles = StyleSheet.create({
    card: {
      overflow: 'hidden',
      borderRadius: 5,
      padding: 10,
      backgroundColor: theme.colors.card
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    title: {
      overflow: 'hidden',
      justifyContent: 'flex-start',
      padding: 10
    },
    cardTitle: {
      marginLeft: 10,
      paddingVertical: 2
    },
    row: {
      flexDirection: 'row',
      paddingVertical: 10,
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    textContainer: {
      marginLeft: 20,
      minHeight: 24,
      flexDirection: 'row',
      alignItems: 'center'
    },
    lineSeparator: { marginLeft: 20 }
  });
  return styles;
};
