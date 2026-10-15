import React, { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

import {
  loadClients,
  loadCurrentClientId,
} from "../../src/storage/clientStorage";

import { Client } from "../../src/types/client";
import { AgencyTask } from "../../src/types/task";
import { loadTasks, saveTasks } from "../../src/storage/taskStorage";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  askOneLeadQAgent,
  checkAIAgentHealth,
} from "../../src/services/aiAgent";

import { colors } from "../../src/theme";
import WebDevelopmentPanel from "../../src/components/WebDevelopmentPanel";
import { getWebDevelopmentSessionToken } from "../../src/services/webDevelopmentSession";

// Clean Gemini Markdown response
// Clean Gemini Markdown response
function formatAIResponse(text: string) {
  return text
    // Remove markdown headings
    .replace(/^###\s+/gm, "")
    .replace(/^##\s+/gm, "")
    .replace(/^#\s+/gm, "")

    // Remove bold markdown: **text**
    .replace(/\*\*(.*?)\*\*/g, "$1")

    // Remove italic markdown: *text*
    .replace(/\*([^*\n]+)\*/g, "$1")

    // Convert markdown bullets
    .replace(/^\s*[-*]\s+/gm, "• ")

    // Remove backticks
    .replace(/`([^`]+)`/g, "$1")
    // Remove markdown horizontal separators
    .replace(/^\s*---+\s*$/gm, "")
    // Clean excessive blank lines
    .replace(/\n{3,}/g, "\n\n")

    .trim();
}
function getSmartTaskDetails(
  title: string,
  response: string
): {
  priority: "low" | "medium" | "high";
  dueDate: string;
  approval: "draft" | "waiting";
} {
  const text = `${title} ${response}`.toLowerCase();

  const dueDate = new Date();

  let priority: "low" | "medium" | "high" = "medium";
  let daysToAdd = 2;
  let approval: "draft" | "waiting" = "draft";

  // Urgent / campaign work
  if (
    text.includes("urgent") ||
    text.includes("launch") ||
    text.includes("campaign") ||
    text.includes("meta ads") ||
    text.includes("google ads")
  ) {
    priority = "high";
    daysToAdd = 1;
  }

  // SEO / development work
  else if (
    text.includes("seo") ||
    text.includes("website") ||
    text.includes("development") ||
    text.includes("technical")
  ) {
    priority = "medium";
    daysToAdd = 3;
  }

  // Content work
  else if (
    text.includes("content") ||
    text.includes("caption") ||
    text.includes("post") ||
    text.includes("reel")
  ) {
    priority = "medium";
    daysToAdd = 2;
  }

  // Research / ideas
  else if (
    text.includes("research") ||
    text.includes("idea") ||
    text.includes("suggest")
  ) {
    priority = "low";
    daysToAdd = 5;
  }

  // Work that normally needs client approval
  if (
  text.includes("meta ads") ||
  text.includes("google ads") ||
  text.includes("ad campaign") ||
  text.includes("campaign launch") ||
  text.includes("creative approval") ||
  text.includes("publish")
) {
  approval = "waiting";
}

  dueDate.setDate(
    dueDate.getDate() + daysToAdd
  );

  return {
    priority,
    dueDate: dueDate
      .toISOString()
      .slice(0, 10),
    approval,
  };
}
export default function AI() {
    const [currentClient, setCurrentClient] = useState<Client | null>(null);
    useFocusEffect(
  useCallback(() => {
    let active = true;

    const loadCurrentClient = async () => {
      try {
        const [clients, currentClientId] = await Promise.all([
          loadClients(),
          loadCurrentClientId(),
        ]);

        if (!active) return;

        const selectedClient =
          clients.find(
            (client) =>
              client.id === currentClientId &&
              client.status === "active"
          ) || null;

        setCurrentClient(selectedClient);
      } catch {
        if (active) {
          setCurrentClient(null);
        }
      }
    };

    loadCurrentClient();

    return () => {
      active = false;
    };
  }, [])
);
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [agent, setAgent] = useState("");
  const [model, setModel] = useState("");

  const [connected, setConnected] = useState<
    boolean | null
  >(null);

  const [loading, setLoading] = useState(false);
  const [webHandoff, setWebHandoff] = useState<{clientId:string;mode:"CREATE_NEW"|"UPGRADE_EXISTING";intent:string;nonce:number}>();
  const [webOpen, setWebOpen] = useState(false);
  useFocusEffect(useCallback(() => () => setWebOpen(false), []));

  const checkConnection = async () => {
    setLoading(true);

    try {
      const result = await checkAIAgentHealth();

      setConnected(result.connected === true);
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  };

  const askAI = async () => {
    const cleanMessage = message.trim();

    if (!cleanMessage || loading) {
      return;
    }

    setLoading(true);

    setWebHandoff(undefined);
    setWebOpen(false);
    setReply("");
    setAgent("");
    setModel("");

    try {
      const result = await askOneLeadQAgent(
  cleanMessage,
  currentClient
    ? {
        id: currentClient.id,
        name: currentClient.name,
        businessType: currentClient.businessType,
        website: currentClient.website,
        location: currentClient.location,
        services: currentClient.services,
        notes: currentClient.notes,
      }
    : undefined
);
      if (result.handoff?.kind === "web-development" && result.handoff.clientId === currentClient?.id) {
        setWebHandoff({clientId:currentClient.id,mode:result.handoff.mode,intent:result.handoff.intent,nonce:Date.now()});
      }
      setConnected(true);

      setAgent(
        result.agent || "OneLeadQ AI"
      );

      setModel(
        result.model || ""
      );

      setReply(
        result.reply || "No response received."
      );
    } catch (error) {
      setConnected(false);

      setReply(
        error instanceof Error
          ? error.message
          : "Unable to connect to OneLeadQ AI."
      );
    } finally {
      setLoading(false);
    }
  };
  const addAIResponseToTasks = async () => {
  if (!reply.trim()) {
    Alert.alert(
      "No AI Response",
      "Generate an AI response before adding a task."
    );
    return;
  }

  if (!currentClient) {
    Alert.alert(
      "No Current Client",
      "Please select a current client first."
    );
    return;
  }

  try {
    const existingTasks = await loadTasks();

    const cleanTitle =
      message.trim() ||
      `${agent || "AI"} Task`;

    const cleanNotes = formatAIResponse(reply);

    // Prevent the same AI response from being added twice
    const duplicateTask = existingTasks.some(
      (task) =>
        task.clientId === currentClient.id &&
        task.title.trim() === cleanTitle &&
        task.notes.trim() === cleanNotes &&
        task.status !== "completed"
    );

    if (duplicateTask) {
      Alert.alert(
        "Task Already Added",
        "This AI response is already in Tasks for this client."
      );
      return;
    }

    const now = new Date();

const smartDetails = getSmartTaskDetails(
  cleanTitle,
  cleanNotes
);

const newTask: AgencyTask = {
      id: `task-${Date.now()}`,
      title: cleanTitle,
      clientId: currentClient.id,
      clientName: currentClient.name,
      dueDate: smartDetails.dueDate,
priority: smartDetails.priority,
status:
  smartDetails.approval === "waiting"
    ? "waiting_approval"
    : "pending",
approval: smartDetails.approval,
      notes: cleanNotes,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    await saveTasks([
      newTask,
      ...existingTasks,
    ]);

    Alert.alert(
      "Task Added",
      `${newTask.title} added to ${currentClient.name} tasks.`
    );
  } catch (error) {
    console.error(
      "Add AI task failed:",
      error
    );

    Alert.alert(
      "Task Save Failed",
      "The AI response could not be added to Tasks."
    );
  }
};

  

  const quickPrompts = [
    "Create a Meta Ads strategy",
    "Give me an SEO improvement plan",
    "Create Google Ads keywords",
    "Write social media content",
  ];

  return (
    <KeyboardAvoidingView
      style={s.page}
      behavior={
        Platform.OS === "ios"
          ? "padding"
          : undefined
      }
    >
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* HEADER */}

        <View style={s.header}>
          <Text style={s.brand}>
            ONELEADQ
          </Text>

          <Text style={s.title}>
            AI Assistant
          </Text>

          <Text style={s.subtitle}>
            Ask one question. OneLeadQ automatically
            selects the right specialist agent.
          </Text>

          {/* CONNECTION STATUS */}

          <View style={s.statusRow}>
            <View
              style={[
                s.dot,

                connected === true
                  ? s.dotOnline
                  : connected === false
                  ? s.dotOffline
                  : s.dotUnknown,
              ]}
            />

            <Text style={s.statusText}>
              {connected === true
                ? "AI Agent Online"
                : connected === false
                ? "AI Agent Offline"
                : "Connection not checked"}
            </Text>

            <Pressable
              style={s.checkButton}
              onPress={checkConnection}
              disabled={loading}
            >
              <Text style={s.checkButtonText}>
  {loading
    ? "CHECKING..."
    : connected === true
    ? "ONLINE"
    : connected === false
    ? "RETRY"
    : "CHECK"}
</Text>
            </Pressable>
          </View>
        </View>
        
{currentClient && (
  <View style={s.clientContext}>
    <Text style={s.clientContextLabel}>CURRENT CLIENT</Text>

    <Text style={s.clientContextName}>
      {currentClient.name}
    </Text>

    <Text style={s.clientContextMeta}>
      {currentClient.businessType}
      {currentClient.location
        ? ` | ${currentClient.location}`
        : ""}
    </Text>
  </View>
)}
        {/* QUICK ACTIONS */}

        <Text style={s.sectionTitle}>
          Quick Actions
        </Text>

        <View style={s.quickGrid}>
          {quickPrompts.map((prompt) => (
            <Pressable
              key={prompt}
              style={s.quickButton}
              onPress={() =>
                setMessage(prompt)
              }
            >
              <Text style={s.quickText}>
                {prompt}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* CHAT INPUT */}

        <View style={s.chatCard}>
          <Text style={s.label}>
            Ask OneLeadQ AI
          </Text>

          <TextInput
            style={s.input}
            accessibilityLabel="AI prompt"
            value={message}
            onChangeText={setMessage}
            placeholder="Example: Create a ₹500/day Meta Ads strategy for Catchy Decors"
            placeholderTextColor="#8A949E"
            multiline
            textAlignVertical="top"
          />

          <Pressable
            style={[
              s.askButton,

              (!message.trim() || loading) &&
                s.askButtonDisabled,
            ]}
            onPress={askAI}
            disabled={
              !message.trim() || loading
            }
          >
            <Text style={s.askButtonText}>
              {loading
                ? "AI IS THINKING..."
                : "GENERATE / உருவாக்கு"}
            </Text>
          </Pressable>
        </View>

        {/* LOADING */}

        {loading && (
          <View style={s.loadingBox}>
            <ActivityIndicator
              size="large"
            />

            <Text style={s.loadingText}>
              OneLeadQ is selecting the best
              specialist agent...
            </Text>
          </View>
        )}

        {/* AI RESPONSE */}

        {!!reply && (
          <View style={s.responseCard}>
            {!!agent && (
              <View style={s.agentBadge}>
                <Text style={s.agentText}>
                  {agent}
                </Text>
              </View>
            )}

            {!!model && (
              <Text style={s.model}>
                Model: {model}
              </Text>
            )}

            <Text style={s.responseTitle}>
              AI Response
            </Text>

            <Text style={s.reply}>
              {formatAIResponse(reply)}
            </Text>
            {webHandoff && webHandoff.clientId === currentClient?.id && (
              <Pressable accessibilityRole="button" accessibilityLabel="Open Website Development workspace" style={s.addTaskButton} onPress={() => setWebOpen(true)}>
                <Text style={s.addTaskButtonText}>OPEN WEBSITE WORKSPACE / இணையதளம்</Text>
              </Pressable>
            )}
            {currentClient && agent && (
  <Pressable
    style={s.addTaskButton}
    onPress={addAIResponseToTasks}
  >
    <Text style={s.addTaskButtonText}>
      ADD TO TASKS
    </Text>
  </Pressable>
)}
          </View>
        )}
      </ScrollView>
      <Modal visible={webOpen && webHandoff?.clientId === currentClient?.id} animationType="slide" onRequestClose={() => setWebOpen(false)}>
        <View style={{flex:1,backgroundColor:colors.cream,paddingTop:48,paddingHorizontal:16}}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close Website Development workspace" onPress={() => setWebOpen(false)} style={s.askButton}><Text style={s.askButtonText}>CLOSE / மூடு</Text></Pressable>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingVertical:16,paddingBottom:48}}>
            {webOpen && webHandoff?.clientId === currentClient?.id && <WebDevelopmentPanel active={webOpen} handoff={webHandoff} getSessionToken={getWebDevelopmentSessionToken} />}
          </ScrollView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
    clientContext: {
  marginHorizontal: 20,
  marginTop: 18,
  padding: 16,
  backgroundColor: colors.white,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: "#E0D5A7",
},

clientContextLabel: {
  color: colors.muted,
  fontSize: 11,
  fontWeight: "800",
},
addTaskButton: {
  marginTop: 18,
  backgroundColor: colors.gold,
  paddingVertical: 14,
  borderRadius: 12,
  alignItems: "center",
},

addTaskButtonText: {
  color: colors.green,
  fontSize: 14,
  fontWeight: "900",
  letterSpacing: 0.5,
},
clientContextName: {
  color: colors.green,
  fontSize: 20,
  fontWeight: "900",
  marginTop: 4,
},

clientContextMeta: {
  color: colors.muted,
  marginTop: 4,
},
  page: {
    flex: 1,
    backgroundColor: colors.cream,
  },

  content: {
    // Keep the final response and task action scrollable above the 122px assistant.
    paddingBottom: 190,
  },

  header: {
    backgroundColor: colors.green,
    paddingTop: 58,
    paddingHorizontal: 20,
    paddingBottom: 24,

    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },

  brand: {
    color: colors.gold,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1.5,
  },

  title: {
    color: colors.white,
    fontSize: 30,
    fontWeight: "900",
    marginTop: 8,
  },

  subtitle: {
    color: "#D7E2DE",
    marginTop: 8,
    lineHeight: 20,
  },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
  },

  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },

  dotOnline: {
    backgroundColor: "#34D399",
  },

  dotOffline: {
    backgroundColor: "#EF4444",
  },

  dotUnknown: {
    backgroundColor: "#FBBF24",
  },

  statusText: {
    color: colors.white,
    flex: 1,
    fontWeight: "700",
  },

  checkButton: {
    borderWidth: 1,
    borderColor: colors.gold,

    paddingHorizontal: 12,
    paddingVertical: 7,

    borderRadius: 10,
  },

  checkButtonText: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: "900",
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.text,

    marginHorizontal: 20,
    marginTop: 22,
    marginBottom: 10,
  },

  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 14,
  },

  quickButton: {
    width: "46%",
    margin: "2%",

    padding: 14,
    minHeight: 72,

    justifyContent: "center",

    borderRadius: 15,

    backgroundColor: "#FFFDF6",

    borderWidth: 1,
    borderColor: "#E0D5A7",
  },

  quickText: {
    color: colors.green,
    fontWeight: "800",
    lineHeight: 19,
  },

  chatCard: {
    margin: 20,
    padding: 18,

    borderRadius: 20,

    backgroundColor: colors.white,
  },

  label: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",

    marginBottom: 12,
  },

  input: {
    minHeight: 130,

    borderWidth: 1,
    borderColor: "#D9D9D9",

    borderRadius: 14,

    padding: 14,

    fontSize: 16,
    color: colors.text,

    backgroundColor: "#FFFFFF",
  },

  askButton: {
    marginTop: 14,

    backgroundColor: colors.green,

    paddingVertical: 16,

    borderRadius: 14,

    alignItems: "center",
  },

  askButtonDisabled: {
    opacity: 0.5,
  },

  askButtonText: {
    color: colors.gold,
    fontWeight: "900",
    fontSize: 15,
  },

  loadingBox: {
    alignItems: "center",

    marginHorizontal: 20,
    marginBottom: 20,
  },

  loadingText: {
    marginTop: 10,
    color: colors.muted,
  },

  responseCard: {
    marginHorizontal: 20,
    marginBottom: 20,

    padding: 20,

    borderRadius: 20,

    backgroundColor: colors.green2,
  },

  agentBadge: {
    alignSelf: "flex-start",

    backgroundColor: colors.green,

    paddingHorizontal: 12,
    paddingVertical: 7,

    borderRadius: 20,

    marginBottom: 8,
  },

  agentText: {
    color: colors.gold,
    fontWeight: "900",
  },

  model: {
    color: "#B9C6C1",
    fontSize: 12,

    marginBottom: 14,
  },

  responseTitle: {
    color: colors.gold,
    fontSize: 18,
    fontWeight: "900",

    marginBottom: 10,
  },

  reply: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 23,
  },
});