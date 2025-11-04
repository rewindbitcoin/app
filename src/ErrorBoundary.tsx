// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { TFunction } from 'i18next';
import React, { Component, ErrorInfo, ReactNode, useMemo } from 'react';
import { View, Text, Button, StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from './common/ui';

interface Props {
  children: ReactNode;
  t: TFunction;
  //catchUhandleRejections: boolean;
  onError: (error: unknown) => void;
}

// Wrapper component to use hooks and pass them to the class component
export default function ErrorBoundary(props: Props) {
  const insets = useSafeAreaInsets();
  const containerStyle = useMemo(
    () => ({ marginBottom: insets.bottom / 4 + 16 }),
    [insets.bottom]
  );

  return <ErrorBoundaryClass {...props} containerStyle={containerStyle} />;
}

interface ErrorBoundaryClassProps extends Props {
  containerStyle: StyleProp<ViewStyle>;
}
interface State {
  error: unknown;
}

// FIXME:
// https://eddiewould.com/2021/28/28/handling-rejected-promises-error-boundary-react/
// The problem is addEventListener('unhandledrejection'
// is not available in react-native
class ErrorBoundaryClass extends Component<ErrorBoundaryClassProps, State> {
  //promiseRejectionHandler = (event: PromiseRejectionEvent) => {
  //  this.setState({
  //    error: event.reason
  //  });
  //};

  override state: State = {
    error: null
  };

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // handle the error (e.g., log to a server)
    console.error('Uncaught error:', error, errorInfo);
  }

  //FIXME: This only works on web - need to check how to add this on native
  //override componentDidMount() {
  //  // Add an event listener to the window to catch unhandled promise rejections & stash the error in the state
  //  addEventListener('unhandledrejection', this.promiseRejectionHandler);
  //}

  //override componentWillUnmount() {
  //  removeEventListener('unhandledrejection', this.promiseRejectionHandler);
  //}

  override render() {
    if (this.state.error) {
      return (
        <KeyboardAwareScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="items-center pt-5 px-4"
        >
          <View
            className="w-full max-w-screen-sm mx-4"
            style={this.props.containerStyle}
          >
            <Text>{this.props.t('globalError.general')}</Text>
            <Text style={{ marginVertical: 32 }}>
              {this.state.error.toString()}
            </Text>
            <Button
              title={this.props.t('tryAgain')}
              onPress={() => this.props.onError(this.state.error)}
            />
          </View>
        </KeyboardAwareScrollView>
      );
      /* more advanced usage example
      const error = this.state.error;

      let errorName;
      let errorMessage;

      if (error instanceof PageNotFoundErro) {
        errorName = '...';
        errorMessage = '...';
      } else if (error instanceof NoRolesAssignedError) {
        errorName = '...';
        errorMessage = '...';
      } else {
        errorName = 'Unexpected Application Error';
      }

      return (
        <FriendlyError errorName={errorName} errorMessage={errorMessage} />
      );
        */
    } else {
      return this.props.children;
    }
  }
}
