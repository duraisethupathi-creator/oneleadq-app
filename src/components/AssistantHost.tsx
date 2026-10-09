import React from "react";
import { StyleSheet, View } from "react-native";

import FloatingAssistant from "./FloatingAssistant";

export default function AssistantHost() {
  return (
    <View
      pointerEvents="box-none"
      style={styles.container}
    >
      <FloatingAssistant />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    pointerEvents: "box-none",
    zIndex: 9999,
    elevation: 20,
  },
});