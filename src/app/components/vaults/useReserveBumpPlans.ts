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
  const [plan, setPlan] = useState<ReserveBumpPlan>('loading');
  const [address, setAddress] = useState<string | undefined>();
  const [output, setOutput] = useState<
    ReturnType<typeof computeReceiveOutput> | undefined
  >();
  const [value, setValue] = useState<number | undefined>();
  const refreshIdRef = useRef(0);
  const wasSyncingBlockchain = useRef(syncingBlockchain);

  const refresh = useCallback(() => {
    const refreshId = refreshIdRef.current + 1;
    refreshIdRef.current = refreshId;

    setPlan('loading');
    setAddress(undefined);
    setOutput(undefined);

    if (!enabled || !networkId || !walletSigner || !accounts) {
      setValue(undefined);
      return;
    }
    if (!canFetchReserveDescriptorData) return;

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
          setPlan('error');
          return;
        }
        const { txosData, hasUnconfirmedUtxos, nextIndex } = reserveData;
        const changeDescriptorWithIndex =
          await getNextChangeDescriptorWithIndex(accounts);
        if (refreshIdRef.current !== refreshId) return;
        const nextOutput = computeReceiveOutput(
          { descriptor: triggerReserveDescriptor, index: nextIndex },
          network
        );
        setValue(utxosDataBalance(txosData));
        setAddress(nextOutput.getAddress());
        setOutput(nextOutput);
        setPlan({
          txosData,
          hasUnconfirmedUtxos,
          changeOutput: computeChangeOutput(changeDescriptorWithIndex, network),
          signer: walletSigner
        });
      } catch (err) {
        console.warn('Could not prepare trigger fee-bump plan', err);
        if (refreshIdRef.current === refreshId) setPlan('error');
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

  return { plan, address, output, value, refresh };
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
  const [plan, setPlan] = useState<ReserveBumpPlan>(
    !enabled || reserveData
      ? 'loading'
      : { txosData: [], hasUnconfirmedUtxos: false }
  );
  const [address, setAddress] = useState<string | undefined>();
  const [output, setOutput] = useState<
    ReturnType<typeof computeReceiveOutput> | undefined
  >();
  const refreshIdRef = useRef(0);
  const wasSyncingBlockchain = useRef(syncingBlockchain);

  const refresh = useCallback(() => {
    const refreshId = refreshIdRef.current + 1;
    refreshIdRef.current = refreshId;

    if (!enabled) {
      setPlan('loading');
      setAddress(undefined);
      setOutput(undefined);
      return;
    }
    if (!reserveData) {
      setPlan({ txosData: [], hasUnconfirmedUtxos: false });
      setAddress(undefined);
      setOutput(undefined);
      return;
    }
    if (!networkId) {
      setPlan('loading');
      setAddress(undefined);
      setOutput(undefined);
      return;
    }
    if (!canFetchReserveDescriptorData) {
      setPlan('loading');
      setAddress(undefined);
      setOutput(undefined);
      return;
    }

    const network = networkMapping[networkId];
    setPlan('loading');
    setAddress(undefined);
    setOutput(undefined);

    const prepareRescueP2ABumpPlan = async () => {
      try {
        const fetchedReserveData = await fetchReserveDescriptorData({
          descriptor: reserveData.addressDescriptor
        });
        if (refreshIdRef.current !== refreshId) return;
        if (!fetchedReserveData) {
          setPlan('error');
          return;
        }
        const { txosData, hasUnconfirmedUtxos, nextIndex } = fetchedReserveData;
        const nextOutput = computeReceiveOutput(
          { descriptor: reserveData.addressDescriptor, index: nextIndex },
          network
        );
        setAddress(nextOutput.getAddress());
        setOutput(nextOutput);
        setPlan({
          txosData,
          hasUnconfirmedUtxos,
          changeOutput: computeChangeOutput(
            { descriptor: reserveData.changeDescriptor, index: 0 },
            network
          ),
          signer: reserveData.signer
        });
      } catch (err) {
        console.warn('Could not prepare rescue fee-bump plan', err);
        if (refreshIdRef.current === refreshId) setPlan('error');
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

  return { plan, address, output, refresh };
};
