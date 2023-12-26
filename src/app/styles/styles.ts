import { StyleSheet } from 'react-native';
export default StyleSheet.create({
  container: { backgroundColor: '#fff', flex: 1 },
  contentContainer: { alignItems: 'center', paddingTop: 40 },
  hotBalance: {
    fontSize: 16,
    fontWeight: '500', // Semi-bold
    marginVertical: 8, // Vertical spacing
    color: '#444' // Darker grey for emphasis
  },
  modal: {
    //TODO: this one should not exist after I get rid of all modals and start using reactnagivation modals
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
    zIndex: 2
  },
  buttonClose: { marginTop: 40 },
  addressText: { marginTop: 20 },
  buttonGroup: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    marginTop: 20
  },
  vaults: { width: '80%' },
  vaultContainer: {
    borderWidth: 1,
    borderColor: '#d1d1d1',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
    backgroundColor: '#f7f7f7'
  }
});
