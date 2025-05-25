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

/**
 * Retrieves the Expo push token for the device.
 * Returns '' if permissions are not granted, not on a physical device,
 * or if fetching fails.
 * @returns {Promise<string | null>} The Expo push token or null.
 */
export async function getExpoPushToken(title: string): Promise<string> {
  try {
    if (Platform.OS === 'android') {
      // On Android, a channel must exists; we set it at HIGH importance
      await Notifications.setNotificationChannelAsync('default', {
        name: title,
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 500, 200, 500, 200, 500]
      });
    }
    // Get the project ID from expo-constants
    const projectId =
      Constants.expoConfig?.['extra']?.['eas']?.projectId ??
      Constants?.easConfig?.projectId;

    if (!projectId) {
      console.warn('Project ID not found in expo-constants');
      return '';
    }

    if ((await Notifications.getPermissionsAsync()).status !== 'granted')
      return '';

    // Check if this device can receive notifications
    if (!canReceiveNotifications) {
      console.warn(
        'Push notifications are only supported on physical iOS/Android devices'
      );
      return '';
    }
    // Attempt to fetch the Expo push token, retrying on failure
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { data: expoToken } = await Notifications.getExpoPushTokenAsync({
          projectId
        });
        return expoToken;
      } catch (err) {
        lastError = err;
        // small backoff: 500ms, 1000ms, 1500ms, ...
        await new Promise(res => setTimeout(res, 500 * attempt));
      }
    }
    console.error('Failed to get Expo push token after retries:', lastError);
    return '';
  } catch (error) {
    console.error('Failed to get push token:', error);
    return '';
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

// Cache of “unacknowledged” watchtower notifications by API URL.
// Populated exactly once on app startup (to recover any notifications
// you missed while the app was killed), then replayed from memory
// on subsequent calls to `fetchAndHandleWatchtowerUnacked`.
const watchtowerUnackedNotifications: Record<
  string,
  {
    vaultId: string;
    walletUUID: string;
    watchtowerId: string;
    firstDetectedAt: number;
    txid: string;
  }[]
> = {};

/**
 * Retrieve and process any “unacknowledged” notifications from the watchtower.
 *
 * When the app is killed, OS‐delivered push notifications never surface
 * in JS unless the user taps them (at least on force-stopped apps on Android).
 * This function:
 *   1. Fetches the “missed” notifications exactly once per WT URL (on first call).
 *   2. Caches the raw payload in `watchtowerUnackedNotificationsRef`.
 *   3. On every subsequent call, skips the network and invokes
 *      `handleWatchtowerNotification` for each cached entry, ensuring
 *      those notifications are handled in the app’s current context
 *      (for example, taking into account whatever wallet is active now).
 *
 * @param {string} watchtowerAPI - The base watchtower API URL for the specific network
 * @returns {Promise<boolean>} True if notifications were successfully fetched and processed,
 *                            false if there was an error or the service was unavailable
 */
export async function fetchAndHandleWatchtowerUnacked({
  networkTimeout,
  pushToken,
  watchtowerAPI,
  handleWatchtowerNotification
}: {
  networkTimeout: number | undefined;
  pushToken: string;
  watchtowerAPI: string;
  handleWatchtowerNotification: (
    pushToken: string,
    data: Record<string, unknown>,
    source:
      | 'PRESENT_IN_TRAY'
      | 'FETCH'
      | 'OPENED'
      | 'FOREGROUND_LISTENER'
      | 'TAPPED'
  ) => void;
}): Promise<boolean> {
  if (!networkTimeout) {
    console.warn(
      'Cannot fetch unacknowledged notifications: missing network timeout'
    );
    return false;
  }
  if (!pushToken) {
    console.warn(
      'Cannot fetch unacknowledged notifications: no push token available'
    );
    return false;
  }

  try {
    //only bug the WT once. Then cache the response. The WT should only be
    //queried on App load in case it was killed. Then we use events.
    if (!watchtowerUnackedNotifications[watchtowerAPI]) {
      // Construct the notifications endpoint for this network
      const notificationsEndpoint = `${watchtowerAPI}/notifications`;
      // Make the request to the watchtower API
      const response = await fetch(notificationsEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pushToken }),
        signal: AbortSignal.timeout(networkTimeout)
      });

      if (!response.ok) {
        console.warn(
          `Failed to fetch unacknowledged notifications from ${notificationsEndpoint}: ${response.status} ${response.statusText}`
        );
        return false;
      }

      const data = await response.json();

      if (!data.notifications || !Array.isArray(data.notifications)) {
        console.warn(
          'Invalid response format for unacknowledged notifications'
        );
        return false;
      }
      watchtowerUnackedNotifications[watchtowerAPI] = data.notifications;
    }

    if (!watchtowerUnackedNotifications[watchtowerAPI])
      throw new Error('watchtowerUnackedNotificationsRef should be set');

    // Process each unacked notification
    for (const unackedNotification of watchtowerUnackedNotifications[
      watchtowerAPI
    ]) {
      const { vaultId, walletUUID, watchtowerId, firstDetectedAt, txid } =
        unackedNotification;

      if (
        typeof vaultId === 'string' &&
        typeof walletUUID === 'string' &&
        typeof watchtowerId === 'string' &&
        typeof firstDetectedAt === 'number' &&
        typeof txid === 'string'
      ) {
        // Process the notification data using the handler
        handleWatchtowerNotification(
          pushToken,
          {
            vaultId,
            walletUUID,
            watchtowerId,
            firstDetectedAt,
            txid
          },
          'FETCH'
        );
      } else {
        console.warn(
          `The watchtower returned corrupted data`,
          JSON.stringify(unackedNotification, null, 2)
        );
        delete watchtowerUnackedNotifications[watchtowerAPI];
        return false;
      }
    }

    // Successfully fetched and processed notifications
    return true;
  } catch (error) {
    // Don't throw, just log the warning
    console.warn(
      `Error fetching unacknowledged notifications from ${watchtowerAPI}:`,
      error
    );
    return false;
  }
}

