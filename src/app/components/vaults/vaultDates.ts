// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import type { Vault, VaultStatus } from '../../lib/vaults';

export const formatVaultDate = (
  unixTime: number | undefined,
  locale: string
): string | undefined => {
  if (!unixTime) return;
  const date = new Date(unixTime * 1000);
  const now = new Date();

  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short', // Abbreviated month in letters
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };

  // If the date is in the current year, delete the year to the options
  if (date.getFullYear() === now.getFullYear()) delete options.year;
  return date.toLocaleString(locale, options);
};

export const getVaultInitDate = (
  vault: Vault,
  vaultStatus: VaultStatus,
  locale: string
) => {
  //vaultPushTime is a bit more precise but may not be available in a device
  //using the same mnemonic. Also we may have old vaultPushTime of previous
  //attempts that never reached the blockchain for network issues...
  //creationTime is good enough.
  //Remember there are some props in vaultStatus that
  //are used to keep internal track of user actions. See docs on VaultStatus.
  const creationOrPushTime =
    vaultStatus.vaultPushTime && vaultStatus.vaultPushTime > vault.creationTime
      ? vaultStatus.vaultPushTime
      : vault.creationTime;
  return formatVaultDate(creationOrPushTime, locale);
};
