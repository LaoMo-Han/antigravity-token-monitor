---
name: token-monitor
description: Antigravity 实时 Token 与模型限额悬浮监控技能。用于查看、刷新当前账号的 Gemini 与 Claude/GPT 模型的 5小时及周度配额余量，或切换组件显示风格（极简水印、经典卡片、极简双环、极客 HUD）。
---

# Token 实时配额监控技能 (Token Monitor)

本技能由 `token-monitor` 插件提供，实现对当前客户端 Token 配额与模型使用限额的实时监控。

## 核心功能

1. **实时余量查看**：
   - Gemini 模型组（5h 限额与周度限额百分比及倒计时）
   - Claude / GPT 模型组（5h 限额与周度限额百分比）
2. **四种风格一键轮转**：
   - 极简水印 (Watermark)
   - 经典卡片 (Classic)
   - 极简双环 (Radial Rings)
   - 极客 HUD (Cyber HUD)
3. **交互与操作**：
   - 鼠标左键点击余量文字直接刷新最新配额，上方轻弹气泡提示。
   - 鼠标按住顶部标题栏可全屏自由拖动定位。
   - 支持吸附复位回左侧边栏系统设置上方。
