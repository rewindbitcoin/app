TAPE-> espero al sync -> desconecto internet -> sync manual -> reconecto -> espero a que wifi se conecte -> sync manual -> me sale de nuevo el toas de error seguido de el toast de ok

- Pasar una rutina que me fuerza un refresh de netStatus. Poner un "Check again" al lado
de los errores permanentes de NetStatus que hace un updateNetStatus, updateFeeEstimates y onTrue(sync)

- Ojo, tengo algun explorer.connect así como ensureConnected que puede hacer throw en WalletContext
    -> ensureConnected debería hacer un toast o algo o pasarlo a NetStatus o algo

- Si voy muy rapudo a creat un Vault me da error q aun no esta set el feeEstiamtes
muchos de esos... Esto me puede pasar cuando creo una wallet con una networkId q no tengo en Storage. Hacer un wait... o bien no mostrar el boton de enviar/redcibir/vaultear

- revisar todas mis llamadas a mis propias apis - ahí tengo q tener toast
    buscar en lvim -> "fetch("
      const response = await fetch(`${serviceAddressAPI}/get`);

Backup errors...

Network errors...
  - ensureConnected
  - explorer.fetchBlockHeight
  - explorer.fetchBlockStatus
  - explorer.fetchTxHistory

Some Network errors being handled:
 - pushTx
 - fetchOutputHistory
 - fetchServiceAddress
    -> Aqui si el faucet me falla printo 2 toasts... una en fetchOutputHistory y otra
        -> Además me hace un throw dentro del try!!! pero luego no lo capturo fuera?
    en useFaucet
- updateTipStatus
    - me hace swallow del error. Pero aquí no es correcto, no?
- updateBtcFiat
    - me hace swallow del error. Aquí es correcto.
- fetchP2PVaults
- p2pBackupVault -> hay un try catch
 - sync
    - But handling is pretty bad because if network fails then it
    basically errors that feeEstimates was bad
    - Here I have fetchVaultStatus that does not retry...
