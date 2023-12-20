import React from 'react';
import Toast, { BaseToast, InfoToast } from 'react-native-toast-message';

/*
  1. Create the config
  Some other props that can be passed to BaseToast or ErrorToast...:
  
      style={{ borderLeftColor: 'pink' }}
      contentContainerStyle={{ paddingHorizontal: 15 }}
*/
const toastConfig = {
  /*
    Overwrite 'success' type,
    by modifying the existing `BaseToast` component
  */
  success: (props: React.ComponentProps<typeof BaseToast>) => (
    <BaseToast
      {...props}
      text1Style={{ fontSize: 17 }}
      text2Style={{ fontSize: 15 }}
      text2NumberOfLines={3}
      style={[
        props.style,
        {
          height: undefined,
          maxHeight: 200,
          paddingVertical: 5
        }
      ]}
    />
  ),
  /*
    Overwrite 'error' type,
    by modifying the existing `ErrorToast` component
  */
  error: (props: React.ComponentProps<typeof InfoToast>) => (
    <InfoToast
      {...props}
      text1Style={{ fontSize: 17 }}
      text2Style={{ fontSize: 15 }}
      text2NumberOfLines={3}
      style={[
        props.style,
        {
          height: undefined,
          maxHeight: 200,
          paddingVertical: 5,
          borderLeftColor: '#FE6301'
        }
      ]}
    />
  ),
  /*
    Overwrite 'error' type,
    by modifying the existing `ErrorToast` component
  */
  info: (props: React.ComponentProps<typeof InfoToast>) => (
    <InfoToast
      {...props}
      text1Style={{ fontSize: 17 }}
      text2Style={{ fontSize: 15 }}
      text2NumberOfLines={3}
      style={[
        props.style,
        {
          height: undefined,
          maxHeight: 200,
          paddingVertical: 5
        }
      ]}
    />
  )
};
export const CustomToast = (props: React.ComponentProps<typeof Toast>) => (
  <Toast {...props} config={toastConfig} />
);
export { Toast };