// getPresentedNotificationsAsync cannot be used because it does not include
// data!
// https://github.com/expo/expo/issues/21109
// const clearOrphanedWatchtowerWalletUUIDs = useCallback(async () => {
//   const uuidsToClear = new Set(orphanedWatchtowerWalletUUIDs);
//   if (uuidsToClear.size === 0) return;
//
//   try {
//     const presentedNotifications = await getPresentedNotificationsAsync();
//     const dismissPromises: Promise<void>[] = [];
//
//     for (const notification of presentedNotifications) {
//       const notificationWalletUUID =
//         notification.request.content.data?.['walletUUID'];
//       if (notificationWalletUUID && uuidsToClear.has(notificationWalletUUID))
//         dismissPromises.push(
//           dismissNotificationAsync(notification.request.identifier)
//         );
//     }
//     await Promise.all(dismissPromises);
//   } catch (error) {
//     console.warn('Error dismissing orphaned notifications:', error);
//   } finally {
//     setOrphanedWatchtowerWalletUUIDs(new Set());
//   }
// }, [orphanedWatchtowerWalletUUIDs, setOrphanedWatchtowerWalletUUIDs]);

// helper to process all tray notifications
// getPresentedNotificationsAsync does not include data!
// https://github.com/expo/expo/issues/21109
// So processPresented cannot be used
//const processPresented = async (pushToken: string) => {
//  try {
//    const list = await getPresentedNotificationsAsync();
//    (list as Array<Notification>).forEach(
//      n => {
//        console.log('TRACE', JSON.stringify(n, null, 2));
//        handleWatchtowerNotification(
//          pushToken,
//          n.request.content.data,
//          'PRESENT_IN_TRAY'
//        );
//      }
//      //if needed they can be cleared with dismissNotificationAsync.
//      //But do this only after clicking on the wallet itself. This is
//      //done in clearOrphanedWatchtowerWalletUUIDs for orphaned ones.
//      //Should we clear also the non-orphaned ones? I think it's nice
//      //to keep then still visible
//    );
//  } catch (e) {
//    console.warn('Error fetching presented notifications', e);
//  }
//};
//
//
//Initial pass for anything still in the tray
//processPresented(pushToken);
//// Also check on every foreground transition
//const appStateSub = AppState.addEventListener('change', state => {
//  if (state === 'active') processPresented(pushToken);
//});
//
//In the same useEffect clear function where the listeners are removed also:
//appStateSub.remove();
