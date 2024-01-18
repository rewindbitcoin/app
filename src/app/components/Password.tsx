import { validatePassword } from '../lib/validators';
import { rgba } from 'polished';
import React, { useState, useRef, useEffect } from 'react';

import { Platform, View } from 'react-native';
import { Text, TextInput, Button } from '../../common/components/ui';
import { useTheme } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

export default ({
  onPassword
}: {
  onPassword: (password: string | undefined) => void;
}) => {
  const { t } = useTranslation();
  const [password, setPassword] = useState<string>();
  const theme = useTheme();

  //https://github.com/necolas/react-native-web/issues/1645#issuecomment-958339838
  const input = useRef<TextInput>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (input.current) {
        input.current.focus();
      }
    }, 100);

    // Cleanup function
    return () => clearTimeout(timer);
  }, []);
  return (
    <>
      <Text style={{ marginBottom: 20 }}>
        {t('wallet.requestPasswordText')}
      </Text>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}
      >
        <TextInput
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
          onChangeText={password => setPassword(password)}
          style={{
            flex: 1,
            marginRight: 20,
            ...Platform.select({
              //clean style for web browsers
              web: {
                outlineStyle: 'none'
              }
            }),
            borderWidth: 1,
            padding: 5,
            borderRadius: 5,
            fontSize: 16,
            backgroundColor: rgba(theme.colors.primary, 0.1),
            borderColor: rgba(theme.colors.primary, 0.5)
          }}
        />
        <Button
          disabled={password === undefined || !validatePassword(password)}
          onPress={() => {
            onPassword(
              password !== undefined && validatePassword(password)
                ? password
                : undefined
            );
          }}
        >
          {t('confirmButton')}
        </Button>
      </View>
    </>
  );
};
