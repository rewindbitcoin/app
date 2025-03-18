//https://docs.expo.dev/versions/v51.0.0/sdk/notifications/

import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { TxId, Vaults, VaultsStatuses } from './vaults';

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
  }>;
};

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
}): Promise<boolean> {
  try {
    // Get push token
    const pushToken = await getExpoPushToken();
    if (!pushToken) return false;

    // Filter vaults that need monitoring (not triggered yet)
    const vaultsToMonitor: Array<{
      triggerTxIds: Array<TxId>;
      commitment: string;
      vaultId: string;
    }> = [];

    // Group trigger transaction IDs by vault ID
    Object.entries(vaults)
      .filter(([vaultId]) => {
        const status = vaultsStatuses[vaultId];
        // Only monitor vaults that are not yet triggered
        return !status?.triggerTxHex;
      })
      .forEach(([vaultId, vault]) => {
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

        if (triggerTxIds.length > 0) {
          vaultsToMonitor.push({
            triggerTxIds,
            commitment: vault.vaultTxHex,
            vaultId
          });
        }
      });

    if (vaultsToMonitor.length === 0) return true; // No vaults to monitor

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
      throw new Error(`Watchtower registration failed: ${response.statusText}`);
    }

    return true;
  } catch (error) {
    console.error('Failed to register with watchtower:', error);
    return false;
  }
}
