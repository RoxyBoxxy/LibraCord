import { EventEmitter } from "node:events";

export const moderationEvents = new EventEmitter();
moderationEvents.setMaxListeners(10);
