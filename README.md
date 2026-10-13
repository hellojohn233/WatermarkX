# WatermarkX

WatermarkX 是一个面向 AI Agent 的批量图片加水印 CLI，只处理已有图片，不重新生成图片。

它的目标不是做一个图片生成工具，而是给 AI、脚本和普通命令行用户提供一个稳定、可解释、可批处理的水印执行器。

## 为什么做成 CLI

AI 最适合负责理解需求、选择参数和组织批处理；实际图片处理应该由确定性的工具完成。WatermarkX 把这两层拆开：

- **CLI 是核心产品**：任何用户都能直接运行。
- **AI-friendly 输出**：支持 `--json` 和 `--dry-run`，方便 agent 调用和读取结果。
- **底层使用成熟库**：默认使用 `sharp`，不重新实现图像处理算法。
- **后续可扩展**：可以继续包 Codex skill、Claude skill 或 MCP server。

## 能力范围

当前第一版聚焦可见水印：

- 批量处理图片文件或文件夹
- 保留原图，输出到新目录
- 文字水印
- Logo 图片水印
- 位置水印：左上、右上、左下、右下、居中
- 平铺水印
- 对角线水印
- 透明度、缩放、边距、旋转、间距
- `dry-run`
- JSON 处理报告

后续再扩展：

- 智能避让主体的 `smart` 位置
- ImageMagick backend
- 隐形水印插件
- Codex/Claude skill
- MCP server

## 安装

本地开发：

```bash
npm install
npm run build
```

开发模式：

```bash
npm run dev -- add ./images --text "Demo" --out ./watermarkx-output
```

构建后运行：

```bash
node dist/cli.js add ./images --text "Demo" --out ./watermarkx-output
```

## 使用示例

右下角文字水印：

```bash
watermarkx add ./photos \
  --text "© John Wick" \
  --position bottom-right \
  --opacity 0.35 \
  --out ./out
```

Logo 水印：

```bash
watermarkx add ./photos \
  --logo ./logo.png \
  --position bottom-right \
  --scale 0.18 \
  --opacity 0.5 \
  --out ./out
```

平铺水印：

```bash
watermarkx add ./photos \
  --text "CONFIDENTIAL" \
  --mode tile \
  --rotate -30 \
  --opacity 0.12 \
  --spacing 240 \
  --out ./out
```

对角线水印：

```bash
watermarkx add ./photos \
  --text "INTERNAL USE ONLY" \
  --mode diagonal \
  --opacity 0.18 \
  --out ./out
```

给 AI Agent 调用：

```bash
watermarkx add ./photos \
  --text "Demo" \
  --position bottom-right \
  --out ./out \
  --json
```

输出示例：

```json
{
  "input": "./photos",
  "outputDir": "./out",
  "processed": 42,
  "skipped": 3,
  "failed": 0,
  "files": []
}
```

预检查，不写文件：

```bash
watermarkx add ./photos --text "Demo" --out ./out --dry-run --json
```

## 命令参数

```text
watermarkx add <input>

Options:
  --out <dir>                  输出目录，默认 ./watermarkx-output
  --text <text>                文字水印
  --logo <path>                Logo 图片水印
  --position <position>        top-left | top-right | bottom-left | bottom-right | center
  --mode <mode>                single | tile | diagonal
  --opacity <number>           透明度，0 到 1
  --scale <number>             Logo 宽度占原图宽度的比例
  --font-size <number>         文字大小
  --color <css-color>          文字颜色
  --margin <number>            边距
  --rotate <number>            旋转角度
  --spacing <number>           平铺间距
  --recursive                  递归处理目录
  --overwrite                  覆盖已存在输出文件
  --dry-run                    只展示计划，不写文件
  --json                       输出 JSON 报告
```

## 技术路线

WatermarkX 不是从零实现图像算法。第一版使用 `sharp` 作为默认执行引擎，因为它基于 `libvips`，速度快、内存占用低、跨平台安装体验好。

后续如果需要更复杂的可见水印效果，可以增加 ImageMagick backend；如果需要隐形水印，则通过插件接入专门的盲水印库，而不是把这些能力混进核心 CLI。

## 项目原则

- 不重新生成图片，只修改已有图片。
- 原图默认不动，所有结果输出到新目录。
- 默认行为应该适合批处理和 agent 调用。
- 文本输出给人看，JSON 输出给 AI 和程序读。
- 可见水印与隐形水印保持架构分离。
