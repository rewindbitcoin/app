// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

const IRREVERSIBLE_BLOCKS = 4; // Number of blocks after which a transaction is considered irreversible
//const IRREVERSIBLE_BLOCKS = 0; // For Screenshots
import { View, Text, Linking } from 'react-native';
import { batchedUpdates } from '~/common/lib/batchedUpdates';

import {
  type Vault,
  type VaultStatus,
  createCpfpChildTx,
  getP2AVaultFundingBreakdown,
  getTriggerReserveUtxosData,
  getVaultFrozenBalance,
  getVaultMode,
  getRemainingBlocks,
  getVaultUnfrozenBalance,
  getVaultRescuedBalance
} from '../../lib/vaults';
import VaultIcon from '../VaultIcon';
import { useTranslation } from 'react-i18next';
import { formatBalance, formatBlocks } from '../../lib/format';
import { Button, useToast } from '../../../common/ui';

import { useSettings } from '../../hooks/useSettings';
import type { BlockStatus } from '@bitcoinerlab/explorer';
import VaultAction from './modals/VaultAction';
import VaultActionButton from './card/VaultActionButton';
import VaultBalance from './card/VaultBalance';
import VaultStatusLine from './card/VaultStatusLine';
import VaultWatchtowerIndicator from './card/VaultWatchtowerIndicator';
import { formatVaultDate, getVaultInitDate } from './vaultDates';
import {
  getActionAvailability,
  getLadderedRescueSortedTxs,
  getLadderedTriggerSortedTxs,
  getP2ARescueInfo,
  getP2ATriggerInfo,
  type P2ABumpPlan,
  type PresignedTxInfo,
  type VaultActionTxData
} from '../../lib/vaultActionTx';
import { useWallet } from '../../hooks/useWallet';
import Delegate from './modals/Delegate';
import ModalInfoButton from '../ModalInfoButton';
import * as Notifications from 'expo-notifications';
import { useLocalization } from '../../hooks/useLocalization';
import { useNetStatus } from '../../hooks/useNetStatus';
import {
  canReceiveNotifications,
  sendAckToWatchtower
} from '../../lib/watchtower';
import SkeletonPulse from '../SkeletonPulse';
import { networkMapping } from '../../lib/network';
import { computeChangeOutput } from '../../lib/vaultDescriptors';
import useFirstDefinedValue from '~/common/hooks/useFirstDefinedValue';

const LOADING_TEXT = '     ';
const INITIAL_NOW_SECONDS = Math.floor(Date.now() / 1000);

