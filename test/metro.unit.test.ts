// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

jest.mock('expo/metro-config', () => ({
  getDefaultConfig: () => ({
    transformer: {},
    resolver: { assetExts: ['png', 'svg'], sourceExts: ['js', 'ts'] }
  })
}));
jest.mock('nativewind/metro', () => ({
  withNativeWind: (config: unknown) => config
}));

const { resolver } = jest.requireActual('../metro.config.js');

describe('platform-scoped Sodium resolution', () => {
  test.each([
    ['react-native-libsodium', 'react-native-libsodium/src/index.ts'],
    ['libsodium-wrappers', 'libsodium-wrappers'],
    ['libsodium-wrappers-sumo', 'libsodium-wrappers-sumo']
  ])('resolves the existing web entry for %s', (name, entry) => {
    const fallback = jest.fn();
    expect(
      resolver.resolveRequest({ resolveRequest: fallback }, name, 'web')
    ).toEqual({
      type: 'sourceFile',
      filePath: require.resolve(entry!)
    });
    expect(fallback).not.toHaveBeenCalled();
  });

  test.each(['android', 'ios'])(
    'keeps native package resolution unchanged on %s',
    platform => {
      for (const name of [
        'react-native-libsodium',
        'libsodium-wrappers',
        'libsodium-wrappers-sumo'
      ]) {
        const expected = { type: 'sourceFile', filePath: 'native-entry.ts' };
        const fallback = jest.fn(() => expected);
        const context = { resolveRequest: fallback };
        expect(resolver.resolveRequest(context, name, platform)).toBe(expected);
        expect(fallback).toHaveBeenCalledWith(context, name, platform);
      }
    }
  );

  test('does not override unrelated web packages', () => {
    const expected = { type: 'sourceFile', filePath: 'other-entry.js' };
    const fallback = jest.fn(() => expected);
    const context = { resolveRequest: fallback };
    expect(resolver.resolveRequest(context, 'react', 'web')).toBe(expected);
    expect(fallback).toHaveBeenCalledWith(context, 'react', 'web');
  });
});
