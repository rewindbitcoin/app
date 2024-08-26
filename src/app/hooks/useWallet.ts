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
