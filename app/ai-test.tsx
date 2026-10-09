import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  askOneLeadQAgent,
  checkAIAgentHealth,
} from "../src/services/aiAgent";

export default function AITestScreen() {
  const [message, setMessage] = useState(
    "Create a Facebook ads strategy for Catchy Decors with 500 rupees daily budget"
  );

  const [reply, setReply] = useState("");
  const [agent, setAgent] = useState("");
  const [model, setModel] = useState("");
  const [status, setStatus] = useState("Not checked");
  const [loading, setLoading] = useState(false);

  const checkConnection = async () => {
    setLoading(true);

    try {
      const result = await checkAIAgentHealth();

      if (result.connected) {
        setStatus("Connected ✅");
        Alert.alert(
          "AI Agent",
          "OneLeadQ AI Agent connected successfully."
        );
      } else {
        setStatus("Disconnected ❌");
      }
    } catch {
      setStatus("Disconnected ❌");
    } finally {
      setLoading(false);
    }
  };

  const askAI = async () => {
    if (!message.trim()) {
      Alert.alert("Message required");
      return;
    }

    setLoading(true);
    setReply("");

    try {
      const result = await askOneLeadQAgent(message);

      setAgent(result.agent || "Unknown Agent");
      setModel(result.model || "Unknown Model");
      setReply(result.reply || "No response");
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unable to connect to AI Agent";

      setReply(`Error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>OneLeadQ AI Test</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Backend Status</Text>
          <Text style={styles.status}>{status}</Text>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={checkConnection}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              Check Connection
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Ask OneLeadQ AI</Text>

          <TextInput
            style={styles.input}
            value={message}
            onChangeText={setMessage}
            multiline
            placeholder="Ask SEO, Meta Ads, Google Ads..."
          />

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={askAI}
            disabled={loading}
          >
            <Text style={styles.buttonText}>Ask AI</Text>
          </TouchableOpacity>
        </View>

        {loading && (
          <ActivityIndicator
            size="large"
            style={styles.loader}
          />
        )}

        {!!reply && (
          <View style={styles.card}>
            <Text style={styles.agent}>
              Agent: {agent}
            </Text>

            <Text style={styles.model}>
              Model: {model}
            </Text>

            <Text style={styles.reply}>
              {reply}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },

  content: {
    padding: 20,
  },

  title: {
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 20,
    color: "#ffffff",
  },

  card: {
    backgroundColor: "#1e293b",
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },

  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
    marginBottom: 10,
  },

  status: {
    fontSize: 16,
    color: "#e2e8f0",
    marginBottom: 12,
  },

  input: {
    minHeight: 120,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    textAlignVertical: "top",
    marginBottom: 14,
  },

  primaryButton: {
    backgroundColor: "#2563eb",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },

  secondaryButton: {
    backgroundColor: "#475569",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },

  buttonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
  },

  loader: {
    marginVertical: 20,
  },

  agent: {
    color: "#22c55e",
    fontWeight: "700",
    marginBottom: 6,
  },

  model: {
    color: "#94a3b8",
    marginBottom: 12,
  },

  reply: {
    color: "#ffffff",
    fontSize: 15,
    lineHeight: 22,
  },
});