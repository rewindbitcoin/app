// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, useToast } from '../../common/ui';

const MAX_LABEL_LENGTH = 255;

const RawLabelEditor = ({
  label,
  placeholder,
  disabled = false,
  className = '',
  editActionText,
  onSave
}: {
  label: string;
  placeholder: string;
  disabled?: boolean;
  className?: string;
  editActionText?: string;
  onSave: (label: string) => Promise<void> | void;
}) => {
  const { t } = useTranslation();
  const toast = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const [isSaving, setIsSaving] = useState(false);

  // NativeWind's text size classes set lineHeight, which can offset single-line
  // TextInput content vertically on native platforms.
  const fixTextAlignment = useMemo(() => ({ lineHeight: undefined }), []);

  useEffect(() => {
    if (!isEditing) setDraft(label);
  }, [isEditing, label]);

  const handleCancel = useCallback(() => {
    setDraft(label);
    setIsEditing(false);
  }, [label]);

  const handleBlur = useCallback(() => {
    if (draft === label) setIsEditing(false);
  }, [draft, label]);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onSave(draft);
      setIsEditing(false);
    } catch (error) {
      console.warn('Failed to save label', error);
      toast.show(t('labels.saveError'), { type: 'warning' });
    } finally {
      setIsSaving(false);
    }
  }, [draft, isSaving, onSave, t, toast]);

  const actions = (
    <View className="flex-row flex-wrap justify-end gap-2">
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
  );

  if (isEditing) {
    return (
      <View className={`gap-2 ${className}`}>
        <TextInput
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
          value={draft}
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
          maxLength={MAX_LABEL_LENGTH}
          autoFocus={true}
          // Let the keyboard's Done/Aceptar key save the label so users do not
          // need to dismiss the keyboard to reach Save. Do not use
          // enablesReturnKeyAutomatically: an empty label is valid and removes
          // the label, so Done must remain available after clearing the input.
          returnKeyType="done"
          style={fixTextAlignment}
          onChangeText={setDraft}
          onBlur={handleBlur}
          onSubmitEditing={handleSave}
        />
        {actions}
      </View>
    );
  }

  return (
    <View className={`flex-row flex-wrap items-center gap-2 ${className}`}>
      {label ? (
        <Text className="rounded-full bg-primary-light px-2 py-1 text-xs font-medium text-primary-dark">
          {label}
        </Text>
      ) : null}
      <Pressable
        hitSlop={8}
        disabled={disabled}
        className={disabled ? 'opacity-50' : 'active:opacity-70'}
        onPress={() => setIsEditing(true)}
      >
        <Text className="text-xs font-medium text-primary">
          {label ? editActionText ?? t('labels.edit') : t('labels.add')}
        </Text>
      </Pressable>
    </View>
  );
};

export default React.memo(RawLabelEditor);
