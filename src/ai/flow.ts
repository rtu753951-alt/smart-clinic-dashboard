export const flowDefinition = {
  steps: [
    { id: "load_data", type: "data" },
    { id: "summarize", type: "llm" },
    { id: "generate_alerts", type: "logic" }
  ]
};

