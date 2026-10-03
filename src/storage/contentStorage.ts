import AsyncStorage from '@react-native-async-storage/async-storage';import { defaultContent } from '../data/defaultContent';import { ContentItem } from '../types/content';
const KEY='@oneleadq/content/v1';
export async function loadContent():Promise<ContentItem[]>{const raw=await AsyncStorage.getItem(KEY);if(!raw){await AsyncStorage.setItem(KEY,JSON.stringify(defaultContent));return defaultContent;}try{return JSON.parse(raw) as ContentItem[];}catch{await AsyncStorage.setItem(KEY,JSON.stringify(defaultContent));return defaultContent;}}
export async function saveContent(items:ContentItem[]){await AsyncStorage.setItem(KEY,JSON.stringify(items));}