const RawVault = ({
  setVaultNotificationAcknowledged,
  updateVaultStatus,
  pushTx,
  btcFiat,
  tipStatus,
  vault,
  vaultNumber,
  vaultStatus,
  blockExplorerURL,
  syncingBlockchain,
  watchtowerAPI,
  syncWatchtowerRegistration,
  ensurePermissionsAndToken,
  notificationPermissions,
  pushToken
}: {
  setVaultNotificationAcknowledged: (vaultId: string) => void;
  updateVaultStatus: (vaultId: string, vaultStatus: VaultStatus) => void;
  pushTx: (txHex: string) => Promise<void>;
  btcFiat: number | undefined;
  tipStatus: BlockStatus | undefined;
  vault: Vault;
  vaultNumber: number;
  vaultStatus: VaultStatus | undefined;
  blockExplorerURL: string | undefined;
  syncingBlockchain: boolean;
  watchtowerAPI: string | undefined;
  syncWatchtowerRegistration: ({
    pushToken,
    isUserTriggered
  }: {
    pushToken: string;
    isUserTriggered: boolean;
  }) => Promise<void>;
  ensurePermissionsAndToken: (mode: 'GET' | 'REQUEST') => Promise<{
    notificationPermissions:
      | Notifications.NotificationPermissionsStatus
      | undefined;
    pushToken: string | undefined;
  }>;

  notificationPermissions:
    | Notifications.NotificationPermissionsStatus
    | undefined;
  pushToken: string | undefined;
}) => {
  const { netRequest } = useNetStatus();
  const [isTriggerBeingHandled, setIsTriggerBeingHandled] =
    useState<boolean>(false);

  const { t } = useTranslation();
  const toast = useToast();
  const vaultMode = useMemo(() => getVaultMode(vault), [vault]);
  const isLadderedVault = vaultMode === 'LADDERED';

  const { settings } = useSettings();
  if (!settings) throw new Error('Settings has not been retrieved');
  const {
    accounts,
    feeEstimates: feeEstimatesRealTime,
    networkId,
    signers,
    getNextChangeDescriptorWithIndex,
    pushTxPackage
  } = useWallet();
  const feeEstimates = useFirstDefinedValue(feeEstimatesRealTime);
  const walletSigner = signers?.[0];
  // undefined: real change-output-backed plan is still being prepared.
  // A plan with empty utxosData means preparation finished with no reserve UTXOs.
  const [triggerP2ABumpPlan, setTriggerP2ABumpPlan] = useState<
    P2ABumpPlan | undefined
  >(undefined);

  // Prepare and set the triggerP2ABumpPlan in state. triggerP2ABumpPlan needs a
  // wallet change output and the next change descriptor is fetched
  // asynchronously. The trigger modal receives, validates and submits this
  // plan.
  useEffect(() => {
    let cancelled = false;
    setTriggerP2ABumpPlan(undefined);

    const prepareTriggerP2ABumpPlan = async () => {
      if (isLadderedVault) {
        return;
      }
      if (!networkId || !walletSigner || !accounts) return;
      const network = networkMapping[networkId];
      const utxosData = getTriggerReserveUtxosData({
        vault,
        signer: walletSigner,
        network
      });
      try {
        const changeDescriptorWithIndex =
          await getNextChangeDescriptorWithIndex(accounts);
        if (cancelled) return;
        // The built-in trigger reserve UTXO is created by this vault tx itself.
        // Until the vault tx confirms, that reserve input is unconfirmed too.
        const isTriggerReserveConfirmed =
          vaultStatus?.vaultTxBlockHeight !== undefined &&
          vaultStatus.vaultTxBlockHeight > 0;
        setTriggerP2ABumpPlan({
          utxosData,
          hasUnconfirmedUtxos:
            utxosData.length > 0 && !isTriggerReserveConfirmed,
          changeOutput: computeChangeOutput(changeDescriptorWithIndex, network),
          signer: walletSigner
        });
      } catch (err) {
        console.warn('Could not prepare trigger fee-bump plan', err);
      }
    };

    prepareTriggerP2ABumpPlan();

    return () => {
      cancelled = true;
    };
  }, [
    isLadderedVault,
    networkId,
    walletSigner,
    accounts,
    vault,
    vaultStatus?.vaultTxBlockHeight,
    getNextChangeDescriptorWithIndex
  ]);

  const [isTriggerModalVisible, setIsTriggerModalVisible] =
    useState<boolean>(false);
  const closeTriggerModal = useCallback(
    () => setIsTriggerModalVisible(false),
    []
  );
  const openTriggerModal = useCallback(
    () => setIsTriggerModalVisible(true),
    []
  );
  // Broadcasts the selected trigger action. It acknowledges the watchtower for
  // this local action, then pushes parent-only txs directly or builds the P2A
  // parent+reserve-child package when reserve UTXOs exist.
  const handleTrigger = useCallback(
    async (triggerData: VaultActionTxData) => {
      batchedUpdates(() => {
        setIsTriggerModalVisible(false);
        setIsTriggerBeingHandled(true);
      });
      const wasTriggerTxPendingConfirmation =
        vaultStatus?.triggerTxBlockHeight !== undefined
          ? vaultStatus.triggerTxBlockHeight === 0
          : !!vaultStatus?.triggerPushTime;
      let triggerCpfpTxHex: string | undefined;
      try {
        const { status: pushStatus } = await netRequest({
          whenToastErrors: 'ON_ANY_ERROR',
          errorMessage: (message: string) => t('app.pushError', { message }),
          func: async () => {
            setVaultNotificationAcknowledged(vault.vaultId);
            try {
              // `sendAckToWatchtower` is normally submitted by `handleWatchtowerNotification`
              // when a notification is received (and after `setVaultNotificationAcknowledged` has been called - see above).
              // We call `sendAckToWatchtower` immediately here as a proactive measure.
              // If the user closes the app before `handleWatchtowerNotification`
              // can handle an incoming notification, sending the ack now prevents the same device
              // that triggered the transaction (tx) from receiving a redundant push notification.
              if (pushToken && watchtowerAPI)
                await sendAckToWatchtower({
                  pushToken,
                  watchtowerAPI,
                  vaultId: vault.vaultId,
                  networkTimeout: settings?.NETWORK_TIMEOUT
                });
            } catch (err) {
              console.warn(
                'Could not ack the watchtower for an auto-trigger from this wallet',
                err,
                pushToken,
                watchtowerAPI,
                vault.vaultId
              );
            }
            if (isLadderedVault) {
              await pushTx(triggerData.parentTxHex);
              return;
            }

            if (
              triggerP2ABumpPlan &&
              triggerP2ABumpPlan.utxosData.length === 0
            ) {
              await pushTx(triggerData.parentTxHex);
              return;
            }

            if (!networkId || !triggerP2ABumpPlan)
              throw new Error('Wallet not ready for Rewind2 trigger package');
            const network = networkMapping[networkId];
            // P2A trigger fee bumping is reserve-backed by design: the dedicated
            // trigger reserve stays outside normal wallet flow and is always
            // the only non-anchor input. The child sends leftover value back to
            // the wallet's regular change branch.
            const childTxData = await createCpfpChildTx({
              parentTxHex: triggerData.parentTxHex,
              parentFee: triggerData.parentTxFee,
              targetPackageFeeRate: triggerData.actionFeeRate,
              utxosData: triggerP2ABumpPlan.utxosData,
              changeOutput: triggerP2ABumpPlan.changeOutput,
              signer: triggerP2ABumpPlan.signer,
              network
            });
            if (!childTxData)
              throw new Error('Cannot build trigger fee-bump transaction');
            triggerCpfpTxHex = childTxData.childTxHex;
            await pushTxPackage({
              parentTxHex: triggerData.parentTxHex,
              childTxHex: childTxData.childTxHex
            });
          }
        });

        if (pushStatus !== 'SUCCESS') return;
        if (wasTriggerTxPendingConfirmation)
          toast.show(t('wallet.vault.accelerateSuccess'), { type: 'success' });
        if (!vaultStatus)
          throw new Error('vault status should exist for existing vault');
        const newVaultStatus = {
          ...vaultStatus,
          triggerTxHex: triggerData.parentTxHex,
          triggerTxBlockHeight: 0,
          triggerPushTime: Math.floor(Date.now() / 1000),
          ...(triggerCpfpTxHex !== undefined && { triggerCpfpTxHex })
        };
        updateVaultStatus(vault.vaultId, newVaultStatus);
      } finally {
        setIsTriggerBeingHandled(false);
      }
    },
    [
      setVaultNotificationAcknowledged,
      pushToken,
      watchtowerAPI,
      settings?.NETWORK_TIMEOUT,
      networkId,
      pushTxPackage,
      pushTx,
      isLadderedVault,
      triggerP2ABumpPlan,
      vault,
      vaultStatus,
      updateVaultStatus,
      netRequest,
      toast,
      t
    ]
  );

  const [showDelegate, setShowDelegate] = useState<boolean>(false);
  const handleCloseDelegate = useCallback(() => setShowDelegate(false), []);
  const handleShowDelegate = useCallback(() => setShowDelegate(true), []);

  const [isRescueBeingHandled, setIsRescueBeingHandled] =
    useState<boolean>(false);
  const [isRescueModalVisible, setIsRescueModalVisible] =
    useState<boolean>(false);
  const closeRescueModal = useCallback(
    () => setIsRescueModalVisible(false),
    []
  );
  const openRescueModal = useCallback(() => setIsRescueModalVisible(true), []);
  const rescueP2ABumpPlan = useMemo<P2ABumpPlan | undefined>(() => {
    // TODO: build this from the shared funding wizard once P2A rescue
    // acceleration top-ups are supported.
    return undefined;
  }, []);
  // Broadcasts the selected rescue action. The modal has already selected a
  // valid parent or package. Parent-only rescue pushes the parent directly;
  // reserve-backed rescue builds the child package.
  const handleRescue = useCallback(
    async (rescueData: VaultActionTxData) => {
      batchedUpdates(() => {
        setIsRescueModalVisible(false);
        setIsRescueBeingHandled(true);
      });
      const wasRescueTxPendingConfirmation =
        vaultStatus?.panicTxBlockHeight !== undefined
          ? vaultStatus.panicTxBlockHeight === 0
          : !!vaultStatus?.panicPushTime;
      let panicCpfpTxHex: string | undefined;
      try {
        const { status: pushStatus } = await netRequest({
          whenToastErrors: 'ON_ANY_ERROR',
          errorMessage: (message: string) => t('app.pushError', { message }),
          func: async () => {
            if (isLadderedVault) {
              await pushTx(rescueData.parentTxHex);
              return;
            }

            if (
              !rescueP2ABumpPlan ||
              rescueP2ABumpPlan.utxosData.length === 0
            ) {
              await pushTx(rescueData.parentTxHex);
              return;
            }
            if (!networkId)
              throw new Error('Wallet not ready for Rewind2 rescue package');
            const network = networkMapping[networkId];
            const childTxData = await createCpfpChildTx({
              parentTxHex: rescueData.parentTxHex,
              parentFee: rescueData.parentTxFee,
              targetPackageFeeRate: rescueData.actionFeeRate,
              utxosData: rescueP2ABumpPlan.utxosData,
              changeOutput: rescueP2ABumpPlan.changeOutput,
              signer: rescueP2ABumpPlan.signer,
              network
            });
            if (!childTxData)
              throw new Error('Cannot build rescue fee-bump transaction');
            panicCpfpTxHex = childTxData.childTxHex;
            await pushTxPackage({
              parentTxHex: rescueData.parentTxHex,
              childTxHex: childTxData.childTxHex
            });
          }
        });

        if (pushStatus !== 'SUCCESS') return;
        if (wasRescueTxPendingConfirmation)
          toast.show(t('wallet.vault.accelerateSuccess'), { type: 'success' });
        if (!vaultStatus)
          throw new Error('vault status should exist for existing vault');
        const newVaultStatus = {
          ...vaultStatus,
          panicTxHex: rescueData.parentTxHex,
          panicTxBlockHeight: 0,
          panicPushTime: Math.floor(Date.now() / 1000),
          ...(panicCpfpTxHex !== undefined && { panicCpfpTxHex })
        };
        updateVaultStatus(vault.vaultId, newVaultStatus);
      } finally {
        setIsRescueBeingHandled(false);
      }
    },
    [
      pushTx,
      vault.vaultId,
      vaultStatus,
      updateVaultStatus,
      netRequest,
      toast,
      t,
      networkId,
      pushTxPackage,
      isLadderedVault,
      rescueP2ABumpPlan
    ]
  );

  const tipHeight = tipStatus?.blockHeight;
  //const tipTime = blockchainData?.tipStatus.blockTime;
  const remainingBlocks =
    tipHeight &&
    vaultStatus &&
    getRemainingBlocks(vault, vaultStatus, tipHeight);
  const { locale, currency } = useLocalization();
  const rescuedDate = formatVaultDate(vaultStatus?.panicTxBlockTime, locale);
  const rescuePushDate = formatVaultDate(vaultStatus?.panicPushTime, locale);
  const panicAddress = vault.coldAddress;
  const spentAsHotDate = formatVaultDate(
    vaultStatus?.spendAsHotTxBlockTime,
    locale
  );
  const unfrozenDate = formatVaultDate(vaultStatus?.hotBlockTime, locale);

  const isVaultTxConfirmed =
    vaultStatus?.vaultTxBlockHeight !== undefined &&
    vaultStatus.vaultTxBlockHeight > 0;
  const isVaultTxInMempool = vaultStatus?.vaultTxBlockHeight === 0;
  const isVaultTxPushed = !!vaultStatus?.vaultPushTime;
  const vaultNotFound =
    !isVaultTxPushed && !isVaultTxInMempool && !isVaultTxConfirmed;

  const isTriggerTxConfirmed =
    vaultStatus?.triggerTxBlockHeight !== undefined &&
    vaultStatus.triggerTxBlockHeight > 0;
  const isTriggerTxInMempool = vaultStatus?.triggerTxBlockHeight === 0;
  const isTriggerTxConfirmedButReversible =
    !!tipHeight &&
    !!vaultStatus?.triggerTxBlockHeight &&
    tipHeight - vaultStatus.triggerTxBlockHeight < IRREVERSIBLE_BLOCKS - 1;
  const isTriggerTxNotFound = remainingBlocks === 'TRIGGER_NOT_FOUND';
  const isTriggerTxPushed = !!vaultStatus?.triggerPushTime;
  const isTriggerPushedButUnconfirmed =
    vaultStatus?.triggerTxBlockHeight !== undefined
      ? isTriggerTxInMempool
      : isTriggerTxPushed;
  const triggerPushedTxHex = vaultStatus?.triggerTxHex;
  const triggerCpfpTxHex = vaultStatus?.triggerCpfpTxHex;
  const hasTriggerStarted =
    isTriggerPushedButUnconfirmed || isTriggerTxConfirmed;
  const isUnfrozen =
    remainingBlocks === 0 || remainingBlocks === 'FOUND_AS_HOT';
  const isRescueTxPushed = !!vaultStatus?.panicPushTime;
  const isRescueTxInMempool = vaultStatus?.panicTxBlockHeight === 0;
  const isRescueTxConfirmed =
    vaultStatus?.panicTxBlockHeight !== undefined &&
    vaultStatus.panicTxBlockHeight > 0;
  const isRescuePushedButUnconfirmed =
    vaultStatus?.panicTxBlockHeight !== undefined
      ? isRescueTxInMempool
      : isRescueTxPushed;
  const rescuePushedTxHex = vaultStatus?.panicTxHex;
  const panicCpfpTxHex = vaultStatus?.panicCpfpTxHex;
  const hasRescueStarted = isRescuePushedButUnconfirmed || isRescueTxConfirmed;

  // P2A_TRUC start packages must not spend unconfirmed non-anchor inputs.
  // Rescue reserves may come from a separate in-memory wallet, so their
  // confirmation state must travel with the bump plan instead of wallet history.
  const isTriggerModalBlockedByUnconfirmedVault =
    vaultMode === 'P2A_TRUC' && !isVaultTxConfirmed;
  const isTriggerModalBlockedByUnconfirmedReserve =
    vaultMode === 'P2A_TRUC' && !!triggerP2ABumpPlan?.hasUnconfirmedUtxos;
  const isRescueModalBlockedByUnconfirmedReserve =
    vaultMode === 'P2A_TRUC' && !!rescueP2ABumpPlan?.hasUnconfirmedUtxos;
  const showDelegateButton = !vaultNotFound && !isUnfrozen && !hasRescueStarted;
  const showHideButton =
    vaultNotFound ||
    //can be hidden if irreversible after specified blocks
    //since either a rescue tx or after having reached a hot status
    (tipHeight &&
      ((vaultStatus?.panicTxBlockHeight &&
        tipHeight - vaultStatus.panicTxBlockHeight >=
          IRREVERSIBLE_BLOCKS - 1) ||
        (vaultStatus?.hotBlockHeight &&
          tipHeight - vaultStatus.hotBlockHeight >= IRREVERSIBLE_BLOCKS - 1)));

  const triggerPresignedTxInfos = useMemo<PresignedTxInfo[]>(
    () =>
      isLadderedVault
        ? getLadderedTriggerSortedTxs(vault)
        : [getP2ATriggerInfo(vault)],
    [isLadderedVault, vault]
  );
  const rescuePresignedTxInfos = useMemo<PresignedTxInfo[] | null>(
    () =>
      !vaultStatus?.triggerTxHex
        ? null
        : isLadderedVault
          ? getLadderedRescueSortedTxs(vault, vaultStatus.triggerTxHex)
          : [getP2ARescueInfo(vault, vaultStatus.triggerTxHex)],
    [isLadderedVault, vault, vaultStatus?.triggerTxHex]
  );

  const trigger = useMemo(() => {
    const startButtonVisible = !vaultNotFound && !hasTriggerStarted;
    const bumpPlanLoading =
      !isLadderedVault && triggerP2ABumpPlan === undefined;

    const hasModalPrerequisites =
      !isTriggerBeingHandled &&
      !isTriggerModalBlockedByUnconfirmedVault &&
      !isTriggerModalBlockedByUnconfirmedReserve &&
      !bumpPlanLoading &&
      !!feeEstimates;

    let accelerationButtonEnabled = false;
    if (
      hasModalPrerequisites &&
      // Once rescue starts, acceleration belongs to the rescue action. For
      // laddered vaults, replacing the trigger after rescue was pushed could
      // invalidate the rescue tx that spends the prior trigger.
      !hasRescueStarted &&
      isTriggerPushedButUnconfirmed &&
      triggerPushedTxHex
    ) {
      const accelerationAvailability = getActionAvailability({
        vaultMode,
        feeEstimates,
        pushedTxHex: triggerPushedTxHex,
        ...(!isLadderedVault && triggerCpfpTxHex
          ? { pushedChildTxHex: triggerCpfpTxHex }
          : {}),
        presignedTxInfos: triggerPresignedTxInfos,
        ...(triggerP2ABumpPlan ? { p2aBumpPlan: triggerP2ABumpPlan } : {})
      });
      accelerationButtonEnabled = isLadderedVault
        ? accelerationAvailability.result === null
        : true;
    }

    return {
      accelerationStatusVisible: isTriggerPushedButUnconfirmed,
      startButtonVisible,
      startDisabled: !hasModalPrerequisites,
      startLoading:
        (!triggerPushedTxHex && isTriggerBeingHandled) ||
        (startButtonVisible &&
          !isTriggerModalBlockedByUnconfirmedVault &&
          !isTriggerModalBlockedByUnconfirmedReserve &&
          !hasModalPrerequisites &&
          (bumpPlanLoading || !feeEstimates)),
      accelerationButtonEnabled,
      accelerationLoading: isTriggerBeingHandled
    };
  }, [
    vaultNotFound,
    hasTriggerStarted,
    isLadderedVault,
    triggerP2ABumpPlan,
    isTriggerBeingHandled,
    isTriggerModalBlockedByUnconfirmedVault,
    isTriggerModalBlockedByUnconfirmedReserve,
    feeEstimates,
    hasRescueStarted,
    isTriggerPushedButUnconfirmed,
    triggerPushedTxHex,
    triggerCpfpTxHex,
    vaultMode,
    triggerPresignedTxInfos
  ]);

  const rescue = useMemo(() => {
    const startButtonVisible =
      hasTriggerStarted && !isUnfrozen && !hasRescueStarted;
    const rescueBumpPlanNeedsFeeEstimates =
      !isLadderedVault &&
      !!rescueP2ABumpPlan &&
      rescueP2ABumpPlan.utxosData.length > 0;
    const modalNeedsFeeEstimates =
      isLadderedVault || rescueBumpPlanNeedsFeeEstimates;
    const hasModalPrerequisites =
      !isRescueBeingHandled &&
      !!rescuePresignedTxInfos &&
      !isRescueModalBlockedByUnconfirmedReserve &&
      (!modalNeedsFeeEstimates || !!feeEstimates);

    let accelerationButtonEnabled = false;
    if (
      hasModalPrerequisites &&
      isRescuePushedButUnconfirmed &&
      rescuePushedTxHex &&
      rescuePresignedTxInfos
    ) {
      const accelerationAvailability = getActionAvailability({
        vaultMode,
        ...(feeEstimates ? { feeEstimates } : {}),
        pushedTxHex: rescuePushedTxHex,
        ...(!isLadderedVault && panicCpfpTxHex
          ? { pushedChildTxHex: panicCpfpTxHex }
          : {}),
        presignedTxInfos: rescuePresignedTxInfos,
        ...(rescueP2ABumpPlan ? { p2aBumpPlan: rescueP2ABumpPlan } : {})
      });
      accelerationButtonEnabled = isLadderedVault
        ? accelerationAvailability.result === null
        : true;
    }

    return {
      accelerationStatusVisible: isRescuePushedButUnconfirmed,
      startButtonVisible,
      startDisabled: !hasModalPrerequisites,
      startLoading:
        (!rescuePushedTxHex && isRescueBeingHandled) ||
        (startButtonVisible &&
          !isRescueModalBlockedByUnconfirmedReserve &&
          !hasModalPrerequisites &&
          modalNeedsFeeEstimates &&
          !feeEstimates),
      accelerationButtonEnabled,
      accelerationLoading: isRescueBeingHandled
    };
  }, [
    hasTriggerStarted,
    isUnfrozen,
    hasRescueStarted,
    isLadderedVault,
    rescueP2ABumpPlan,
    isRescueBeingHandled,
    isRescueModalBlockedByUnconfirmedReserve,
    rescuePresignedTxInfos,
    feeEstimates,
    isRescuePushedButUnconfirmed,
    rescuePushedTxHex,
    panicCpfpTxHex,
    vaultMode
  ]);

  const [scheduledNow, setScheduledNow] = useState<number>(INITIAL_NOW_SECONDS);
  //update now every 5 minutes...
  useEffect(() => {
    const interval = setInterval(
      () => {
        setScheduledNow(Math.floor(Date.now() / 1000));
      },
      5 * 60 * 1000
    );
    return () => clearInterval(interval);
  }, []);
  const now = scheduledNow;

  const triggerBlockTimeBestGuess = vaultStatus?.triggerTxBlockTime
    ? vaultStatus.triggerTxBlockTime
    : isTriggerTxPushed || isTriggerTxInMempool
      ? now + 10 * 60 //expected is always 10' from now
      : undefined;

  //It's better to find out the unfreeze expected time based on the remainig time
  // and not using triggerTime + blockBlocks since previous blocks until now
  // may have not been 10' exactly
  const unfreezeTimeBestGuess = !triggerBlockTimeBestGuess
    ? undefined
    : typeof remainingBlocks !== 'number'
      ? undefined
      : remainingBlocks === 0
        ? undefined //this means it already is unfrozen
        : now + remainingBlocks * 10 * 60; //expected is always 10' from now, whatever is now

  const estimatedUnfreezeDate =
    unfreezeTimeBestGuess && formatVaultDate(unfreezeTimeBestGuess, locale);

  const triggerConfirmedDate = formatVaultDate(
    vaultStatus?.triggerTxBlockTime,
    locale
  );

  const plannedUnfreezeTimeButRescued =
    triggerBlockTimeBestGuess &&
    triggerBlockTimeBestGuess + vault.lockBlocks * 10 * 60;
  const plannedUnfreezeButRescuedDate = formatVaultDate(
    plannedUnfreezeTimeButRescued,
    locale
  );
  const triggerPushDate = formatVaultDate(vaultStatus?.triggerPushTime, locale);

  const vaultInitDate =
    vaultStatus && getVaultInitDate(vault, vaultStatus, locale);
  const vaultStatusRef = useRef(vaultStatus);
  useEffect(() => {
    return () => {
      vaultStatusRef.current = undefined; //unset on unmount
    };
  }, []);

  const handleHideVault = useCallback(() => {
    const newVaultStatus = {
      ...vaultStatus,
      isHidden: true
    };
    updateVaultStatus(vault.vaultId, newVaultStatus);
  }, [updateVaultStatus, vaultStatus, vault.vaultId]);

  const amountMode =
    settings.FIAT_MODE && typeof btcFiat === 'number'
      ? 'Fiat'
      : settings.SUB_UNIT;

  const frozenBalance =
    tipHeight &&
    vaultStatus &&
    getVaultFrozenBalance(vault, vaultStatus, tipHeight);
  const unfrozenBalance =
    tipHeight &&
    vaultStatus &&
    getVaultUnfrozenBalance(vault, vaultStatus, tipHeight);
  const rescuedBalance =
    tipHeight && vaultStatus && getVaultRescuedBalance(vault, vaultStatus);
  const unfreezeReserveValue = useMemo(() => {
    if (isLadderedVault || !frozenBalance || vaultStatus?.triggerTxHex) return;
    const signer = signers?.[0];
    if (!signer) return;
    return getP2AVaultFundingBreakdown({ vault, signer }).triggerReserveValue;
  }, [
    isLadderedVault,
    frozenBalance,
    vaultStatus?.triggerTxHex,
    signers,
    vault
  ]);

  return (
    <View
      key={vault.vaultId}
      className="rounded-3xl bg-white overflow-hidden p-4"
    >
      {/* Header: Icon + Vault number + Creation Date  */}
      <View className="flex-row items-center justify-start mb-4">
        <VaultIcon remainingBlocks={remainingBlocks} />
        <Text className="font-semibold text-slate-800 web:text-base native:text-lg pl-2 flex-shrink-0">
          {t('wallet.vault.vaultTitle', { vaultNumber })}
        </Text>
        <SkeletonPulse active={!vaultInitDate}>
          <Text
            className={`text-slate-500 flex-1 text-right pl-4 native:text-sm web:text-xs`}
          >
            {vaultInitDate
              ? t('wallet.vault.vaultDate', {
                  date: vaultInitDate
                })
              : LOADING_TEXT}
          </Text>
        </SkeletonPulse>
      </View>
      <View>
        <View className="flex-row justify-between items-center">
          <View className="flex-1">
            {!!frozenBalance && (
              <VaultBalance
                title={
                  hasTriggerStarted
                    ? t('wallet.vault.amountBeingUnfrozen')
                    : t('wallet.vault.amountFrozen')
                }
                isConfirming={
                  (isVaultTxPushed || isVaultTxInMempool) && !isVaultTxConfirmed
                }
                satsBalance={frozenBalance}
                btcFiat={btcFiat}
                mode={amountMode}
              />
            )}
            {!!unfrozenBalance && (
              <VaultBalance
                title={t('wallet.vault.unfrozenAmount')}
                isConfirming={false}
                satsBalance={unfrozenBalance}
                btcFiat={btcFiat}
                mode={amountMode}
              />
            )}
            {!!rescuedBalance && (
              <VaultBalance
                title={t('wallet.vault.rescuedAmount')}
                isConfirming={
                  (isRescueTxPushed || isRescueTxInMempool) &&
                  !isRescueTxConfirmed
                }
                satsBalance={rescuedBalance}
                btcFiat={btcFiat}
                mode={amountMode}
              />
            )}
          </View>
          {canReceiveNotifications &&
            (isTriggerTxNotFound ||
              isTriggerTxInMempool ||
              isTriggerTxConfirmedButReversible) && (
              <VaultWatchtowerIndicator
                vaultStatus={vaultStatus}
                watchtowerAPI={watchtowerAPI}
                notificationPermissions={notificationPermissions}
                pushToken={pushToken}
                syncingBlockchain={syncingBlockchain}
                ensurePermissionsAndToken={ensurePermissionsAndToken}
                syncWatchtowerRegistration={syncWatchtowerRegistration}
              />
            )}
        </View>
        {typeof remainingBlocks === 'number' && remainingBlocks > 0 && (
          <View className="flex-row items-center mt-2">
            {/*<MaterialCommunityIcons
              name="lock-clock"
              size={14}
              className="text-slate-900 pr-1"
            />*/}
            <Text className="native:text-sm web:text-xs uppercase text-primary-dark font-semibold">
              {t('wallet.vault.timeRemaining', {
                timeRemaining: formatBlocks(remainingBlocks, t, locale, true)
              })}
            </Text>
          </View>
        )}
        {isTriggerTxNotFound && (
          <View className="flex-row items-center mt-2.5">
            {/*<MaterialCommunityIcons
              name="lock-clock"
              size={16}
              className="text-slate-900 pr-1"
            />*/}
            <Text className="native:text-sm web:text-xs uppercase text-primary-dark font-semibold">
              {t('wallet.vault.untriggeredLockTime', {
                timeRemaining: formatBlocks(vault.lockBlocks, t, locale, true)
              })}
            </Text>
          </View>
        )}
        {unfreezeReserveValue ? (
          <View className="w-full flex-row items-start gap-2 pt-2">
            <Text className="shrink text-slate-500 native:text-sm web:text-xs">
              {t('vaultSetup.unfreezeReserveLabel')}:{' '}
              {formatBalance({
                satsBalance: unfreezeReserveValue,
                btcFiat,
                currency,
                locale,
                mode: amountMode,
                appendSubunit: true
              })}
            </Text>
            <ModalInfoButton
              title={t('vaultSetup.unfreezeReserveHelpTitle')}
              icon={{ family: 'FontAwesome5', name: 'coins' }}
              text={t('vaultSetup.unfreezeReserveHelp')}
            />
          </View>
        ) : null}
        <View className={`gap-4 ${!vaultNotFound ? 'pt-4' : ''}`}>
          {trigger.accelerationStatusVisible && (
            <VaultStatusLine
              icon={{
                name: 'clock-fast',
                family: 'MaterialCommunityIcons'
              }}
              accelerateLoading={trigger.accelerationLoading}
              {...(trigger.accelerationButtonEnabled
                ? { onAccelerate: openTriggerModal }
                : {})}
            >
              {triggerPushDate
                ? t('wallet.vault.pushedTriggerUnconfirmed', {
                    triggerPushDate
                  })
                : t('wallet.vault.pushedTriggerUnconfirmedWithUnknownDate')}
            </VaultStatusLine>
          )}
          {triggerConfirmedDate && (
            <VaultStatusLine
              icon={{
                name: 'clock-fast',
                family: 'MaterialCommunityIcons'
              }}
            >
              {t('wallet.vault.confirmedTrigger', {
                lockTime: formatBlocks(vault.lockBlocks, t, locale, true),
                triggerConfirmedDate
              })}
            </VaultStatusLine>
          )}
          {hasTriggerStarted &&
            !isUnfrozen &&
            !hasRescueStarted &&
            estimatedUnfreezeDate && (
              <VaultStatusLine
                icon={{
                  name: 'flag-checkered',
                  family: 'MaterialCommunityIcons'
                }}
              >
                {t('wallet.vault.triggerWithEstimatedDate', {
                  estimatedUnfreezeDate
                })}
              </VaultStatusLine>
            )}
          {hasTriggerStarted && isUnfrozen && (
            <VaultStatusLine
              icon={{
                name: 'flag-checkered',
                family: 'MaterialCommunityIcons'
              }}
            >
              {unfrozenDate
                ? t('wallet.vault.unfrozenDate', { unfrozenDate })
                : t('wallet.vault.unfrozenOnNextBlock')}
            </VaultStatusLine>
          )}
          {hasRescueStarted && plannedUnfreezeButRescuedDate && (
            <VaultStatusLine
              danger
              icon={{
                name: 'flag-off',
                family: 'MaterialCommunityIcons'
              }}
            >
              {t('wallet.vault.triggerWithEstimatedDateButRescued', {
                plannedUnfreezeButRescuedDate
              })}
            </VaultStatusLine>
          )}
          {rescuedDate && (
            <VaultStatusLine
              icon={{
                name: 'shield-alert-outline',
                family: 'MaterialCommunityIcons'
              }}
            >
              {t('wallet.vault.confirmedRescue', {
                rescuedDate,
                panicAddress
              })}
            </VaultStatusLine>
          )}
          {rescue.accelerationStatusVisible && (
            <VaultStatusLine
              icon={{
                name: 'shield-alert-outline',
                family: 'MaterialCommunityIcons'
              }}
              accelerateLoading={rescue.accelerationLoading}
              {...(rescue.accelerationButtonEnabled
                ? { onAccelerate: openRescueModal }
                : {})}
            >
              {rescuePushDate
                ? t('wallet.vault.rescueUnconfirmed', {
                    rescuePushDate,
                    panicAddress
                  })
                : t('wallet.vault.rescueUnconfirmedWithUnknownDate')}
            </VaultStatusLine>
          )}
          {rescue.startButtonVisible &&
            isRescueModalBlockedByUnconfirmedReserve && (
              <Text className="pt-2">
                {t(
                  'wallet.vault.cannotBeRescuedBecauseReserveUnconfirmed_TRUC'
                )}
              </Text>
            )}
          {vaultNotFound && (
            <Text className="pt-2">{t('wallet.vault.vaultNotFound')}</Text>
          )}
          {isTriggerTxNotFound && (
            <Text className="pt-2">
              {isVaultTxConfirmed
                ? isTriggerModalBlockedByUnconfirmedReserve
                  ? t(
                      'wallet.vault.cannotBeTriggeredBecauseReserveUnconfirmed_TRUC',
                      {
                        lockTime: formatBlocks(
                          vault.lockBlocks,
                          t,
                          locale,
                          true
                        )
                      }
                    )
                  : t('wallet.vault.canBeTriggered', {
                      lockTime: formatBlocks(vault.lockBlocks, t, locale, true)
                    })
                : t(
                    vaultMode === 'P2A_TRUC'
                      ? 'wallet.vault.cannotBeTriggeredBecauseVaultUnconfirmed_TRUC'
                      : 'wallet.vault.canBeTriggeredEvenIfVaultUnconfirmed',
                    {
                      lockTime: formatBlocks(vault.lockBlocks, t, locale, true)
                    }
                    //TODO: accelerate? But this needs a real RBF implementation in coinselect
                  )}
            </Text>
          )}
          {remainingBlocks === 'FOUND_AS_HOT' && (
            <Text className="pt-2">
              {spentAsHotDate
                ? t('wallet.vault.unfrozenAndSpent', { spentAsHotDate })
                : t('wallet.vault.unfrozenAndSpentPushed')}
            </Text>
          )}
          {remainingBlocks === 0 && (
            <Text className="pt-2">
              {t('wallet.vault.unfrozenAndHotBalance')}
            </Text>
          )}
          {hasRescueStarted && (
            // native:text-sm web:text-xs web:sm:text-sm
            <>
              <Text className="py-2">
                {isRescueTxConfirmed
                  ? t('wallet.vault.rescueConfirmedEmergencyAddressIntro')
                  : t('wallet.vault.rescueUnconfirmedEmergencyAddressIntro')}
              </Text>
              {/*text-ellipsis, whitespace-nowrap & break-words is web only; overflow-hidden on a Text element breaks words
               flex-1 explanation: https://www.bam.tech/article/why-my-text-is-going-off-screen */}
              <Button
                iconRight={{
                  family: 'FontAwesome5',
                  name: 'external-link-alt'
                }}
                mode="text"
                textClassName="overflow-hidden flex-1"
                onPress={() =>
                  Linking.openURL(`${blockExplorerURL}/${panicAddress}`)
                }
              >
                {panicAddress}
              </Button>
            </>
          )}
        </View>
        {(rescue.startButtonVisible ||
          trigger.startButtonVisible ||
          showDelegateButton ||
          showHideButton) && (
          <View
            className={`w-full flex-row ${[rescue.startButtonVisible, trigger.startButtonVisible, showDelegateButton, showHideButton].filter(Boolean).length > 1 ? 'justify-between flex-wrap' : 'justify-end'} pt-8 px-0 moblg:px-4 gap-4 moblg:gap-6`}
          >
            {rescue.startButtonVisible && (
              <VaultActionButton
                mode="secondary-alert"
                onPress={openRescueModal}
                loading={rescue.startLoading}
                disabled={rescue.startDisabled}
                msg={t('wallet.vault.rescueButton')}
                infoButton={
                  <ModalInfoButton
                    title={t('wallet.vault.help.rescue.title')}
                    icon={{
                      family: 'MaterialCommunityIcons',
                      name: 'alarm-light'
                    }}
                    text={t('wallet.vault.help.rescue.text')}
                    buttonContainerClassName=""
                  />
                }
              />
            )}
            {trigger.startButtonVisible && (
              <VaultActionButton
                mode="secondary"
                onPress={openTriggerModal}
                loading={trigger.startLoading}
                disabled={trigger.startDisabled}
                msg={t('wallet.vault.triggerUnfreezeButton')}
                infoButton={
                  <ModalInfoButton
                    title={t('wallet.vault.help.initUnfreeze.title')}
                    icon={{
                      family: 'MaterialCommunityIcons',
                      name: 'snowflake-melt'
                    }}
                    text={t('wallet.vault.help.initUnfreeze.text')}
                    buttonContainerClassName=""
                  />
                }
              />
            )}
            {showDelegateButton && (
              <VaultActionButton
                mode="secondary"
                onPress={handleShowDelegate}
                loading={false}
                msg={t('wallet.vault.delegateButton')}
                infoButton={
                  <ModalInfoButton
                    title={t('wallet.vault.help.delegate.title')}
                    icon={{ family: 'FontAwesome5', name: 'hands-helping' }}
                    text={t('wallet.vault.help.delegate.text')}
                    buttonContainerClassName=""
                  />
                }
              />
            )}
            {showHideButton && (
              <VaultActionButton
                mode="secondary"
                onPress={handleHideVault}
                loading={false}
                msg={t('wallet.vault.hideButton')}
              />
            )}
          </View>
        )}
      </View>
      <VaultAction
        role="TRIGGER"
        vault={vault}
        vaultStatus={vaultStatus}
        p2aBumpPlan={triggerP2ABumpPlan}
        isVisible={isTriggerModalVisible}
        lockBlocks={vault.lockBlocks}
        onClose={closeTriggerModal}
        onAction={handleTrigger}
      />
      <VaultAction
        role="RESCUE"
        vault={vault}
        vaultStatus={vaultStatus}
        p2aBumpPlan={rescueP2ABumpPlan}
        isVisible={isRescueModalVisible}
        onClose={closeRescueModal}
        onAction={handleRescue}
      />
      <Delegate
        vault={vault}
        isVisible={showDelegate}
        onClose={handleCloseDelegate}
      />
    </View>
  );
};

const VaultCard = React.memo(RawVault);

export default VaultCard;
