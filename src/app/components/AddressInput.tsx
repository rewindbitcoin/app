//This is basically a TextInput with 3 buttons: [CREATE NEW][PASTE][SCAN]
//CREATE NEW is for Vaults

import React from 'react';
import { TextInput } from '../../common/ui';

function AddressInput() {
  return <TextInput style={{ width: 300 }} />;
}
export default React.memo(AddressInput);
