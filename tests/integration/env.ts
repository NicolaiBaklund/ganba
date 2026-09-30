import { config } from "dotenv";

// Runs against the project in apps/web/.env.local with throwaway users that are deleted afterwards.
config({ path: "apps/web/.env.local", quiet: true });
