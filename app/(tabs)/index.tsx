import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { loadContent } from "../../src/storage/contentStorage";
import { loadTasks } from "../../src/storage/taskStorage";
import { loadSEOIssues } from "../../src/storage/seoStorage";
import { loadLeads } from "../../src/storage/leadStorage";
import RecentAgentActivity from "../../src/components/RecentAgentActivity";
import { queueAICommand } from "../../src/assistant/commandHandoff";
import { colors } from "../../src/theme";
import { loadClients, loadCurrentClientId } from "../../src/storage/clientStorage";

export default function Dashboard() {
  const router = useRouter();

  const [todayTasks, setTodayTasks] = useState(0);
  const [approvals, setApprovals] = useState(0);
  const [scheduled, setScheduled] = useState(0);
  const [seoIssues, setSeoIssues] = useState(0);
  const [openLeads, setOpenLeads] = useState(0);
  const [currentClientName, setCurrentClientName] = useState("No client selected");

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [command, setCommand] = useState('');
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState('');
  const [refresh, setRefresh] = useState(0);
  function openCommand(text: string) {
    if (!text.trim()) return;
    queueAICommand(text, selectedClientId);
    router.push('/(tabs)/ai');
  }
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setDashboardLoading(true); setDashboardError('');

      Promise.all([
        loadTasks(),
        loadContent(),
        loadSEOIssues(),
        loadLeads(),
        loadClients(),
        loadCurrentClientId(),
      ])
        .then(([tasks, content, seo, leads, clients, currentClientId]) => {
          if (!active) return;

          setSelectedClientId(clients.some(client => client.id === currentClientId && client.status === "active") ? currentClientId : null);
          setCurrentClientName(clients.find(client => client.id === currentClientId && client.status === "active")?.name || "No client selected");
          const today = new Date().toISOString().slice(0, 10);

          setTodayTasks(
            tasks.filter(
              (t) =>
                t.dueDate === today &&
                t.status !== "completed"
            ).length
          );

          setApprovals(
            tasks.filter((t) => t.approval === "waiting").length
          );

          setScheduled(
            content.filter((x) => x.status === "scheduled").length
          );

          setSeoIssues(
            seo.filter(
              (x) =>
                x.status !== "fixed" &&
                x.status !== "ignored"
            ).length
          );

          setOpenLeads(
            leads.filter(
              (x) =>
                x.stage !== "won" &&
                x.stage !== "lost"
            ).length
          );
        })
        .catch(() => { if (active) { setCurrentClientName("Client unavailable"); setDashboardError("Unable to load saved records. Try again / மீண்டும் முயற்சி"); } })
        .finally(() => { if (active) setDashboardLoading(false); });

      return () => {
        active = false;
      };
    }, [refresh])
  );

  const count = (value: number) => dashboardLoading ? "…" : dashboardError ? "—" : String(value);
  const metrics = [
    ["Today Tasks", count(todayTasks)],
    ["Approvals", count(approvals)],
    ["Scheduled", count(scheduled)],
    ["SEO Issues", count(seoIssues)],
    ["Open Leads", count(openLeads)],
  ];

  const actions = [
    { label: 'Create Website / இணையதளம்', go: () => openCommand('Create a website') },
    { label: 'Create Ads / விளம்பரம்', go: () => openCommand('Help me choose Meta Ads or Google Ads') },
    { label: 'Improve SEO / தேடல்', go: () => router.push('/seo') },
    { label: 'Manage Clients / வாடிக்கையாளர்', go: () => router.push('/(tabs)/clients') },
    {
      label: "+ Client / சேர்",
      go: () => router.push("/(tabs)/clients"),
    },
    {
      label: "Create Content / உள்ளடக்கம்",
      go: () => router.push("/content-studio"),
    },
    {
      label: "SEO Check",
      go: () => router.push("/seo"),
    },
    {
      label: "Leads CRM",
      go: () => router.push("/leads-crm"),
    },
    {
      label: "Report",
      go: () => router.push("/reports-finance"),
    },
  ];

  return (
    <ScrollView
      style={s.page}
      contentContainerStyle={s.content}
    >
      <View style={s.hero}>
        <Text style={s.brand}>ONELEADQ</Text>

        <Text style={s.tag}>
          ONE STRATEGY. INFINITE GROWTH.
        </Text>

        <Text style={s.hi}>
          Agency Command Center
        </Text>

        <Text style={s.sub}>
          Current client · {currentClientName}
        </Text>
      </View>

      <View style={s.ai}>
        <Text style={s.aiTitle}>What would you like to do? / என்ன செய்யலாம்?</Text>
        <TextInput accessibilityLabel="Dashboard AI command" value={command} onChangeText={setCommand}
          placeholder="Example: Create a website" placeholderTextColor="#5b6965" maxLength={3000}
          style={{backgroundColor:colors.white,color:colors.text,borderRadius:12,padding:14,minHeight:52,marginTop:12}} />
        <Pressable accessibilityRole="button" accessibilityLabel="Continue to AI" disabled={!command.trim()} onPress={() => openCommand(command)}
          style={{minHeight:48,justifyContent:'center',opacity:command.trim()?1:0.5}}><Text style={s.aiButton}>Continue / தொடர்க</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Choose current client" onPress={() => router.push('/(tabs)/clients')} style={{minHeight:48,justifyContent:'center'}}><Text style={s.aiText}>Client / வாடிக்கையாளர்: {currentClientName}</Text></Pressable>
      </View>
      <Text style={s.title}>Overview / இன்று</Text>
      {dashboardLoading && <ActivityIndicator accessibilityLabel="Loading dashboard" />}
      {!!dashboardError && <View style={{paddingHorizontal:20}}><Text accessibilityRole="alert" style={{color:colors.danger}}>{dashboardError}</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry dashboard loading" onPress={() => setRefresh(value => value + 1)} style={{minHeight:48,justifyContent:'center'}}><Text style={{color:colors.green}}>Retry / மீண்டும்</Text></Pressable></View>}
      <Text style={{color:colors.muted,paddingHorizontal:20,marginBottom:12}}>Counts use saved app records; sample records may be included.</Text>

      <View style={s.grid}>
        {metrics.map(([k, v]) => (
          <Pressable
            style={s.card}
            key={k}
            onPress={() => {
              if (
                k === "Today Tasks" ||
                k === "Approvals"
              ) {
                router.push({ pathname: "/(tabs)/tasks", params: { view: k === "Approvals" ? "approval" : "today" } });
              }

              if (k === "Scheduled") {
                router.push("/content-calendar");
              }

              if (k === "SEO Issues") {
                router.push("/seo");
              }

              if (k === "Open Leads") {
                router.push("/leads-crm");
              }
            }}
          >
            <Text style={s.num}>{v}</Text>
            <Text style={s.label}>{k}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.title}>Quick actions</Text>

      <View style={s.actions}>
        {actions.map((x) => (
          <Pressable
            style={s.action}
            accessibilityRole="button"
            accessibilityLabel={x.label}
            key={x.label}
            onPress={x.go}
          >
            <Text style={s.actionText}>
              {x.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <RecentAgentActivity clientId={selectedClientId} />
      <Pressable
        style={s.ai}
        onPress={() => router.push("/(tabs)/ai")}
      >
        <Text style={s.aiTitle}>
          OneLeadQ AI Assistant
        </Text>

        <Text style={s.aiText}>
          Ask OneLeadQ AI. The right specialist agent will be selected automatically.
        </Text>

        <Text style={s.aiButton}>
          OPEN AI ASSISTANT →
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.cream,
  },

  content: {
    paddingBottom: 28,
  },

  hero: {
    backgroundColor: colors.green,
    paddingTop: 58,
    paddingHorizontal: 20,
    paddingBottom: 26,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },

  brand: {
    color: colors.gold,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 1,
  },

  tag: {
    color: "#E8D89A",
    fontSize: 10,
    letterSpacing: 1.2,
    marginTop: 2,
  },

  hi: {
    color: colors.white,
    fontSize: 22,
    fontWeight: "800",
    marginTop: 24,
  },

  sub: {
    color: "#D7E2DE",
    marginTop: 5,
  },

  title: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    margin: 20,
    marginBottom: 12,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 14,
  },

  card: {
    width: "46%",
    margin: "2%",
    backgroundColor: colors.white,
    padding: 18,
    borderRadius: 18,
  },

  num: {
    fontSize: 28,
    fontWeight: "900",
    color: colors.green,
  },

  label: {
    color: colors.muted,
    marginTop: 5,
  },

  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 14,
  },

  action: {
    width: "46%",
    margin: "2%",
    borderWidth: 1,
    borderColor: "#E0D5A7",
    backgroundColor: "#FFFDF6",
    padding: 15,
    borderRadius: 15,
  },

  actionText: {
    color: colors.green,
    fontWeight: "800",
  },

  ai: {
    margin: 20,
    backgroundColor: colors.green2,
    padding: 20,
    borderRadius: 20,
  },

  aiTitle: {
    color: colors.gold,
    fontSize: 18,
    fontWeight: "900",
  },

  aiText: {
    color: colors.white,
    marginTop: 6,
    lineHeight: 20,
  },

  aiButton: {
    color: colors.gold,
    fontWeight: "900",
    marginTop: 14,
  },
});