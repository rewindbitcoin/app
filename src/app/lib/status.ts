import { t } from 'i18next';
import { Toast } from '../../common/ui';
import type { StorageErrorCode } from '../../common/lib/storage';
import type { Vaults, VaultsStatuses } from './vaults';
import type { Accounts, Signers, Wallet } from './wallets';

type StorageAccessStatus = {
  /** When the user clicks on "Cancel" during authentication in wallet creation
   * or opening wallet */
  biometricAuthCancelled: boolean;
  /** this is the case of old Samsung Devices which do not let storing
   * data even if the system reports that they suppor it. We only find our
   * runtime
   * https://stackoverflow.com/questions/36043912/error-after-fingerprint-touched-on-samsung-phones-android-security-keystoreexce
   */
  biometricsUncapable: boolean;
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
  isNewWallet,
  settingsErrorCode,
  signersErrorCode,
  walletsErrorCode,
  discoveryExportErrorCode,
  vaultsErrorCode,
  vaultsStatusesErrorCode,
  accountsErrorCode
}: {
  isNewWallet: boolean;
  settingsErrorCode: StorageErrorCode;
  signersErrorCode: StorageErrorCode;
  walletsErrorCode: StorageErrorCode;
  discoveryExportErrorCode: StorageErrorCode;
  vaultsErrorCode: StorageErrorCode;
  vaultsStatusesErrorCode: StorageErrorCode;
  accountsErrorCode: StorageErrorCode;
}): StorageAccessStatus => {
  let biometricAuthCancelled = false;
  let biometricsUncapable = false;
  let readWriteError = false;
  //Don't pass it further down as a Wallet Error. This is probably a user
  //typing in the wrong password. We overwrite it as a non-error internally in
  //this function.
  if (signersErrorCode === 'DecryptError') signersErrorCode = false;
  //When setting up a new wallet we treat biometrics error specially. This is
  //the first time the App checks if Biometrics properly work. An error here
  //means that the device is an old Samsung device probably that reported that
  //has biometrics but then failed. See note above in 'BIOMETRICS_UNCAPABLE'
  if (
    isNewWallet &&
    (signersErrorCode === 'BiometricsWriteError' ||
      signersErrorCode === 'BiometricsReadError')
  )
    biometricsUncapable = true;
  if (
    signersErrorCode === 'BiometricsReadUserCancel' ||
    signersErrorCode === 'BiometricsWriteUserCancel'
  ) {
    biometricAuthCancelled = true;
  }
  if (
    settingsErrorCode ||
    walletsErrorCode ||
    discoveryExportErrorCode ||
    (!biometricsUncapable && !biometricAuthCancelled && signersErrorCode) ||
    vaultsErrorCode ||
    vaultsStatusesErrorCode ||
    accountsErrorCode
  ) {
    readWriteError = true;
  }
  return {
    biometricAuthCancelled,
    biometricsUncapable,
    readWriteError
  };
};

/** Very rudimentary wallet integrity check. A much better implementation
 * should make sure the structure of each arg corresponds to the defined type
 */
export const getIsCorrupted = ({
  wallet,
  signers,
  isSignersSynchd,
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
  isSignersSynchd: boolean;
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
    (!signers && isSignersSynchd && signersErrorCode !== 'DecryptError') ||
    (!vaults && isVaultsSynchd) ||
    (!vaultsStatuses && isVaultsStatusesSynchd) ||
    (!accounts && isAccountsSynchd)
  );
};

//TODO: remove this function below
type ToastError = 'NETWORK_ERROR'; //'NETWORK_ERROR' | 'STORAGE_ERROR' |...
/**
 * When the error is permanent (such as in btc rates or fees failing then
 * better use NetStatus.notifyErrorAsync
 *
 */
export const toastifyErrorAsync = async <T>(
  errorType: ToastError,
  func: () => Promise<T>
): Promise<T | ToastError> => {
  try {
    return await func();
  } catch (error) {
    console.warn(error);
    const errorMessage =
      error instanceof Error ? error.message : t('app.unknownError');

    if (errorType === 'NETWORK_ERROR')
      Toast.show(t('app.networkError', { message: errorMessage }), {
        type: 'warning'
      });
    else throw new Error(`Invalid error type ${errorType}`);
    return 'NETWORK_ERROR';
  }
};
