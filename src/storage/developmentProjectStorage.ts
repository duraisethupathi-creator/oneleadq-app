import { defaultDevelopmentProjects } from '../data/defaultDevelopmentProjects';
import { DevelopmentProject } from '../types/developmentProject';
import { preservedCollection } from './preservedCollection';

const store = preservedCollection<DevelopmentProject>('@oneleadq/development-projects/v1', defaultDevelopmentProjects);
export const loadDevelopmentProjects = store.load;
export const saveDevelopmentProjects = store.save;
