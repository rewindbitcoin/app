import React from 'react';
import Toast, { BaseToast, InfoToast } from 'react-native-toast-message';
import type { ViewStyle, StyleProp } from 'react-native';

/*
  1. Create the config
  Some other props that can be passed to BaseToast or ErrorToast...:
  
      style={{ borderLeftColor: 'pink' }}
      contentContainerStyle={{ paddingHorizontal: 15 }}
*/

const createToastComponent =
  (
    ToastComponent: React.ComponentType<React.ComponentProps<typeof BaseToast>>,
    uniqueStyle: StyleProp<ViewStyle> = {}
  ) =>
  (props: React.ComponentProps<typeof BaseToast>) => {
    if (typeof uniqueStyle !== 'object')
      throw new Error('uniqueStyle must be object');
    return (
      <ToastComponent
        {...props}
        text1Style={{ fontSize: 16 }}
        text2Style={{ fontSize: 14, paddingTop: 5 }}
        text2NumberOfLines={5}
        style={[
          props.style,
          {
            height: null,
            maxHeight: 200,
            paddingVertical: 10,
            ...uniqueStyle
          }
        ]}
      />
    );
  };

const toastConfig = {
  success: createToastComponent(BaseToast),
  error: createToastComponent(BaseToast, { borderLeftColor: '#FE6301' }),
  info: createToastComponent(InfoToast, { borderLeftColor: '#FE6301' })
};

export const CustomToast = (props: React.ComponentProps<typeof Toast>) => (
  <Toast {...props} config={toastConfig} />
);
export { Toast };
