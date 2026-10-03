import AsyncStorage from '@react-native-async-storage/async-storage';
import { defaultTasks } from '../data/defaultTasks';
import { AgencyTask } from '../types/task';

const KEY='@oneleadq/tasks/v1';
export async function loadTasks():Promise<AgencyTask[]> {
  const raw=await AsyncStorage.getItem(KEY);
  if(!raw){ await AsyncStorage.setItem(KEY,JSON.stringify(defaultTasks)); return defaultTasks; }
  try{return JSON.parse(raw) as AgencyTask[];}catch{await AsyncStorage.setItem(KEY,JSON.stringify(defaultTasks));return defaultTasks;}
}
export async function saveTasks(tasks:AgencyTask[]){await AsyncStorage.setItem(KEY,JSON.stringify(tasks));}
