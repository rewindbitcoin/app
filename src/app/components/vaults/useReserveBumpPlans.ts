// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '../../hooks/useWallet';
import { networkMapping, type NetworkId } from '../../lib/network';
import { getTriggerReserveDescriptor } from '../../lib/p2aReserve';
import { computeOutput } from '../../lib/vaultDescriptors';
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
  const { signers, canFetchReserveDescriptorData, fetchReserveDescriptorData } =
    useWallet();
  const walletSigner = signers?.[0];
  const [p2aBumpPlan, setP2ABumpPlan] = useState<ReserveBumpPlan>('loading');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const syncIdRef = useRef(0);
  const wasSyncingBlockchain = useRef(syncingBlockchain);

  const syncBumpPlan = useCallback(() => {
    const syncId = syncIdRef.current + 1;
    syncIdRef.current = syncId;

    // Keep a loaded plan visible during background syncs; the modal can
    // disable only its final submit button while this flag is true.
    setP2ABumpPlan(currentPlan =>
      typeof currentPlan === 'object' ? currentPlan : 'loading'
    );
    setIsRefreshing(true);

    if (!enabled || !networkId || !walletSigner) {
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
        if (syncIdRef.current !== syncId) return;
        if (!reserveData) {
          setP2ABumpPlan('error');
          setIsRefreshing(false);
          return;
        }
        const { txosData, hasUnconfirmedUtxos } = reserveData;
        setP2ABumpPlan({
          txosData,
          hasUnconfirmedUtxos,
          signer: walletSigner
        });
        setIsRefreshing(false);
      } catch (err) {
        console.warn('Could not prepare trigger fee-bump plan', err);
        if (syncIdRef.current === syncId) {
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
    canFetchReserveDescriptorData,
    vault,
    fetchReserveDescriptorData
  ]);
  const cancelPendingSync = useCallback(() => {
    syncIdRef.current += 1;
  }, []);

  useEffect(() => {
    // Reserve discovery is an async external scan. Start it when the real
    // inputs change; `syncBumpPlan` owns loading/error state and stale result guards.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    syncBumpPlan();
    return cancelPendingSync;
  }, [cancelPendingSync, syncBumpPlan]);

  useEffect(() => {
    const syncFinished = wasSyncingBlockchain.current && !syncingBlockchain;
    wasSyncingBlockchain.current = syncingBlockchain;
    if (!syncFinished) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    syncBumpPlan();
  }, [syncBumpPlan, syncingBlockchain]);

  const value =
    typeof p2aBumpPlan === 'object'
      ? utxosDataBalance(p2aBumpPlan.txosData)
      : undefined;

  return { p2aBumpPlan, value, isRefreshing, syncBumpPlan };
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
    nextOutput?: ReturnType<typeof computeOutput>;
  }>(() =>
    !enabled || reserveData
      ? { p2aBumpPlan: 'loading' }
      : {
          p2aBumpPlan: { txosData: [], hasUnconfirmedUtxos: false }
        }
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const syncIdRef = useRef(0);
  const wasSyncingBlockchain = useRef(syncingBlockchain);

  const syncBumpPlan = useCallback(() => {
    const syncId = syncIdRef.current + 1;
    syncIdRef.current = syncId;

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
    // Keep a loaded plan visible during background syncs; the modal can
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
        if (syncIdRef.current !== syncId) return;
        if (!fetchedReserveData) {
          setState({ p2aBumpPlan: 'error' });
          setIsRefreshing(false);
          return;
        }
        const { txosData, hasUnconfirmedUtxos, nextIndex } = fetchedReserveData;
        const nextOutput = computeOutput(
          { descriptor: reserveData.addressDescriptor, index: nextIndex },
          network
        );
        setState({
          nextOutput,
          p2aBumpPlan: {
            txosData,
            hasUnconfirmedUtxos,
            signer: reserveData.signer
          }
        });
        setIsRefreshing(false);
      } catch (err) {
        console.warn('Could not prepare rescue fee-bump plan', err);
        if (syncIdRef.current === syncId) {
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
  const cancelPendingSync = useCallback(() => {
    syncIdRef.current += 1;
  }, []);

  useEffect(() => {
    // Reserve discovery is an async external scan. Start it when the real
    // inputs change; `syncBumpPlan` owns loading/error state and stale result guards.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    syncBumpPlan();
    return cancelPendingSync;
  }, [cancelPendingSync, syncBumpPlan]);

  useEffect(() => {
    const syncFinished = wasSyncingBlockchain.current && !syncingBlockchain;
    wasSyncingBlockchain.current = syncingBlockchain;
    if (!syncFinished) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    syncBumpPlan();
  }, [syncBumpPlan, syncingBlockchain]);

  const { p2aBumpPlan } = state;
  const nextOutput =
    typeof p2aBumpPlan === 'object' ? state.nextOutput : undefined;

  return {
    p2aBumpPlan,
    nextOutput,
    isRefreshing,
    syncBumpPlan
  };
};
