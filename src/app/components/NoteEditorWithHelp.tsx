// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import LabelEditor from './LabelEditor';

const NoteEditorWithHelp = ({
  label,
  placeholder,
  disabled = false,
  className = '',
  editorClassName = 'w-full',
  addActionText,
  editActionText,
  helpToggleText,
  hideHelpText,
  helpText,
  resetKey,
  onSave
}: {
  label: string;
  placeholder: string;
  disabled?: boolean;
  className?: string;
  editorClassName?: string;
  addActionText?: string;
  editActionText?: string;
  helpToggleText: string;
  hideHelpText: string;
  helpText: string;
  resetKey?: unknown;
  onSave: (label: string) => Promise<void> | void;
}) => {
  const [showHelp, setShowHelp] = useState(false);
  const toggleHelp = useCallback(() => setShowHelp(value => !value), []);
  const hideHelp = useCallback(() => setShowHelp(false), []);

  useEffect(() => {
    setShowHelp(false);
  }, [resetKey]);

  return (
    <View className={`gap-2 ${className}`}>
      <LabelEditor
        className={editorClassName}
        label={label}
        placeholder={placeholder}
        disabled={disabled}
        {...(addActionText !== undefined ? { addActionText } : {})}
        {...(editActionText !== undefined ? { editActionText } : {})}
        trailingAction={
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            className="active:opacity-70"
            onPress={toggleHelp}
          >
            <Text className="text-xs font-medium text-slate-500 underline">
              {showHelp ? hideHelpText : helpToggleText}
            </Text>
          </Pressable>
        }
        onStartEditing={hideHelp}
        onSave={onSave}
      />
      {showHelp ? (
        <View className="rounded-lg bg-slate-100 px-3 py-3">
          <Text className="text-xs leading-5 text-slate-600">{helpText}</Text>
        </View>
      ) : null}
    </View>
  );
};

export default React.memo(NoteEditorWithHelp);
