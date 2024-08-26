# Errores

Si voy muy rápido a creat un Vault me da error q aun no esta set el feeEstiamtes
muchos de esos... Esto me puede pasar cuando creo una wallet con una networkId
q no tengo en Storage. Hacer un wait... o bien no mostrar el boton de
enviar/redcibir/vaultear

Do not let pass from the HomeScreen if netErrors are present.
Go back to HomeScreen if netErrors are present.

Backup errors...

Network errors...

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
