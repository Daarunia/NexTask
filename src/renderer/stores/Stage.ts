import { defineStore } from "pinia";
import axios from "axios";
import { MINUTE } from "../constants";

/**
 * Entité 'Stage'
 */
export interface Task {
  id: number;
  name: string;
  position: number;
}
