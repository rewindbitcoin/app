import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { NetworkId } from './network';
import { TxId, Vaults, VaultsStatuses } from './vaults';

// Type for the data to send to the watchtower
export type WatchtowerRegistrationData = {
  pushToken: string;
  vaults: Array<{
    triggerTxId: TxId;
    networkId: NetworkId;
    vaultId: string;
  }>;
};

// Configure notifications
export async function configureNotifications() {
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
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;

    if (!projectId) {
      console.warn('Project ID not found in expo-constants');
      return null;
    }

    // Check if this is a physical device
    const isDevice = await Device.isDeviceAsync();
    if (!isDevice) {
      console.warn('Push notifications are only supported on physical devices');
      // You might still want to continue for testing purposes
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
  networkId,
  networkTimeout
}: {
  watchtowerAPI: string;
  vaults: Vaults;
  vaultsStatuses: VaultsStatuses;
  networkId: NetworkId;
  networkTimeout: number;
}): Promise<boolean> {
  try {
    // Skip if watchtower API is not configured
    if (watchtowerAPI === '') return true;

    // Get push token
    const pushToken = await getExpoPushToken();
    if (!pushToken) return false;

    // Filter vaults that need monitoring (not triggered yet)
    const vaultsToMonitor = Object.entries(vaults)
      .filter(([vaultId, vault]) => {
        const status = vaultsStatuses[vaultId];
        // Only monitor vaults that are not hidden, have a trigger tx, and are not yet triggered
        return (
          !status?.isHidden &&
          vault.triggerTxId &&
          !status?.triggerTxBlockHeight
        );
      })
      .map(([vaultId, vault]) => ({
        triggerTxId: vault.triggerTxId as TxId,
        networkId,
        vaultId
      }));

    if (vaultsToMonitor.length === 0) return true; // No vaults to monitor

    // Prepare data for the watchtower
    const registrationData: WatchtowerRegistrationData = {
      pushToken,
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
