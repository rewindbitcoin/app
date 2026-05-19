// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '../../hooks/useWallet';
import { networkMapping, type NetworkId } from '../../lib/network';
import { getTriggerReserveDescriptor } from '../../lib/p2aReserve';
import {
  computeChangeOutput,
  computeReceiveOutput
} from '../../lib/vaultDescriptors';
import { type Vault, utxosDataBalance } from '../../lib/vaults';
import type { P2ABumpPlan } from '../../lib/vaultActionTx';
import type { EphemeralWalletData } from '../EphemeralWalletWizard';

export type ReserveBumpPlan = P2ABumpPlan | 'loading' | 'error';

export const useTriggerReserveBumpPlan = ({
  enabled,
  vault,
  networkId,
  syncingBlockchain
}: {
  enabled: boolean;
  vault: Vault;
  networkId: NetworkId | undefined;
  syncingBlockchain: boolean;
}) => {
  const {
    accounts,
    signers,
    getNextChangeDescriptorWithIndex,
    canFetchReserveDescriptorData,
    fetchReserveDescriptorData
  } = useWallet();
  const walletSigner = signers?.[0];
  const [p2aBumpPlan, setP2ABumpPlan] = useState<ReserveBumpPlan>('loading');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshIdRef = useRef(0);
  const wasSyncingBlockchain = useRef(syncingBlockchain);

  const refresh = useCallback(() => {
    const refreshId = refreshIdRef.current + 1;
    refreshIdRef.current = refreshId;

    // Keep a loaded plan visible during background refreshes; the modal can
    // disable only its final submit button while this flag is true.
    setP2ABumpPlan(currentPlan =>
      typeof currentPlan === 'object' ? currentPlan : 'loading'
    );
    setIsRefreshing(true);

    if (!enabled || !networkId || !walletSigner || !accounts) {
      setP2ABumpPlan('loading');
      setIsRefreshing(false);
      return;
    }
    if (!canFetchReserveDescriptorData) {
      setIsRefreshing(false);
      return;
    }

    const network = networkMapping[networkId];

    const prepareTriggerP2ABumpPlan = async () => {
      try {
        const triggerReserveDescriptor = getTriggerReserveDescriptor({
          vault,
          signer: walletSigner,
          network
        });
        const reserveData = await fetchReserveDescriptorData({
          descriptor: triggerReserveDescriptor
        });
        if (refreshIdRef.current !== refreshId) return;
        if (!reserveData) {
          setP2ABumpPlan('error');
          setIsRefreshing(false);
          return;
        }
        const { txosData, hasUnconfirmedUtxos } = reserveData;
        const changeDescriptorWithIndex =
          await getNextChangeDescriptorWithIndex(accounts);
        if (refreshIdRef.current !== refreshId) return;
        setP2ABumpPlan({
          txosData,
          hasUnconfirmedUtxos,
          changeOutput: computeChangeOutput(changeDescriptorWithIndex, network),
          signer: walletSigner
        });
        setIsRefreshing(false);
      } catch (err) {
        console.warn('Could not prepare trigger fee-bump plan', err);
        if (refreshIdRef.current === refreshId) {
          setP2ABumpPlan('error');
          setIsRefreshing(false);
        }
      }
    };

    void prepareTriggerP2ABumpPlan();
  }, [
    enabled,
    networkId,
    walletSigner,
    accounts,
    canFetchReserveDescriptorData,
    vault,
    fetchReserveDescriptorData,
    getNextChangeDescriptorWithIndex
  ]);
  const cancelPendingRefresh = useCallback(() => {
    refreshIdRef.current += 1;
  }, []);

  useEffect(() => {
    // Reserve discovery is an async external scan. Start it when the real
    // inputs change; `refresh` owns loading/error state and stale result guards.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    return cancelPendingRefresh;
  }, [cancelPendingRefresh, refresh]);

  useEffect(() => {
    const syncFinished = wasSyncingBlockchain.current && !syncingBlockchain;
    wasSyncingBlockchain.current = syncingBlockchain;
    if (!syncFinished) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh, syncingBlockchain]);

  const value =
    typeof p2aBumpPlan === 'object'
      ? utxosDataBalance(p2aBumpPlan.txosData)
      : undefined;

  return { p2aBumpPlan, value, isRefreshing, refresh };
};

