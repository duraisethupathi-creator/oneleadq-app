import type { AgencyExecution, ExecutionState, ApprovalRequest, TaskSnapshot } from '../types/agencyExecution';
import type { ServiceId } from './registry';
const transitions:Record<ExecutionState,ExecutionState[]>={created:['running','clarification_required','cancelled'],running:['draft_ready','failed','cancelled'],draft_ready:['waiting_approval','created'],waiting_approval:['created','cancelled'],clarification_required:['created','cancelled'],failed:['created','cancelled'],cancelled:[]};
export function createExecution(id:string,clientId:string|null,serviceId:ServiceId|null,at=new Date().toISOString()):AgencyExecution {
  if(!id.trim())throw new Error('Execution ID required');
  return {id,taskId:null,clientId,serviceId,state:'created',attempt:1,revision:1,events:[{state:'created',at,attempt:1}]};
}
export function transitionExecution(run:AgencyExecution,next:ExecutionState,reason?:AgencyExecution['events'][number]['reason'],at=new Date().toISOString()):AgencyExecution {
  if(!transitions[run.state].includes(next))throw new Error('Invalid execution transition');
  return {...run,state:next,revision:run.revision+1,events:[...run.events,{state:next,at,attempt:run.attempt,...(reason?{reason}:{})}].slice(-50),...(next==='created'?{approvalRequest:undefined}:{})};
}
export function retryExecution(run:AgencyExecution):AgencyExecution {
  if(run.state!=='failed'||run.attempt>=3)throw new Error('Retry unavailable');
  const next=transitionExecution({...run,attempt:run.attempt+1},'created');
  return next;
}
export function requestExecutionApproval(run:AgencyExecution,request:ApprovalRequest,validationPassed:boolean):AgencyExecution {
  if(!validationPassed||!run.taskId||request.taskId!==run.taskId||request.clientId!==run.clientId||!request.artifactId||!Number.isInteger(request.version)||request.version<1||!/^[a-f0-9]{64}$/.test(request.contentHash))throw new Error('Validated matching artifact required');
  return {...transitionExecution(run,'waiting_approval'),approvalRequest:{...request}};
}
export function isCurrentApproval(request:ApprovalRequest,artifact:ApprovalRequest):boolean {
  return request.taskId===artifact.taskId&&request.clientId===artifact.clientId&&request.artifactId===artifact.artifactId&&request.version===artifact.version&&request.contentHash===artifact.contentHash;
}
export function acceptServerSnapshot(current:TaskSnapshot|undefined,next:TaskSnapshot,clientId:string):TaskSnapshot {
  if(next.schemaVersion!==1||next.source!=='server'||next.task.clientId!==clientId||next.execution.clientId!==clientId||next.execution.taskId!==next.task.id||!Number.isInteger(next.serverRevision)||next.serverRevision<1)throw new Error('Invalid client-bound server snapshot');
  if(current&&(current.task.id!==next.task.id||current.task.clientId!==clientId))throw new Error('Task identity changed');
  if(current&&next.serverRevision<=current.serverRevision)return current;
  // This checks shape/order, never authentication. An authenticated server transport is still required.
  return next;
}
