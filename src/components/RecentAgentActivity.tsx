import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Text, View } from 'react-native';
import { loadAgentActivity, type AgentActivity } from '../storage/agentActivity';
import { serviceRegistry } from '../agents/registry';
import { colors } from '../theme';
export default function RecentAgentActivity({clientId}:{clientId:string|null}) {
  const [items,setItems]=useState<AgentActivity[]>([]),[error,setError]=useState(false),[loading,setLoading]=useState(true);
  useFocusEffect(useCallback(()=>{let active=true;setLoading(true);setError(false);void loadAgentActivity(clientId).then(value=>{if(active)setItems(value.slice(0,5))}).catch(()=>{if(active)setError(true)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false};},[clientId]));
  return <View style={{margin:20,gap:8}}><Text style={{fontWeight:'900',fontSize:20,color:colors.green}}>Recent AI activity / சமீபத்திய வேலை</Text>
    {loading?<Text>Loading saved activity…</Text>:error?<Text accessibilityRole="alert">Activity could not be loaded. Reopen this screen to retry.</Text>:!items.length?<Text>No saved AI requests for this client yet.</Text>:items.map(item=><Text key={item.id} style={{color:colors.text}}>{serviceRegistry.find(service=>service.id===item.serviceId)?.name||'General AI'} · {item.state.replace(/_/g,' ')} · attempt {item.attempt}</Text>)}
    <Text style={{color:colors.muted}}>Local request history only. A draft is not a published action.</Text>
  </View>;
}
