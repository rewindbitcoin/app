import { useCallback } from 'react';
import type { TxHex } from '../lib/vaults';
import { ensureConnected } from '../lib/walletDerivedData';
import type { DiscoveryInstance } from '@bitcoinerlab/discovery';
import { useToast } from '../../common/ui';
import { useTranslation } from 'react-i18next';
import { Transaction } from 'bitcoinjs-lib';
const DETECTION_INTERVAL = 4000;
const DETECT_RETRY_MAX = 5;

export type PushTxFunction = (
  txHex: TxHex
) => Promise<'SUCCESS' | 'NETWORK_ERROR' | 'REJECTED' | 'DETECTION_TIMEOUT'>;

export function usePushTx(
  initialDiscovery: DiscoveryInstance | undefined
): (
  txHex: TxHex
) => Promise<'SUCCESS' | 'NETWORK_ERROR' | 'DETECTION_TIMEOUT'> {
  const { t } = useTranslation();
  const toast = useToast();

  const pushTx = useCallback(
    async (txHex: TxHex) => {
      const tx = Transaction.fromHex(txHex);
      const txId = tx.getId();
      try {
        const discovery =
          initialDiscovery && (await ensureConnected(initialDiscovery));
        if (!discovery)
          throw new Error('Cannot push txs while discovery is not ready');
        const explorer = discovery.getExplorer();
        await explorer.push(txHex);
        //Now, make sure it made it to the mempool:
        for (let i = 0; i < DETECT_RETRY_MAX; i++) {
          if (await explorer.fetchTx(txId)) return 'SUCCESS';
          await new Promise(resolve => setTimeout(resolve, DETECTION_INTERVAL));
        }
      } catch (err: unknown) {
        toast.show(t('app.pushError', { message: (err as Error).message }), {
          type: 'warning'
        });
        return 'NETWORK_ERROR';
      }
      toast.show(t('app.pushTimeoutError'), {
        type: 'warning'
      });
      return 'DETECTION_TIMEOUT';
    },
    [initialDiscovery, t, toast]
  );
  return pushTx;
}
