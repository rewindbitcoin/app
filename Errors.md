- Tengo un monton de toasts que no deberían aparecer si la causa principal

- Si voy muy rapudo a creat un Vault me da error q aun no esta set el feeEstiamtes
muchos de esos...

- revisar todas mis llamadas a mis propias apis - ahí tengo q tener toast
    buscar en lvim -> "fetch("
      const response = await fetch(`${serviceAddressAPI}/get`);

es que a) No tengo acceso a Internet b) RewindBitcion está caído.
En ese caso simplemente mostrar un mensaje de error permanente. Diciendo
que will keep retrying every 60 seconds (tap to retry now)

 | Importante tengo los fetchVaultStatus que hacen uso de explorer.fetch y 
 || ya me han dado error durante un fetcg... hacer un retrial y hacer un toast...
 || handle eso
 ||   -> Asociado con esto, si quito la red y hago un refresh, me salen 2 veces
 ||   el mismo mensaje de error toast de fee-estimates...
 ||   En realidad debería tener el mensaje de q no hay red. y no repetir mensajes toast...
 ||   Probar todo tipo de errores de red como el de arriba con los vault.


Problems:
  do not repeat messages...
    -> fee Estimates too many times
  Dont let the app move if the app/wallet is experiencing an error:
    - fees incorrect ?
    - Show USD if values not correct ?
    - Incorrect sync ?
    - Old data, so do not allow to create vault/txs... ?
    
  Some errors are recoverable:  
    -> network
  Some are not recoverable:
    -> storage error
    -> many of the throw new Error() that i force

BTC/USD errors...

serviceApi errors...

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
    en useFaucet
 - sync
    - But handling is pretty bad because if network fails then it
    basically errors that feeEstimates was bad
    - Here I have fetchVaultStatus that does not retry...

Explorer should retry stuff...
Explorer should already return some error stuff?
