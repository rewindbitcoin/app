import type { StorageErrorCode } from '../../common/lib/storage';
import type { Vaults, VaultsStatuses } from './vaults';
import type { Accounts, Signers, Wallet } from './wallets';
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
  /** Data retrieved from storage is not valid */
  | 'CORRUPTED'
  | false;

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
  accountsErrorCode,
  isCorrupted
}: {
  isNewWallet: boolean;
  settingsErrorCode: StorageErrorCode;
  signersErrorCode: StorageErrorCode;
  walletsErrorCode: StorageErrorCode;
  discoveryErrorCode: StorageErrorCode;
  vaultsErrorCode: StorageErrorCode;
  vaultsStatusesErrorCode: StorageErrorCode;
  accountsErrorCode: StorageErrorCode;
  isCorrupted: boolean;
}): WalletError => {
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
    return 'BIOMETRICS_UNCAPABLE';
  else if (
    signersErrorCode === 'BiometricsReadUserCancel' ||
    signersErrorCode === 'BiometricsWriteUserCancel'
  ) {
    return 'USER_CANCEL';
  } else if (
    settingsErrorCode ||
    walletsErrorCode ||
    discoveryErrorCode ||
    signersErrorCode ||
    vaultsErrorCode ||
    vaultsStatusesErrorCode ||
    accountsErrorCode
  ) {
    return 'STORAGE_ERROR';
  } else if (isCorrupted) return 'CORRUPTED';
  else return false;
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
