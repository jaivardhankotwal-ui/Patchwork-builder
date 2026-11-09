import { EventEmitter } from "node:events";
export const incidentEvents = new EventEmitter();
incidentEvents.setMaxListeners(100);
export function notifyDashboard() { incidentEvents.emit("change"); }
