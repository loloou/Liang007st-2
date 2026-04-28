# 提示词历史记录功能实现文档

## 功能概述

本次更新实现了两个重要功能，增强了提示词和反向提示词的管理体验：

1. **提示词模板增加历史记录**：在提示词模板下拉中整合了历史记录，支持快速应用之前的生图记录
2. **反向提示词历史合并到模板**：将反向提示词的历史记录合并到模板下拉中，提供统一的访问入口

---

## 功能 1：提示词模板增加历史记录

### 实现位置
文件：`client/src/App.tsx` 第 3682-3764 行

### 主要修改

#### 修改前的结构
```
提示词模板下拉
├── 模板列表
└── 保存当前为模板
```

#### 修改后的结构
```
提示词模板/历史下拉
├── 📋 历史记录（最多显示最近 10 条）
│   ├── 2026/03/16 10:30:05 - 一只可爱的猫咪...
│   └── ...
├── 📁 保存的模板
│   ├── 梦幻风景
│   └── ...
└── ＋ 保存当前为模板…
```

### 功能特性

1. **历史记录展示**
   - 显示最近 10 条生成历史
   - 格式：`时间 - 提示词前25个字符...`
   - 使用 `optgroup` 分组，界面更清晰

2. **应用历史记录**
   - 点击历史记录选项后，自动恢复：
     - 提示词内容
     - 反向提示词内容
     - 模型名称
     - 批量大小
     - 图片结果（仅限有效的外部 URL）

3. **智能数据处理**
   - 自动过滤失效的 blob: URL 和 data: URL
   - 如果历史记录有 originalUrl 字段，优先使用原始 URL
   - 确保只恢复有效的图片数据

---

## 功能 2：反向提示词历史合并到模板

### 实现位置
文件：`client/src/App.tsx` 第 3802-3850 行

### 主要修改

#### 修改前的结构
```
反向提示词区域
├── 反向词模板下拉
├── 保存模板内联区
└── 历史反向词下拉（独立）
```

#### 修改后的结构
```
反向提示词区域
└── 反向词模板/历史下拉（统一）
    ├── 📋 生成历史（最多显示最近 8 条有反向提示词的记录）
    │   ├── nsfw, low quality, blurry...
    │   └── ...
    ├── 🕐 使用历史（最多显示最近 8 条）
    │   ├── ugly, low quality...
    │   └── ...
    ├── 📁 保存的模板
    │   ├── 默认反向词
    │   └── ...
    └── ＋ 保存当前为模板…
```

### 功能特性

1. **三合一下拉菜单**
   - **生成历史**：从 `generationHistory` 中提取，显示所有有反向提示词的记录
   - **使用历史**：从 `negPromptHistory` 中提取，显示之前手动使用的反向提示词
   - **保存的模板**：用户保存的常用反向提示词模板

2. **智能筛选**
   - 生成历史：只显示包含有效反向提示词的记录（过滤空值）
   - 每个分类最多显示 8 条记录，避免下拉过长

3. **优化显示**
   - 显示前 30 个字符，超出部分用 "..." 表示
   - 使用 emoji 图标（📋、🕐、📁）区分不同来源
   - 统一的下拉选择体验

---

## 技术实现细节

### 状态变量

```typescript
// 提示词模板
const [promptTemplates, setPromptTemplates] = useState<{ name: string; prompt: string; negative?: string }[]>([]);
const [historyTemplateValue, setHistoryTemplateValue] = useState("");

// 反向提示词模板
const [negTemplates, setNegTemplates] = useState<{ name: string; text: string }[]>([]);
const [negTemplateValue, setNegTemplateValue] = useState("");

// 生成历史
const [generationHistory, setGenerationHistory] = useState<{
  id: string;
  time: string;
  prompt: string;
  negativePrompt?: string;
  model: string;
  width: number;
  height: number;
  batchSize: number;
  results: GeneratedImage[];
}[]>([]);

// 反向提示词历史
const [negPromptHistory, setNegPromptHistory] = useState<string[]>([]);
```

### 关键代码逻辑

#### 1. 提示词模板下拉处理

```typescript
<select
  value={historyTemplateValue}
  onChange={(e) => {
    const v = e.target.value;
    setHistoryTemplateValue("");
    if (!v) return;
    
    if (v.startsWith("tpl:")) {
      // 应用模板
      const idx = parseInt(v.slice(4));
      if (!isNaN(idx) && promptTemplates[idx]) {
        handleApplyTemplate(promptTemplates[idx]);
      }
    } else if (v.startsWith("hist:")) {
      // 应用历史记录
      const idx = parseInt(v.slice(5));
      if (!isNaN(idx) && generationHistory[idx]) {
        const entry = generationHistory[idx];
        setPrompt(entry.prompt || "");
        setNegativePrompt(entry.negativePrompt || "");
        setModel(entry.model || "");
        setBatchSize(entry.batchSize || 1);
        // 恢复图片结果
        if (entry.results && entry.results.length > 0) {
          const validResults = entry.results.filter(img => /* 数据验证逻辑 */);
          if (validResults.length > 0) {
            setResults(validResults);
            setResultActiveIdx(0);
          }
        }
      }
    } else if (v === "save") {
      setShowTemplateSave(true);
    }
  }}
>
```

