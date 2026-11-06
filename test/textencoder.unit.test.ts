// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('react-native-fast-encoder', () => {
  throw new Error('Native encoder must not be loaded by web');
});

test('uses browser text encoders without initializing a native module', () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const browserEncoders = jest.requireActual('util');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      TextEncoder: browserEncoders.TextEncoder,
      TextDecoder: browserEncoders.TextDecoder
    }
  });
  try {
    const { TextEncoder, TextDecoder } = jest.requireActual(
      '../dist/src/common/lib/textencoder'
    );
    expect(TextEncoder).toBe(browserEncoders.TextEncoder);
    expect(TextDecoder).toBe(browserEncoders.TextDecoder);
    const message = 'Español 日本語 🔑';
    expect(new TextDecoder().decode(new TextEncoder().encode(message))).toBe(
      message
    );
  } finally {
    if (previousWindow)
      Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
