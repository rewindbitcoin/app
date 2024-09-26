import { TFunction } from 'i18next';
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, Button } from 'react-native';

interface Props {
  children: ReactNode;
  t: TFunction;
  //catchUhandleRejections: boolean;
  onError: (error: unknown) => void;
}
interface State {
  error: unknown;
}

// FIXME:
// https://eddiewould.com/2021/28/28/handling-rejected-promises-error-boundary-react/
// The problem is addEventListener('unhandledrejection'
// is not available in react-native
export default class ErrorBoundary extends Component<Props, State> {
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
        <View style={{ flex: 1, marginTop: 40, padding: 16, paddingTop: 40 }}>
          <Text>{this.props.t('globalError.general')}</Text>
          <Text style={{ marginVertical: 32 }}>
            {this.state.error.toString()}
          </Text>
          <Button
            title={this.props.t('tryAgain')}
            onPress={() => this.props.onError(this.state.error)}
          />
        </View>
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
