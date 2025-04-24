//https://docs.expo.dev/versions/v51.0.0/sdk/notifications/

import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { getVaultNumber, TxId, Vaults, VaultsStatuses } from './vaults';

// Check if the device can receive push notifications
export const canReceiveNotifications =
  (Platform.OS === 'ios' || Platform.OS === 'android') && Device.isDevice;

// Type for the data to send to the watchtower
export type WatchtowerRegistrationData = {
  pushToken: string;
  walletName: string;
  locale: string;
  walletId: string;
  watchtowerId: string;
  vaults: Array<{
    triggerTxIds: Array<TxId>;
    vaultId: string;
    vaultNumber: number;
  }>;
};

// Configure notifications
export type NotificationSetupResult = {
  status: Notifications.PermissionStatus;
  canAskAgain: boolean;
};

export async function configureNotifications(): Promise<NotificationSetupResult> {
  if (!canReceiveNotifications)
    throw new Error('This device does not support notifications');
  // Request permission
  const { status: existingStatus, canAskAgain } =
    await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return {
      status: finalStatus,
      canAskAgain
    };
  }

  // Configure how notifications appear when the app is in foreground
  // We rather disable this
  //
  //// If we still want to get the message in the tray:
  //Notifications.setNotificationHandler({
  //  handleNotification: async () => ({
  //    shouldShowAlert: true,
  //    shouldPlaySound: false,
  //    shouldSetBadge: false
  //  })
  //});

  return {
    status: finalStatus,
    canAskAgain: true
  };
}

// Get the Expo push token
// If configureNotifications has not been called, this will return null.
export async function getExpoPushToken(): Promise<string | null> {
  try {
    // Get the project ID from expo-constants
    const projectId =
      Constants.expoConfig?.['extra']?.['eas']?.projectId ??
      Constants?.easConfig?.projectId;

    if (!projectId) {
      console.warn('Project ID not found in expo-constants');
      return null;
    }

    if ((await Notifications.getPermissionsAsync()).status !== 'granted')
      return null;

    // Check if this device can receive notifications
    if (!canReceiveNotifications) {
      console.warn(
        'Push notifications are only supported on physical iOS/Android devices'
      );
      // For testing purposes, we'll continue anyway but return null at the end
      return null;
    }

    //FIXME: this can throw since this is a fetch call!!!
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: projectId
    });
    return token.data;
  } catch (error) {
    console.error('Failed to get push token:', error);
    return null;
  }
}

// Register vaults with the watchtower service
// The backend won't return an error when trying to re-register a vault.
//
//FIXME: only call this if getExpoPushToken returns something, in fact
//pass it as param. It may be the case the user never accepted push notifications
//then warn the user or something.
//FIXME: this function cannot be called before configureNotifications
//(requestPermissionsAsync) - it will hang indefinitely
export async function watchVaults({
  watchtowerAPI,
  vaults,
  vaultsStatuses,
  networkTimeout,
  walletName,
  locale,
  walletId
}: {
  watchtowerAPI: string;
  vaults: Vaults;
  vaultsStatuses: VaultsStatuses;
  networkTimeout: number;
  walletName: string;
  locale: string;
  walletId: string;
}): Promise<string[]> {
  try {
    // Get push token
    const pushToken = await getExpoPushToken();
    if (!pushToken) return []; //FIXME: read 1st FIXME above

    const vaultsToMonitor = Object.entries(vaults)
      .filter(([vaultId]) => {
        const status = vaultsStatuses[vaultId];
        // Only monitor vaults that are not yet not registered
        // with current watchtower even if they've been triggered (may be
        // a recent trigger)
        return !status?.registeredWatchtowers?.includes(watchtowerAPI);
      })
      .map(([vaultId, vault]) => {
        // Each vault has multiple trigger transactions (one per fee rate)
        // Extract all trigger transaction IDs from the triggerMap
        const triggerTxIds: Array<TxId> = Object.keys(vault.triggerMap).map(
          triggerTxHex => {
            const txInfo = vault.txMap[triggerTxHex];
            if (!txInfo) {
              throw new Error(
                `Transaction info not found for trigger tx: ${triggerTxHex}`
              );
            }
            return txInfo.txId;
          }
        );

        return {
          triggerTxIds,
          commitment: vault.vaultTxHex,
          vaultId,
          vaultNumber: getVaultNumber(vaultId, vaults)
        };
      })
      .filter(vault => vault.triggerTxIds.length > 0);

    if (vaultsToMonitor.length === 0) return [];

    // Prepare data for the watchtower
    const registrationData: WatchtowerRegistrationData = {
      pushToken,
      walletName,
      locale,
      walletId,
      watchtowerId: watchtowerAPI,
      vaults: vaultsToMonitor
    };

    // Send data to the watchtower
    const response = await fetch(`${watchtowerAPI}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(registrationData),
      signal: AbortSignal.timeout(networkTimeout)
    });

    if (!response.ok) {
      throw new Error(
        `Watchtower registration failed (${response.status}): ${response.statusText}`
      );
    }

    return vaultsToMonitor.map(v => v.vaultId);
  } catch (error) {
    console.error('Failed to register with watchtower:', error);
    throw error;
  }
}