#### 2. 反向提示词下拉处理

```typescript
<select
  value={negTemplateValue}
  onChange={(e) => {
    const v = e.target.value;
    setNegTemplateValue("");
    if (!v) return;
    
    if (v.startsWith("ntpl:")) {
      // 应用反向提示词模板
      const idx = parseInt(v.slice(5));
      if (!isNaN(idx) && negTemplates[idx]) {
        setNegativePrompt(negTemplates[idx].text);
      }
    } else if (v.startsWith("nhist:")) {
      // 应用使用历史
      const idx = parseInt(v.slice(6));
      if (!isNaN(idx) && negPromptHistory[idx]) {
        setNegativePrompt(negPromptHistory[idx]);
      }
    } else if (v.startsWith("ghist:")) {
      // 从生成历史中提取反向提示词
      const idx = parseInt(v.slice(6));
      if (!isNaN(idx) && generationHistory[idx] && generationHistory[idx].negativePrompt) {
        setNegativePrompt(generationHistory[idx].negativePrompt || "");
      }
    } else if (v === "nsave") {
      setShowNegTemplateSave(true);
    }
  }}
>
```

#### 3. 历史记录过滤逻辑

```typescript
// 提示词模板下拉：显示最近 10 条历史记录
{generationHistory.slice(0, 10).map((entry, i) => (
  <option key={`hist-${i}`} value={`hist:${i}`}>
    {entry.time} - {entry.prompt.slice(0, 25)}{entry.prompt.length > 25 ? "..." : ""}
  </option>
))}

// 反向提示词下拉：显示最近 8 条有反向提示词的生成历史
{generationHistory
  .filter(h => h.negativePrompt && h.negativePrompt.trim())
  .slice(0, 8)
  .map((entry, i) => (
    <option key={`ghist-${entry.id}`} value={`ghist:${generationHistory.indexOf(entry)}`}>
      {entry.negativePrompt!.slice(0, 30)}{entry.negativePrompt!.length > 30 ? "..." : ""}
    </option>
  ))}
```

---

## 用户体验优化

### 1. 统一的选择入口
- 将分散的历史记录、模板整合到一个下拉菜单
- 减少界面元素，提升操作效率

### 2. 清晰的分类展示
- 使用 `optgroup` 进行分组
- 添加 emoji 图标增强可识别性
- 每个分类最多显示 8-10 条记录，避免列表过长

### 3. 智能的数据展示
- 自动截断过长的文本，保持界面整洁
- 提供足够的上下文信息（时间、提示词内容）
- 只显示有效的、有意义的数据

### 4. 无缝的数据恢复
- 应用历史记录时，完整恢复所有相关参数
- 智能处理失效的图片 URL
- 不影响用户当前的使用状态

---

## 测试建议

### 功能测试

1. **提示词模板历史功能**
   - [ ] 生成图片后，检查历史记录是否出现在下拉中
   - [ ] 选择历史记录，确认提示词、反向提示词、模型等参数是否正确恢复
   - [ ] 检查图片结果是否正确显示（针对有效外部 URL）
   - [ ] 验证失效的 blob/data URL 是否被正确过滤

2. **反向提示词历史合并功能**
   - [ ] 检查三个分类（生成历史、使用历史、保存模板）是否正确显示
   - [ ] 从生成历史中选择反向提示词，确认内容正确
   - [ ] 从使用历史中选择反向提示词，确认内容正确
   - [ ] 从保存的模板中选择反向提示词，确认内容正确

3. **边界情况测试**
   - [ ] 历史记录为空时的显示
   - [ ] 历史记录超过限制（10条/8条）时的截断
   - [ ] 反向提示词为空的记录是否正确过滤
   - [ ] 同时修改多个参数后的历史记录应用

### 兼容性测试

- [ ] 不同浏览器下的 optgroup 显示效果
- [ ] 文本截断在不同语言下的表现
- [ ] 长时间使用后的历史记录累积

---

## 后续优化建议

1. **搜索功能**
   - 在历史记录下拉中添加搜索框
   - 支持按提示词内容或时间搜索

2. **分组扩展**
   - 支持用户自定义历史记录分组
   - 添加标签系统对历史记录进行分类

3. **统计信息**
   - 显示每个历史记录的使用次数
   - 显示最常用的提示词/反向提示词

4. **导出导入**
   - 支持导出历史记录为 JSON 文件
   - 支持从文件导入历史记录

5. **AI 增强**
   - 基于历史记录智能推荐提示词
   - 自动合并相似的反向提示词

---

## 修改文件清单

- `client/src/App.tsx` - 主要功能实现

---

## 修改时间

2026-03-16

---

## 版本信息

- 实现版本：v1.0
- 状态：✅ 已完成
- 测试状态：待测试
