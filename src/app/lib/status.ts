import type { StorageErrorCode } from '../../common/lib/storage';
import type { Vaults, VaultsStatuses } from './vaults';
import type { Accounts, Signers, Wallet } from './wallets';

type StorageAccessStatus = {
  /**
   * The user added / removed a face / fingerprint. This invalidates the key.
   * See: https://docs.expo.dev/versions/latest/sdk/securestore/#securestoregetitemasynckey-options
   */
  biometricsKeyInvalidated: boolean;
  /** When the user clicks on "Cancel" during authentication in wallet creation
   * or opening wallet */
  biometricAuthCancelled: boolean;
  /** Note some old Samsung Devices can give this error when storing
   * data even if the system reports that they support it. We only find our
   * runtime
   * https://stackoverflow.com/questions/36043912/error-after-fingerprint-touched-on-samsung-phones-android-security-keystoreexce
   */
  biometricsReadWriteError: boolean;
  /** some read write delete operation failed (or any other uknown error that
   * may arise in storage - see function isStorageError )*/
  readWriteError: boolean;
};

//type ActionResult = {
//  lastOkDate: Date;
//  /**
//   * The error message if last result of an action geneates an error
//   * If last result of an action is ok, then this is deleted
//   */
//  error?: unknown;
//  errorType?: 'LOGIC' | 'NETWORK';
//};

export type WalletStatus = {
  storageAccess: StorageAccessStatus;
  /** Data retrieved from storage is not valid */
  isCorrupted: boolean;

  //sync: ActionResult;
  //feeEstimates: ActionResult;
  //btcRate: ActionResult;
  //vaultCreation: ActionResult;

  //pushTx: ActionResult;
};

/** Merges all possible storage errors into simpler meaningul errors to be
 * displayed to the user
 */
export const getStorageAccessStatus = ({
  signers,
  isSignersDiskSynchd,
  settingsErrorCode,
  signersErrorCode,
  walletsErrorCode,
  discoveryExportErrorCode,
  vaultsErrorCode,
  vaultsStatusesErrorCode,
  accountsErrorCode
}: {
  signers: Signers | undefined;
  isSignersDiskSynchd: boolean;
  settingsErrorCode: StorageErrorCode;
  signersErrorCode: StorageErrorCode;
  walletsErrorCode: StorageErrorCode;
  discoveryExportErrorCode: StorageErrorCode;
  vaultsErrorCode: StorageErrorCode;
  vaultsStatusesErrorCode: StorageErrorCode;
  accountsErrorCode: StorageErrorCode;
}): StorageAccessStatus => {
  let biometricsKeyInvalidated = false;
  let biometricAuthCancelled = false;
  let biometricsReadWriteError = false;
  let readWriteError = false;
  let badPassword = false;
  //Don't pass it further down as a Wallet Error. This is probably a user
  //typing in the wrong password. We overwrite it as a non-error internally in
  //this function.
  if (signersErrorCode === 'DecryptError') {
    signersErrorCode = false;
    badPassword = true;
  }
  //When setting up a new wallet we treat biometrics error specially. This is
  //the first time the App checks if Biometrics properly work. An error here
  //means that the device is an old Samsung device probably that reported that
  //has biometrics but then failed. See note above in 'BIOMETRICS_UNCAPABLE'
  if (
    signersErrorCode === 'BiometricsReadUserCancel' ||
    signersErrorCode === 'BiometricsWriteUserCancel'
  ) {
    biometricAuthCancelled = true;
  }
  //signers will be set to undefined if a new face or fingerprint is added/removed
  //from the system. See https://docs.expo.dev/versions/latest/sdk/securestore/#securestoregetitemasynckey-options
  //Note that we convert null->undefined internally in storage.ts
  if (
    badPassword === false &&
    signers === undefined &&
    isSignersDiskSynchd &&
    biometricAuthCancelled === false
  )
    biometricsKeyInvalidated = true;
  if (
    settingsErrorCode ||
    walletsErrorCode ||
    discoveryExportErrorCode ||
    (!biometricAuthCancelled && signersErrorCode) ||
    vaultsErrorCode ||
    vaultsStatusesErrorCode ||
    accountsErrorCode
  ) {
    readWriteError = true;
  }
  if (
    signersErrorCode === 'BiometricsWriteError' ||
    signersErrorCode === 'BiometricsReadError'
  )
    biometricsReadWriteError = true;
  return {
    //The user added / removed a face / fingerprint
    biometricsKeyInvalidated,
    //The user clicked on Cancel on the OS modal.
    biometricAuthCancelled,
    biometricsReadWriteError,
    readWriteError //this includes biometricsReadWriteError
  };
};

/** Very rudimentary wallet integrity check. A much better implementation
 * should make sure the structure of each arg corresponds to the defined type
 */
export const getIsCorrupted = ({
  wallet,
  signers,
  isSignersDiskSynchd,
  signersErrorCode,
  vaults,
  isVaultsSynchd,
  vaultsStatuses,
  isVaultsStatusesSynchd,
  accounts,
  isAccountsSynchd
}: {
  wallet: Wallet | undefined;
  signers: Signers | undefined;
  isSignersDiskSynchd: boolean;
  signersErrorCode: StorageErrorCode;
  vaults: Vaults | undefined;
  isVaultsSynchd: boolean;
  vaultsStatuses: VaultsStatuses | undefined;
  isVaultsStatusesSynchd: boolean; // Corrected the name to match other naming conventions
  accounts: Accounts | undefined;
  isAccountsSynchd: boolean;
}): boolean => {
  return (
    !wallet ||
    //If we dont' have signers because of DecryptError, this is probably a user
    //typing in the wrong password. So quite probably this is not corrupted.
    (!signers && isSignersDiskSynchd && signersErrorCode !== 'DecryptError') ||
    (!vaults && isVaultsSynchd) ||
    (!vaultsStatuses && isVaultsStatusesSynchd) ||
    (!accounts && isAccountsSynchd)
  );
};

//import { t } from 'i18next';
//import { Toast } from '../../common/ui';
//type ToastError = 'NETWORK_ERROR'; //'NETWORK_ERROR' | 'STORAGE_ERROR' |...
///**
// * When the error is permanent (such as in btc rates or fees failing then
// * better use NetStatus.notifyErrorAsync
// *
// */
//export const toastifyErrorAsync = async <T>(
//  errorType: ToastError,
//  func: () => Promise<T>
//): Promise<T | ToastError> => {
//  try {
//    return await func();
//  } catch (error) {
//    console.warn(error);
//    const errorMessage =
//      error instanceof Error ? error.message : t('app.unknownError');
//
//    if (errorType === 'NETWORK_ERROR')
//      Toast.show(t('app.networkError', { message: errorMessage }), {
//        type: 'warning'
//      });
//    else throw new Error(`Invalid error type ${errorType}`);
//    return 'NETWORK_ERROR';
//  }
//};
//    If you activate the above, then add back this translation:
//    networkError: `Oops! There was a network issue. Please check your connection and try again.
//
//{{message}}`,
