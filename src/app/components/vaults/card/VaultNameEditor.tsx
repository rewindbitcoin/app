// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, useToast } from '../../../../common/ui';
import { normalizeVaultNameText } from '../../../lib/vaultLabels';

const MAX_VAULT_NAME_LENGTH = 255;

const VaultNameEditor = ({
  vaultName,
  disabled,
  onSave
}: {
  vaultName: string;
  disabled: boolean;
  onSave: (vaultName: string) => Promise<void> | void;
}) => {
  const { t } = useTranslation();
  const toast = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(vaultName);
  const [isSaving, setIsSaving] = useState(false);

  const fixTextAlignment = useMemo(() => ({ lineHeight: undefined }), []);

  useEffect(() => {
    if (!isEditing) setDraft(vaultName);
  }, [isEditing, vaultName]);

  const handleCancel = useCallback(() => {
    setDraft(vaultName);
    setIsEditing(false);
  }, [vaultName]);

  const handleBlur = useCallback(() => {
    if (normalizeVaultNameText(draft) === vaultName) setIsEditing(false);
  }, [draft, vaultName]);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onSave(normalizeVaultNameText(draft));
      setIsEditing(false);
    } catch (error) {
      console.warn('Failed to save vault name', error);
      toast.show(t('wallet.vault.nameSaveError'), { type: 'warning' });
    } finally {
      setIsSaving(false);
    }
  }, [draft, isSaving, onSave, t, toast]);

  if (!isEditing) {
    return (
      <View className="flex-shrink">
        <Text className="font-semibold text-slate-800 web:text-base native:text-lg">
          {t('wallet.vault.vaultTitle', { vaultName })}
        </Text>
        <Pressable
          hitSlop={8}
          disabled={disabled}
          className={`self-start ${disabled ? 'opacity-50' : 'active:opacity-70'}`}
          onPress={() => setIsEditing(true)}
        >
          <Text className="text-xs font-medium text-primary">
            {t('wallet.vault.editName')}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 gap-2">
      <View className="flex-row items-center gap-2">
        <Text className="font-semibold text-slate-800 web:text-base native:text-lg">
          {t('wallet.vault.vaultNamePrefix')}
        </Text>
        <TextInput
          className="min-w-24 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
          value={draft}
          maxLength={MAX_VAULT_NAME_LENGTH}
          autoFocus={true}
          returnKeyType="done"
          style={fixTextAlignment}
          onChangeText={setDraft}
          onBlur={handleBlur}
          onSubmitEditing={handleSave}
        />
      </View>
      <View className="flex-row flex-wrap justify-start gap-2">
        <Button
          mode="secondary"
          containerClassName="!min-w-0 !py-2 !px-3"
          textClassName="!text-xs"
          onPress={handleCancel}
        >
          {t('cancelButton')}
        </Button>
        <Button
          containerClassName="!min-w-0 !py-2 !px-3"
          textClassName="!text-xs"
          loading={isSaving}
          onPress={handleSave}
        >
          {t('saveButton')}
        </Button>
      </View>
    </View>
  );
};

export default React.memo(VaultNameEditor);
