import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
	plugins: [react()],
	server: {
		host: true,
		allowedHosts: ["g7-pt-wsl.tigon-bebop.ts.net", "localhost", ".localhost"],
	},
});
