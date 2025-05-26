//https://docs.expo.dev/versions/v51.0.0/sdk/notifications/

import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { AppState, AppStateStatus, Platform } from 'react-native';
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

// Type for a single unacknowledged notification item
export type UnackedNotificationItem = {
  vaultId: string;
  walletUUID: string;
  watchtowerId: string;
  firstDetectedAt: number;
  txid: string;
};

//FIXME: also dont refetch failed API calls every time, but at mostevery 30 seconds?
//so return again as failed if re-fetching too often!!!

// Cache of “unacknowledged” watchtower notifications by API URL.
// Populated exactly once on app startup (to recover any notifications
// you missed while the app was killed) and when the app becomes active again,
// then replayed from memory
// on subsequent calls to `fetchWatchtowerUnackedNotifications`.
// This cache should only store validated notification arrays.
let watchtowerUnackedNotifications: Record<string, UnackedNotificationItem[]> =
  {};

// Keep track of the current app state
let currentAppState: AppStateStatus = AppState.currentState;

// Listen to AppState changes to reset the cache when app becomes active from background
AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
  if (
    nextAppState === 'active' &&
    currentAppState === 'background' // Only reset if coming from background
  ) {
    watchtowerUnackedNotifications = {};
  }
  currentAppState = nextAppState;
});

/**
 * Retrieve any “unacknowledged” notifications from the watchtower.
 *
 * When the app is killed, OS‐delivered push notifications never surface
 * in JS unless the user taps them (at least on force-stopped apps on Android).
 * This function:
 *   1. Fetches the “missed” notifications exactly once per WT URL (on first call).
 *   2. Validates the fetched notifications.
 *   3. Caches the validated payload in `watchtowerUnackedNotifications`.
 *   4. On every subsequent call, skips the network and returns the cached entries.
 *
 * @param {string} watchtowerAPI - The base watchtower API URL for the specific network
 * @returns {Promise<UnackedNotificationItem[] | null>} An array of unacknowledged notifications,
 *                                                    or null if there was an error or the service was unavailable.
 */
export async function fetchWatchtowerUnackedNotifications({
  networkTimeout,
  pushToken,
  watchtowerAPI,
  signal
}: {
  networkTimeout: number;
  pushToken: string;
  watchtowerAPI: string;
  signal?: AbortSignal;
}): Promise<UnackedNotificationItem[] | null> {
  // If already cached, return the (pre-validated) cached notifications.
  if (watchtowerUnackedNotifications[watchtowerAPI])
    return watchtowerUnackedNotifications[watchtowerAPI];

  try {
    const fetchOptionsSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(networkTimeout)])
      : AbortSignal.timeout(networkTimeout);

    // Construct the notifications endpoint for this network
    const notificationsEndpoint = `${watchtowerAPI}/notifications`;
    // Make the request to the watchtower API
    const response = await fetch(notificationsEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ pushToken }),
      signal: fetchOptionsSignal
    });

    // If aborted after fetch started but before here.
    if (signal?.aborted) {
      console.warn(
        `Fetch for ${watchtowerAPI} aborted by external signal after response.`
      );
      return null;
    }

    if (!response.ok) {
      console.warn(
        `Failed to fetch unacknowledged notifications from ${notificationsEndpoint}: ${response.status} ${response.statusText}.`
      );
      return null;
    }
    const data = await response.json();

    if (!data.notifications || !Array.isArray(data.notifications)) {
      console.warn(
        `Invalid response format for unacknowledged notifications from ${watchtowerAPI}.`
      );
      return null;
    }

    const validatedNotifications: UnackedNotificationItem[] = [];

    for (const item of data.notifications) {
      if (
        item &&
        typeof item.vaultId === 'string' &&
        typeof item.walletUUID === 'string' &&
        typeof item.watchtowerId === 'string' &&
        typeof item.firstDetectedAt === 'number' &&
        typeof item.txid === 'string'
      ) {
        validatedNotifications.push({
          vaultId: item.vaultId,
          walletUUID: item.walletUUID,
          watchtowerId: item.watchtowerId,
          firstDetectedAt: item.firstDetectedAt,
          txid: item.txid
        });
      } else {
        console.warn(
          `The watchtower ${watchtowerAPI} returned corrupted data: ${JSON.stringify(item, null, 2)}.`
        );
        // Do not cache if any item is invalid.
        return null;
      }
    }

    // Cache the validated notifications
    watchtowerUnackedNotifications[watchtowerAPI] = validatedNotifications;

    // Check external signal again befor final return
    if (signal?.aborted) {
      console.warn(
        `Fetch for ${watchtowerAPI} aborted by external signal before finish.`
      );
      return null;
    }
    return validatedNotifications;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      // Log specific message for abort, could be due to timeout or external signal
      console.warn(
        `Fetch for ${watchtowerAPI} aborted: ${(error as Error).message}.`
      );
    } else {
      // Log other errors
      console.warn(
        `Error fetching unacknowledged notifications from ${watchtowerAPI}:`,
        error
      );
    }
    return null;
  }
}

/**
 * Acknowledges to the watchtower service that a vault notification
 * has been received or seen by the user.
 *
 * This function is idempotent: once it has successfully ACK’d a given
 * (watchtowerAPI, vaultId) pair, further calls for the same vault
 * will no-op and will not hit the network again.
 *
 * If the network request fails (e.g. no timeout, missing push token,
 * non-2xx response), it logs a warning but does not throw.
 *
 * @param watchtowerAPI - Base URL of the watchtower service.
 * @param vaultId       - Identifier of the vault whose notification is being acknowledged.
 * @returns A promise that resolves to `true` if the ACK was sent (or had already been sent),
 *          and `false` if the request could not be made or failed.
 */

const watchtowerAcked: Record<string, Set<string>> = {};

export async function sendAckToWatchtower({
  pushToken,
  watchtowerAPI,
  vaultId,
  networkTimeout
}: {
  pushToken: string;
  watchtowerAPI: string;
  vaultId: string;
  networkTimeout: number | undefined;
}) {
  if (!networkTimeout) {
    console.warn(
      'Cannot acknowledge watchtower notification: networkTimeout not set.'
    );
    return;
  }
  if (!pushToken) {
    console.warn(
      'Cannot acknowledge watchtower notification: pushToken not available.'
    );
    return;
  }
  // skip if we've already acked this vault --
  if (!watchtowerAcked[watchtowerAPI])
    watchtowerAcked[watchtowerAPI] = new Set<string>();

  if (watchtowerAcked[watchtowerAPI].has(vaultId)) return; // nothing to do

  try {
    const ackEndpoint = `${watchtowerAPI}/ack`;
    const response = await fetch(ackEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ pushToken, vaultId }),
      signal: AbortSignal.timeout(networkTimeout)
    });

    if (!response.ok) {
      console.warn(
        `Failed to acknowledge watchtower notification for vault ${vaultId} at ${watchtowerAPI}: ${response.status} ${response.statusText}`
      );
    } else watchtowerAcked[watchtowerAPI].add(vaultId);
  } catch (error) {
    console.warn(
      `Error acknowledging watchtower notification for vault ${vaultId} at ${watchtowerAPI}:`,
      error
    );
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
