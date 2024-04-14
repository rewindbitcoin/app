import rnfe from 'react-native-fast-encoder';
import { Platform } from 'react-native';

let TextEncoder: typeof window.TextEncoder | typeof rnfe;
let TextDecoder: typeof window.TextDecoder | typeof rnfe;

if (Platform.OS === 'web') {
  if (
    typeof window === 'undefined' ||
    !window.TextEncoder ||
    !window.TextDecoder
  )
    throw new Error('Browser should support TextEncoder / TextDecoder');
  TextEncoder = window.TextEncoder;
  TextDecoder = window.TextDecoder;
} else {
  if (typeof global === 'undefined')
    throw new Error(
      'This environment is not either browser or node/react native'
    );
  TextEncoder =
    (global as { TextEncoder?: typeof TextEncoder }).TextEncoder || rnfe;
  TextDecoder =
    (global as { TextDecoder?: typeof TextDecoder }).TextDecoder || rnfe;
}
export { TextEncoder, TextDecoder };
