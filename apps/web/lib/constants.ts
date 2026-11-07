export const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const APP_TIME_ZONE = process.env.APP_TIME_ZONE ?? "Asia/Tokyo";

export const shortUrlFor = (shortCode: string) => `${BASE_URL}/${shortCode}`;
