// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { useContext } from 'react';
import {
  type WalletContextType,
  WalletContext
} from '../contexts/WalletContext';
export const useWallet = (): WalletContextType => {
  const context = useContext<WalletContextType | null>(WalletContext);
  if (context === null) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};
