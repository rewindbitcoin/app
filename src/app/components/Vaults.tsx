// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { AppState, AppStateStatus, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useTranslation } from 'react-i18next';
import type { BlockStatus } from '@bitcoinerlab/explorer';

import { Button, IconType, Modal } from '../../common/ui';
import type {
  VaultStatus,
  Vaults as VaultsType,
  VaultsStatuses
} from '../lib/vaults';
import { canReceiveNotifications, getExpoPushToken } from '../lib/watchtower';
import { useNetStatus } from '../hooks/useNetStatus';
import LearnMoreAboutVaults from './LearnMoreAboutVaults';
import VaultCard from './vaults/VaultCard';

const permissionsForNotificationsIcon = {
  family: 'MaterialCommunityIcons',
  name: 'bell-alert-outline'
} as IconType;

const Vaults = ({
  setVaultNotificationAcknowledged,
  updateVaultStatus,
  syncWatchtowerRegistration,
  pushTx,
  btcFiat,
  tipStatus,
  vaults,
  vaultsStatuses,
  blockExplorerURL,
  syncingBlockchain,
  watchtowerAPI,
  pushToken,
  setPushToken
}: {
  setVaultNotificationAcknowledged: (vaultId: string) => void;
  updateVaultStatus: (vaultId: string, vaultStatus: VaultStatus) => void;
  syncWatchtowerRegistration: ({
    pushToken,
    isUserTriggered
  }: {
    pushToken: string;
    isUserTriggered: boolean;
  }) => Promise<void>;
  pushTx: (txHex: string) => Promise<void>;
  btcFiat: number | undefined;
  tipStatus: BlockStatus | undefined;
  vaults: VaultsType;
  vaultsStatuses: VaultsStatuses;
  blockExplorerURL: string | undefined;
  syncingBlockchain: boolean;
  watchtowerAPI: string | undefined;
  pushToken: string | undefined;
  setPushToken: (token: string) => void;
}) => {
  const { t } = useTranslation();
  // This needs to be in state for rendering purposes:
  const [notificationPermissions, setNotificationPermissions] =
    useState<Notifications.NotificationPermissionsStatus>();
  const [
    showPermissionsForNotificationsExplainModal,
    setShowPermissionsForNotificationsExplainModal
  ] = useState(false);
  //Apple Store reviewers don’t like that users can Cancel before the system request
  //const closePermissionsForNotificationsExplainModal = useCallback(() => {
  //  setShowPermissionsForNotificationsExplainModal(false);
  //}, []);

  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Initialize push notifications whenever the vault count increases.
  // Requests permission if needed, then configures notifications
  // and syncs watchtower registration once per new vault detected.
  const vaultCount = Object.keys(vaults).length;
  // keep a stable ref to the latest syncWatchtowerRegistration fn
  const syncWatchtowerRegistrationRef = useRef(syncWatchtowerRegistration);
  useEffect(() => {
    syncWatchtowerRegistrationRef.current = syncWatchtowerRegistration;
  }, [syncWatchtowerRegistration]);

  /**
   * gets the most recent pushToken and notifications permissions
   * note that notification permissions can change at any time since
   * the user can revoke permissions any time. We'll detect those changes
   * new grants/revoke when the app comes back to the foreground (see above)
   */
  const notificationPermissionsRef = useRef(notificationPermissions);
  const pushTokenRef = useRef(pushToken);
  const ensurePermissionsAndToken = useCallback(
    async (mode: 'GET' | 'REQUEST') => {
      try {
        notificationPermissionsRef.current =
          mode === 'GET'
            ? await Notifications.getPermissionsAsync()
            : await Notifications.requestPermissionsAsync();
        setNotificationPermissions(prevPermissions => {
          return JSON.stringify(prevPermissions) ===
            JSON.stringify(notificationPermissionsRef.current)
            ? prevPermissions
            : notificationPermissionsRef.current;
        });
      } catch (err) {
        console.warn('Could not getPermissionsAsync', err);
      }
      if (
        notificationPermissionsRef.current?.status === 'granted' &&
        //undefined is when it's still not been read from storage, and
        //therefore it's better not trying to set it
        //'' is when it's been read from storage and it had not been set yet.
        //Note that pushToken never changes so no need to requery it:
        //https://docs.expo.dev/push-notifications/faq/?utm_source=chatgpt.com#when-and-why-does-the-expopushtoken-change
        pushTokenRef.current === ''
      ) {
        try {
          pushTokenRef.current = await getExpoPushToken(
            t('wallet.vault.watchtower.permissionTitle')
          );
          setPushToken(pushTokenRef.current);
        } catch (err) {
          console.warn('Could not getExpoPushToken', err);
        }
      }
      return {
        notificationPermissions: notificationPermissionsRef.current,
        pushToken: pushTokenRef.current
      };
    },
    [setPushToken, t]
  );

  /**
   * When the user clicks on the button that opens notifications system
   * permission
   */
  const handleNotificationsSystemRequest = useCallback(async () => {
    setShowPermissionsForNotificationsExplainModal(false);
    const { pushToken } = await ensurePermissionsAndToken('REQUEST');
    if (!isMountedRef.current) return;
    if (pushToken)
      await syncWatchtowerRegistrationRef.current({
        pushToken,
        isUserTriggered: true
      });
    else console.warn('Failed during notification system request');
  }, [ensurePermissionsAndToken]);

  //Check when the app comes to the foreground (perhaps it was in the back
  //while the user was tuning on notifications manually)
  //So here it's a good place to retrieve the pushToken
  useEffect(() => {
    let previousAppState = AppState.currentState;
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (
        previousAppState === 'background' &&
        nextAppState === 'active' &&
        canReceiveNotifications
      ) {
        previousAppState = nextAppState; //ASAP before the await
        const { pushToken } = await ensurePermissionsAndToken('GET');
        //Won't do anything if already registerted, also never throws:
        if (pushToken && isMountedRef.current)
          syncWatchtowerRegistrationRef.current({
            pushToken,
            //this is not user driven, so don't show the toast
            //if this error is already registerted
            isUserTriggered: false
          });
      }
      previousAppState = nextAppState;
    };
    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange
    );
    return () => subscription.remove();
  }, [ensurePermissionsAndToken]);

  //initial notificationPermissions GET and watchtower sync if there are vaults
  const hasInitializedRef = useRef(false);
  const { watchtowerAPIReachable } = useNetStatus();
  useEffect(() => {
    if (hasInitializedRef.current) return;
    const init = async () => {
      const { pushToken } = await ensurePermissionsAndToken('GET');
      if (
        isMountedRef.current &&
        pushToken &&
        watchtowerAPIReachable &&
        hasInitializedRef.current === false
      ) {
        syncWatchtowerRegistration({ pushToken, isUserTriggered: false });
        hasInitializedRef.current = true;
      }
    };
    if (vaultCount) init();
  }, [
    ensurePermissionsAndToken,
    syncWatchtowerRegistration,
    vaultCount,
    watchtowerAPIReachable
  ]);

  //Each time a new vault is added, we must sync. This is the first
  //time the user may see the modal that will explain the user to accept the
  //system modal requesting push notifications permissions
  const prevVaultCountRef = useRef(vaultCount);
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | undefined;

    const onNewVault = async () => {
      //console.log('TRACE onNewVault', {
      //  vaultCount,
      //  isMountedRef: isMountedRef.current,
      //  canReceiveNotifications
      //});
      // Only proceed if we haven't synced yet and we have vaults
      if (canReceiveNotifications && vaultCount > 0) {
        const { pushToken, notificationPermissions } =
          await ensurePermissionsAndToken('GET');
        try {
          if (
            notificationPermissions?.status !== 'granted' &&
            notificationPermissions?.canAskAgain
          )
            // show explanation modal after 3 seconds so that users
            // already have seen their vault activity
            timeoutId = setTimeout(() => {
              if (isMountedRef.current)
                setShowPermissionsForNotificationsExplainModal(true);
            }, 3000);
          //console.log('TRACE useEffect - onNewVault', vaultCount);
          if (!isMountedRef.current) return;
          if (pushToken)
            await syncWatchtowerRegistrationRef.current({
              pushToken,
              //This is triggered only on new vault creation
              isUserTriggered: true
            });
          else console.warn('Could not get push token during initial setup.');
        } catch (error: unknown) {
          console.warn(
            'Failed during notification permission check or setup:',
            error
          );
        }
      }
    };
    if (vaultCount > prevVaultCountRef.current) onNewVault();
    prevVaultCountRef.current = vaultCount;
    // Cleanup function to clear the timeout if the component unmounts
    // or if the effect re-runs before the timeout finishes
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [vaultCount, ensurePermissionsAndToken]);

  const sortedVaults = useMemo(() => {
    return Object.values(vaults).sort(
      (a, b) => b.creationTime - a.creationTime
    );
  }, [vaults]);

  const hasVisibleVaults = useMemo(() => {
    return sortedVaults.some(vault => !vaultsStatuses[vault.vaultId]?.isHidden);
  }, [sortedVaults, vaultsStatuses]);

  return (
    <View className="gap-y-4">
      <Modal
        title={t('wallet.vault.watchtower.permissionTitle')}
        icon={permissionsForNotificationsIcon}
        isVisible={showPermissionsForNotificationsExplainModal}
        /* Apple Store reviewers don't like that users can Cancel 
          before the system request
        onClose={closePermissionsForNotificationsExplainModal} */
        customButtons={
          <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
            <Button mode="primary" onPress={handleNotificationsSystemRequest}>
              {t('continueButton')}
            </Button>
          </View>
        }
      >
        <Text className="text-base pl-2 pr-2 text-slate-600">
          {t('wallet.vault.watchtower.permissionExplanation')}
        </Text>
      </Modal>
      {hasVisibleVaults ? (
        sortedVaults.map((vault, index) => {
          const vaultStatus = vaultsStatuses[vault.vaultId];
          return (
            !vaultStatus?.isHidden && (
              <VaultCard
                setVaultNotificationAcknowledged={
                  setVaultNotificationAcknowledged
                }
                updateVaultStatus={updateVaultStatus}
                key={vault.vaultId}
                btcFiat={btcFiat}
                tipStatus={tipStatus}
                vault={vault}
                vaultNumber={sortedVaults.length - index}
                vaultStatus={vaultStatus}
                pushTx={pushTx}
                blockExplorerURL={blockExplorerURL}
                syncingBlockchain={syncingBlockchain}
                watchtowerAPI={watchtowerAPI}
                notificationPermissions={notificationPermissions}
                pushToken={pushToken}
                ensurePermissionsAndToken={ensurePermissionsAndToken}
                syncWatchtowerRegistration={syncWatchtowerRegistration}
              />
            )
          );
        })
      ) : (
        <View className="flex-col items-center self-center my-4 max-w-80">
          <MaterialCommunityIcons
            name="snowflake-off"
            size={4 * 16}
            className="text-primary opacity-50"
          />
          <Text className="font-bold text-slate-600 mt-4 text-center text-lg">
            {t('wallet.vault.noFundsTile')}
          </Text>
          <Text className="text-slate-500 mt-2 text-center">
            {t('wallet.vault.noFundsBody')}
          </Text>
          <LearnMoreAboutVaults />
        </View>
      )}
    </View>
  );
};

export default React.memo(Vaults);
