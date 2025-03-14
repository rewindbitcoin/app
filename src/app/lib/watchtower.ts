import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { NetworkId } from './network';
import { TxId, VaultStatus, Vaults, VaultsStatuses } from './vaults';

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
      shouldSetBadge: true,
    }),
  });

  return true;
}

// Get the Expo push token
export async function getExpoPushToken(): Promise<string | null> {
  try {
    // Get the project ID from app.json
    const projectId = "0598db8e-d582-4b63-9bf1-3a3fca12dc83"; // This is from your app.json
    
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: projectId,
    });
    return token.data;
  } catch (error) {
    console.error('Failed to get push token:', error);
    return null;
  }
}

// Register vaults with the watchtower service
export async function registerVaultsWithWatchtower({
  watchtowerApi,
  vaults,
  vaultsStatuses,
  networkId,
  networkTimeout
}: {
  watchtowerApi: string;
  vaults: Vaults;
  vaultsStatuses: VaultsStatuses;
  networkId: NetworkId;
  networkTimeout: number;
}): Promise<boolean> {
  try {
    // Skip if watchtower API is not configured
    if (!watchtowerApi) return true;
    
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
      vaults: vaultsToMonitor,
    };

    // Send data to the watchtower
    const response = await fetch(`${watchtowerApi}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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

// Unregister a specific vault from the watchtower service
export async function unregisterVaultFromWatchtower({
  watchtowerApi,
  vaultId,
  networkId,
  networkTimeout
}: {
  watchtowerApi: string;
  vaultId: string;
  networkId: NetworkId;
  networkTimeout: number;
}): Promise<boolean> {
  try {
    // Skip if watchtower API is not configured
    if (!watchtowerApi) return true;
    
    // Get push token
    const pushToken = await getExpoPushToken();
    if (!pushToken) return false;

    // Prepare data for unregistration
    const unregisterData = {
      pushToken,
      vaultId,
      networkId
    };

    // Send unregister request to the watchtower
    const response = await fetch(`${watchtowerApi}/unregister`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(unregisterData),
      signal: AbortSignal.timeout(networkTimeout)
    });

    if (!response.ok) {
      throw new Error(`Watchtower unregistration failed: ${response.statusText}`);
    }

    return true;
  } catch (error) {
    console.error('Failed to unregister vault from watchtower:', error);
    return false;
  }
}
