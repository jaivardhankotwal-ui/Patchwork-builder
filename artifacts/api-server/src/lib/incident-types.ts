import { AnalyzeIncidentResponse } from "@workspace/api-zod";
export type Incident = ReturnType<typeof AnalyzeIncidentResponse.parse>;
export type IncidentInput = { repository: string; branch: string; stack_trace: string; simulated?: boolean };
