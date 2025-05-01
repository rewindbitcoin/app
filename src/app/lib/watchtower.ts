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
  walletUUID: string;
  watchtowerId: string;
  vaults: Array<{
    triggerTxIds: Array<TxId>;
    vaultId: string;
    vaultNumber: number;
  }>;
};

export async function getOrRequestPermissionsForNotifications(): Promise<Notifications.NotificationPermissionsStatus> {
  if (!canReceiveNotifications)
    throw new Error('This device does not support notifications');
  // Request permission
  let result = await Notifications.getPermissionsAsync();
  if (result.status !== 'granted' && result.canAskAgain)
    result = await Notifications.requestPermissionsAsync();
  return result;
}

/**
 * Retrieves the Expo push token for the device.
 * Returns null if permissions are not granted, not on a physical device,
 * or if fetching fails.
 * @returns {Promise<string | null>} The Expo push token or null.
 */
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
    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId: projectId
    });
    return tokenResponse.data;
  } catch (error) {
    console.error('Failed to get push token:', error);
    return null;
  }
}

// Register vaults with the watchtower service
// The backend won't return an error when trying to re-register a vault.
export async function watchVaults({
  pushToken,
  watchtowerAPI,
  vaults,
  vaultsStatuses,
  networkTimeout,
  walletName,
  locale,
  walletUUID
}: {
  pushToken: string;
  watchtowerAPI: string;
  vaults: Vaults;
  vaultsStatuses: VaultsStatuses;
  networkTimeout: number;
  walletName: string;
  locale: string;
  walletUUID: string;
}): Promise<string[]> {
  try {
    // Get push token
    if (!pushToken) throw new Error('Cannot watchVaults without a pushToken');

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
      walletUUID,
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
