import { AgencyTask } from '../types/task';

const today = new Date().toISOString().slice(0,10);
const now = new Date().toISOString();

export const defaultTasks: AgencyTask[] = [
  { id:'task-1', title:'Review Meta campaign creatives', clientId:'catchy-decors', clientName:'Catchy Decors', dueDate:today, priority:'high', status:'pending', approval:'draft', notes:'DEMO DATA', createdAt:now, updatedAt:now },
  { id:'task-2', title:'Prepare weekly social content', clientId:'ar-bangles', clientName:'AR Bangles', dueDate:today, priority:'medium', status:'waiting_approval', approval:'waiting', notes:'DEMO DATA', createdAt:now, updatedAt:now },
];
