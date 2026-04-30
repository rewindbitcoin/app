// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useTranslation } from 'react-i18next';

import { Button, Modal } from '../../../../common/ui';
import { useNetStatus } from '../../../hooks/useNetStatus';
import type { VaultStatus } from '../../../lib/vaults';

type VaultWatchtowerIndicatorProps = {
  vaultStatus: VaultStatus | undefined;
  watchtowerAPI: string | undefined;
  notificationPermissions:
    | Notifications.NotificationPermissionsStatus
    | undefined;
  pushToken: string | undefined;
  syncingBlockchain: boolean;
  ensurePermissionsAndToken: (mode: 'GET' | 'REQUEST') => Promise<{
    notificationPermissions:
      | Notifications.NotificationPermissionsStatus
      | undefined;
    pushToken: string | undefined;
  }>;
  syncWatchtowerRegistration: ({
    pushToken,
    isUserTriggered
  }: {
    pushToken: string;
    isUserTriggered: boolean;
  }) => Promise<void>;
};

const VaultWatchtowerIndicator = ({
  vaultStatus,
  watchtowerAPI,
  notificationPermissions,
  pushToken,
  syncingBlockchain,
  ensurePermissionsAndToken,
  syncWatchtowerRegistration
}: VaultWatchtowerIndicatorProps) => {
  const { t } = useTranslation();
  const { internetReachable, watchtowerAPIReachable } = useNetStatus();
  const [showWatchtowerStatusModal, setShowWatchtowerStatusModal] =
    useState<boolean>(false);
  const handleShowWatchtowerStatusModal = useCallback(() => {
    setShowWatchtowerStatusModal(true);
  }, []);
  const handleCloseWatchtowerStatusModal = useCallback(
    () => setShowWatchtowerStatusModal(false),
    []
  );
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * this is called on the user pushing on the retry button when the
   * watchtower is unreachable
   */
  const retryWatchtowerSetup = useCallback(async () => {
    setShowWatchtowerStatusModal(false);
    //request if necessay (it gets if already granted):
    const { pushToken } = await ensurePermissionsAndToken('REQUEST');
    if (pushToken && isMountedRef.current)
      await syncWatchtowerRegistration({
        pushToken,
        isUserTriggered: true
      });
    else console.warn('Failed during notification system request');
  }, [ensurePermissionsAndToken, syncWatchtowerRegistration]);
  // keep a stable ref to the latest retryWatchtowerSetup fn
  const retryWatchtowerSetupRef = useRef(retryWatchtowerSetup);
  useEffect(() => {
    retryWatchtowerSetupRef.current = retryWatchtowerSetup;
  }, [retryWatchtowerSetup]);

  // --- Derived Notification/Watchtower States ---
  const isWatchtowerRegistered =
    watchtowerAPI !== undefined &&
    !!vaultStatus?.registeredWatchtowers?.includes(watchtowerAPI);

  const isWatchtowerAPIPending = watchtowerAPIReachable === undefined;
  const isWatchtowerStatusPending =
    notificationPermissions === undefined || isWatchtowerAPIPending;

  const isWatchtowerDown =
    watchtowerAPIReachable === false && internetReachable === true;

  const shouldRetryPushToken =
    notificationPermissions?.status === 'granted' && pushToken === '';

  const shouldRequestNotificationPermission =
    notificationPermissions &&
    notificationPermissions.status !== 'granted' &&
    notificationPermissions.canAskAgain;
  const shouldDirectToSystemNotificationSettings =
    notificationPermissions &&
    notificationPermissions.status !== 'granted' &&
    notificationPermissions.canAskAgain === false;

  const watchtowerStatusMessage = (() => {
    if (isWatchtowerDown) {
      return t('wallet.vault.watchtower.watchtowerServiceError');
    } else if (shouldRequestNotificationPermission) {
      return t('wallet.vault.watchtower.notGranted');
    } else if (shouldDirectToSystemNotificationSettings) {
      return t('wallet.vault.watchtower.systemNotGranted');
    } else if (shouldRetryPushToken) {
      return t('wallet.vault.watchtower.pushTokenFailed');
    } else if (isWatchtowerStatusPending) {
      return t('wallet.vault.watchtower.apiPending');
    } else if (isWatchtowerRegistered) {
      return t('wallet.vault.watchtower.registered');
    } else {
      // At this point:
      // - notificationPermissions.status === 'granted'
      // - pushToken exists
      // - isWatchtowerStatusPending === false
      // - but isWatchtowerRegistered === false
      return t('wallet.vault.watchtower.registrationFailed');
    }
  })();

  const watchtowerNeedsRetry =
    isWatchtowerDown ||
    shouldRequestNotificationPermission ||
    shouldDirectToSystemNotificationSettings ||
    shouldRetryPushToken ||
    (!isWatchtowerStatusPending && !isWatchtowerRegistered);

  const watchtowerBellIconName = watchtowerNeedsRetry
    ? 'bell-off-outline'
    : 'bell-outline';

  const watchtowerBellIconColor = watchtowerNeedsRetry
    ? 'red'
    : isWatchtowerStatusPending
      ? 'slate'
      : 'green';
  // --- End Derived States ---

  return (
    <>
      <Pressable
        onPress={handleShowWatchtowerStatusModal}
        hitSlop={20}
        className={`p-1.5 bg-white rounded-xl web:shadow-sm ios:shadow-sm android:elevation android:border android:border-slate-200 active:opacity-70 active:scale-95 ${watchtowerBellIconColor === 'slate' ? 'animate-pulse' : 'animate-none'}`}
      >
        <MaterialCommunityIcons
          name={watchtowerBellIconName}
          className={`text-xl ${watchtowerBellIconColor === 'red' ? 'text-red-500' : watchtowerBellIconColor === 'slate' ? 'text-slate-400' : 'text-green-500'}
                 `}
        />
      </Pressable>
      <Modal
        title={t('wallet.vault.watchtower.statusTitle')}
        icon={{
          family: 'MaterialCommunityIcons',
          name: 'bell'
        }}
        isVisible={showWatchtowerStatusModal}
        onClose={handleCloseWatchtowerStatusModal}
        customButtons={(() => {
          return (
            <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
              <Button
                mode={watchtowerNeedsRetry ? 'secondary' : 'primary'}
                onPress={handleCloseWatchtowerStatusModal}
              >
                {t('understoodButton')}
              </Button>
              {watchtowerNeedsRetry && (
                <Button
                  mode="primary"
                  loading={isWatchtowerDown && syncingBlockchain}
                  onPress={
                    isWatchtowerDown
                      ? retryWatchtowerSetupRef.current
                      : shouldDirectToSystemNotificationSettings
                        ? Linking.openSettings
                        : retryWatchtowerSetupRef.current
                  }
                >
                  {isWatchtowerDown && syncingBlockchain
                    ? t('wallet.vault.watchtower.retryingButton')
                    : shouldRequestNotificationPermission
                      ? t('wallet.vault.watchtower.openSystemPrompt')
                      : shouldDirectToSystemNotificationSettings
                        ? t('wallet.vault.watchtower.goToSettings')
                        : t('wallet.vault.watchtower.retryButton')}
                </Button>
              )}
            </View>
          );
        })()}
      >
        <Text className="text-base pl-2 pr-2 text-slate-600">
          {watchtowerStatusMessage}
        </Text>
      </Modal>
    </>
  );
};

export default VaultWatchtowerIndicator;
