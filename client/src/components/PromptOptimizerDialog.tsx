/**
 * PromptOptimizerDialog.tsx - 提示词优化器
 *
 * 功能特性：
 * 1. 顶部操作栏 + 主体双栏对比区 + 底部辅助功能栏 三段式布局
 * 2. 左栏原始提示词输入 / 右栏优化后结果展示
 * 3. LCS 字符级差异对比算法
 * 4. 双栏同步滚动联动
 * 5. 差异明细区（修改总览 + 逐行修改明细）
 * 6. 可自定义系统模板（新增/编辑/删除/设为默认）
 * 7. 历史记录 / 一键复制 / 解锁编辑 / 导出报告
 * 8. 色盲友好高亮色值规范
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { getApiConfig } from '../api/settings'
import {
  SPECIMEN_CONFIGS,
  SPECIMEN_TYPE_LIST,
  TEMPLATE_ICONS,
  TEMPLATE_SPECIMEN_HINTS,
  STORAGE_KEY_SPECIMEN,
  getRandomHerb,
  generateSpecimenPrompt,
  type SpecimenType,
  type SpecimenParams,
} from '../data/specimenDatabase'
import { computeDiff, type DiffSegment, type ModificationDetail } from '../utils/diffUtils'

// ── 类型定义 ─────────────────────────────────────────────────────────────

type OptimizeRecord = {
  id: string
  timestamp: number
  originalPrompt: string
  optimizedPrompt: string
  details: ModificationDetail[]
  duration: number
  templateName?: string
  isFavorite?: boolean
}

type SystemTemplate = {
  id: string
  name: string
  description: string
  systemPrompt: string
  isDefault: boolean
  createdAt: number
}

type DiffStats = {
  totalChanges: number
  addedChars: number
  removedChars: number
  replacedCount: number
  addedCount: number
  removedCount: number
  formatCount: number
}

// ── 模板图标映射 ──────────────────────────────────────────────────────

// ── 常量 ──────────────────────────────────────────────────────────────

const STORAGE_KEY_RECORDS = 'liang007_optimize_records'
const STORAGE_KEY_TEMPLATES = 'liang007_optimize_templates'
const STORAGE_KEY_FAVORITES = 'liang007_optimize_favorites'
const MAX_CHARS = 10000

const DEFAULT_TEMPLATES: SystemTemplate[] = [
  {
    id: 'tcm-museum',
    name: '中医药博物馆设计',
    description: '中医药博物馆展陈空间设计，融合传统中医文化与现代展陈理念',
    systemPrompt: `你是中医药博物馆设计领域的顶级专家，精通中医文化、传统建筑美学与现代博物馆展陈技术。

请严格按照以下结构输出优化后的提示词：

【空间层】博物馆整体定位
- 博物馆类型：中医药历史博物馆/中药标本博物馆/中医诊疗博物馆/民族医药博物馆/中医药文化体验馆
- 核心主题：中医理论体系/中药发展史/针灸推拿/名医名家/民族医药/养生文化
- 叙事线索：时间轴(上古→近代)/空间轴(中国各地域医药特色)/专题轴(人物/典籍/药材)
- 建筑风格：新中式/传统宫殿式/江南园林式/现代极简中式

【布局层】展厅流线设计
- 平面布局：回字型/流线型/放射型/串联式/并联式
- 空间序列：序厅→主厅→专题厅→尾厅
- 层高要求：标准层高/挑高中庭/夹层空间
- 人流动线：单向/双向/自由流动，疏散通道宽度≥1.5m

【展陈层】展品与展柜设计
- 展品类型：古籍善本/中药标本/医疗器械/方剂档案/名医字画/多媒体互动
- 展柜形式：独立柜/壁龛柜/悬挂柜/景观场景柜/大型场景复原
- 重点展品照明：500-1000lux，重点突出
- 普通展品照明：150-300lux，均匀柔和

【灯光层】专业博物馆照明
- 照明标准：参考《博物馆照明设计规范》GB/T 23863-2009
- 色温选择：2700K(古籍/书画)/3000K(中药标本)/4000K(现代展品)
- 照度控制：相对湿度45%-60%，紫外线辐射≤50μW/lm
- 灯光类型：轨道射灯/灯带/洗墙灯/柜内灯/地脚灯
- 氛围照明：模拟自然光/节气光影/昼夜变化

【材质层】传统工艺与现代材料
- 地面材质：青砖/花岗岩/实木地板/水磨石/地毯
- 墙面材质：木质格栅/宣纸屏风/仿古墙纸/竹编墙饰/浮雕壁画
- 顶面材质：木质藻井/铝合金格栅/织物软膜/仿古瓦当
- 中药元素装饰：药柜陈列/百子柜/药臼/药秤/药碾

【色彩层】中医文化色彩体系
- 主色调：玄色(玄青)/赤色(朱砂)/黄色(帝王黄)/白色(素雅)/青色(草木)
- 辅助色：金色点缀/檀木色/玉石绿
- 五行配色：木(青绿)/火(赤红)/土(黄褐)/金(白)/水(玄黑)

【多媒体层】数字化展陈
- 互动装置：脉诊体验/舌诊互动/中药辨认/针灸模拟
- 多媒体投影：动态《本草纲目》/名医故事/药材生长
- 数字典籍：高清古籍阅读/虚拟翻页

【技术层】渲染参数
- 分辨率：4K/8K/16K超清
- 渲染引擎：Unreal Engine 5/V-Ray/Corona
- 视角选择：全景/鸟瞰/人视点(1.6m)/仰视特写

【合规层】博物馆设计规范
- 消防安全：疏散通道/消防设施/防火材料
- 无障碍设计：轮椅通道/盲道引导/无障碍卫生间
- 文物保存：温湿度控制/防虫防霉/光线防护

输出格式要求：
1. 仅输出优化后的提示词，禁止输出任何解释
2. 使用中文逗号、句号作为分隔符
3. 确保传统中医文化元素与现代展陈技术自然融合`,
    isDefault: true,
    createdAt: Date.now(),
  },
  {
    id: 'tcm-herbarium',
    name: '腊叶标本摄影',
    description: '中药腊叶标本（干燥植物标本）专业摄影，保留植物形态与色彩',
    systemPrompt: `你是中药植物学摄影专家，精通腊叶标本的拍摄技法与后期处理，能够真实还原标本的形态、色彩与科学价值。

请严格按照以下结构输出优化后的提示词：

【标本层】腊叶标本特征
- 植物类型：根茎类/全草类/花果类/叶类/藤木类/皮类
- 压制形态：完整株型/局部特写/根系展示/花果特写
- 干燥程度：新鲜压制/中期干燥/完全干燥/久存泛黄
- 标本状态：品相完好/轻微破损/虫蛀痕迹/历史遗留
- 采集信息标签：学名/中文名/采集地/采集时间/采集人

【形态层】植物学细节
- 茎部特征：直立茎/缠绕茎/匍匐茎/攀援茎，粗细、节间长短
- 叶部细节：单叶/复叶，叶形(卵形/心形/掌状/羽状)，叶缘锯齿，叶脉纹路
- 花部结构：花序类型/花瓣数量/花色变化/花药柱头
- 果实种子：果实类型/种子形态/成熟度
- 根系展示：主根/须根/块根/块茎

【背景层】承载介质与底衬
- 衬纸材质：宣纸/毛边纸/拷贝纸/专用标本纸
- 背景颜色：米白色/象牙白/浅黄褐色/传统古纸色
- 辅助元素：标本标签/编号/比例尺/收藏印章

【光影层】专业标本照明
- 光线类型：正面散射光(均匀柔和)/侧向光(突出立体感)/背透光(叶脉纹理)
- 光质选择：软光箱/硫酸纸柔光/自然散射光
- 光比控制：1:2(自然层次)/1:4(强调立体)/1:1(平面还原)
- 色温设置：5000K(色彩还原)/5500K(自然日光)/3200K(古朴暖调)

【构图层】科学摄影构图
- 构图方式：中心构图(主体突出)/黄金分割(视觉舒适)/对角线(动感延伸)
- 景别选择：整体展示/局部特写(叶脉/花朵)/细节放大
- 比例参照：比例尺/硬币参照
- 装裱形式：传统卷轴/现代框裱/玻璃覆压/裸片展示

【色彩层】标本色彩还原
- 色彩还原：准确还原植物本色/轻微强化色彩/古旧泛黄效果
- 色调处理：自然色/暖黄古朴/冷绿清新/黑白档案风格
- 特殊效果：做旧效果/虫蛀纹理/岁月痕迹

【技术层】高精尖摄影参数
- 分辨率：8K/16K超高清
- 镜头选择：90mm微距/65mm微距(1:1放大)/50mm标准微距
- 光圈设置：f/5.6-f/8(整体清晰)/f/11-f/16(叶脉细节)
- 后期处理：色阶调整/色彩平衡/锐化处理/降噪处理

输出格式要求：
1. 仅输出优化后的提示词，禁止输出任何解释
2. 植物形态描述科学准确，符合植物学规范
3. 光影还原真实自然，避免过度处理导致失真`,
    isDefault: false,
    createdAt: Date.now(),
  },
  {
    id: 'tcm-liquid-specimen',
    name: '浸制标本摄影',
    description: '中药浸制标本（保色液封存）专业摄影，展现透明瓶中标本的色泽与形态',
    systemPrompt: `你是中药标本摄影专家，精通浸制标本的拍摄技法，能够克服玻璃反光、液体折射等拍摄难点，真实呈现标本的自然色泽与形态。

请严格按照以下结构输出优化后的提示词：

【标本层】浸制标本特征
- 保存液类型：福尔马林液(澄清透明)/酒精保存液(轻微变色)/甘油保存液/专用保色浸制液
- 液体状态：清澈透明/轻微浑浊/气泡悬浮/结晶沉淀
- 标本类型：完整植株(全草)/根部标本/果实标本/花类标本/动物标本(蛇/虫/鱼)
- 形态特征：舒展自然/卷曲收缩/色泽鲜艳/褪色陈旧

【器皿层】容器材质与形态
- 瓶身材质：玻璃(清透)/亚克力(轻便)/塑料(安全)
- 瓶口类型：螺旋盖/软木塞/玻璃磨砂盖/密封圈
- 瓶形选择：圆柱形/广口瓶/方瓶/泡菜坛型(传统)
- 瓶身标签：纸质手写/印刷标签/铜牌雕刻/无标签

【背景层】环境与衬底
- 背景选择：纯白/纯黑/渐变灰/木纹/大理石/纱布/绸缎
- 背景处理：干净简洁/传统药材柜背景/自然生态环境
- 搭配元素：传统药柜/药臼/药秤/干药材/古籍
- 氛围营造：药香氤氲/古朴典雅/科学严谨

【光影层】克服玻璃反光的布光技巧
- 主光方向：侧后方45°(减少反光)/正侧光(强调轮廓)/低角度(减少眩光)
- 反光控制：偏振镜消除玻璃反光/黑卡纸遮挡反光点
- 透射光：背透光强调标本通透感/底部透射光表现液体质感
- 环境反射：黑色背景板吸收杂光/白色反光板补充阴影细节
- 色温校准：5500K日光还原真实色彩/根据保存液颜色微调

【构图层】标本展示构图
- 构图方式：居中对称(庄重感)/对角线(动感)/黄金分割(舒适)
- 景别选择：整体瓶身/标本局部特写/多瓶组合
- 视角选择：平视(正视玻璃面)/俯视(展示瓶口标签)/微俯(立体感)
- 水面处理：液面水平/微倾(动态感)/气泡点缀
- 标本位置：居中/偏心/悬浮/贴壁

【色彩层】保色与调色处理
- 色彩还原度：鲜艳保色(新品)/自然褪色(陈年)/人工着色(特殊需求)
- 色调选择：自然原色/暖黄复古/冷绿清新/高饱和强调
- 液体颜色：无色透明/淡黄/淡绿/淡红(根据保存液)
- 背景色彩：白色(明亮干净)/深色(高级质感)/暖色(传统氛围)

【技术层】专业摄影参数
- 分辨率：8K/16K超高清，支持大幅面输出
- 镜头选择：100mm微距(最佳变形控制)/90mm微距/60mm微距
- 光圈设置：f/8-f/11(整体清晰)/f/16-f/22(玻璃表面细节)
- 曝光控制：欠曝1/3档(减少过曝)/高光锁定
- 滤镜使用：偏振镜(CPL)消除反光/渐变灰滤镜平衡光比
- 后期合成：焦点堆叠(扩大景深)/曝光合成(HDR)

输出格式要求：
1. 仅输出优化后的提示词，禁止输出任何解释
2. 光线描述需具体(如"侧后方45°入射光")，便于AI理解布光意图
3. 确保玻璃器皿不出现杂散反光，标本形态清晰可辨`,
    isDefault: false,
    createdAt: Date.now(),
  },
  {
    id: 'tcm-crude-drug',
    name: '生药标本摄影',
    description: '中药生药标本（原生药材）专业摄影，呈现药材的天然形态与质地',
    systemPrompt: `你是中药生药学摄影专家，精通各类中药材的拍摄技法，能够真实展现原生药材的形态特征、纹理质地与药用价值。

请严格按照以下结构输出优化后的提示词：

【药材层】生药标本类型
- 药材大类：根茎类(人参/黄芪/当归)/全草类(薄荷/益母草)/花类(金银花/菊花)/果实种子类(枸杞/杏仁)/皮类(杜仲/肉桂)/叶类(艾叶/枇杷叶)/藤木类(鸡血藤/钩藤)/菌藻类(茯苓/灵芝)
- 药材形态：完整原形/切片/段/块/粉/碎
- 加工状态：原药材/产地加工/炮制后/炙法后(蜜炙/酒炙/醋炙/盐炙)
- 品质等级：特等/一等/二等/统货
- 药材特征：道地药材(特定产区)/栽培/野生

【质地层】药材物理特性
- 表面质感：光滑/粗糙/粉性/角质/纤维性/柴性
- 断面特征：平坦/裂隙/颗粒性/富粉性/纤维性/胶质/朱砂点(苍术)
- 质地软硬：坚硬/柔韧/脆性/粉性/黏性
- 含水状态：干燥/微潮/受潮回软/虫蛀霉变
- 特殊气味：气微/气香/气浓/辛味/苦味/甜味/特殊香气(麝香/冰片)

【背景层】展示环境设计
- 底衬材质：宣纸(传统)/牛皮纸/白瓷盘/玻璃皿/竹编/木盒
- 背景色彩：米白/浅灰/深灰/黑色天鹅绒/原木色
- 搭配道具：药秤/戥子/铜秤/捣药罐/药臼/药粉/药瓶
- 场景氛围：药铺柜台/传统药房/现代展柜/野外采药

【光影层】药材质感表现
- 主光类型：侧光(45°-90°)强调表面纹理/低角度侧光(爬光效果表现粉性)
- 补光技巧：反光板填充阴影/柔光箱柔化边缘
- 透射光：背透光表现半透明药材(如天麻/茯苓)
- 质感强化：硬光(清晰纹理)/软光(柔和质感)
- 特殊效果：耶稣光(丁达尔)穿透灵芝/枸杞透光感
- 色温控制：5500K日光还原/3200K暖光传统氛围

【构图层】药材摄影构图
- 构图方式：特写构图(1-2种药材)/组合构图(多品种展示)/标本画构图(科学规范)
- 视觉层次：主体药材/辅助说明(标签/比例尺)/背景装饰
- 摆放技巧：散落自然/整齐排列/高低错落/疏密有致
- 比例参照：厘米刻度尺/一元硬币/手指/药匙
- 景别选择：整体展示/局部特写(断面/纹理)/显微细节

【色彩层】药材色彩还原
- 色彩还原：忠实原色(科学准确)/艺术强化(视觉美观)
- 色调风格：自然写实/暖色古典/冷色现代/低饱和高级灰
- 色彩层次：表皮色/断面色/粉末色/炮制后颜色变化
- 特殊色彩：硫磺熏制(过白)/发霉(绿黑)/虫蛀(空洞)
- 背景配色：对比色突出/邻近色和谐/撞色时尚

【标签层】信息标注设计
- 标签内容：药材名称(中文/拉丁学名)/产地/规格/批号
- 标签风格：传统毛笔手写/印刷标签/铜牌雕刻/电子标签
- 标签位置：画面角落/药材旁边/底部/悬挂式
- 附加信息：功效说明/性味归经/使用禁忌

【技术层】高分辨率摄影
- 分辨率：8K/16K超高清，支持印刷与数字典藏
- 相机系统：中画幅数码后背/全画幅高像素
- 镜头选择：120mm微距(中画幅)/90mm微距/100mm微距
- 光圈运用：f/2.8-f/4(选择性虚化)/f/5.6-f/8(主体清晰)/f/11-f/16(全片清晰)
- 景深控制：浅景深突出主体/深景深展示整体
- 照明附件：环形闪光灯(消除阴影)/双灯布光/三灯立体布光
- 后期处理：色彩管理/锐化/降噪/焦点合成

输出格式要求：
1. 仅输出优化后的提示词，禁止输出任何解释
2. 药材描述需包含具体的性状特征，便于AI精准生成
3. 光影设计需兼顾质感表现与氛围营造
4. 色彩描述需考虑药材实际颜色与炮制后的变化`,
    isDefault: false,
    createdAt: Date.now(),
  },
  {
    id: 'tcm-slice-specimen',
    name: '饮片标本摄影',
    description: '中药饮片（炮制加工后）专业摄影，呈现饮片的切制形态与炮制特征',
    systemPrompt: `你是中药饮片摄影专家，精通各类中药饮片的拍摄技法，能够真实展现饮片的切制形态、炮制特征与药用价值。

请严格按照以下结构输出优化后的提示词：

【饮片层】炮制饮片类型
- 饮片类别：切片类(圆片/斜片/直片/横片)/段类/块类/丝类/粉类/颗粒类
- 炮制方法：净制/切制/炒制(清炒/麸炒/土炒)/炙法(蜜炙/酒炙/醋炙/盐炙/姜炙)/煅法/蒸煮/燀法
- 药材来源：根茎类/果实种子类/全草类/皮类/花类/叶类/藤木类
- 品质特征：道地产区/栽培品/野生品/优质/统货

【形态层】饮片外观特征
- 厚度规格：极薄片(0.5mm以下)/薄片(1-2mm)/厚片(2-4mm)/斜片/直片
- 切制形态：圆形(直径)/斜形/长条形/不规则块状
- 表面特征：平滑/粗糙/粉性/角质/纤维性/裂隙/颗粒性
- 断面特征：平坦/显纤维性/颗粒性/胶质/朱砂点(苍术)/车轮纹(防己)/菊花心(黄芪)/金井玉栏
- 颜色特征：外皮色/断面色/质地色

【背景层】展示环境设计
- 底衬材质：白瓷盘/黑绒布/牛皮纸/宣纸/玻璃皿/木盒
- 背景色彩：纯白/纯黑/深灰/米白/原木色
- 搭配元素：戥子/药秤/铜臼/捣药杵/饮片瓶/标签
- 场景氛围：中药房/制剂室/传统药铺/现代饮片展柜

【光影层】饮片质感表现
- 主光方向：侧上方45°(强调立体感)/顶光(平面展示)/低角度(爬光)
- 质感表现：粉性药材(金银花/天花粉)需柔和散射光；角质药材(三七/贝母)可用硬光强调
- 透射光：半透明饮片(茯苓/灵芝)可加背透光表现通透感
- 补光技巧：白色反光板填充阴影/黑色吸光板加深阴影
- 特殊效果：体现饮片断面纹理/表现炮制后的色泽变化

【构图层】饮片摄影构图
- 构图方式：单品特写(单一饮片)/组合陈列(多品种)/比例参照(与尺子/硬币)
- 摆放方式：整齐排列/自然散落/高低错落/疏密有致
- 景别选择：整体展示/局部特写(断面/纹理)/显微细节
- 视角选择：俯视(展示整体形态)/平视(强调立体感)/微俯(常用)
- 标签设计：信息卡/拉丁学名标签/产地标签

【色彩层】炮制后色彩处理
- 色彩还原：准确还原炮制后本色/艺术强化
- 炮制色变：炒黄(淡黄)/炒焦(焦褐色)/炒炭(黑色)/蜜炙(黄棕色)/酒炙(淡黄色)
- 色调选择：自然原色/暖色古典/冷色现代/低饱和高级灰
- 背景配色：对比色突出主体/邻近色和谐统一

【技术层】高分辨率摄影
- 分辨率：8K超高清，支持大幅面印刷
- 镜头选择：100mm微距/90mm微距/65mm微距
- 光圈设置：f/5.6-f/8(主体清晰)/f/11(细节展现)/f/16(整体清晰)
- 照明附件：环形闪光灯/双灯布光/偏振镜(减少反光)
- 后期处理：色彩校准/锐化/降噪/局部对比度调整

输出格式要求：
1. 仅输出优化后的提示词，禁止输出任何解释
2. 需明确标注饮片的炮制方法和断面特征
3. 光影设计需准确表现饮片的质地类型(粉性/角质/纤维性等)`,
    isDefault: false,
    createdAt: Date.now(),
  },
  {
    id: 'tcm-mineral',
    name: '矿物标本摄影',
    description: '中药矿物药标本专业摄影，展现矿物的晶体结构与光学特性',
    systemPrompt: `你是中药矿物学摄影专家，精通矿物标本的拍摄技法，能够真实展现矿物的晶体结构、光泽质感与中药药用价值。

请严格按照以下结构输出优化后的提示词：

【矿物层】矿物药材类型
- 矿物大类：金属类(金箔/银箔/铜绿)/非金属类(石膏/滑石/硼砂)/岩石类(赭石/浮石/白石)/化石类(龙骨/龙齿/琥珀)/硫化物类(雄黄/雌黄/朱砂)/氧化物类(磁石/赭石)/卤化物类(盐卤/硝石)
- 药材形态：块状/粒状/片状/粉末状/晶体/结核状/钟乳状
- 矿物纯度：纯品/杂质含量/伴生矿物/人工合成
- 品质特征：色泽纯正/杂质少/结晶完整/药用等级

【晶体层】光学特性
- 晶体系统：等轴晶系(萤石/石榴石)/三方晶系(石英/方解石)/六方晶系(绿柱石)/斜方晶系(重晶石)/单斜晶系(石膏)/三斜晶系(斜长石)
- 解理特征：极完全解理/完全解理/中等解理/不完全解理/无解理
- 断口类型：贝壳状(石英)/参差状(黄铁矿)/土状(高岭土)/平坦状
- 光泽类型：金刚光泽(赤铁矿)/玻璃光泽(石英/萤石)/油脂光泽(软玉)/丝绢光泽(石膏)/土状光泽(高岭土)/金属光泽(黄铁矿/磁铁矿)

【颜色层】矿物色彩
- 自色(固有)：红色(朱砂/赤铁矿)/黄色(雄黄/雌黄)/绿色(孔雀石)/蓝色(石青)/白色(石膏/芒硝)/黑色(磁石/黑曜石)
- 他色(杂质)：紫水晶(含铁)/粉水晶(含锰)/绿松石(含铜)
- 假色(光学效应)：变彩(欧泊)/晕彩(月光石)/猫眼效应(金绿宝石)/星光效应
- 条痕色：矿物粉末颜色(赤铁矿条痕樱红色/磁铁矿条痕黑色)
- 颜色分布：均匀分布/条带状/斑点状/浸染状/脉状充填

【背景层】展示环境设计
- 底衬材质：黑色绒布(突出光泽)/白色瓷板(还原本色)/玻璃皿/木盒
- 背景色彩：黑色(金属光泽矿物)/白色(浅色矿物)/灰色过渡
- 搭配元素：比例尺/标签/放大镜/手电筒(强调光泽)
- 场景氛围：矿物展厅/地质博物馆/中药房/标本收藏柜

【光影层】矿物光泽表现
- 光线类型：单一方向硬光(强调晶体棱角)/多方向软光(均匀照明)
- 光泽强化：侧向光(突出金属光泽)/背透光(表现通透矿物)/顶光(展示整体)
- 镜面反射：黑色卡纸遮挡(避免杂散反光)/偏振镜消除非金属光泽
- 高光控制：精确控制高光位置/保留适当反光体现质感
- 色温设置：5500K日光/3200K暖光(传统氛围)

【构图层】矿物标本构图
- 构图方式：单品特写(单晶或晶簇)/组合展示(多矿物对比)/比例参照
- 晶体朝向：正面展示主要晶面/45°展示立体感/俯视展示晶面花纹
- 景别选择：整体晶形/单晶特写/晶面纹理/解理面细节
- 焦点选择：主要晶体锐利/背景适当虚化
- 画面留白：适当留白突出主体/四边出血增加张力

【技术层】专业矿物摄影
- 分辨率：8K/16K超高清
- 相机选择：中画幅/全画幅高像素
- 镜头选择：120mm微距/100mm微距/65mm微距
- 光圈运用：f/8-f/11(最佳锐度)/f/16-f/22(增加景深)
- 照明方案：单灯硬光/双灯柔光/环形闪光灯/光纤照明
- 滤镜使用：偏振镜(消除非金属反光)/中性灰渐变(平衡光比)
- 景深控制：焦点堆叠(扩大清晰范围)/浅景深(突出主体)
- 后期处理：锐化/色彩管理/局部对比度/高光阴影调整

输出格式要求：
1. 仅输出优化后的提示词，禁止输出任何解释
2. 需明确描述矿物的光泽类型和光学特性
3. 光影设计需准确表现不同光泽(金属/玻璃/油脂/丝绢等)
4. 背景选择需与矿物颜色形成适当对比`,
    isDefault: false,
    createdAt: Date.now(),
  },
  {
    id: 'tcm-animal',
    name: '动物标本摄影',
    description: '中药动物药材标本专业摄影，包括整体标本、骨骼标本与剥制标本',
    systemPrompt: `你是中药动物学摄影专家，精通动物药材标本的拍摄技法，能够真实展现动物标本的形态特征、保存状态与药用价值。

请严格按照以下结构输出优化后的提示词：

【标本层】动物药材类型
- 药材类别：整体入药(海马/海龙/全蝎/蜈蚣/蛤蚧)/脏器入药(熊胆粉/牛黄/麝香)/甲壳类(龟板/鳖甲/牡蛎)/贝壳类(石决明/珍珠母)/昆虫类(僵蚕/蚕沙/蜂房)/骨骼类(乌梢蛇/金钱白花蛇/鹿茸/阿胶)
- 标本类型：腊叶标本/浸制标本/剥制标本/骨骼标本/生药标本(切片/粉末)
- 保存状态：完整形态/破损修复/褪色陈旧/新鲜标本
- 品质特征：野生品/养殖品/道地产区/等级规格

【形态层】动物药材特征
- 外形特征：完整全形/局部特写/背腹面/侧面观
- 形态细节：头/身/尾/四肢/鳞片/甲壳/羽毛/皮毛
- 规格尺寸：大小尺寸/重量等级/完整度
- 特殊标记：品种标识/产地标签/炮制说明

【背景层】展示环境设计
- 底衬材质：白瓷盘/玻璃皿/黑色绒布/宣纸/木板
- 背景色彩：白色(清晰展示)/黑色(立体感)/渐变灰
- 搭配元素：比例尺/参照物/标签/传统药具
- 场景氛围：中药房/标本馆/自然博物馆/传统药铺

【光影层】标本质感表现
- 光线方向：45°侧光(强调立体感)/顶光(平面展示)/低角度(轮廓光)
- 质感表现：硬壳类(龟板/鳖甲)用硬光强调纹理；柔软标本用柔光表现质感
- 光比控制：1:2(自然层次)/1:4(强立体感)
- 细节照明：局部补光强调重点特征
- 色温设置：5500K日光还原/3200K暖光传统氛围

【构图层】动物标本构图
- 构图方式：整体展示/局部特写(头部/鳞片/甲壳)/组合陈列
- 摆放姿态：自然舒展/收缩姿态/侧面展示/背面展示
- 景别选择：整体形态/细节纹理/比例参照
- 视角选择：俯视(整体观)/平视(正视)/侧面(特征展示)
- 背景处理：简洁干净/虚化背景/特写无背景

【色彩层】标本色彩处理
- 色彩还原：忠实原色/轻微修复/艺术强化
- 色调风格：自然原色/暖色古典/冷色现代
- 保存色变：褪色程度/氧化变化/修复色差
- 背景配色：对比色突出/邻近色和谐

【技术层】高分辨率摄影
- 分辨率：8K超高清
- 镜头选择：100mm微距/90mm微距/65mm微距
- 光圈设置：f/5.6-f/8(主体清晰)/f/11-f/16(细节展现)
- 照明方案：双灯布光/环形闪光/侧向硬光
- 景深控制：焦点堆叠(扩大清晰范围)
- 后期处理：色彩校准/锐化/降噪/局部对比

输出格式要求：
1. 仅输出优化后的提示词，禁止输出任何解释
2. 需明确描述动物药材的种类和入药部位
3. 光影设计需准确表现标本的质感类型`,
    isDefault: false,
    createdAt: Date.now(),
  },
  {
    id: 'tcm-ecology',
    name: '生态场景摄影',
    description: '中药原生态场景摄影，再现道地药材的生长环境与生态特征',
    systemPrompt: `你是中药生态摄影专家，精通中药材原生态场景的拍摄技法，能够真实再现道地药材的生长环境、时节特征与生态美学。

请严格按照以下结构输出优化后的提示词：

【生态层】药材生长环境
- 生境类型：高山草甸(冬虫夏草/红景天)/林下阴湿(人参/三七/石斛)/山坡灌丛(柴胡/黄芩)/平原旱地(板蓝根/丹参)/湿地沼泽(芦根/泽泻)/荒漠戈壁(肉苁蓉/锁阳)/海边滩涂(海藻/昆布)/热带雨林(槟榔/砂仁)
- 生态群落：乔木层/灌木层/草本层/地被层/层间植物
- 微生境：石缝/树洞/腐木/苔藓/溪边/岩壁
- 海拔梯度：平原(500m以下)/低山(500-1000m)/中山(1000-3500m)/高山(3500m以上)

【植物层】药材本体特征
- 生长状态：野生/栽培/仿野生/有机种植
- 生育周期：幼苗期/营养期/花期/果期/成熟期/采收期
- 植株部位：全草/根/茎/叶/花/果/种子/皮部
- 形态特征：一年生/多年生/草本/藤本/灌木/乔木
- 道地特征：特定产区标志性特征/与其他产区的区分要点

【时节层】时间与节气
- 季节特征：春季(发芽/返青)/夏季(生长/开花)/秋季(结果/成熟)/冬季(休眠/采收)
- 节气选择：清明(采茶)/谷雨(播种)/夏至(花开)/秋分(收获)/霜降(采药)
- 一天时辰：晨露(清晨采药)/午阳(正午拍摄)/暮色(傍晚氛围)/夜间(特殊拍摄)
- 气候条件：晴朗/多云/阴天/雨后/云雾缭绕/雨雪天气

【空间层】场景纵深感
- 前景运用：前景花朵/叶片/虚化处理/引导视线
- 中景主体：药材植株/生长特写/环境细节
- 远景交代：山峦/森林/村落/天空/云雾
- 三层关系：前景虚化+中景清晰+远景朦胧
- 空间尺度：参照人物/建筑/工具建立场景规模

【光影层】自然光表现
- 光线类型：直射阳光(清晰锐利)/散射光(柔和均匀)/阴天漫射光
- 黄金时刻：日出/日落(暖色调)/蓝调时刻(冷暖对比)
- 光线方向：顺光(色彩鲜艳)/侧光(立体感)/逆光(轮廓光/透射光)/顶光
- 特殊效果：耶稣光(树冠间)/丁达尔效应(林间)/水面倒影/晨雾透视
- 天气光效：阳光穿透云层/雨后彩虹/薄雾笼罩/阴天柔光

【色彩层】生态配色方案
- 环境主色：绿色系(新绿/翠绿/墨绿/黄绿)/棕色系(土地/树皮)/蓝色系(天空/水系)
- 点缀色彩：花朵颜色/果实颜色/秋季彩叶
- 季节色调：春日嫩绿/夏季浓绿/秋日金黄/冬季素雅
- 色调风格：自然写实/浓郁油画/清淡水彩/古朴素雅

【构图层】生态摄影构图
- 构图法则：三分法/黄金分割/对称构图/对角线/框架构图
- 景别选择：宏观场景(展现生境全貌)/中景(植株与环境)/近景(药材特写)/特写(花/果/叶细节)
- 视角选择：平视(自然视角)/俯视(鸟瞰)/仰视(高大植株)/低角度(野花野草)
- 焦平面：前实后虚/前虚后实/全部清晰/选择性对焦
- 画面比例：横版(场景)/竖版(单株)/方版(特写)

【技术层】自然摄影参数
- 分辨率：8K/16K超高清，支持大画幅输出与后期裁剪
- 镜头选择：超广角16-24mm(宏大场景)/标准24-70mm(中景)/长焦70-200mm(特写)/微距镜头(细节)
- 光圈运用：f/2.8-f/4(虚化背景)/f/5.6-f/8(主体清晰)/f/11-f/16(全景深)
- 景深控制：超焦距(全景清晰)/选择性对焦(突出主体)
- 滤镜使用：偏振镜(消除叶片反光)/渐变灰(平衡天地光比)/减光镜(长曝光流水)
- 感光度：低感光度(ISO 100-400)保证画质
- 白平衡：日光(5500K)/阴天(6500K)/阴影(7500K)/手动白平衡精确还原
- 曝光控制：矩阵测光/点测光(针对主体)/包围曝光(HDR)

输出格式要求：
1. 仅输出优化后的提示词，禁止输出任何解释
2. 需明确标注药材的道地产区和生长环境特征
3. 光影设计需兼顾环境氛围与药材主体的表现
4. 时节描述需与药材的实际生长采收规律相符
5. 确保中草药形态特征清晰可辨，避免与其他植物混淆`,
    isDefault: false,
    createdAt: Date.now(),
  },
]

const PLACEHOLDER_TEXT = '请输入原始提示词，支持空间布局、灯光、材质、风格、分辨率等全维度描述'

/** 提示词丰富度打分（满分 100） */
function scorePrompt(prompt: string): {
  score: number
  breakdown: { label: string; score: number; max: number }[]
  suggestions: string[]
} {
  if (!prompt.trim()) return { score: 0, breakdown: [], suggestions: ['请输入提示词'] }

  const p = prompt.toLowerCase()
  const breakdown: { label: string; score: number; max: number }[] = []
  const suggestions: string[] = []

  // 1. 长度维度（20 分）
  const len = prompt.length
  const lenScore = Math.min(20, Math.floor(len / 5))
  breakdown.push({ label: '内容长度', score: lenScore, max: 20 })
  if (lenScore < 10) suggestions.push('建议增加更多描述细节（至少 50 字符）')

  // 2. 空间描述（15 分）
  const spaceKeywords = [
    '空间',
    '布局',
    '尺度',
    '面积',
    '尺寸',
    '平面',
    '立面',
    '剖面',
    '层高',
    '房间',
    '展厅',
    '走廊',
    '大厅',
    '区域',
  ]
  const spaceCount = spaceKeywords.filter(k => p.includes(k)).length
  const spaceScore = Math.min(15, spaceCount * 5)
  breakdown.push({ label: '空间描述', score: spaceScore, max: 15 })
  if (spaceScore < 8) suggestions.push('可补充空间类型、尺度、布局等信息')

  // 3. 灯光描述（15 分）
  const lightKeywords = [
    '灯光',
    '照明',
    '色温',
    '照度',
    'lux',
    '光影',
    '自然光',
    '氛围光',
    '重点照明',
    '基础照明',
    '漫反射',
    '眩光',
  ]
  const lightCount = lightKeywords.filter(k => p.includes(k)).length
  const lightScore = Math.min(15, lightCount * 5)
  breakdown.push({ label: '灯光描述', score: lightScore, max: 15 })
  if (lightScore < 8) suggestions.push('可补充灯光类型、色温、照度等参数')

  // 4. 材质描述（15 分）
  const matKeywords = [
    '材质',
    '材料',
    '石材',
    '木材',
    '金属',
    '玻璃',
    '混凝土',
    '纹理',
    '质感',
    '表面',
    '环保',
    '阻燃',
    '大理石',
    '木材',
  ]
  const matCount = matKeywords.filter(k => p.includes(k)).length
  const matScore = Math.min(15, matCount * 5)
  breakdown.push({ label: '材质描述', score: matScore, max: 15 })
  if (matScore < 8) suggestions.push('可补充材质类型、表面处理、质感等信息')

  // 5. 风格描述（15 分）
  const styleKeywords = [
    '风格',
    '现代',
    '极简',
    '古典',
    '工业',
    '中式',
    '欧式',
    '当代',
    '传统',
    '未来',
    '抽象',
    '写实',
    '氛围',
  ]
  const styleCount = styleKeywords.filter(k => p.includes(k)).length
  const styleScore = Math.min(15, styleCount * 5)
  breakdown.push({ label: '风格描述', score: styleScore, max: 15 })
  if (styleScore < 8) suggestions.push('可补充设计风格、视觉氛围等信息')

  // 6. 技术参数（10 分）
  const techKeywords = [
    '分辨率',
    '4k',
    '8k',
    '渲染',
    '渲染器',
    '视角',
    '画幅',
    '比例',
    '细节',
    '精度',
    '高清',
  ]
  const techCount = techKeywords.filter(k => p.includes(k)).length
  const techScore = Math.min(10, techCount * 5)
  breakdown.push({ label: '技术参数', score: techScore, max: 10 })
  if (techScore < 5) suggestions.push('可补充渲染分辨率、视角、精度等技术参数')

  // 7. 合规性（10 分）
  const complianceKeywords = [
    '无障碍',
    '消防',
    '安全',
    '规范',
    '标准',
    '防火',
    '疏散',
    '人流',
    '动线',
    '文物保护',
  ]
  const complianceCount = complianceKeywords.filter(k => p.includes(k)).length
  const complianceScore = Math.min(10, complianceCount * 5)
  breakdown.push({ label: '合规性', score: complianceScore, max: 10 })
  if (complianceScore < 5) suggestions.push('可补充无障碍设计、消防规范等合规要求')

  const totalScore = breakdown.reduce((s, b) => s + b.score, 0)

  return { score: totalScore, breakdown, suggestions }
}

