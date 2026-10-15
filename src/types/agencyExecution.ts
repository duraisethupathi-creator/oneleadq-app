import type { AgencyTask } from './task';
import type { ServiceId } from '../agents/registry';
export type ExecutionState = 'created'|'running'|'draft_ready'|'waiting_approval'|'clarification_required'|'failed'|'cancelled';
export type ExecutionEvent = {at:string;state:ExecutionState;attempt:number;reason?:'NETWORK'|'TIMEOUT'|'CANCELLED'|'ROUTING_MISMATCH'|'VALIDATION'};
export type ApprovalRequest = {taskId:AgencyTask['id'];clientId:AgencyTask['clientId'];artifactId:string;version:number;contentHash:string};
export type AgencyExecution = {id:string;taskId:AgencyTask['id']|null;clientId:AgencyTask['clientId']|null;serviceId:ServiceId|null;state:ExecutionState;attempt:number;revision:number;events:ExecutionEvent[];approvalRequest?:ApprovalRequest};
// Shared wire contract only. Existing backend session/approval gates remain authoritative.
export type TaskSnapshot = {schemaVersion:1;serverRevision:number;task:AgencyTask;execution:AgencyExecution;source:'server'};
export type TaskCommand = {schemaVersion:1;taskId:AgencyTask['id'];clientId:AgencyTask['clientId'];expectedServerRevision:number;idempotencyKey:string;kind:'retry'|'cancel'|'request_approval'};
