import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AgencyExecution, ExecutionState } from '../types/agencyExecution';
import { serviceRegistry } from '../agents/registry';
export type AgentActivity={id:string;clientId:string|null;serviceId:AgencyExecution['serviceId'];state:ExecutionState;attempt:number;at:string;events:AgencyExecution['events']};
const KEY='@oneleadq/agent-activity/v1';
const states:ExecutionState[]=['created','running','draft_ready','waiting_approval','clarification_required','failed','cancelled'];
let writes:Promise<unknown>=Promise.resolve();
function screen(input:unknown):AgentActivity|null {
  if(!input||typeof input!=='object')return null;
  const x=input as Record<string,unknown>;const identifier=(value:unknown)=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,120}$/.test(value);
  if(!identifier(x.id)||x.clientId!==null&&!identifier(x.clientId)||x.serviceId!==null&&!serviceRegistry.some(s=>s.id===x.serviceId)||!states.includes(x.state as ExecutionState)||!Number.isInteger(x.attempt)||(x.attempt as number)<1||(x.attempt as number)>3||typeof x.at!=='string'||!/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(x.at))return null;
  const events=Array.isArray(x.events)?x.events.filter(event=>event&&typeof event==='object'&&states.includes(event.state)&&typeof event.at==='string'&&/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(event.at)&&Number.isInteger(event.attempt)&&event.attempt>=1&&event.attempt<=3).slice(-20).map(event=>({state:event.state,at:event.at,attempt:event.attempt,...(['NETWORK','TIMEOUT','CANCELLED','ROUTING_MISMATCH','VALIDATION'].includes(event.reason)?{reason:event.reason}:{})})):[];
  return {id:x.id as string,clientId:x.clientId as string|null,serviceId:x.serviceId as AgentActivity['serviceId'],state:x.state as ExecutionState,attempt:x.attempt as number,at:x.at,events};
}
async function read():Promise<AgentActivity[]> {
  const raw=await AsyncStorage.getItem(KEY);if(!raw)return [];
  try{const parsed:unknown=JSON.parse(raw);if(!Array.isArray(parsed))throw new Error('Invalid activity data');return parsed.map(screen).filter((x):x is AgentActivity=>!!x).slice(-50)}catch{throw new Error('Saved activity is unreadable; existing data was preserved')}
}
export async function loadAgentActivity(clientId:string|null):Promise<AgentActivity[]> {await writes;return (await read()).filter(item=>item.clientId===clientId).reverse();}
export function saveExecutionActivity(run:AgencyExecution):Promise<void> {
  const event=screen({id:run.id,clientId:run.clientId,serviceId:run.serviceId,state:run.state,attempt:run.attempt,at:run.events[run.events.length-1].at,events:run.events});
  if(!event)return Promise.reject(new Error('Invalid activity metadata'));
  const write=writes.then(async()=>{const history=await read();await AsyncStorage.setItem(KEY,JSON.stringify([...history.filter(item=>item.id!==event.id),event].slice(-50)))});
  writes=write.catch(()=>{});return write;
}
