import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      headerShown:false,
      tabBarActiveTintColor:colors.gold,
      tabBarInactiveTintColor:'#789087',
      tabBarStyle:{height:68,paddingBottom:8,paddingTop:6,backgroundColor:colors.green,borderTopWidth:0}
    }}>
      <Tabs.Screen name="index" options={{title:'Home',tabBarIcon:({color,size})=><Ionicons name="home" color={color} size={size}/>}}/>
      <Tabs.Screen name="clients" options={{title:'Clients',tabBarIcon:({color,size})=><Ionicons name="people" color={color} size={size}/>}}/>
      <Tabs.Screen name="ai" options={{title:'AI',tabBarIcon:({color,size})=><Ionicons name="sparkles" color={color} size={size}/>}}/>
      <Tabs.Screen name="tasks" options={{title:'Tasks',tabBarIcon:({color,size})=><Ionicons name="checkbox" color={color} size={size}/>}}/>
      <Tabs.Screen name="more" options={{title:'More',tabBarIcon:({color,size})=><Ionicons name="grid" color={color} size={size}/>}}/>
    </Tabs>
  );
}
