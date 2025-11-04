//export function time<T>(label: string, fn: () => T): T {
//  const t0 = global?.performance?.now?.() ?? Date.now();
//  try {
//    return fn();
//  } finally {
//    const t1 = global?.performance?.now?.() ?? Date.now();
//    console.log(
//      `REQUIRE (DescriptorsFactory.ts) ${label} took ${Math.round(t1 - t0)}ms`
//    );
//  }
//}
//
//import * as secp256k1 from '@bitcoinerlab/secp256k1';
//import { DescriptorsFactory } from '@bitcoinerlab/descriptors';
//const { Output, BIP32, expand, ECPair, parseKeyExpression } = time(
//  'DescriptorsFactory(secp256k1)',
//  () => DescriptorsFactory(secp256k1)
//);
//export { Output, BIP32, expand, ECPair, parseKeyExpression };

//The call to DescriptorsFactory is very slow. Also importing
//'@bitcoinerlab/descriptors' can get slow too.
//We postpone loading it after the App is rendered. This prevents slow boot
//on slow Android devices
import { type DescriptorsFactory } from '@bitcoinerlab/descriptors';
type DescriptorsFactoryInstance = ReturnType<typeof DescriptorsFactory>;
let _instance: DescriptorsFactoryInstance | null = null;

/** Synchronous, lazy, shared singleton of the DescriptorsFactory result */
export function ensureDescriptorsFactoryInstance() {
  if (_instance) return _instance;

  //const t0 = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const secp = require('@bitcoinerlab/secp256k1');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DescriptorsFactory } = require('@bitcoinerlab/descriptors');

  _instance = DescriptorsFactory(secp);
  if (!_instance) throw new Error('DescriptorsFactory failed');

  //const t1 = Date.now();
  //console.log(
  //  `REQUIRE (descriptors) DescriptorsFactory + deps took ${Math.round(t1 - t0)}ms`
  //);

  return _instance;
}

/** optional: prewarm after first frame */
export function preloadDescriptorsFactoryInstance() {
  try {
    ensureDescriptorsFactoryInstance();
  } catch {}
}
