/**
 * Entité 'Tâches'
 */
export interface Task {
  id: number;
  version: string;
  description: string;
  position: number;
  title: string;
  isHistorized: boolean;
  historizationDate?: Date;
  stageId: number;
}
