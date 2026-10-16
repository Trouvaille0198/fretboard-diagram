import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// dev 全响应禁缓存：WSL 文件监视偶发失效 + Chrome 对 ?t= 模块的 304 缓存，会让人看到"改了不生效"的旧界面
const forceNoStore = {
	name: "force-no-store",
	configureServer(server) {
		server.middlewares.use((req, res, next) => {
			res.setHeader("Cache-Control", "no-store");
			next();
		});
	},
};

export default defineConfig({
	plugins: [react(), forceNoStore],
	server: {
		host: true,
		allowedHosts: ["g7-pt-wsl.tigon-bebop.ts.net", "localhost", ".localhost"],
		// dev 模块禁缓存：WSL 文件监视偶发失效时 ETag 停在旧值，304 会让浏览器拿旧模块（"改了没生效"的元凶）
		headers: {
			"Cache-Control": "no-store",
		},
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
