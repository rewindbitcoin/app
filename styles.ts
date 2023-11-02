import { StyleSheet } from "react-native";
export default StyleSheet.create({
  container: { backgroundColor: "#fff", flex: 1 },
  settings: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingRight: 10,
    paddingTop: 5,
  },
  mnemo: {
    marginBottom: 40,
    marginRight: 20,
    marginLeft: 20,
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DADADA",
    backgroundColor: "#F5F5F5",
    textAlign: "center",
    fontSize: 16,
    color: "#333",
  },
  contentContainer: { alignItems: "center", paddingTop: 40 },
  hotBalance: {
    fontSize: 16,
    fontWeight: "500", // Semi-bold
    marginVertical: 8, // Vertical spacing
    color: "#444", // Darker grey for emphasis
  },
  modal: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "white",
    zIndex: 2,
  },
  buttonClose: { marginTop: 40 },
  addressText: { marginTop: 20 },
  factoryReset: { marginTop: 20 },
  buttonGroup: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 20,
    marginTop: 20,
  },
  vaults: { width: "80%" },
  vaultContainer: {
    borderWidth: 1,
    borderColor: "#d1d1d1",
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
    backgroundColor: "#f7f7f7",
  },
});
