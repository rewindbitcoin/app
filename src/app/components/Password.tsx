import { validatePassword } from '../lib/validators';
import React, { useRef, useEffect, useCallback, useState } from 'react';

import { Platform, View } from 'react-native';
import { Modal, Text, TextInput, Button } from '../../common/ui';
import { useTranslation } from 'react-i18next';

const Password = ({
  isVisible,
  onPassword,
  onCancel
}: {
  isVisible: boolean;
  onPassword: (password: string) => void;
  onCancel: () => void;
}) => {
  const [password, setPassword] = useState<string>();
  const { t } = useTranslation();
  const handleCancel = useCallback(() => {
    setPassword(undefined);
    onCancel();
  }, [onCancel]);
  const handlePassword = useCallback(() => {
    setPassword(undefined);
    if (!password) throw new Error(`Password should have been set`);
    onPassword(password);
  }, [onPassword, password]);
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
  return (
    <Modal
      title={t('wallet.requestPasswordTitle')}
      closeButtonText={t('cancelButton')}
      icon={{ family: 'AntDesign', name: 'form' }}
      isVisible={isVisible}
      onClose={handleCancel}
      customButtons={
        <View className="items-center pb-4 gap-6 flex-row justify-center">
          <Button onPress={handleCancel}>{t('cancelButton')}</Button>
          <Button
            disabled={password === undefined || !validatePassword(password)}
            onPress={handlePassword}
          >
            {t('wallet.setNewPasswordButton')}
          </Button>
        </View>
      }
    >
      <View className="px-2">
        <Text className="pb-6">{t('wallet.requestPasswordText')}</Text>
        <TextInput
          value={password}
          enablesReturnKeyAutomatically
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
          className="outline-none flex-1 web:w-full rounded bg-slate-200 py-2 px-4"
        />
      </View>
    </Modal>
  );
};

export default Password;
