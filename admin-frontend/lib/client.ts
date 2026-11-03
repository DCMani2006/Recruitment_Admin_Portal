import { IS_MOCK } from "./config";
import { adminApi } from "./adminApi";
import { mockApi } from "./mock";

// Every page and component must import api ONLY from lib/client.ts
export const api = IS_MOCK ? mockApi : adminApi;
