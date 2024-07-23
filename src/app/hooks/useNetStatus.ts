/** for usage read notes en NetStatusContext.tsx */
import { useContext } from 'react';
import { NetStatusContext, NetStatus } from '../contexts/NetStatusContext';

export const useNetStatus = (): NetStatus => {
  const context = useContext(NetStatusContext);
  if (!context) {
    throw new Error('useNetStatus must be used within a NetStatusProvider');
  }
  return context;
};
