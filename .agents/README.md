# Skills Bridge

此目录用于兼容 Codex 的仓库技能扫描路径：`.agents/skills`。

本仓库将技能主目录维护在 Copilot 约定位置：`.github/skills`，并通过符号链接将
`.agents/skills` 指向 `.github/skills`。

这样可以同时满足：

1. Copilot 工作流使用 `.github/skills`
2. Codex 工作流扫描 `.agents/skills`
