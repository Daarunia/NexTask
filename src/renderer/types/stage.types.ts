import { Task } from "./task.types";

/**
 * Entité 'Stage'
 */
export interface Stage {
  id: number;
  name: string;
  position: number;
  tasks: Task[];
}
