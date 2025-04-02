//https://docs.expo.dev/versions/v51.0.0/sdk/notifications/

import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { getVaultNumber, TxId, Vaults, VaultsStatuses } from './vaults';

// Check if the device can receive push notifications
export const canReceiveNotifications = (): boolean => {
  const isPhysicalDevice = Device.isDevice;
  return (
    Platform.OS === 'ios' || (Platform.OS === 'android' && isPhysicalDevice)
  );
};

// Type for the data to send to the watchtower
export type WatchtowerRegistrationData = {
  pushToken: string;
  walletName: string;
  vaults: Array<{
    triggerTxIds: Array<TxId>;
    vaultId: string;
    vaultNumber: number;
  }>;
};

// Track successful registrations to avoid redundant calls
const successfulRegistrations: Record<string, boolean> = {};

// Configure notifications
export async function configureNotifications() {
  // First check if this device can receive notifications
  const canReceive = canReceiveNotifications();
  if (!canReceive) {
    console.warn(
      'Device cannot receive push notifications (not a physical iOS/Android device)'
    );
    return false;
  }

  // Request permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return false;
  }

  // Configure how notifications appear when the app is in foreground
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true
    })
  });

  return true;
}

// Get the Expo push token
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

    // Check if this device can receive notifications
    const canReceive = canReceiveNotifications();
    if (!canReceive) {
      console.warn(
        'Push notifications are only supported on physical iOS/Android devices'
      );
      // For testing purposes, we'll continue anyway but return null at the end
      return null;
    }

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
// FIXME: this returning false is wrong, it shoudl throw
//so I can then correctly report then in netRequest
//FIXME: only call this if getExpoPushToken returns something, in fact
//pass it as param. It may be the case the user never accepted push notifications
//thwn warn the user or soimething.
export async function registerVaultsWithWatchtower({
  watchtowerAPI,
  vaults,
  vaultsStatuses,
  networkTimeout,
  walletName
}: {
  watchtowerAPI: string;
  vaults: Vaults;
  vaultsStatuses: VaultsStatuses;
  networkTimeout: number;
  walletName: string;
}): Promise<string[]> {
  try {
    // Get push token
    const pushToken = await getExpoPushToken();
    if (!pushToken) return [];

    const vaultsToMonitor = Object.entries(vaults)
      .filter(([vaultId]) => {
        const status = vaultsStatuses[vaultId];
        // Only monitor vaults that are not yet triggered and not registered with current watchtower
        return !status?.triggerTxHex && 
               (!status?.registeredWatchtowers?.includes(watchtowerAPI));
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
