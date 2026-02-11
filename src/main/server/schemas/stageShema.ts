import { taskSchema } from "../schemas/taskSchema.js";

export const stageSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    position: { type: "integer" },
    tasks: {
      type: "array",
      items: taskSchema,
    },
  },
};
