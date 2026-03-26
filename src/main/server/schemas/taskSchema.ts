export const taskSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    stage: { type: "string" },
    version: { type: "string" },
    description: { type: "string" },
    title: { type: "string" },
    position: { type: "integer" },
    isHistorized: { type: "boolean" },
    historizationDate: { type: ["string", "null"], format: "date-time" },
    stageId: { type: "integer" },
  },
};
