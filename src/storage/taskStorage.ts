import { preservedCollection } from './preservedCollection';
import { defaultTasks } from '../data/defaultTasks';
import { AgencyTask } from '../types/task';

const KEY='@oneleadq/tasks/v1';
const store = preservedCollection<AgencyTask>(KEY, defaultTasks);
export const loadTasks = store.load;
export const saveTasks = store.save;
