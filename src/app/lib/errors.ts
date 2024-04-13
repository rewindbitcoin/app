import type { StorageErrorCode } from '../../common/lib/storage';
export type WalletError =
  /** When the user clicks on "Cancel" during authentication in wallet creation
   * or opening wallet */
  | 'USER_CANCEL'
  /** this is the case of old Samsung Devices which do not let storing
   * data even if the system reports that they suppor it. We only find our
   * runtime
   * https://stackoverflow.com/questions/36043912/error-after-fingerprint-touched-on-samsung-phones-android-security-keystoreexce
   */
  | 'BIOMETRICS_UNCAPABLE'
  /** some read write delete operation failed (or any other uknown error that
   * may arise in storage - see function isStorageError )*/
  | 'STORAGE_ERROR'
  | 'ENCRYPTION_ERROR'
  | false;

const isEncryptionError = (errorCode: StorageErrorCode) =>
  errorCode === 'DecryptError' || errorCode === 'EncryptError';
const isStorageError = (errorCode: StorageErrorCode) =>
  errorCode === 'UnknownError' ||
  errorCode === 'ReadError' ||
  errorCode === 'WriteError' ||
  errorCode === 'DeleteError' ||
  errorCode === 'BiometricsReadError' ||
  errorCode === 'BiometricsWriteError';

/** Merges all possible storage errors into simpler meaningul errors to be
 * displayed to the user
 */
export const getWalletError = ({
  isNewWallet,
  settingsErrorCode,
  signersErrorCode,
  walletsErrorCode,
  discoveryErrorCode,
  vaultsErrorCode,
  vaultsStatusesErrorCode,
  accountNamesErrorCode
}: {
  isNewWallet: boolean;
  settingsErrorCode: StorageErrorCode;
  signersErrorCode: StorageErrorCode;
  walletsErrorCode: StorageErrorCode;
  discoveryErrorCode: StorageErrorCode;
  vaultsErrorCode: StorageErrorCode;
  vaultsStatusesErrorCode: StorageErrorCode;
  accountNamesErrorCode: StorageErrorCode;
}): WalletError => {
  if (
    //signersStorageStatus DecryptError is not handled as an ENCRYPTION_ERROR.
    //This error will probably arise when the user makes an error while
    //typing the password and is handled in requiresAuth
    signersErrorCode === 'EncryptError' ||
    isEncryptionError(settingsErrorCode) ||
    isEncryptionError(walletsErrorCode) ||
    isEncryptionError(discoveryErrorCode) ||
    isEncryptionError(signersErrorCode) ||
    isEncryptionError(vaultsErrorCode) ||
    isEncryptionError(vaultsStatusesErrorCode) ||
    isEncryptionError(accountNamesErrorCode)
  ) {
    return 'ENCRYPTION_ERROR';
  } else if (
    //newSigners is defined when creating a new wallet
    isNewWallet &&
    (signersErrorCode === 'BiometricsWriteError' ||
      signersErrorCode === 'BiometricsReadError')
  )
    return 'BIOMETRICS_UNCAPABLE';
  else if (
    signersErrorCode === 'BiometricsReadUserCancel' ||
    signersErrorCode === 'BiometricsWriteUserCancel'
  ) {
    return 'USER_CANCEL';
  } else if (
    isStorageError(settingsErrorCode) ||
    isStorageError(walletsErrorCode) ||
    isStorageError(discoveryErrorCode) ||
    isStorageError(signersErrorCode) ||
    isStorageError(vaultsErrorCode) ||
    isStorageError(vaultsStatusesErrorCode) ||
    isStorageError(accountNamesErrorCode)
  ) {
    return 'STORAGE_ERROR';
  } else return false;
};
