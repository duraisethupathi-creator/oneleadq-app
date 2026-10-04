import { PropsWithChildren } from 'react';import { View,StyleSheet } from 'react-native';import FloatingAssistant from './FloatingAssistant';
export default function AssistantHost({children}:PropsWithChildren){return <View style={s.root}>{children}<FloatingAssistant/></View>}
const s=StyleSheet.create({root:{flex:1}});