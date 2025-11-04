// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { validatePassword } from '../lib/validators';
import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  useMemo
} from 'react';

import { Platform, View, Text, TextInput } from 'react-native';
import { Modal, Button } from '../../common/ui';
import { useTranslation } from 'react-i18next';

const Password = ({
  mode,
  isVisible,
  onPassword,
  onCancel,
  onContinueWithoutPassword
}: {
  mode: 'REQUEST' | 'FORCED_SET' | 'OPTIONAL_SET';
  isVisible: boolean;
  onPassword: (password: string) => void;
  onCancel: () => void;
  onContinueWithoutPassword?: () => void;
}) => {
  const [password, setPassword] = useState<string>();
  const { t } = useTranslation();
  const handleCancel = useCallback(() => {
    setPassword(undefined);
    onCancel();
  }, [onCancel]);
  const handleContinueWithoutPassword = useCallback(() => {
    setPassword(undefined);
    if (!onContinueWithoutPassword)
      throw new Error(
        'onContinueWithoutPassword must be set for FORCED_SET mode'
      );
    onContinueWithoutPassword();
  }, [onContinueWithoutPassword]);
  const handlePassword = useCallback(() => {
    setPassword(undefined);
    if (!password) throw new Error(`Password should have been set`);
    onPassword(password);
  }, [onPassword, password]);
  const handleOnSubmitEditing = useCallback(() => {
    if (password && validatePassword(password).isValid) handlePassword();
  }, [password, handlePassword]);

  const onChangePassword = useCallback((password: string) => {
    setPassword(password);
  }, []);

  //https://github.com/necolas/react-native-web/issues/1645#issuecomment-958339838
  const input = useRef<TextInput>(null);
  useEffect(() => {
    //console.log(input.current);
    const timer = setTimeout(() => {
      if (isVisible) input.current?.focus();
    }, 100);

    // Cleanup function
    return () => clearTimeout(timer);
  }, [isVisible]);

  // NativeWind's `text-base` sets a lineHeight, which causes a subtle jump/flicker
  // on each keystroke in TextInput. This is a known React Native quirk.
  // Setting lineHeight to `undefined` prevents layout recalculations while typing.
  const fixTextFlicker = useMemo(() => ({ lineHeight: undefined }), []);

  return (
    <Modal
      title={
        mode === 'FORCED_SET'
          ? t('wallet.focedSetPasswordTitle')
          : mode === 'OPTIONAL_SET'
            ? t('wallet.optionalSetPasswordTitle')
            : t('wallet.requestPasswordTitle')
      }
      closeButtonText={t('cancelButton')}
      icon={{ family: 'AntDesign', name: 'form' }}
      isVisible={isVisible}
      onClose={handleCancel}
      customButtons={
        <View className="items-center pb-4 gap-2 mobmed:gap-6 mobmed:gap-y-4 flex-row flex-wrap justify-center">
          {mode === 'OPTIONAL_SET' ? (
            <Button mode="secondary" onPress={handleContinueWithoutPassword}>
              {t('wallet.skipOptionalSetPasswordButton')}
            </Button>
          ) : (
            <Button mode="secondary" onPress={handleCancel}>
              {t('cancelButton')}
            </Button>
          )}
          <Button
            disabled={
              password === undefined || !validatePassword(password).isValid
            }
            onPress={handlePassword}
          >
            {mode === 'FORCED_SET' || mode === 'OPTIONAL_SET'
              ? t('wallet.setPasswordButton')
              : t('wallet.requestPasswordButton')}
          </Button>
        </View>
      }
    >
      <View className="px-2">
        <Text className="text-base pb-6">
          {mode === 'FORCED_SET'
            ? t('wallet.forcedSetPasswordText')
            : mode === 'OPTIONAL_SET'
              ? t('wallet.optionalSetPasswordText')
              : t('wallet.requestPasswordText')}
        </Text>
        {password && !validatePassword(password).isValid && (
          <Text className="text-notification text-sm pb-2">
            {validatePassword(password).error === 'TOO_SHORT'
              ? t('wallet.password.validation.tooShort')
              : t('wallet.password.validation.tooLong')}
          </Text>
        )}
        <TextInput
          value={password || ''}
          enablesReturnKeyAutomatically
          onSubmitEditing={handleOnSubmitEditing}
          ref={input}
          keyboardType={Platform.select({
            android: 'visible-password',
            default: 'default'
          })}
          autoComplete="off"
          spellCheck={false}
          autoCorrect={false}
          autoCapitalize="none"
          maxLength={32}
          {...(Platform.OS === 'ios' ? { textContentType: 'newPassword' } : {})}
          onChangeText={onChangePassword}
          className="text-base outline-none flex-1 web:w-full rounded bg-slate-200 py-2 px-4"
          style={fixTextFlicker}
        />
      </View>
    </Modal>
  );
};

export default Password;
