import { askOneLeadQAgent, type AIClientContext, type ConversationTurn, type AIAgentResponse } from './aiAgent';
import { resolveAgencyIntent } from '../agents/registry';
import { createExecution, transitionExecution } from '../agents/execution';
import { saveExecutionActivity } from '../storage/agentActivity';
export type AgencyDraftResponse=AIAgentResponse & {clarificationRequired?:boolean;unavailable?:boolean;historySaved?:boolean;draftOnly:true};
let sequence=0;
export async function requestAgencyDraft(message:string,client?:AIClientContext,signal?:AbortSignal,history:ConversationTurn[]=[],backend:typeof askOneLeadQAgent=askOneLeadQAgent):Promise<AgencyDraftResponse> {
  const intent=resolveAgencyIntent(message);
  let run=createExecution('request-'+Date.now()+'-'+(++sequence),client?.id||null,intent.kind==='route'||intent.kind==='unavailable'?intent.serviceId:null);
  let historySaved=true;
  async function record(){try{await saveExecutionActivity(run);historySaved=true}catch{historySaved=false}}
  if(signal?.aborted){run=transitionExecution(run,'cancelled','CANCELLED');await record();throw new Error('OneLeadQ AI request stopped or timed out. Please try again.')}
  if(intent.kind==='clarify'){run=transitionExecution(run,'clarification_required');await record();return {ok:true,agentId:'clarification',agent:'Choose a service',reply:intent.question,clarificationRequired:true,draftOnly:true,historySaved}}
  if(intent.kind==='unavailable'){run=transitionExecution(run,'clarification_required');await record();return {ok:true,agentId:'general',agent:'Service availability',reply:intent.message,unavailable:true,draftOnly:true,historySaved}}
  run=transitionExecution(run,'running');await record();
  try{
    const safeHistory=history.filter(turn=>turn.clientId===(client?.id||null)).slice(-8);
    const result=await backend(message,client,signal,safeHistory);
    if(!result.ok||typeof result.reply!=='string')throw new Error('Invalid AI response');
    if(result.handoff && result.handoff.clientId!==(client?.id||null))throw new Error('Client context changed; review and retry.');
    if(intent.kind==='route' && result.agentId!==intent.backendId){run=transitionExecution(run,'failed','ROUTING_MISMATCH');await record();throw new Error('The selected specialist could not be confirmed. Choose one service and try again.')}
    run=transitionExecution(run,'draft_ready');await record();
    return {...result,draftOnly:true,historySaved};
  }catch(error){if(run.state==='running'){run=transitionExecution(run,signal?.aborted?'cancelled':'failed',signal?.aborted?'CANCELLED':error instanceof Error && /timed out|timeout/i.test(error.message)?'TIMEOUT':'NETWORK');await record()}throw error}
}
