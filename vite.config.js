import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
	plugins: [react()],
	server: {
		host: true,
		allowedHosts: ["g7-pt-wsl.tigon-bebop.ts.net", "localhost", ".localhost"],
	},
	preview: {
		host: true,
		allowedHosts: ["g7-pt-wsl.tigon-bebop.ts.net", "localhost", ".localhost"],
		// index.html 禁缓存：否则浏览器启发式缓存旧入口、刷新看不到新构建（资源文件名带哈希不受影响）
		headers: {
			"Cache-Control": "no-cache, must-revalidate",
		},
	},
});
