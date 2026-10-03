export type TaskStatus = 'pending' | 'in_progress' | 'waiting_approval' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high';
export type ApprovalStatus = 'draft' | 'waiting' | 'approved' | 'rejected';

export type AgencyTask = {
  id: string;
  title: string;
  clientId: string;
  clientName: string;
  dueDate: string;
  priority: TaskPriority;
  status: TaskStatus;
  approval: ApprovalStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
};