// ── 工具函数 ─────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function confirmAction(message: string): boolean {
  // eslint-disable-next-line no-alert
  return window.confirm(message)
}

function computeStats(details: ModificationDetail[]): DiffStats {
  let addedChars = 0,
    removedChars = 0
  let addedCount = 0,
    removedCount = 0,
    replacedCount = 0,
    formatCount = 0
  for (const d of details) {
    addedChars += d.optimized.length
    removedChars += d.original.length
    if (d.type === 'added') addedCount++
    else if (d.type === 'removed') removedCount++
    else if (d.type === 'replaced') replacedCount++
    else if (d.type === 'format') formatCount++
  }
  return {
    totalChanges: details.length,
    addedChars,
    removedChars,
    replacedCount,
    addedCount,
    removedCount,
    formatCount,
  }
}

// ── 主组件 ──────────────────────────────────────────────────────────────

export default function PromptOptimizerDialog({
  open,
  onClose,
  originalPrompt,
  onAdopt,
}: {
  open: boolean
  onClose: () => void
  originalPrompt: string
  onAdopt: (optimized: string) => void
}) {
  const [inputPrompt, setInputPrompt] = useState(originalPrompt)
  const [optimizedPrompt, setOptimizedPrompt] = useState('')
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [optimizeError, setOptimizeError] = useState('')
  const [isEditingOutput, setIsEditingOutput] = useState(false)
  const [optimizeTime, setOptimizeTime] = useState('')
  const [_tokenUsage, setTokenUsage] = useState<{
    prompt: number
    completion: number
    total: number
  } | null>(null)

  const [diffResult, setDiffResult] = useState<{
    segments: DiffSegment[]
    details: ModificationDetail[]
  } | null>(null)
  const [activeDetailTab, setActiveDetailTab] = useState<'overview' | 'details'>('overview')
  const [filterType, setFilterType] = useState<'all' | 'added' | 'removed' | 'replaced'>('all')
  const [highlightedChange, setHighlightedChange] = useState<number | null>(null)

  const leftScrollRef = useRef<HTMLDivElement>(null)
  const rightScrollRef = useRef<HTMLDivElement>(null)
  const isSyncScrolling = useRef(false)

  const [records, setRecords] = useState<OptimizeRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_RECORDS)
      if (saved) {
        const parsed = JSON.parse(saved)
        return Array.isArray(parsed)
          ? parsed.map((r: OptimizeRecord) => ({
              ...r,
              details: r.details || [],
              duration: r.duration || 0,
            }))
          : []
      }
    } catch {
      /* ignore */
    }
    return []
  })
  const [showHistory, setShowHistory] = useState(false)

  const [templates, setTemplates] = useState<SystemTemplate[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TEMPLATES)
      if (saved) return JSON.parse(saved)
    } catch {
      /* ignore */
    }
    return DEFAULT_TEMPLATES
  })
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TEMPLATES)
      if (saved) {
        const parsed: SystemTemplate[] = JSON.parse(saved)
        const def = parsed.find(t => t.isDefault)
        if (def) return def.id
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_TEMPLATES[0].id
  })
  const [showTemplateManager, setShowTemplateManager] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Partial<SystemTemplate> | null>(null)
  const [showTemplateEdit, setShowTemplateEdit] = useState(false)
  const [showScoreDetail, setShowScoreDetail] = useState(false)

  // ── 中药标本选择状态 ─────────────────────────────────────────────────
  const [specimenTypes, setSpecimenTypes] = useState<SpecimenType[]>([])
  const [specimenParams, setSpecimenParams] = useState<Record<string, SpecimenParams>>({})
  const [showSpecimenPanel, setShowSpecimenPanel] = useState(false)
  const [specimenInsertMode, setSpecimenInsertMode] = useState<'cursor' | 'append'>('cursor')
  const [slashCommandActive, setSlashCommandActive] = useState(false)
  const [slashFilter, setSlashFilter] = useState('')
  const [ignoredRecommendations, setIgnoredRecommendations] = useState<Set<string>>(new Set())

  // ── 自定义标本类型状态 ─────────────────────────────────────────────────
  type CustomSpecimen = {
    id: string
    label: string
    icon: string
    basePrompt: string
    negativePrompt: string
  }
  const [customSpecimens, setCustomSpecimens] = useState<CustomSpecimen[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SPECIMEN)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [showCustomSpecimenDialog, setShowCustomSpecimenDialog] = useState(false)
  const [_editingCustomSpecimen, setEditingCustomSpecimen] = useState<CustomSpecimen | null>(null)
  const [newCustomSpecimen, setNewCustomSpecimen] = useState<CustomSpecimen>({
    id: '',
    label: '',
    icon: '🔬',
    basePrompt: '',
    negativePrompt: '',
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SPECIMEN, JSON.stringify(customSpecimens))
    } catch {
      /* quota exceeded */
    }
  }, [customSpecimens])

  const [tplDialogSize, setTplDialogSize] = useState({ w: 600, h: 600 })
  const [histDialogSize, setHistDialogSize] = useState({ w: 560, h: 500 })
  const [isTplResizing, setIsTplResizing] = useState(false)
  const [isHistResizing, setIsHistResizing] = useState(false)
  const tplResizeStart = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const histResizeStart = useRef<{ x: number; y: number; w: number; h: number } | null>(null)

  // ── 双栏分隔线拖动 ─────────────────────────────────────────────────
  const [splitRatio, setSplitRatio] = useState(0.5) // 左栏占比，默认 50%
  const [isDraggingSplit, setIsDraggingSplit] = useState(false)
  const splitContainerRef = useRef<HTMLDivElement>(null)

  const [toast, setToast] = useState<{
    message: string
    type: 'success' | 'error' | 'info'
  } | null>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showFavorites, setShowFavorites] = useState(false)
  const [favorites, setFavorites] = useState<OptimizeRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_FAVORITES)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(records.slice(0, 50)))
    } catch {
      /* quota exceeded */
    }
  }, [records])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify(templates))
    } catch {
      /* quota exceeded */
    }
  }, [templates])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_FAVORITES, JSON.stringify(favorites.slice(0, 50)))
    } catch {
      /* quota exceeded */
    }
  }, [favorites])

  useEffect(() => {
    if (open) {
      setInputPrompt(originalPrompt)
      setOptimizedPrompt('')
      setDiffResult(null)
      setOptimizeError('')
      setOptimizeTime('')
      setIsEditingOutput(false)
    }
  }, [open, originalPrompt])

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  // ── 弹窗拖拽调整尺寸 ─────────────────────────────────────────────────
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (isTplResizing && tplResizeStart.current) {
        const dx = e.clientX - tplResizeStart.current.x
        const dy = e.clientY - tplResizeStart.current.y
        setTplDialogSize({
          w: Math.max(400, Math.min(1000, tplResizeStart.current.w + dx)),
          h: Math.max(300, Math.min(800, tplResizeStart.current.h + dy)),
        })
      }
      if (isHistResizing && histResizeStart.current) {
        const dx = e.clientX - histResizeStart.current.x
        const dy = e.clientY - histResizeStart.current.y
        setHistDialogSize({
          w: Math.max(400, Math.min(1000, histResizeStart.current.w + dx)),
          h: Math.max(300, Math.min(800, histResizeStart.current.h + dy)),
        })
      }
    }
    const handleUp = () => {
      setIsTplResizing(false)
      setIsHistResizing(false)
      tplResizeStart.current = null
      histResizeStart.current = null
    }
    if (isTplResizing || isHistResizing) {
      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
      return () => {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
      }
    }
  }, [isTplResizing, isHistResizing])

  // ── 双栏分隔线拖动逻辑 ─────────────────────────────────────────────
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingSplit || !splitContainerRef.current) return
      const rect = splitContainerRef.current.getBoundingClientRect()
      let ratio = (e.clientX - rect.left) / rect.width
      ratio = Math.max(0.2, Math.min(0.8, ratio))
      setSplitRatio(ratio)
    }
    const handleMouseUp = () => {
      setIsDraggingSplit(false)
    }
    if (isDraggingSplit) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDraggingSplit])

  const handleTplResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsTplResizing(true)
      tplResizeStart.current = {
        x: e.clientX,
        y: e.clientY,
        w: tplDialogSize.w,
        h: tplDialogSize.h,
      }
    },
    [tplDialogSize],
  )

  const handleHistResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsHistResizing(true)
      histResizeStart.current = {
        x: e.clientX,
        y: e.clientY,
        w: histDialogSize.w,
        h: histDialogSize.h,
      }
    },
    [histDialogSize],
  )

  // ── 提示词打分 ───────────────────────────────────────────────────────
  const promptScore = useMemo(() => scorePrompt(inputPrompt), [inputPrompt])

  const handleLeftScroll = useCallback(() => {
    if (isSyncScrolling.current || !leftScrollRef.current || !rightScrollRef.current) return
    isSyncScrolling.current = true
    const ratio =
      leftScrollRef.current.scrollTop /
      (leftScrollRef.current.scrollHeight - leftScrollRef.current.clientHeight || 1)
    rightScrollRef.current.scrollTop =
      ratio * (rightScrollRef.current.scrollHeight - rightScrollRef.current.clientHeight)
    requestAnimationFrame(() => {
      isSyncScrolling.current = false
    })
  }, [])

  const handleRightScroll = useCallback(() => {
    if (isSyncScrolling.current || !leftScrollRef.current || !rightScrollRef.current) return
    isSyncScrolling.current = true
    const ratio =
      rightScrollRef.current.scrollTop /
      (rightScrollRef.current.scrollHeight - rightScrollRef.current.clientHeight || 1)
    leftScrollRef.current.scrollTop =
      ratio * (leftScrollRef.current.scrollHeight - leftScrollRef.current.clientHeight)
    requestAnimationFrame(() => {
      isSyncScrolling.current = false
    })
  }, [])

  useEffect(() => {
    if (optimizedPrompt && inputPrompt) {
      const result = computeDiff(inputPrompt, optimizedPrompt)
      setDiffResult(result)
    } else {
      setDiffResult(null)
    }
  }, [optimizedPrompt, inputPrompt])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return
      if (e.key === 'Escape') {
        if (showTemplateManager) {
          setShowTemplateManager(false)
          setEditingTemplate(null)
          setShowTemplateEdit(false)
        } else if (showTemplateEdit) {
          setShowTemplateEdit(false)
          setEditingTemplate(null)
        } else if (showHistory) setShowHistory(false)
        else if (showFavorites) setShowFavorites(false)
        else if (showShortcuts) setShowShortcuts(false)
        else onClose()
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key === 'Enter' &&
        !isOptimizing &&
        !showTemplateManager &&
        !showTemplateEdit
      ) {
        e.preventDefault()
        handleOptimize()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    isOptimizing,
    inputPrompt,
    showTemplateManager,
    showTemplateEdit,
    showHistory,
    showFavorites,
    showShortcuts,
    onClose,
  ])

  const activeTemplate = useMemo(() => {
    return templates.find(t => t.id === selectedTemplateId) || templates[0]
  }, [templates, selectedTemplateId])

  // 当前模板的标本关联信息
  const currentSpecimenHint = useMemo(() => {
    const hint = TEMPLATE_SPECIMEN_HINTS[selectedTemplateId]
    if (!hint) return null

    const activeSpecimenLabels = hint.types
      .map(t => SPECIMEN_CONFIGS[t as Exclude<SpecimenType, 'none'>]?.label)
      .filter(Boolean)

    return {
      types: hint.types,
      hint: hint.hint,
      labels: activeSpecimenLabels as string[],
      recommended: activeSpecimenLabels.length > 0,
    }
  }, [selectedTemplateId])

  // 当前使用的完整配置摘要
  const currentConfigSummary = useMemo(() => {
    const parts: string[] = []
    const icon = TEMPLATE_ICONS[selectedTemplateId] || '📝'
    parts.push(`${icon} ${activeTemplate?.name || '默认'}`)

    const activeSpecimens = specimenTypes.filter(t => t !== 'none')
    if (activeSpecimens.length > 0) {
      const labels = activeSpecimens
        .map(t => SPECIMEN_CONFIGS[t as Exclude<SpecimenType, 'none'>]?.label)
        .filter(Boolean)
      if (labels.length > 0) {
        parts.push(`+ ${labels.join(', ')}`)
      }
    }

    return parts.join(' | ')
  }, [selectedTemplateId, activeTemplate, specimenTypes])

  const handleOptimize = useCallback(async () => {
    if (!inputPrompt.trim()) {
      setOptimizeError('请输入有效的提示词')
      return
    }

    const cfg = getApiConfig()
    const chatModels = cfg.chatModels.filter(m => m.modelId.trim())
    if (chatModels.length === 0) {
      setOptimizeError('请先在「设置 → Chat」标签配置有效模型后再使用优化功能')
      return
    }

    const tpl = activeTemplate
    if (!tpl?.systemPrompt?.trim()) {
      setOptimizeError('当前系统模板为空，请检查模板配置')
      return
    }

    setIsOptimizing(true)
    setOptimizeError('')
    setOptimizedPrompt('')
    setDiffResult(null)

    const startTime = Date.now()

    try {
      const chatModel = chatModels[0]
      const baseUrl = (chatModel.baseUrl?.trim() || cfg.globalBaseUrl?.trim() || '').replace(
        /\/$/,
        '',
      )
      const apiKey = chatModel.apiKey?.trim() || cfg.globalApiKey?.trim() || ''

      if (!baseUrl) throw new Error('未配置 Base URL，请先在「设置 → Global Config」填写接口地址')

      const endpoint = `${baseUrl}/v1/chat/completions`

      // 构建标本专业提示
      let specimenContext = ''
      const activeSpecimens = specimenTypes.filter(t => t !== 'none')
      if (activeSpecimens.length > 0) {
        const specimenDetails = activeSpecimens
          .map(t => {
            const cfg = SPECIMEN_CONFIGS[t as Exclude<SpecimenType, 'none'>]
            if (!cfg) return ''
            const params = specimenParams[t] || { name: '', hasLabel: true }
            const prompt = generateSpecimenPrompt(t, params)
            return `【${cfg.label}】${prompt}\n负面词：${cfg.negativePrompt}`
          })
          .filter(Boolean)
          .join('\n')
        specimenContext = `\n\n【中药标本专业要求】\n用户选择了以下标本类型，请严格遵循对应标本类型的专业规范，将标本的形态、展陈、质感、渲染细节完整融合到优化后的提示词中，逻辑连贯，无生硬拼接：\n${specimenDetails}`
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: chatModel.modelId,
          messages: [
            { role: 'system', content: tpl.systemPrompt + specimenContext },
            { role: 'user', content: `请优化以下提示词：\n\n${inputPrompt}` },
          ],
          temperature: 0.7,
        }),
      })

      if (!res.ok) throw new Error(`API 请求失败，状态码：${res.status}`)

      const data = await res.json()
      const choices = data?.choices as Array<{ message?: { content?: string } }> | undefined
      const optimized = choices?.[0]?.message?.content?.trim()

      if (!optimized) throw new Error('API 返回数据为空')

      // 提取 token 用量
      const usage = data?.usage as
        | { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
        | undefined
      if (usage?.total_tokens) {
        setTokenUsage({
          prompt: usage.prompt_tokens || 0,
          completion: usage.completion_tokens || 0,
          total: usage.total_tokens || 0,
        })
      } else {
        setTokenUsage(null)
      }

      const duration = Date.now() - startTime
      setOptimizedPrompt(optimized)
      setOptimizeTime(new Date().toLocaleTimeString('zh-CN'))

      const diffRes = computeDiff(inputPrompt, optimized)
      const record: OptimizeRecord = {
        id: generateId(),
        timestamp: Date.now(),
        originalPrompt: inputPrompt,
        optimizedPrompt: optimized,
        details: diffRes.details,
        duration,
        templateName: tpl.name,
      }
      setRecords(prev => [record, ...prev].slice(0, 50))
      showToast('优化完成', 'success')
    } catch (e) {
      setOptimizeError(e instanceof Error ? e.message : String(e))
      showToast('优化失败', 'error')
    } finally {
      setIsOptimizing(false)
    }
  }, [inputPrompt, showToast, activeTemplate, specimenParams, specimenTypes])

  const handleCopy = useCallback(async () => {
    if (!optimizedPrompt.trim()) {
      showToast('没有可复制的内容', 'info')
      return
    }
    try {
      await navigator.clipboard.writeText(optimizedPrompt)
      showToast('已复制到剪贴板', 'success')
    } catch {
      showToast('复制失败', 'error')
    }
  }, [optimizedPrompt, showToast])

  const handleSaveOriginal = useCallback(() => {
    if (!inputPrompt.trim()) {
      showToast('没有内容可保存', 'info')
      return
    }
    onAdopt(inputPrompt.trim())
    showToast('已保存原始提示词修改', 'success')
  }, [inputPrompt, showToast, onAdopt])

  const handleRestoreRecord = useCallback(
    (record: OptimizeRecord) => {
      setInputPrompt(record.originalPrompt)
      setOptimizedPrompt(record.optimizedPrompt)
      setShowHistory(false)
      showToast('已恢复历史记录', 'success')
    },
    [showToast],
  )

  const handleJumpToChange = useCallback((changeIndex: number) => {
    setHighlightedChange(changeIndex)
    setTimeout(() => setHighlightedChange(null), 3000)
  }, [])

  const handleExportReport = useCallback(() => {
    if (!diffResult) return
    const stats = computeStats(diffResult.details)
    const lines = [
      '提示词优化报告',
      '='.repeat(50),
      '',
      `优化时间：${optimizeTime}`,
      `使用模板：${activeTemplate?.name || '默认'}`,
      `总修改处数：${stats.totalChanges}`,
      `新增内容：${stats.addedChars} 字符`,
      `删除内容：${stats.removedChars} 字符`,
      '',
      '─ 原始提示词 ─',
      inputPrompt,
      '',
      '─ 优化后提示词 ─',
      optimizedPrompt,
      '',
      '─ 修改明细 ─',
      ...diffResult.details.map(
        (d, i) =>
          `[${i + 1}] ${d.type === 'added' ? '新增' : d.type === 'removed' ? '删除' : '替换'}\n原始：${d.original || '(无)'}\n优化后：${d.optimized || '(无)'}\n原因：${d.reason}\n`,
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `提示词优化报告_${new Date().toLocaleDateString('zh-CN')}.txt`
    a.click()
    URL.revokeObjectURL(url)
    showToast('报告已导出', 'success')
  }, [diffResult, inputPrompt, optimizedPrompt, optimizeTime, showToast, activeTemplate])

  // ── 收藏 / 取消收藏 ─────────────────────────────────────────────────
  const handleToggleFavorite = useCallback(() => {
    if (!optimizedPrompt.trim()) return
    const exists = favorites.find(f => f.optimizedPrompt === optimizedPrompt)
    if (exists) {
      setFavorites(prev => prev.filter(f => f.id !== exists.id))
      showToast('已取消收藏', 'info')
    } else {
      const fav: OptimizeRecord = {
        id: generateId(),
        timestamp: Date.now(),
        originalPrompt: inputPrompt,
        optimizedPrompt,
        details: diffResult?.details || [],
        duration: 0,
        templateName: activeTemplate?.name,
        isFavorite: true,
      }
      setFavorites(prev => [fav, ...prev].slice(0, 50))
      showToast('已加入收藏', 'success')
    }
  }, [optimizedPrompt, inputPrompt, favorites, diffResult, activeTemplate, showToast])

  // ── 套用收藏到输入框 ─────────────────────────────────────────────────
  const handleApplyFavorite = useCallback(
    (record: OptimizeRecord) => {
      setInputPrompt(record.originalPrompt)
      setOptimizedPrompt(record.optimizedPrompt)
      setShowFavorites(false)
      showToast('已套用收藏内容', 'success')
    },
    [showToast],
  )

  // ── 模板导入 ────────────────────────────────────────────────────────
  const handleImportTemplates = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = e => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = ev => {
        try {
          const imported: SystemTemplate[] = JSON.parse(ev.target?.result as string)
          if (!Array.isArray(imported)) throw new Error('格式错误')
          const merged = [...templates]
          for (const tpl of imported) {
            if (!merged.find(t => t.id === tpl.id)) {
              merged.push({ ...tpl, id: tpl.id || generateId() })
            }
          }
          setTemplates(merged)
          showToast(`已导入 ${imported.length} 个模板`, 'success')
        } catch {
          showToast('导入失败，文件格式不正确', 'error')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }, [templates, showToast])

  // ── 模板导出 ────────────────────────────────────────────────────────
  const handleExportTemplates = useCallback(() => {
    const blob = new Blob([JSON.stringify(templates, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `提示词模板_${new Date().toLocaleDateString('zh-CN')}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast('模板已导出', 'success')
  }, [templates, showToast])

  // ── 套用模板到输入框 ─────────────────────────────────────────────────
  const handleApplyTemplateToInput = useCallback(
    (tpl: SystemTemplate) => {
      setInputPrompt(tpl.systemPrompt)
      setShowTemplateManager(false)
      showToast('模板内容已填入输入框', 'success')
    },
    [showToast],
  )

  // ── 中药标本：切换选中类型 ───────────────────────────────────────────
  const handleToggleSpecimenType = useCallback(
    (type: SpecimenType) => {
      if (type === 'none') {
        setSpecimenTypes([])
        setSpecimenParams({})
        return
      }
      setSpecimenTypes(prev => {
        if (prev.includes(type)) return prev.filter(t => t !== type)
        return [...prev, type]
      })
      // 选中时自动随机填充一个药材名称
      if (!specimenParams[type]) {
        const herb = getRandomHerb(type)
        if (herb) {
          setSpecimenParams(prev => ({ ...prev, [type]: { hasLabel: true, ...herb } }))
        } else {
          setSpecimenParams(prev => ({ ...prev, [type]: { name: '', hasLabel: true } }))
        }
      }
    },
    [specimenParams],
  )

  // ── 中药标本：更新参数 ──────────────────────────────────────────────
  const handleUpdateSpecimenParam = useCallback(
    (type: SpecimenType, field: keyof SpecimenParams, value: string | boolean) => {
      setSpecimenParams(prev => ({
        ...prev,
        [type]: { ...(prev[type] || { name: '', hasLabel: true }), [field]: value },
      }))
    },
    [],
  )

  // ── 中药标本：插入提示词到输入框 ─────────────────────────────────────
  const handleInsertSpecimenPrompt = useCallback(
    (type: SpecimenType) => {
      const params = specimenParams[type] || { name: '', hasLabel: true }
      const prompt = generateSpecimenPrompt(type, params)
      if (!prompt) return
      setInputPrompt(prev => {
        if (!prev.trim()) return prompt
        return prev + '\n' + prompt
      })
      setShowSpecimenPanel(false)
      setSlashCommandActive(false)
      showToast(
        `${SPECIMEN_CONFIGS[type as Exclude<SpecimenType, 'none'>]?.label || ''} 提示词已插入`,
        'success',
      )
    },
    [specimenParams, showToast],
  )

  // ── 中药标本：插入全部 ──────────────────────────────────────────────
  const handleInsertAllSpecimens = useCallback(() => {
    const prompts = specimenTypes
      .filter(t => t !== 'none')
      .map(t => generateSpecimenPrompt(t, specimenParams[t] || { name: '', hasLabel: true }))
      .filter(Boolean)
    if (prompts.length === 0) {
      showToast('请先选择标本类型', 'info')
      return
    }
    const combined = prompts.join('\n')
    setInputPrompt(prev => {
      if (!prev.trim()) return combined
      return prev + '\n' + combined
    })
    setShowSpecimenPanel(false)
    showToast(`已插入 ${prompts.length} 个标本提示词`, 'success')
  }, [specimenTypes, specimenParams, showToast])

  // ── 中药标本：保存为模板 ────────────────────────────────────────────
  const handleSaveSpecimenAsTemplate = useCallback(() => {
    if (specimenTypes.length === 0) {
      showToast('请先选择标本类型', 'info')
      return
    }
    const labels = specimenTypes
      .filter(t => t !== 'none')
      .map(t => SPECIMEN_CONFIGS[t]?.label)
      .join(' + ')
    const prompt = specimenTypes
      .filter(t => t !== 'none')
      .map(t => generateSpecimenPrompt(t, specimenParams[t] || { name: '', hasLabel: true }))
      .filter(Boolean)
      .join('\n')
    const newTpl: SystemTemplate = {
      id: generateId(),
      name: `${labels} 标本模板`,
      description: `自动生成的${labels}标本提示词模板`,
      systemPrompt: prompt,
      isDefault: false,
      createdAt: Date.now(),
    }
    setTemplates(prev => [...prev, newTpl])
    showToast('标本配置已保存为模板', 'success')
  }, [specimenTypes, specimenParams, showToast])

  // ── 智能推荐：识别输入中的标本类型（完全匹配标本名称才触发） ──────────────────
  const detectedSpecimens = useMemo(() => {
    if (!inputPrompt.trim()) return []
    const p = inputPrompt
    const detected: SpecimenType[] = []
    for (const [type, cfg] of Object.entries(SPECIMEN_CONFIGS)) {
      // 只有完全匹配标本正式名称才触发（如"浸制标本"、"腊叶标本"、"生药标本"、"饮片标本"）
      const exactMatch = p.includes(cfg.label)
      if (exactMatch && !ignoredRecommendations.has(type)) {
        detected.push(type as SpecimenType)
      }
    }
    return detected
  }, [inputPrompt, ignoredRecommendations])

  // ── 智能推荐：插入推荐标本 ──────────────────────────────────────────
  const handleInsertRecommendation = useCallback(
    (type: SpecimenType) => {
      const cfg = SPECIMEN_CONFIGS[type as Exclude<SpecimenType, 'none'>]
      if (!cfg) return

      // 确保有药材名称（如果缺失则随机填充）
      let currentParams = specimenParams[type]
      if (!currentParams?.name) {
        const herb = getRandomHerb(type)
        if (herb) {
          setSpecimenParams(prev => ({ ...prev, [type]: { hasLabel: true, ...herb } }))
          currentParams = { hasLabel: true, ...herb }
        } else {
          currentParams = { name: 'XXX', hasLabel: true }
        }
      }

      const prompt = generateSpecimenPrompt(type, currentParams)

      setInputPrompt(prev => {
        if (!prev.trim()) return prompt
        return prev + '\n' + prompt
      })
      setIgnoredRecommendations(prev => new Set(prev).add(type))
      showToast(`已插入${cfg.label}提示词`, 'success')
    },
    [specimenParams, showToast],
  )

  const handleIgnoreRecommendation = useCallback((type: SpecimenType) => {
    setIgnoredRecommendations(prev => new Set(prev).add(type))
  }, [])

  // ── 斜杠命令处理 ────────────────────────────────────────────────────
  const handleTextareaKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (slashCommandActive) {
        if (e.key === 'Escape') {
          setSlashCommandActive(false)
          setSlashFilter('')
          return
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          const filtered = SPECIMEN_TYPE_LIST.filter(
            s => s.value !== 'none' && s.label.includes(slashFilter),
          )
          if (filtered.length > 0) {
            handleInsertSpecimenPrompt(filtered[0].value)
          }
          return
        }
      }
    },
    [slashCommandActive, slashFilter, handleInsertSpecimenPrompt],
  )

  const handleTextareaInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    if (val.length <= MAX_CHARS) {
      setInputPrompt(val)
    }
    const cursorPos = (e.target as HTMLTextAreaElement).selectionStart
    const textBeforeCursor = val.slice(0, cursorPos)
    const slashMatch = textBeforeCursor.match(/\/([^\s]*)$/)
    if (slashMatch) {
      setSlashCommandActive(true)
      setSlashFilter(slashMatch[1])
    } else {
      setSlashCommandActive(false)
      setSlashFilter('')
    }
  }, [])

  // ── 标本专业维度打分 ────────────────────────────────────────────────
  const specimenScore = useMemo(() => {
    if (specimenTypes.length === 0 || specimenTypes.every(t => t === 'none')) return null
    let score = 0
    const maxScore = specimenTypes.length * 25
    for (const type of specimenTypes) {
      if (type === 'none') continue
      const cfg = SPECIMEN_CONFIGS[type as Exclude<SpecimenType, 'none'>]
      if (!cfg) continue
      const params = specimenParams[type] || { name: '', hasLabel: true }
      const filled = cfg.requiredFields.filter(f => params[f] && String(params[f]).trim()).length
      score += Math.floor((filled / cfg.requiredFields.length) * 20)
      const optFilled = cfg.optionalFields.filter(f => params[f] && String(params[f]).trim()).length
      score += Math.floor((optFilled / cfg.optionalFields.length) * 5)
    }
    return { score: Math.min(score, maxScore), max: maxScore }
  }, [specimenTypes, specimenParams])

  // ── 模板管理 ────────────────────────────────────────────────────────
  const handleSaveTemplate = useCallback(() => {
    if (!editingTemplate?.name?.trim() || !editingTemplate?.systemPrompt?.trim()) {
      showToast('请输入模板名称和优化规则', 'error')
      return
    }
    if (editingTemplate.id) {
      setTemplates(prev =>
        prev.map(t =>
          t.id === editingTemplate.id
            ? ({
                ...t,
                ...editingTemplate,
                name: editingTemplate.name!.trim(),
                systemPrompt: editingTemplate.systemPrompt!.trim(),
              } as SystemTemplate)
            : t,
        ),
      )
      showToast('模板已更新', 'success')
    } else {
      const newTpl: SystemTemplate = {
        id: generateId(),
        name: editingTemplate.name.trim(),
        description: editingTemplate.description?.trim() || '',
        systemPrompt: editingTemplate.systemPrompt.trim(),
        isDefault: false,
        createdAt: Date.now(),
      }
      setTemplates(prev => [...prev, newTpl])
      showToast('模板已创建', 'success')
    }
    setEditingTemplate(null)
  }, [editingTemplate, showToast])

  const handleDeleteTemplate = useCallback(
    (id: string) => {
      const tpl = templates.find(t => t.id === id)
      if (!tpl) return
      if (!confirmAction(`确定要删除模板「${tpl.name}」吗？`)) return
      setTemplates(prev => {
        const next = prev.filter(t => t.id !== id)
        if (selectedTemplateId === id) {
          setSelectedTemplateId(next[0]?.id || '')
        }
        return next
      })
      showToast('模板已删除', 'success')
    },
    [selectedTemplateId, showToast, templates],
  )

  const handleSetDefaultTemplate = useCallback(
    (id: string) => {
      setTemplates(prev => prev.map(t => ({ ...t, isDefault: t.id === id })))
      setSelectedTemplateId(id)
      showToast('已设为默认模板', 'success')
    },
    [showToast],
  )

  const stats = useMemo(() => (diffResult ? computeStats(diffResult.details) : null), [diffResult])
  const filteredDetails = useMemo(() => {
    if (!diffResult) return []
    if (filterType === 'all') return diffResult.details
    return diffResult.details.filter(d => d.type === filterType)
  }, [diffResult, filterType])

  const isValidInput = inputPrompt.trim().length > 0

  if (!open) return null

  return (
    <div
      className="overlay-dark fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="flex flex-col overflow-hidden rounded-xl bg-white/[0.06] shadow-2xl"
        style={{ width: 'min(96vw, 1400px)', height: 'min(92vh, 900px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ═══════════════════════════════════════════════════════
            顶部操作栏
        ═══════════════════════════════════════════════════════ */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.08] bg-white/[0.04] px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 shadow-sm">
              <svg
                className="h-5 w-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">提示词优化器</h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
                自定义系统模板 · 差异对比 · 专业优化
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* 模板选择器 - 增强版 */}
            <div className="flex items-center gap-1">
              <select
                value={selectedTemplateId}
                onChange={e => setSelectedTemplateId(e.target.value)}
                className="min-w-[140px] cursor-pointer rounded-lg border border-white/[0.08] bg-white/[0.06] px-2.5 py-1.5 text-xs text-slate-400 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                title="选择系统模板"
              >
                {templates.map(t => (
                  <option key={t.id} value={t.id}>
                    {TEMPLATE_ICONS[t.id] || '📝'} {t.name}
                    {t.isDefault ? ' ★' : ''}
                  </option>
                ))}
              </select>
              {/* 当前模板快捷说明 */}
              {currentSpecimenHint && currentSpecimenHint.recommended && (
                <button
                  onClick={() => {
                    // 自动选中推荐标本类型
                    const newTypes = currentSpecimenHint.types.filter(
                      t => !specimenTypes.includes(t),
                    )
                    if (newTypes.length > 0) {
                      setSpecimenTypes(prev => [
                        ...prev.filter(t => !currentSpecimenHint.types.includes(t)),
                        ...newTypes,
                      ])
                    }
                    setShowSpecimenPanel(true)
                  }}
                  className="flex items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-400 transition hover:bg-emerald-500/15"
                  title={currentSpecimenHint.hint}
                >
                  <span>🎯</span>
                  <span>配{currentSpecimenHint.labels[0]}</span>
                </button>
              )}
            </div>
            {/* 当前配置摘要 */}
            <div
              className="hidden max-w-[200px] items-center gap-1 truncate rounded bg-white/[0.08] px-2 py-1 text-[10px] text-slate-500 lg:flex"
              title={currentConfigSummary}
            >
              <span>配置:</span>
              <span className="truncate">{currentConfigSummary}</span>
            </div>
            <button
              onClick={() => setShowTemplateManager(true)}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-slate-400 transition hover:bg-white/[0.06]"
              title="管理系统模板"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              模板管理
            </button>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-slate-400 transition hover:bg-white/[0.06]"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              历史记录
              {records.length > 0 && (
                <span className="rounded bg-blue-500/15 px-1 text-[9px] font-bold text-blue-400">
                  {records.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setShowFavorites(!showFavorites)}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-slate-400 transition hover:bg-white/[0.06]"
              title="收藏的优化结果"
            >
              <svg
                className="h-3.5 w-3.5"
                fill={favorites.length > 0 ? 'currentColor' : 'none'}
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                />
              </svg>
              收藏
              {favorites.length > 0 && (
                <span className="rounded bg-amber-500/15 px-1 text-[9px] font-bold text-amber-400">
                  {favorites.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setShowShortcuts(!showShortcuts)}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-400"
              title="快捷键"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-400"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════
            主体双栏对比区
        ═══════════════════════════════════════════════════════ */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div ref={splitContainerRef} className="flex flex-1 overflow-hidden">
            {/* ── 左栏：原始提示词 ── */}
            <div
              className="flex flex-col border-r border-white/[0.08]"
              style={{ flex: `0 0 ${splitRatio * 100}%`, minWidth: 0 }}
            >
              <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.06] bg-white/[0.04] px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    原始提示词
                  </span>
                  <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] text-slate-300">
                    输入区
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {specimenTypes.length > 0 && specimenTypes.some(t => t !== 'none') && (
                    <button
                      onClick={() => setShowSpecimenPanel(!showSpecimenPanel)}
                      className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400 transition hover:bg-emerald-500/25"
                    >
                      🏷️ 标本 ({specimenTypes.filter(t => t !== 'none').length})
                    </button>
                  )}
                  <button
                    onClick={() => setShowSpecimenPanel(!showSpecimenPanel)}
                    className="text-[10px] text-slate-400 transition hover:text-emerald-400"
                    title="中药标本选择"
                  >
                    + 标本
                  </button>
                  {inputPrompt && (
                    <button
                      onClick={() => {
                        setInputPrompt('')
                        setOptimizedPrompt('')
                        setDiffResult(null)
                        setSpecimenTypes([])
                        setSpecimenParams({})
                      }}
                      className="text-[10px] text-slate-400 transition hover:text-red-500"
                    >
                      清空
                    </button>
                  )}
                </div>
              </div>

              {/* ── 标本选择面板 ── */}
              {showSpecimenPanel && (
                <div
                  className="flex-shrink-0 border-b border-emerald-500/20 bg-white/[0.04]"
                  style={{ maxHeight: 420 }}
                >
                  <div className="flex items-center justify-between border-b border-emerald-500/20 px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-emerald-400">标本类型选择</span>
                      {/* 当前模板关联提示 */}
                      {currentSpecimenHint && (
                        <span className="rounded border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-400">
                          💡 当前模板: {currentSpecimenHint.hint}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() =>
                          setSpecimenInsertMode(prev => (prev === 'cursor' ? 'append' : 'cursor'))
                        }
                        className="text-[10px] text-emerald-400 underline hover:text-emerald-300"
                      >
                        {specimenInsertMode === 'cursor' ? '光标插入' : '末尾追加'}
                      </button>
                      <button
                        onClick={() => setShowCustomSpecimenDialog(true)}
                        className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400 transition hover:bg-amber-500/25"
                      >
                        + 自定义
                      </button>
                      <button
                        onClick={() => {
                          setShowSpecimenPanel(false)
                        }}
                        className="text-[10px] text-slate-400 hover:text-slate-400"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <div className="overflow-auto p-3" style={{ maxHeight: 370 }}>
                    {/* 类型卡片 + 一键插入 */}
                    <div className="mb-2 flex items-center gap-1.5">
                      <div className="grid flex-1 grid-cols-5 gap-1.5">
                        {SPECIMEN_TYPE_LIST.filter(s => s.value !== 'none').map(s => {
                          const isSelected = specimenTypes.includes(s.value)
                          const isRecommended = currentSpecimenHint?.types.includes(s.value)
                          return (
                            <button
                              key={s.value}
                              onClick={() => handleToggleSpecimenType(s.value)}
                              className={`relative flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-medium transition ${
                                isSelected
                                  ? 'border-emerald-400 bg-emerald-500/15 text-emerald-400'
                                  : isRecommended && currentSpecimenHint?.recommended
                                    ? 'border-blue-300 bg-blue-500/10 text-blue-400 hover:border-blue-400 hover:bg-blue-500/15'
                                    : 'border-white/[0.08] bg-white/[0.06] text-slate-500 hover:border-emerald-300 hover:text-emerald-400'
                              }`}
                              title={
                                isRecommended && currentSpecimenHint
                                  ? `${currentSpecimenHint.hint} - 推荐配合此模板使用`
                                  : s.label
                              }
                            >
                              {s.icon && <span>{s.icon}</span>}
                              <span className="truncate">{s.label}</span>
                              {isRecommended && !isSelected && (
                                <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-blue-500"></span>
                              )}
                            </button>
                          )
                        })}
                        {/* 自定义标本类型 */}
                        {customSpecimens.map(s => {
                          const isSelected = specimenTypes.includes(s.id)
                          return (
                            <button
                              key={s.id}
                              onClick={() => handleToggleSpecimenType(s.id)}
                              className={`relative flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-medium transition ${
                                isSelected
                                  ? 'border-amber-400 bg-amber-500/15 text-amber-400'
                                  : 'border-amber-500/20 bg-amber-500/10 text-amber-400 hover:border-amber-400'
                              }`}
                            >
                              <span>{s.icon}</span>
                              <span className="truncate">{s.label}</span>
                              <button
                                onClick={e => {
                                  e.stopPropagation()
                                  setCustomSpecimens(prev => prev.filter(cs => cs.id !== s.id))
                                  setSpecimenTypes(prev => prev.filter(t => t !== s.id))
                                }}
                                className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] text-white hover:bg-red-600"
                                title="删除"
                              >
                                ✕
                              </button>
                            </button>
                          )
                        })}
                      </div>
                      {specimenTypes.filter(t => t !== 'none').length > 0 && (
                        <button
                          onClick={handleInsertAllSpecimens}
                          className="flex-shrink-0 whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-bold text-white transition hover:bg-emerald-700"
                        >
                          一键插入全部
                        </button>
                      )}
                    </div>
                    {/* 参数表单 */}
                    {specimenTypes
                      .filter(t => t !== 'none')
                      .map(type => {
                        const cfg = SPECIMEN_CONFIGS[type as Exclude<SpecimenType, 'none'>]
                        const isCustom = customSpecimens.find(cs => cs.id === type)
                        const params = specimenParams[type] || { name: '', hasLabel: true }
                        const preview = cfg
                          ? generateSpecimenPrompt(type, params)
                          : specimenParams[type]?.name || isCustom?.basePrompt || ''

                        return (
                          <div
                            key={type}
                            className="mb-2 overflow-hidden rounded-lg border border-amber-500/20 bg-white/[0.06]"
                          >
                            {/* 标题栏 */}
                            <div className="flex items-center justify-between border-b border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5">
                              <span className="text-[10px] font-bold text-amber-400">
                                {isCustom
                                  ? `${isCustom.icon} ${isCustom.label}`
                                  : `${cfg?.icon} ${cfg?.label}`}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => {
                                    const text = cfg
                                      ? generateSpecimenPrompt(type, params)
                                      : specimenParams[type]?.name || isCustom?.basePrompt || ''
                                    navigator.clipboard.writeText(text)
                                    showToast('已复制', 'success')
                                  }}
                                  className="text-[9px] text-slate-400 hover:text-blue-500"
                                >
                                  复制
                                </button>
                                <button
                                  onClick={() => {
                                    handleInsertSpecimenPrompt(type)
                                  }}
                                  className="text-[9px] font-medium text-amber-400 underline hover:text-amber-300"
                                >
                                  插入
                                </button>
                              </div>
                            </div>

                            {/* 自定义标本：简化表单 */}
                            {isCustom && (
                              <div className="p-2.5">
                                <div className="mb-2">
                                  <label className="mb-0.5 block text-[9px] text-slate-400">
                                    标本名称 *
                                  </label>
                                  <input
                                    type="text"
                                    className="w-full rounded border border-white/[0.08] bg-white/[0.06] px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-amber-500/30"
                                    value={specimenParams[type]?.name || ''}
                                    onChange={e =>
                                      handleUpdateSpecimenParam(type, 'name', e.target.value)
                                    }
                                    placeholder="输入标本名称"
                                  />
                                </div>
                                <div className="mb-1 text-[9px] text-slate-400">提示词预览</div>
                                <div className="max-h-20 overflow-auto whitespace-pre-wrap rounded bg-white/[0.04] p-2 text-[9px] text-slate-400">
                                  {isCustom.basePrompt.replace(
                                    /\[名称\]/g,
                                    specimenParams[type]?.name || 'XXX',
                                  )}
                                </div>
                              </div>
                            )}

                            {/* 参数区 */}
                            <div className="p-2.5">
                              {/* 必填字段 */}
                              <div className="mb-2">
                                <div className="mb-1 text-[9px] font-medium text-slate-400">
                                  必填参数
                                </div>
                                <div className="grid grid-cols-2 gap-1.5">
                                  {cfg.requiredFields.map(field => (
                                    <div key={field}>
                                      <label className="mb-0.5 block text-[9px] text-slate-400">
                                        {field === 'name'
                                          ? '中药正式名 *'
                                          : field === 'family'
                                            ? '科属 *'
                                            : field === 'origin'
                                              ? '产地 *'
                                              : field === 'part'
                                                ? '药用部位 *'
                                                : field === 'latinName'
                                                  ? '拉丁学名 *'
                                                  : field === 'processingSpec'
                                                    ? '炮制规格 *'
                                                    : field}
                                      </label>
                                      {field === 'part' ? (
                                        <select
                                          className="w-full rounded border border-white/[0.08] bg-white/[0.06] px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                                          value={String(params[field] || '')}
                                          onChange={e =>
                                            handleUpdateSpecimenParam(type, field, e.target.value)
                                          }
                                        >
                                          <option value="">请选择</option>
                                          <option value="根">根</option>
                                          <option value="根茎">根茎</option>
                                          <option value="茎">茎</option>
                                          <option value="叶">叶</option>
                                          <option value="花">花</option>
                                          <option value="果实">果实</option>
                                          <option value="种子">种子</option>
                                          <option value="全草">全草</option>
                                          <option value="皮">皮</option>
                                          <option value="树脂">树脂</option>
                                        </select>
                                      ) : (
                                        <input
                                          type="text"
                                          className="w-full rounded border border-white/[0.08] bg-white/[0.06] px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                                          value={String(params[field] || '')}
                                          onChange={e =>
                                            handleUpdateSpecimenParam(type, field, e.target.value)
                                          }
                                          placeholder={
                                            field === 'name'
                                              ? '如：黄芪、当归'
                                              : field === 'latinName'
                                                ? '如：Astragalus membranaceus'
                                                : ''
                                          }
                                        />
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* 可选字段 */}
                              <div>
                                <div className="mb-1 text-[9px] font-medium text-slate-400">
                                  可选参数
                                </div>
                                <div className="grid grid-cols-3 gap-1.5">
                                  {cfg.optionalFields.map(field => (
                                    <div key={field}>
                                      <label className="mb-0.5 block text-[9px] text-slate-400">
                                        {field === 'bottleType'
                                          ? '瓶型'
                                          : field === 'liquidType'
                                            ? '浸制液'
                                            : field === 'cabinetType'
                                              ? '展柜'
                                              : field === 'hasLabel'
                                                ? '带标签'
                                                : field === 'sheetSpec'
                                                  ? '台纸规格'
                                                  : field === 'collector'
                                                    ? '采集人'
                                                    : field === 'collectTime'
                                                      ? '采集时间'
                                                      : field === 'showSection'
                                                        ? '展示断面'
                                                        : field === 'standMaterial'
                                                          ? '展台材质'
                                                          : field === 'sliceShape'
                                                            ? '片型'
                                                            : field === 'thickness'
                                                              ? '厚度'
                                                              : field}
                                      </label>
                                      {field === 'hasLabel' || field === 'showSection' ? (
                                        <select
                                          className="w-full rounded border border-white/[0.08] bg-white/[0.06] px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                                          value={params[field] ? 'true' : 'false'}
                                          onChange={e =>
                                            handleUpdateSpecimenParam(
                                              type,
                                              field,
                                              e.target.value === 'true',
                                            )
                                          }
                                        >
                                          <option value="true">是</option>
                                          <option value="false">否</option>
                                        </select>
                                      ) : field === 'bottleType' ? (
                                        <select
                                          className="w-full rounded border border-white/[0.08] bg-white/[0.06] px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                                          value={String(params[field] || '')}
                                          onChange={e =>
                                            handleUpdateSpecimenParam(type, field, e.target.value)
                                          }
                                        >
                                          <option value="">默认</option>
                                          <option value="广口瓶">广口瓶</option>
                                          <option value="磨砂瓶">磨砂瓶</option>
                                          <option value="透明瓶">透明瓶</option>
                                        </select>
                                      ) : field === 'liquidType' ? (
                                        <select
                                          className="w-full rounded border border-white/[0.08] bg-white/[0.06] px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                                          value={String(params[field] || '')}
                                          onChange={e =>
                                            handleUpdateSpecimenParam(type, field, e.target.value)
                                          }
                                        >
                                          <option value="">默认</option>
                                          <option value="保色浸制液">保色浸制液</option>
                                          <option value="中性浸制液">中性浸制液</option>
                                          <option value="防腐浸制液">防腐浸制液</option>
                                        </select>
                                      ) : field === 'cabinetType' ? (
                                        <select
                                          className="w-full rounded border border-white/[0.08] bg-white/[0.06] px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                                          value={String(params[field] || '')}
                                          onChange={e =>
                                            handleUpdateSpecimenParam(type, field, e.target.value)
                                          }
                                        >
                                          <option value="">默认</option>
                                          <option value="恒温恒湿展柜">恒温恒湿展柜</option>
                                          <option value="普通展柜">普通展柜</option>
                                        </select>
                                      ) : field === 'sliceShape' ? (
                                        <select
                                          className="w-full rounded border border-white/[0.08] bg-white/[0.06] px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                                          value={String(params[field] || '')}
                                          onChange={e =>
                                            handleUpdateSpecimenParam(type, field, e.target.value)
                                          }
                                        >
                                          <option value="">默认</option>
                                          <option value="类圆形厚片">类圆形厚片</option>
                                          <option value="斜片">斜片</option>
                                          <option value="段状">段状</option>
                                          <option value="薄片">薄片</option>
                                        </select>
                                      ) : (
                                        <input
                                          type="text"
                                          className="w-full rounded border border-white/[0.08] bg-white/[0.06] px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                                          value={String(params[field] || '')}
                                          onChange={e =>
                                            handleUpdateSpecimenParam(type, field, e.target.value)
                                          }
                                          placeholder={field === 'sheetSpec' ? '40cm×30cm' : ''}
                                        />
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* 预览区 */}
                            {preview && (
                              <div className="px-2.5 pb-2.5">
                                <div className="mb-1 text-[9px] font-medium text-slate-400">
                                  生成预览
                                </div>
                                <div className="max-h-20 overflow-auto whitespace-pre-wrap rounded border border-white/[0.06] bg-white/[0.04] p-2 text-[10px] leading-relaxed text-slate-400">
                                  {preview}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    {/* 操作按钮 */}
                    <div className="mt-2 flex items-center justify-between border-t border-emerald-500/20 pt-2">
                      <button
                        onClick={handleSaveSpecimenAsTemplate}
                        className="text-[10px] text-emerald-400 underline hover:text-emerald-300"
                      >
                        保存为模板
                      </button>
                      <span className="text-[10px] text-slate-400">
                        已选 {specimenTypes.filter(t => t !== 'none').length} 个类型
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── 智能推荐条 ── */}
              {detectedSpecimens.length > 0 && (
                <div className="flex flex-shrink-0 items-center gap-2 border-b border-emerald-500/20 bg-emerald-500/10 px-4 py-2">
                  <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400">
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    检测到标本关键词：
                  </span>
                  {detectedSpecimens.map(type => {
                    const cfg = SPECIMEN_CONFIGS[type as Exclude<SpecimenType, 'none'>]
                    if (!cfg) return null
                    return (
                      <div
                        key={type}
                        className="flex items-center gap-1 rounded border border-emerald-500/20 bg-white/[0.06] px-2 py-1 shadow-sm"
                      >
                        <span className="text-[10px]">{cfg.icon}</span>
                        <span className="text-[10px] font-medium text-emerald-400">
                          {cfg.label}
                        </span>
                        <button
                          onClick={() => {
                            setSpecimenTypes(prev => (prev.includes(type) ? prev : [...prev, type]))
                            if (!specimenParams[type]) {
                              const herb = getRandomHerb(type)
                              if (herb) {
                                setSpecimenParams(prev => ({
                                  ...prev,
                                  [type]: { hasLabel: true, ...herb },
                                }))
                              } else {
                                setSpecimenParams(prev => ({
                                  ...prev,
                                  [type]: { name: '', hasLabel: true },
                                }))
                              }
                            }
                            setShowSpecimenPanel(true)
                          }}
                          className="text-[9px] font-medium text-blue-400 underline hover:text-blue-300"
                        >
                          配置
                        </button>
                        <button
                          onClick={() => handleInsertRecommendation(type)}
                          className="text-[9px] font-medium text-emerald-400 underline hover:text-emerald-300"
                        >
                          插入
                        </button>
                        <button
                          onClick={() => handleIgnoreRecommendation(type)}
                          className="text-[9px] text-slate-400 hover:text-slate-400"
                        >
                          ✕
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ── 自定义标本弹窗 ── */}
              {showCustomSpecimenDialog && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
                  <div className="max-h-[80vh] w-[480px] overflow-hidden rounded-xl bg-white/[0.06] shadow-2xl">
                    <div className="flex items-center justify-between border-b border-amber-500/20 bg-amber-500/10 px-4 py-3">
                      <span className="text-sm font-bold text-amber-400">创建自定义标本类型</span>
                      <button
                        onClick={() => {
                          setShowCustomSpecimenDialog(false)
                          setEditingCustomSpecimen(null)
                          setNewCustomSpecimen({
                            id: '',
                            label: '',
                            icon: '🔬',
                            basePrompt: '',
                            negativePrompt: '',
                          })
                        }}
                        className="text-slate-400 hover:text-slate-400"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="max-h-[60vh] space-y-3 overflow-auto p-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs text-slate-400">名称 *</label>
                          <input
                            type="text"
                            className="w-full rounded-lg border border-white/[0.08] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                            value={newCustomSpecimen.label}
                            onChange={e =>
                              setNewCustomSpecimen(prev => ({
                                ...prev,
                                label: e.target.value,
                                id: `custom_${Date.now()}`,
                              }))
                            }
                            placeholder="如：矿物标本"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-slate-400">图标</label>
                          <input
                            type="text"
                            className="w-full rounded-lg border border-white/[0.08] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                            value={newCustomSpecimen.icon}
                            onChange={e =>
                              setNewCustomSpecimen(prev => ({ ...prev, icon: e.target.value }))
                            }
                            placeholder="🔬"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-slate-400">
                          基础提示词模板 *
                        </label>
                        <textarea
                          className="w-full resize-none rounded-lg border border-white/[0.08] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
                          rows={4}
                          value={newCustomSpecimen.basePrompt}
                          onChange={e =>
                            setNewCustomSpecimen(prev => ({ ...prev, basePrompt: e.target.value }))
                          }
                          placeholder="使用 [名称] 作为标本名称占位符，如：[名称]标本，高清无模糊..."
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-slate-400">负面提示词</label>
                        <textarea
                          className="w-full resize-none rounded-lg border border-white/[0.08] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
                          rows={2}
                          value={newCustomSpecimen.negativePrompt}
                          onChange={e =>
                            setNewCustomSpecimen(prev => ({
                              ...prev,
                              negativePrompt: e.target.value,
                            }))
                          }
                          placeholder="模糊、失真、变形..."
                        />
                      </div>
                      <div className="text-[10px] text-slate-400">
                        💡 提示：使用 [名称] 占位符，在插入时会自动替换为实际标本名称
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 border-t border-white/[0.06] px-4 py-3">
                      <button
                        onClick={() => {
                          setShowCustomSpecimenDialog(false)
                          setEditingCustomSpecimen(null)
                          setNewCustomSpecimen({
                            id: '',
                            label: '',
                            icon: '🔬',
                            basePrompt: '',
                            negativePrompt: '',
                          })
                        }}
                        className="rounded-lg px-4 py-2 text-sm text-slate-400 transition hover:bg-white/[0.08]"
                      >
                        取消
                      </button>
                      <button
                        onClick={() => {
                          if (
                            !newCustomSpecimen.label.trim() ||
                            !newCustomSpecimen.basePrompt.trim()
                          ) {
                            showToast('请填写名称和基础提示词', 'error')
                            return
                          }
                          const newSpec = {
                            ...newCustomSpecimen,
                            id: `custom_${Date.now()}`,
                            label: newCustomSpecimen.label.trim(),
                            basePrompt: newCustomSpecimen.basePrompt.trim(),
                            negativePrompt: newCustomSpecimen.negativePrompt.trim(),
                          }
                          setCustomSpecimens(prev => [...prev, newSpec])
                          setSpecimenTypes(prev => [...prev, newSpec.id])
                          setShowCustomSpecimenDialog(false)
                          setNewCustomSpecimen({
                            id: '',
                            label: '',
                            icon: '🔬',
                            basePrompt: '',
                            negativePrompt: '',
                          })
                          showToast(`自定义标本「${newSpec.label}」已创建并选中`, 'success')
                        }}
                        className="rounded-lg bg-amber-500 px-4 py-2 text-sm text-white transition hover:bg-amber-600"
                      >
                        创建并选中
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── 斜杠命令浮窗 ── */}
              {slashCommandActive && (
                <div
                  className="absolute z-50 w-64 overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.06] shadow-xl"
                  style={{ top: '200px', left: '50%' }}
                >
                  <div className="border-b border-white/[0.06] bg-white/[0.04] px-3 py-2">
                    <span className="text-[10px] text-slate-500">输入 / 选择标本类型</span>
                  </div>
                  {SPECIMEN_TYPE_LIST.filter(
                    s => s.value !== 'none' && s.label.includes(slashFilter),
                  ).map(s => (
                    <button
                      key={s.value}
                      onClick={() => handleInsertSpecimenPrompt(s.value)}
                      className="flex w-full items-center gap-2 border-b border-white/[0.04] px-3 py-2 text-left text-xs transition last:border-0 hover:bg-emerald-500/10"
                    >
                      <span>{s.icon}</span>
                      <span>{s.label}</span>
                    </button>
                  ))}
                  {SPECIMEN_TYPE_LIST.filter(
                    s => s.value !== 'none' && s.label.includes(slashFilter),
                  ).length === 0 && (
                    <div className="px-3 py-2 text-[10px] text-slate-400">无匹配结果</div>
                  )}
                </div>
              )}

              <div
                ref={leftScrollRef}
                className="relative flex-1 overflow-auto"
                onScroll={handleLeftScroll}
              >
                <textarea
                  className="h-full w-full resize-none bg-transparent px-4 py-3 text-sm leading-relaxed text-slate-300 focus:outline-none"
                  style={{ minHeight: 200 }}
                  placeholder={PLACEHOLDER_TEXT}
                  value={inputPrompt}
                  onChange={handleTextareaInput}
                  onKeyDown={handleTextareaKeyDown}
                />
              </div>
              <div className="flex flex-shrink-0 items-center justify-between border-t border-white/[0.06] bg-white/[0.04] px-4 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400">
                    支持多行输入 · 最大 {MAX_CHARS.toLocaleString()} 字符
                  </span>
                  {inputPrompt.trim() && (
                    <button
                      onClick={() => setShowScoreDetail(!showScoreDetail)}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition ${
                        promptScore.score >= 80
                          ? 'bg-green-100 text-emerald-400 hover:bg-green-200'
                          : promptScore.score >= 60
                            ? 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/20'
                            : promptScore.score >= 40
                              ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
                              : 'bg-red-100 text-red-400 hover:bg-red-200'
                      }`}
                    >
                      丰富度 {promptScore.score}/100 {showScoreDetail ? '▲' : '▼'}
                    </button>
                  )}
                  {specimenScore && specimenScore.score > 0 && (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                      标本专业 {specimenScore.score}/{specimenScore.max}
                    </span>
                  )}
                </div>
                <span
                  className={`font-mono text-[10px] ${inputPrompt.length > MAX_CHARS * 0.9 ? 'text-amber-500' : 'text-slate-400'}`}
                >
                  {inputPrompt.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
                </span>
              </div>
            </div>

            {/* ── 丰富度打分详情面板 ── */}
            {showScoreDetail && inputPrompt.trim() && (
              <div className="flex-shrink-0 border-t border-white/[0.08] bg-white/[0.04] px-4 py-3">
                <div className="mb-2 flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${
                        promptScore.score >= 80
                          ? 'bg-green-100 text-emerald-400'
                          : promptScore.score >= 60
                            ? 'bg-blue-500/15 text-blue-400'
                            : promptScore.score >= 40
                              ? 'bg-amber-500/15 text-amber-400'
                              : 'bg-red-100 text-red-400'
                      }`}
                    >
                      {promptScore.score}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-300">提示词丰富度评分</div>
                      <div className="text-[10px] text-slate-400">
                        {promptScore.score >= 80
                          ? '优秀，描述丰富全面'
                          : promptScore.score >= 60
                            ? '良好，可继续补充细节'
                            : promptScore.score >= 40
                              ? '一般，建议增加更多维度'
                              : '较简单，需要大幅补充'}
                      </div>
                    </div>
                  </div>
                </div>
                {/* 维度进度条 */}
                <div className="mb-2 space-y-1.5">
                  {promptScore.breakdown.map(b => (
                    <div key={b.label} className="flex items-center gap-2">
                      <span className="w-16 flex-shrink-0 text-[10px] text-slate-500">
                        {b.label}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                        <div
                          className={`h-full rounded-full transition-all ${
                            b.score / b.max >= 0.8
                              ? 'bg-emerald-500/100'
                              : b.score / b.max >= 0.5
                                ? 'bg-blue-500'
                                : b.score / b.max >= 0.3
                                  ? 'bg-amber-500'
                                  : 'bg-red-400'
                          }`}
                          style={{ width: `${(b.score / b.max) * 100}%` }}
                        />
                      </div>
                      <span className="w-12 text-right font-mono text-[10px] text-slate-400">
                        {b.score}/{b.max}
                      </span>
                    </div>
                  ))}
                </div>
                {/* 改进建议 */}
                {promptScore.suggestions.length > 0 && (
                  <div className="rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 py-2">
                    <div className="mb-1 text-[10px] font-medium text-slate-500">改进建议：</div>
                    <div className="space-y-0.5">
                      {promptScore.suggestions.map((s, i) => (
                        <div key={i} className="flex items-start gap-1 text-[10px] text-slate-400">
                          <span className="flex-shrink-0 text-amber-400">•</span>
                          <span>{s}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── 分隔线拖动手柄 ── */}
            <div
              className="relative flex-shrink-0 cursor-col-resize"
              style={{ width: 8, marginLeft: -4, zIndex: 10 }}
              onMouseDown={e => {
                e.preventDefault()
                setIsDraggingSplit(true)
              }}
            >
              <div
                className={`absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors ${
                  isDraggingSplit ? 'bg-blue-400' : 'bg-white/[0.08] hover:bg-blue-400/60'
                }`}
              />
            </div>

            {/* ── 右栏：优化后结果 ── */}
            <div
              className="flex flex-col"
              style={{ flex: `0 0 ${(1 - splitRatio) * 100}%`, minWidth: 0 }}
            >
              <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.06] bg-blue-500/10 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    优化结果
                  </span>
                  {activeTemplate && (
                    <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] text-blue-500">
                      {activeTemplate.name}
                    </span>
                  )}
                  {optimizeTime && (
                    <span className="text-[10px] text-slate-400">{optimizeTime}</span>
                  )}
                  {stats && stats.totalChanges > 0 && (
                    <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
                      {stats.totalChanges} 处修改
                    </span>
                  )}
                </div>
                {optimizedPrompt && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleToggleFavorite}
                      className={`rounded px-2 py-0.5 text-[10px] transition ${favorites.find(f => f.optimizedPrompt === optimizedPrompt) ? 'bg-amber-500/15 text-amber-400' : 'text-slate-400 hover:text-amber-500'}`}
                      title="收藏"
                    >
                      {favorites.find(f => f.optimizedPrompt === optimizedPrompt)
                        ? '★ 已收藏'
                        : '☆ 收藏'}
                    </button>
                    <button
                      onClick={() => setIsEditingOutput(!isEditingOutput)}
                      className={`rounded px-2 py-0.5 text-[10px] transition ${isEditingOutput ? 'bg-blue-500/15 text-blue-400' : 'text-slate-400 hover:text-blue-500'}`}
                    >
                      {isEditingOutput ? '锁定编辑' : '解锁编辑'}
                    </button>
                    <button
                      onClick={handleCopy}
                      className="text-[10px] text-slate-400 transition hover:text-blue-500"
                    >
                      复制
                    </button>
                  </div>
                )}
              </div>
              <div
                ref={rightScrollRef}
                className="flex-1 overflow-auto"
                onScroll={handleRightScroll}
              >
                {isOptimizing ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
                    <svg
                      className="h-8 w-8 animate-spin text-blue-500"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    <span className="text-sm">优化中，请稍候...</span>
                    <span className="text-[10px] text-slate-300">
                      正在调用「{activeTemplate?.name}」模板进行优化
                    </span>
                  </div>
                ) : optimizedPrompt ? (
                  isEditingOutput ? (
                    <textarea
                      className="h-full w-full resize-none bg-white/[0.06] px-4 py-3 text-sm leading-relaxed text-slate-300 focus:outline-none"
                      style={{ minHeight: 200 }}
                      value={optimizedPrompt}
                      onChange={e => setOptimizedPrompt(e.target.value)}
                    />
                  ) : diffResult && diffResult.segments.length > 0 ? (
                    <div className="whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed">
                      {diffResult.segments.map((seg, idx) => {
                        const isHighlighted =
                          highlightedChange !== null && seg.changeIndex === highlightedChange
                        switch (seg.type) {
                          case 'added':
                            return (
                              <span
                                key={idx}
                                className="rounded px-0.5"
                                style={{
                                  backgroundColor: 'rgba(45,164,78,0.15)',
                                  borderBottom: '2px solid #2da44e',
                                  color: '#2da44e',
                                  outline: isHighlighted ? '2px solid #2da44e' : 'none',
                                }}
                              >
                                {seg.text}
                              </span>
                            )
                          case 'removed':
                            return (
                              <span
                                key={idx}
                                className="rounded px-0.5"
                                style={{
                                  backgroundColor: 'rgba(207,34,46,0.1)',
                                  textDecoration: 'line-through',
                                  textDecorationColor: '#cf222e',
                                  color: '#cf222e',
                                  outline: isHighlighted ? '2px solid #cf222e' : 'none',
                                }}
                              >
                                {seg.text}
                              </span>
                            )
                          case 'replaced':
                            return (
                              <span
                                key={idx}
                                className="rounded px-0.5"
                                style={{
                                  backgroundColor: 'rgba(9,105,218,0.1)',
                                  border: '1px solid #0969da',
                                  color: '#0969da',
                                  outline: isHighlighted ? '2px solid #0969da' : 'none',
                                }}
                              >
                                {seg.text}
                              </span>
                            )
                          default:
                            return (
                              <span key={idx} className="text-slate-300">
                                {seg.text}
                              </span>
                            )
                        }
                      })}
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed text-slate-300">
                      {optimizedPrompt}
                    </div>
                  )
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-300">
                    <svg
                      className="h-12 w-12 opacity-30"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <span className="text-sm">请输入原始提示词，点击一键优化</span>
                    <span className="text-[10px]">
                      将使用「{activeTemplate?.name}」模板进行专业优化
                    </span>
                  </div>
                )}
              </div>
              {optimizedPrompt && (
                <div className="flex flex-shrink-0 items-center justify-between border-t border-white/[0.06] bg-white/[0.04] px-4 py-1.5">
                  <span className="text-[10px] text-slate-400">
                    优化前后字数变化：
                    <span className="ml-1 text-emerald-400">
                      {optimizedPrompt.length - inputPrompt.length > 0 ? '+' : ''}
                      {optimizedPrompt.length - inputPrompt.length} 字符
                    </span>
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">
                    {optimizedPrompt.length.toLocaleString()} 字符
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════
              差异明细区
          ═══════════════════════════════════════════════════════ */}
          {diffResult && diffResult.details.length > 0 && (
            <div className="flex-shrink-0 border-t border-white/[0.08]" style={{ maxHeight: 280 }}>
              <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.04] px-4 py-2">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setActiveDetailTab('overview')}
                    className={`rounded px-3 py-1 text-xs font-medium transition ${activeDetailTab === 'overview' ? 'bg-blue-500/15 text-blue-400' : 'text-slate-500 hover:bg-white/[0.06]'}`}
                  >
                    修改总览
                  </button>
                  <button
                    onClick={() => setActiveDetailTab('details')}
                    className={`rounded px-3 py-1 text-xs font-medium transition ${activeDetailTab === 'details' ? 'bg-blue-500/15 text-blue-400' : 'text-slate-500 hover:bg-white/[0.06]'}`}
                  >
                    逐行修改明细 ({diffResult.details.length})
                  </button>
                </div>
                {activeDetailTab === 'details' && (
                  <div className="flex items-center gap-1">
                    {(['all', 'added', 'removed', 'replaced'] as const).map(ft => (
                      <button
                        key={ft}
                        onClick={() => setFilterType(ft)}
                        className={`rounded px-2 py-0.5 text-[10px] transition ${filterType === ft ? 'bg-blue-500/15 font-medium text-blue-400' : 'text-slate-400 hover:bg-white/[0.06]'}`}
                      >
                        {ft === 'all'
                          ? '全部'
                          : ft === 'added'
                            ? '新增'
                            : ft === 'removed'
                              ? '删除'
                              : '替换'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="overflow-auto" style={{ maxHeight: 230 }}>
                {activeDetailTab === 'overview' && stats ? (
                  <div className="grid grid-cols-5 gap-3 p-4">
                    <div className="rounded-lg border border-white/[0.08] bg-white/[0.06] p-3 text-center">
                      <div className="text-2xl font-bold text-slate-100">{stats.totalChanges}</div>
                      <div className="mt-1 text-[10px] text-slate-400">总修改处数</div>
                    </div>
                    <div className="rounded-lg border border-white/[0.08] bg-white/[0.06] p-3 text-center">
                      <div className="text-2xl font-bold text-emerald-400">+{stats.addedChars}</div>
                      <div className="mt-1 text-[10px] text-slate-400">新增内容（字符）</div>
                    </div>
                    <div className="rounded-lg border border-white/[0.08] bg-white/[0.06] p-3 text-center">
                      <div className="text-2xl font-bold text-red-500">-{stats.removedChars}</div>
                      <div className="mt-1 text-[10px] text-slate-400">删除内容（字符）</div>
                    </div>
                    <div className="rounded-lg border border-white/[0.08] bg-white/[0.06] p-3 text-center">
                      <div className="text-2xl font-bold text-blue-400">{stats.replacedCount}</div>
                      <div className="mt-1 text-[10px] text-slate-400">替换处数</div>
                    </div>
                    <div className="rounded-lg border border-white/[0.08] bg-white/[0.06] p-3 text-center">
                      <div className="text-2xl font-bold text-indigo-400">
                        {stats.addedCount + stats.replacedCount}
                      </div>
                      <div className="mt-1 text-[10px] text-slate-400">优化维度覆盖</div>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {filteredDetails.map(detail => (
                      <div
                        key={detail.changeIndex}
                        className={`cursor-pointer px-4 py-2.5 transition hover:bg-white/[0.04] ${highlightedChange === detail.changeIndex ? 'bg-blue-500/10' : ''}`}
                        onClick={() => handleJumpToChange(detail.changeIndex)}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[10px] font-bold ${detail.type === 'added' ? 'bg-green-100 text-emerald-400' : detail.type === 'removed' ? 'bg-red-100 text-red-500' : 'bg-blue-500/15 text-blue-400'}`}
                          >
                            {detail.changeIndex + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${detail.type === 'added' ? 'bg-green-100 text-emerald-400' : detail.type === 'removed' ? 'bg-red-100 text-red-400' : 'bg-blue-500/15 text-blue-400'}`}
                              >
                                {detail.type === 'added'
                                  ? '新增'
                                  : detail.type === 'removed'
                                    ? '删除'
                                    : '替换'}
                              </span>
                              {detail.original && (
                                <span className="max-w-[200px] truncate text-[10px] text-slate-400">
                                  原：{detail.original.slice(0, 60)}
                                </span>
                              )}
                            </div>
                            {detail.optimized && (
                              <div className="mb-1 truncate text-xs text-slate-300">
                                优化后：{detail.optimized.slice(0, 100)}
                              </div>
                            )}
                            <div className="text-[10px] leading-relaxed text-slate-500">
                              {detail.reason}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {filteredDetails.length === 0 && (
                      <div className="px-4 py-8 text-center text-sm text-slate-400">
                        没有匹配的修改记录
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════
            底部固定功能栏
        ═══════════════════════════════════════════════════════ */}
        <div className="flex flex-shrink-0 items-center justify-between border-t border-white/[0.08] bg-white/[0.04] px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-slate-400">
              输入{' '}
              <span className="font-mono font-medium text-slate-400">{inputPrompt.length}</span>{' '}
              字符
            </span>
            {optimizedPrompt && (
              <span className="text-[10px] text-slate-400">
                输出{' '}
                <span className="font-mono font-medium text-slate-400">
                  {optimizedPrompt.length}
                </span>{' '}
                字符
              </span>
            )}
            {stats && (
              <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-400">
                {stats.totalChanges} 处差异
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveOriginal}
              className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-slate-400 transition hover:bg-emerald-500/10 hover:text-emerald-400"
            >
              <svg
                className="mr-1 inline h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V3"
                />
              </svg>
              保存
            </button>
            {diffResult && diffResult.details.length > 0 && (
              <button
                onClick={handleExportReport}
                className="flex items-center gap-1 rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-slate-400 transition hover:bg-white/[0.06]"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                导出报告
              </button>
            )}
            <button
              onClick={handleOptimize}
              disabled={!isValidInput || isOptimizing}
              className={`flex items-center gap-2 rounded-lg px-6 py-2 text-sm font-semibold text-white shadow-md transition disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none ${isValidInput && !isOptimizing ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700' : 'bg-slate-300'}`}
              title="Ctrl/Cmd + Enter"
            >
              {isOptimizing ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  优化中...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  一键优化提示词
                </>
              )}
            </button>
          </div>
          <div className="flex items-center gap-2">
            {optimizedPrompt && (
              <button
                onClick={() => {
                  onAdopt(optimizedPrompt.trim())
                  onClose()
                }}
                className="rounded-lg bg-green-600 px-4 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-green-700"
              >
                采纳结果
              </button>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════
            系统模板管理弹窗
        ═══════════════════════════════════════════════════════ */}
        {showTemplateManager && (
          <div
            className="overlay-dark fixed inset-0 z-[10000] flex items-center justify-center"
            onClick={() => {
              setShowTemplateManager(false)
              setEditingTemplate(null)
              setShowTemplateEdit(false)
            }}
          >
            <div
              className="flex flex-col overflow-hidden rounded-xl bg-white/[0.06] shadow-2xl"
              style={{
                width: tplDialogSize.w,
                height: tplDialogSize.h,
                minWidth: 400,
                minHeight: 300,
              }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.08] px-5 py-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-100">系统模板管理</h3>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    自定义优化规则，创建专属系统 Prompt 模板
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowTemplateManager(false)
                    setEditingTemplate(null)
                    setShowTemplateEdit(false)
                  }}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/[0.08] hover:text-slate-400"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {/* 模板列表 */}
                {templates.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
                    <svg
                      className="h-12 w-12 opacity-30"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                      />
                    </svg>
                    <span className="text-sm">暂无模板</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {templates.map(tpl => (
                      <div
                        key={tpl.id}
                        className={`cursor-pointer rounded-xl border p-3 transition ${
                          selectedTemplateId === tpl.id
                            ? 'border-blue-300 bg-blue-500/50'
                            : 'border-white/[0.08] hover:border-white/[0.12] hover:bg-white/[0.04]'
                        }`}
                        onClick={() => {
                          setSelectedTemplateId(tpl.id)
                          setShowTemplateManager(false)
                        }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-100">
                                {tpl.name}
                              </span>
                              {tpl.isDefault && (
                                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400">
                                  默认
                                </span>
                              )}
                              {selectedTemplateId === tpl.id && (
                                <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-medium text-blue-400">
                                  当前使用
                                </span>
                              )}
                            </div>
                            {tpl.description && (
                              <p className="mt-0.5 truncate text-[10px] text-slate-400">
                                {tpl.description}
                              </p>
                            )}
                            <p className="mt-1 truncate font-mono text-[10px] text-slate-300">
                              {tpl.systemPrompt.slice(0, 120)}...
                            </p>
                          </div>
                          <div className="ml-2 flex flex-shrink-0 items-center gap-1">
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                handleApplyTemplateToInput(tpl)
                              }}
                              className="rounded-lg p-1.5 text-slate-300 transition hover:bg-indigo-500/10 hover:text-indigo-400"
                              title="套用模板到输入框"
                            >
                              <svg
                                className="h-3.5 w-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M16 11V7a4 4 0 00-8 0v4m8 4v2m-8-2h8"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                handleSetDefaultTemplate(tpl.id)
                              }}
                              className={`rounded-lg p-1.5 transition ${tpl.isDefault ? 'bg-emerald-500/10 text-emerald-500' : 'text-slate-300 hover:bg-emerald-500/10 hover:text-emerald-500'}`}
                              title="设为默认"
                            >
                              <svg
                                className="h-3.5 w-3.5"
                                fill={tpl.isDefault ? 'currentColor' : 'none'}
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                setEditingTemplate({ ...tpl })
                                setShowTemplateEdit(true)
                              }}
                              className="rounded-lg p-1.5 text-slate-300 transition hover:bg-blue-500/10 hover:text-blue-500"
                              title="编辑"
                            >
                              <svg
                                className="h-3.5 w-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                handleDeleteTemplate(tpl.id)
                              }}
                              className="rounded-lg p-1.5 text-slate-300 transition hover:bg-red-500/10 hover:text-red-500"
                              title="删除"
                            >
                              <svg
                                className="h-3.5 w-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center justify-between border-t border-white/[0.06] px-5 py-3">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] text-slate-400">点击模板可快速切换 · 编辑后自动保存</p>
                  <button
                    onClick={handleImportTemplates}
                    className="text-[10px] text-slate-400 underline transition hover:text-blue-500"
                    title="导入模板"
                  >
                    导入
                  </button>
                  <button
                    onClick={handleExportTemplates}
                    className="text-[10px] text-slate-400 underline transition hover:text-blue-500"
                    title="导出模板"
                  >
                    导出
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditingTemplate({ name: '', description: '', systemPrompt: '' })
                      setShowTemplateEdit(true)
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-blue-700"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    新建模板
                  </button>
                </div>
              </div>
              {/* 拖拽手柄 */}
              <div
                className="hover:bg-blue-500/20/50 absolute bottom-0 right-0 h-5 w-5 cursor-se-resize rounded-bl-xl transition-colors"
                onMouseDown={handleTplResizeStart}
                title="拖动调整大小"
              >
                <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22 22H20V20H22V22ZM22 18H20V16H22V18ZM18 22H16V20H18V22ZM22 14H20V12H22V14ZM18 18H16V16H18V18ZM14 22H12V20H14V22Z" />
                </svg>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            模板编辑弹窗
        ═══════════════════════════════════════════════════════ */}
        {showTemplateEdit && editingTemplate && (
          <div
            className="fixed inset-0 z-[10001] flex items-center justify-center"
            style={{ background: 'rgba(15,23,42,0.5)' }}
            onClick={() => {
              setShowTemplateEdit(false)
              setEditingTemplate(null)
            }}
          >
            <div
              className="flex flex-col overflow-hidden rounded-xl bg-white/[0.06] shadow-2xl"
              style={{ width: 'min(90vw, 640px)', height: 'min(80vh, 560px)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.08] px-5 py-3">
                <h3 className="text-sm font-bold text-slate-100">
                  {editingTemplate.id ? '编辑模板' : '新建模板'}
                </h3>
                <button
                  onClick={() => {
                    setShowTemplateEdit(false)
                    setEditingTemplate(null)
                  }}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/[0.08] hover:text-slate-400"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-auto p-5">
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">
                      模板名称 <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      value={editingTemplate.name || ''}
                      onChange={e =>
                        setEditingTemplate({ ...editingTemplate, name: e.target.value })
                      }
                      placeholder="如：室内设计优化、博物馆展陈设计..."
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">
                      描述（可选）
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      value={editingTemplate.description || ''}
                      onChange={e =>
                        setEditingTemplate({ ...editingTemplate, description: e.target.value })
                      }
                      placeholder="简要说明模板用途"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-medium text-slate-300">
                      系统 Prompt（优化规则）<span className="text-red-400">*</span>
                    </label>
                    <p className="mb-1.5 text-[10px] text-slate-400">
                      将作为 system message 发送给 AI 模型，指导优化方向
                    </p>
                    <textarea
                      className="w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 py-2.5 font-mono text-sm leading-relaxed focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      rows={12}
                      value={editingTemplate.systemPrompt || ''}
                      onChange={e =>
                        setEditingTemplate({ ...editingTemplate, systemPrompt: e.target.value })
                      }
                      placeholder="输入优化提示词的规则和指导..."
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center justify-between border-t border-white/[0.06] bg-white/[0.04] px-5 py-3">
                <p className="text-[10px] text-slate-400">名称和规则为必填项</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowTemplateEdit(false)
                      setEditingTemplate(null)
                    }}
                    className="rounded-lg border border-white/[0.08] px-4 py-2 text-xs text-slate-400 transition hover:bg-white/[0.06]"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSaveTemplate}
                    disabled={
                      !editingTemplate.name?.trim() || !editingTemplate.systemPrompt?.trim()
                    }
                    className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    保存模板
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            历史记录弹窗
        ═══════════════════════════════════════════════════════ */}
        {showHistory && (
          <div
            className="overlay-dark fixed inset-0 z-[10000] flex items-center justify-center"
            onClick={() => setShowHistory(false)}
          >
            <div
              className="flex flex-col overflow-hidden rounded-xl bg-white/[0.06] shadow-2xl"
              style={{
                width: histDialogSize.w,
                height: histDialogSize.h,
                minWidth: 400,
                minHeight: 300,
              }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.08] px-5 py-3">
                <h3 className="text-sm font-bold text-slate-100">历史记录 ({records.length})</h3>
                <button
                  onClick={() => setShowHistory(false)}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/[0.08] hover:text-slate-400"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {records.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
                    <svg
                      className="h-12 w-12 opacity-30"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span className="text-sm">暂无历史记录</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {records.map(record => (
                      <div
                        key={record.id}
                        className="cursor-pointer rounded-lg border border-white/[0.08] p-3 transition hover:border-blue-300 hover:bg-blue-500/30"
                        onClick={() => handleRestoreRecord(record)}
                      >
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-[10px] text-slate-400">
                            {new Date(record.timestamp).toLocaleString('zh-CN')}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {record.duration}ms · {record.details.length} 处修改
                            {record.templateName ? ` · ${record.templateName}` : ''}
                          </span>
                        </div>
                        <div className="truncate text-xs text-slate-400">
                          {record.originalPrompt.slice(0, 80)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {records.length > 0 && (
                <div className="flex flex-shrink-0 justify-end border-t border-white/[0.06] px-5 py-3">
                  <button
                    onClick={() => {
                      if (confirmAction('确定清空所有历史记录？')) {
                        setRecords([])
                        showToast('记录已清空', 'success')
                      }
                    }}
                    className="rounded-lg border border-red-500/20 px-3 py-1.5 text-xs text-red-500 transition hover:bg-red-500/10"
                  >
                    清空全部
                  </button>
                </div>
              )}
              {/* 拖拽手柄 */}
              <div
                className="hover:bg-blue-500/20/50 absolute bottom-0 right-0 h-5 w-5 cursor-se-resize rounded-bl-xl transition-colors"
                onMouseDown={handleHistResizeStart}
                title="拖动调整大小"
              >
                <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22 22H20V20H22V22ZM22 18H20V16H22V18ZM18 22H16V20H18V22ZM22 14H20V12H22V14ZM18 18H16V16H18V18ZM14 22H12V20H14V22Z" />
                </svg>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            收藏弹窗
        ═══════════════════════════════════════════════════════ */}
        {showFavorites && (
          <div
            className="overlay-dark fixed inset-0 z-[10000] flex items-center justify-center"
            onClick={() => setShowFavorites(false)}
          >
            <div
              className="flex flex-col overflow-hidden rounded-xl bg-white/[0.06] shadow-2xl"
              style={{ width: 'min(90vw, 560px)', height: 'min(70vh, 500px)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.08] px-5 py-3">
                <h3 className="text-sm font-bold text-slate-100">
                  收藏的优化结果 ({favorites.length})
                </h3>
                <button
                  onClick={() => setShowFavorites(false)}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/[0.08] hover:text-slate-400"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {favorites.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
                    <svg
                      className="h-12 w-12 opacity-30"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                      />
                    </svg>
                    <span className="text-sm">暂无收藏</span>
                    <span className="text-[10px]">优化完成后点击「☆ 收藏」即可添加</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {favorites.map(fav => (
                      <div
                        key={fav.id}
                        className="rounded-lg border border-white/[0.08] p-3 transition hover:border-amber-500/30 hover:bg-amber-500/30"
                      >
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-[10px] text-slate-400">
                            {new Date(fav.timestamp).toLocaleString('zh-CN')}
                            {fav.templateName ? ` · ${fav.templateName}` : ''}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleApplyFavorite(fav)}
                              className="text-[10px] font-medium text-blue-400 hover:text-blue-400"
                            >
                              套用
                            </button>
                            <button
                              onClick={() =>
                                setFavorites(prev => prev.filter(f => f.id !== fav.id))
                              }
                              className="text-[10px] text-red-400 hover:text-red-400"
                            >
                              移除
                            </button>
                          </div>
                        </div>
                        <div className="mb-1 truncate text-xs text-slate-400">
                          {fav.originalPrompt.slice(0, 80)}
                        </div>
                        <div className="truncate text-[10px] text-slate-400">
                          {fav.optimizedPrompt.slice(0, 100)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {favorites.length > 0 && (
                <div className="flex flex-shrink-0 justify-end border-t border-white/[0.06] px-5 py-3">
                  <button
                    onClick={() => {
                      if (confirmAction('确定清空所有收藏？')) {
                        setFavorites([])
                        showToast('收藏已清空', 'success')
                      }
                    }}
                    className="rounded-lg border border-red-500/20 px-3 py-1.5 text-xs text-red-500 transition hover:bg-red-500/10"
                  >
                    清空全部
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            快捷键面板
        ═══════════════════════════════════════════════════════ */}
        {showShortcuts && (
          <div
            className="overlay-dark fixed inset-0 z-[10000] flex items-center justify-center"
            onClick={() => setShowShortcuts(false)}
          >
            <div
              className="flex flex-col overflow-hidden rounded-xl bg-white/[0.06] shadow-2xl"
              style={{ width: 'min(90vw, 420px)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.08] px-5 py-3">
                <h3 className="text-sm font-bold text-slate-100">快捷键</h3>
                <button
                  onClick={() => setShowShortcuts(false)}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/[0.08] hover:text-slate-400"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <div className="p-5">
                <div className="space-y-3">
                  {[
                    { keys: ['Ctrl', 'Enter'], desc: '一键优化提示词' },
                    { keys: ['Esc'], desc: '关闭弹窗' },
                    { keys: ['Ctrl', 'C'], desc: '复制优化结果（结果区聚焦时）' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">{item.desc}</span>
                      <div className="flex items-center gap-1">
                        {item.keys.map((k, j) => (
                          <span
                            key={j}
                            className="rounded border border-white/[0.08] bg-white/[0.08] px-2 py-0.5 font-mono text-[10px] text-slate-400"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            错误提示
        ═══════════════════════════════════════════════════════ */}
        {optimizeError && (
          <div className="absolute bottom-16 left-1/2 z-30 w-96 -translate-x-1/2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 shadow-xl">
            <div className="flex items-start gap-2.5">
              <svg
                className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="flex-1">
                <p className="text-xs leading-relaxed text-red-400">{optimizeError}</p>
                <button
                  onClick={() => {
                    setOptimizeError('')
                    handleOptimize()
                  }}
                  className="mt-2 text-[10px] font-medium text-red-500 underline hover:text-red-700"
                >
                  重试
                </button>
              </div>
              <button
                onClick={() => setOptimizeError('')}
                className="flex-shrink-0 text-slate-400 hover:text-slate-400"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            Toast 轻提示
        ═══════════════════════════════════════════════════════ */}
        {toast && (
          <div
            className={`absolute bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-lg px-4 py-2 text-sm font-medium shadow-lg ${toast.type === 'success' ? 'bg-emerald-500/100 text-white' : toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}`}
          >
            {toast.message}
          </div>
        )}
      </div>
    </div>
  )
}
