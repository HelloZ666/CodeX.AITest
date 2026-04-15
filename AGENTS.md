# 仓库协作规则

- 每次新增、删除或修改任何功能后，必须同步更新 `README.md`，确保菜单、路由、接口、依赖、环境变量、使用方式和注意事项与当前代码一致。
- 更新 `README.md` 时，优先记录“当前实际行为”，不要保留已经失效的旧流程或旧命名。
- 界面文案、文档说明默认使用中文，除非需求明确要求其他语言。
- 排查问题时，默认先做静态分析和轻量检查，不要直接启动长期驻留任务；除非我明确要求，否则不要主动运行 `start-dev.bat`、`npm run dev`、`vitest`/`npm run test:watch`、`uvicorn --reload`、Playwright 持续会话或其他 watch 模式命令。
- 搜索和读取文件时默认限制范围在 `src/`、`api/`、`package.json`、`README.md`、`AGENTS.md` 等必要路径，避免无差别递归扫描整个仓库。
- 默认跳过大体积或产物目录：`node_modules/`、`dist/`、`coverage/`、`output/`、`release-packages/`、`.codex-tmp/`、`.playwright-cli/`、`.pytest_cache/`、日志文件和运行时目录；只有在我明确要求时才进入这些位置排查。
- 需要验证启动逻辑时，优先运行只检查不驻留的命令，例如 `start-dev.bat --check`，确认无误后再决定是否启动前后端。
- 如果上一个任务被我中断，后续优先检查是否有残留的 `node`、`python`、`cmd`、浏览器或测试进程在后台持续占用资源，再继续执行其他操作。
