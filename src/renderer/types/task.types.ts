/**
 * Entité 'Tâches'
 */
export interface Task {
  id: number;
  stage: string;
  version: string;
  description: string;
  position: number;
  title: string;
  redmine?: number;
  isHistorized: boolean;
  historizationDate?: Date;
  stageId: number;
}
