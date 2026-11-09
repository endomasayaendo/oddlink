import { getEnv } from "@/lib/env";

const env = getEnv();

export const BASE_URL = env.BASE_URL;

export const APP_TIME_ZONE = env.APP_TIME_ZONE;

export const shortUrlFor = (shortCode: string) => `${BASE_URL}/${shortCode}`;