export const useRescueReserveBumpPlan = ({
  enabled,
  reserveData,
  networkId,
  syncingBlockchain
}: {
  enabled: boolean;
  reserveData: EphemeralWalletData | undefined;
  networkId: NetworkId | undefined;
  syncingBlockchain: boolean;
}) => {
  const { canFetchReserveDescriptorData, fetchReserveDescriptorData } =
    useWallet();
  const [state, setState] = useState<{
    p2aBumpPlan: ReserveBumpPlan;
    nextOutput?: ReturnType<typeof computeReceiveOutput>;
  }>(() =>
    !enabled || reserveData
      ? { p2aBumpPlan: 'loading' }
      : {
          p2aBumpPlan: { txosData: [], hasUnconfirmedUtxos: false }
        }
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshIdRef = useRef(0);
  const wasSyncingBlockchain = useRef(syncingBlockchain);

  const refresh = useCallback(() => {
    const refreshId = refreshIdRef.current + 1;
    refreshIdRef.current = refreshId;

    if (!enabled) {
      setState({ p2aBumpPlan: 'loading' });
      setIsRefreshing(false);
      return;
    }
    if (!reserveData) {
      setState({
        p2aBumpPlan: { txosData: [], hasUnconfirmedUtxos: false }
      });
      setIsRefreshing(false);
      return;
    }
    if (!networkId) {
      setState({ p2aBumpPlan: 'loading' });
      setIsRefreshing(false);
      return;
    }
    if (!canFetchReserveDescriptorData) {
      setState(currentState =>
        typeof currentState.p2aBumpPlan === 'object'
          ? currentState
          : { p2aBumpPlan: 'loading' }
      );
      setIsRefreshing(false);
      return;
    }

    const network = networkMapping[networkId];
    // Keep a loaded plan visible during background refreshes; the modal can
    // disable only its final submit button while this flag is true.
    setState(currentState =>
      typeof currentState.p2aBumpPlan === 'object'
        ? currentState
        : { p2aBumpPlan: 'loading' }
    );
    setIsRefreshing(true);

    const prepareRescueP2ABumpPlan = async () => {
      try {
        const fetchedReserveData = await fetchReserveDescriptorData({
          descriptor: reserveData.addressDescriptor
        });
        if (refreshIdRef.current !== refreshId) return;
        if (!fetchedReserveData) {
          setState({ p2aBumpPlan: 'error' });
          setIsRefreshing(false);
          return;
        }
        const { txosData, hasUnconfirmedUtxos, nextIndex } = fetchedReserveData;
        const nextOutput = computeReceiveOutput(
          { descriptor: reserveData.addressDescriptor, index: nextIndex },
          network
        );
        setState({
          nextOutput,
          p2aBumpPlan: {
            txosData,
            hasUnconfirmedUtxos,
            changeOutput: computeChangeOutput(
              { descriptor: reserveData.changeDescriptor, index: 0 },
              network
            ),
            signer: reserveData.signer
          }
        });
        setIsRefreshing(false);
      } catch (err) {
        console.warn('Could not prepare rescue fee-bump plan', err);
        if (refreshIdRef.current === refreshId) {
          setState({ p2aBumpPlan: 'error' });
          setIsRefreshing(false);
        }
      }
    };

    void prepareRescueP2ABumpPlan();
  }, [
    enabled,
    networkId,
    reserveData,
    canFetchReserveDescriptorData,
    fetchReserveDescriptorData
  ]);
  const cancelPendingRefresh = useCallback(() => {
    refreshIdRef.current += 1;
  }, []);

  useEffect(() => {
    // Reserve discovery is an async external scan. Start it when the real
    // inputs change; `refresh` owns loading/error state and stale result guards.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    return cancelPendingRefresh;
  }, [cancelPendingRefresh, refresh]);

  useEffect(() => {
    const syncFinished = wasSyncingBlockchain.current && !syncingBlockchain;
    wasSyncingBlockchain.current = syncingBlockchain;
    if (!syncFinished) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh, syncingBlockchain]);

  const { p2aBumpPlan } = state;
  const nextOutput =
    typeof p2aBumpPlan === 'object' ? state.nextOutput : undefined;

  return { p2aBumpPlan, nextOutput, isRefreshing, refresh };
};
