/**
 * 中药标本数据库
 * 从 PromptOptimizerDialog.tsx 提取，包含标本配置和中药材数据
 */

// ── 类型定义 ─────────────────────────────────────────────────────────────

export type SpecimenType = "immersed" | "herbarium" | "crude_drug" | "decoction_pieces" | "none" | string;

export type SpecimenParams = {
  name: string;
  family?: string;
  origin?: string;
  part?: string;
  bottleType?: string;
  liquidType?: string;
  cabinetType?: string;
  hasLabel?: boolean;
  latinName?: string;
  sheetSpec?: string;
  collector?: string;
  collectTime?: string;
  showSection?: boolean;
  standMaterial?: string;
  processingSpec?: string;
  sliceShape?: string;
  thickness?: string;
};

export type SpecimenConfig = {
  type: SpecimenType;
  label: string;
  icon: string;
  keywords: string[];
  fuzzyKeywords: string[];
  basePrompt: string;
  negativePrompt: string;
  requiredFields: (keyof SpecimenParams)[];
  optionalFields: (keyof SpecimenParams)[];
};

// ── 标本配置 ─────────────────────────────────────────────────────────────

export const SPECIMEN_CONFIGS: Record<Exclude<SpecimenType, "none">, SpecimenConfig> = {
  immersed: {
    type: "immersed",
    label: "浸制标本",
    icon: "🫙",
    keywords: ["浸制标本", "浸制", "浸泡标本", "液浸"],
    fuzzyKeywords: ["标本瓶", "保色液", "广口瓶", "浸泡"],
    basePrompt: "中药浸制标本，透明广口磨砂玻璃标本瓶，中性保色浸制液，液体通透无浑浊无气泡，液面平整，瓶口蜡封，[中药正式名]完整舒展，保色完好，无破损，瓶身右侧贴规范白底黑字标签（标注品名、拉丁名、科属、产地、采收时间），超白钢化玻璃恒温恒湿展柜，防紫外线漫射柔光，无玻璃强反光，瓶身轻微环境反光，8K超清，nanobanana超写实渲染，物理级玻璃材质，微距细节拉满，景深效果，锐化合理",
    negativePrompt: "模糊、失真、液体浑浊、植株残缺、标签缺失、比例失调、过度饱和、玻璃强反光、气泡过多",
    requiredFields: ["name", "family", "origin", "part"],
    optionalFields: ["bottleType", "liquidType", "cabinetType", "hasLabel"],
  },
  herbarium: {
    type: "herbarium",
    label: "腊叶标本",
    icon: "🌿",
    keywords: ["腊叶标本", "腊叶", "压制标本", "台纸"],
    fuzzyKeywords: ["标本台纸", "压制", "干燥标本", "植物标本"],
    basePrompt: "中药腊叶标本，标准40cm×30cm白色道林纸台纸，[中药正式名]全株标本，根、茎、叶、花、果实完整，叶片平整正反面展示，白色棉线规范固定，无褶皱无破损，右下角贴规范采集标签（中文名、拉丁名、科属、产地、采集人、采集时间），漫射柔光，无反光，超写实植物纹理，纸质质感拉满，8K超清，nanobanana物理级渲染，微距细节清晰，无畸变",
    negativePrompt: "卷曲变形、颜色失真、标签缺失、台纸破损、排列混乱、比例失调、反光严重",
    requiredFields: ["name", "latinName", "family", "origin"],
    optionalFields: ["sheetSpec", "collector", "collectTime", "hasLabel"],
  },
  crude_drug: {
    type: "crude_drug",
    label: "生药标本",
    icon: "🏥",
    keywords: ["生药标本", "生药", "原生药", "药材标本"],
    fuzzyKeywords: ["药材展示", "断面", "生药鉴定", "药用部位"],
    basePrompt: "[中药正式名]生药标本，符合《中国药典》2025版性状描述，完整原药材，表皮纹理清晰，自然色泽，断面展示完整的放射状纹理/纤维结构/粉质特征，放置于灰色哑光展台，规范标签标注品名、产地、药用部位，防眩光漫射柔光，无反光，超写实材质质感，8K超清，nanobanana超写实渲染，细节拉满，景深效果，无色彩失真",
    negativePrompt: "模糊、发霉、虫蛀、断面不清、展台杂乱、光线不足、标签缺失、色彩失真",
    requiredFields: ["name", "origin", "part"],
    optionalFields: ["showSection", "standMaterial", "hasLabel"],
  },
  decoction_pieces: {
    type: "decoction_pieces",
    label: "饮片标本",
    icon: "💊",
    keywords: ["饮片标本", "饮片", "炮制饮片", "中药切片"],
    fuzzyKeywords: ["切片", "炮制", "炒制", "蒸制", "煅制"],
    basePrompt: "[中药正式名][炮制规格]饮片标本，符合《中国药典》2025版性状标准，[片型：类圆形厚片/斜片/段状]，厚度均匀，外表皮纹理清晰，切面完整展示导管孔/放射状纹理/皮部木部分层，炮制后自然色泽，整齐排列于白色哑光标本盘，规范标签标注品名、炮制规格、产地、生产批号，漫射柔光，无反光，超写实饮片质感，8K超清，nanobanana物理级渲染，微距细节拉满，锐化合理",
    negativePrompt: "碎屑过多、片型不均、颜色异常、霉变、虫蛀、展示杂乱、标签缺失、反光",
    requiredFields: ["name", "processingSpec", "origin"],
    optionalFields: ["sliceShape", "thickness", "hasLabel"],
  },
};

// ── 中国药典中药材随机库 ─────────────────────────────────────────────────

type HerbEntry = { name: string; family?: string; origin?: string; part?: string; latinName?: string };

export const HERB_DATABASE: Record<string, HerbEntry[]> = {
  immersed: [
    { name: "人参", family: "五加科", origin: "吉林抚松", part: "根", latinName: "Panax ginseng C.A.Mey." },
    { name: "三七", family: "五加科", origin: "云南文山", part: "根茎", latinName: "Panax notoginseng (Burk.) F.H.Chen" },
    { name: "黄精", family: "百合科", origin: "贵州", part: "根茎", latinName: "Polygonatum sibiricum Red." },
    { name: "重楼", family: "百合科", origin: "云南", part: "根茎", latinName: "Paris polyphylla Smith" },
    { name: "天门冬", family: "百合科", origin: "贵州", part: "块根", latinName: "Asparagus cochinchinensis (Lour.) Merr." },
    { name: "麦门冬", family: "百合科", origin: "浙江", part: "块根", latinName: "Ophiopogon japonicus (L.f.) Ker-Gawl." },
    { name: "百合", family: "百合科", origin: "甘肃兰州", part: "肉质鳞叶", latinName: "Lilium brownii F.E.Brown ex Miellez" },
    { name: "太子参", family: "石竹科", origin: "贵州", part: "块根", latinName: "Pseudostellaria heterophylla (Miq.) Pax" },
    { name: "何首乌", family: "蓼科", origin: "河南", part: "块根", latinName: "Fallopia multiflora (Thunb.) Harald." },
    { name: "地黄", family: "玄参科", origin: "河南怀庆", part: "块根", latinName: "Rehmannia glutinosa (Gaertn.) Libosch." },
    { name: "白及", family: "兰科", origin: "贵州", part: "块茎", latinName: "Bletilla striata (Thunb.) Rchb.f." },
    { name: "石斛", family: "兰科", origin: "云南", part: "茎", latinName: "Dendrobium nobile Lind." },
    { name: "铁皮石斛", family: "兰科", origin: "浙江", part: "茎", latinName: "Dendrobium officinale Kimura et Migo" },
    { name: "半夏", family: "天南星科", origin: "四川", part: "块茎", latinName: "Pinellia ternata (Thunb.) Breit." },
    { name: "水菖蒲", family: "天南星科", origin: "湖南", part: "根茎", latinName: "Acorus calamus L." },
    { name: "白术", family: "菊科", origin: "浙江", part: "根茎", latinName: "Atractylodes macrocephala Koidz." },
    { name: "苍术", family: "菊科", origin: "江苏", part: "根茎", latinName: "Atractylodes lancea (Thunb.) DC." },
    { name: "香附", family: "莎草科", origin: "山东", part: "块茎", latinName: "Cyperus rotundus L." },
    { name: "川芎", family: "伞形科", origin: "四川", part: "根茎", latinName: "Ligusticum chuanxiong Hort." },
    { name: "当归", family: "伞形科", origin: "甘肃", part: "根", latinName: "Angelica sinensis (Oliv.) Diels" },
  ],
  herbarium: [
    { name: "银杏", family: "银杏科", origin: "四川", part: "叶", latinName: "Ginkgo biloba L." },
    { name: "侧柏叶", family: "柏科", origin: "山东", part: "叶", latinName: "Platycladus orientalis (L.) Franco" },
    { name: "大青叶", family: "十字花科", origin: "河北", part: "叶", latinName: "Isatis indigotica Fortune" },
    { name: "艾叶", family: "菊科", origin: "湖北蕲春", part: "叶", latinName: "Artemisia argyi Lévl. et Van." },
    { name: "紫苏叶", family: "唇形科", origin: "江苏", part: "叶", latinName: "Perilla frutescens (L.) Britt." },
    { name: "薄荷", family: "唇形科", origin: "江苏", part: "地上部分", latinName: "Mentha haplocalyx Briq." },
    { name: "益母草", family: "唇形科", origin: "河南", part: "地上部分", latinName: "Leonurus japonicus Houtt." },
    { name: "泽兰", family: "唇形科", origin: "浙江", part: "地上部分", latinName: "Lycopus lucidus Turcz." },
    { name: "车前草", family: "车前科", origin: "江西", part: "全草", latinName: "Plantago asiatica L." },
    { name: "金钱草", family: "豆科", origin: "四川", part: "全草", latinName: "Lysimachia christinae Hance" },
    { name: "穿心莲", family: "爵床科", origin: "广东", part: "地上部分", latinName: "Andrographis paniculata (Burm.f.) Nees" },
    { name: "淫羊藿", family: "小檗科", origin: "陕西", part: "叶", latinName: "Epimedium brevicornu Maxim." },
    { name: "鱼腥草", family: "三白草科", origin: "四川", part: "全草", latinName: "Houttuynia cordata Thunb." },
    { name: "蒲公英", family: "菊科", origin: "河北", part: "全草", latinName: "Taraxacum mongolicum Hand.-Mazz." },
    { name: "茵陈", family: "菊科", origin: "陕西", part: "地上部分", latinName: "Artemisia capillaris Thunb." },
    { name: "瞿麦", family: "石竹科", origin: "河北", part: "地上部分", latinName: "Dianthus superbus L." },
    { name: "石韦", family: "水龙骨科", origin: "四川", part: "叶", latinName: "Pyrrosia lingua (Thunb.) Farwell" },
    { name: "淡竹叶", family: "禾本科", origin: "浙江", part: "茎叶", latinName: "Lophatherum gracile Brongn." },
    { name: "紫花地丁", family: "堇菜科", origin: "江苏", part: "全草", latinName: "Viola yedoensis Makino" },
    { name: "半枝莲", family: "唇形科", origin: "浙江", part: "全草", latinName: "Scutellaria barbata D.Don" },
  ],
  crude_drug: [
    { name: "黄芪", family: "豆科", origin: "内蒙古", part: "根", latinName: "Astragalus membranaceus (Fisch.) Bunge" },
    { name: "甘草", family: "豆科", origin: "内蒙古", part: "根和根茎", latinName: "Glycyrrhiza uralensis Fisch." },
    { name: "党参", family: "桔梗科", origin: "甘肃", part: "根", latinName: "Codonopsis pilosula (Franch.) Nannf." },
    { name: "丹参", family: "唇形科", origin: "四川", part: "根和根茎", latinName: "Salvia miltiorrhiza Bunge" },
    { name: "白芍", family: "毛茛科", origin: "浙江", part: "根", latinName: "Paeonia lactiflora Pall." },
    { name: "赤芍", family: "毛茛科", origin: "内蒙古", part: "根", latinName: "Paeonia lactiflora Pall." },
    { name: "川乌", family: "毛茛科", origin: "四川", part: "母根", latinName: "Aconitum carmichaelii Debx." },
    { name: "草乌", family: "毛茛科", origin: "东北", part: "块根", latinName: "Aconitum kusnezoffii Reichb." },
    { name: "附子", family: "毛茛科", origin: "四川", part: "子根", latinName: "Aconitum carmichaelii Debx." },
    { name: "黄连", family: "毛茛科", origin: "四川", part: "根茎", latinName: "Coptis chinensis Franch." },
    { name: "川贝母", family: "百合科", origin: "四川", part: "鳞茎", latinName: "Fritillaria cirrhosa D.Don" },
    { name: "浙贝母", family: "百合科", origin: "浙江", part: "鳞茎", latinName: "Fritillaria thunbergii Miq." },
    { name: "平贝母", family: "百合科", origin: "吉林", part: "鳞茎", latinName: "Fritillaria ussuriensis Maxim." },
    { name: "天麻", family: "兰科", origin: "云南", part: "块茎", latinName: "Gastrodia elata Bl." },
    { name: "白芷", family: "伞形科", origin: "四川", part: "根", latinName: "Angelica dahurica (Fisch. ex Hoffm.) Benth. et Hook.f." },
    { name: "柴胡", family: "伞形科", origin: "山西", part: "根", latinName: "Bupleurum chinense DC." },
    { name: "防风", family: "伞形科", origin: "东北", part: "根", latinName: "Saposhnikovia divaricata (Turcz.) Schischk." },
    { name: "远志", family: "远志科", origin: "山西", part: "根", latinName: "Polygala tenuifolia Willd." },
    { name: "桔梗", family: "桔梗科", origin: "安徽", part: "根", latinName: "Platycodon grandiflorus (Jacq.) A.DC." },
  ],
  decoction_pieces: [
    { name: "黄芪", family: "豆科", origin: "内蒙古", part: "根", latinName: "Astragalus membranaceus" },
    { name: "当归", family: "伞形科", origin: "甘肃", part: "根", latinName: "Angelica sinensis" },
    { name: "党参", family: "桔梗科", origin: "甘肃", part: "根", latinName: "Codonopsis pilosula" },
    { name: "茯苓", family: "多孔菌科", origin: "云南", part: "菌核", latinName: "Poria cocos" },
    { name: "白术", family: "菊科", origin: "浙江", part: "根茎", latinName: "Atractylodes macrocephala" },
    { name: "陈皮", family: "芸香科", origin: "广东", part: "果皮", latinName: "Citrus reticulata" },
    { name: "法半夏", family: "天南星科", origin: "四川", part: "块茎", latinName: "Pinellia ternata" },
    { name: "姜半夏", family: "天南星科", origin: "四川", part: "块茎", latinName: "Pinellia ternata" },
    { name: "清半夏", family: "天南星科", origin: "四川", part: "块茎", latinName: "Pinellia ternata" },
    { name: "熟地黄", family: "玄参科", origin: "河南", part: "块根", latinName: "Rehmannia glutinosa" },
    { name: "制何首乌", family: "蓼科", origin: "河南", part: "块根", latinName: "Fallopia multiflora" },
    { name: "蜜甘草", family: "豆科", origin: "内蒙古", part: "根和根茎", latinName: "Glycyrrhiza uralensis" },
    { name: "炙黄芪", family: "豆科", origin: "内蒙古", part: "根", latinName: "Astragalus membranaceus" },
    { name: "酒当归", family: "伞形科", origin: "甘肃", part: "根", latinName: "Angelica sinensis" },
    { name: "醋延胡索", family: "罂粟科", origin: "浙江", part: "块茎", latinName: "Corydalis yanhusuo" },
    { name: "醋乳香", family: "橄榄科", origin: "埃塞俄比亚", part: "树脂", latinName: "Boswellia carterii" },
    { name: "醋没药", family: "橄榄科", origin: "索马里", part: "树脂", latinName: "Commiphora myrrha" },
    { name: "煅自然铜", family: "黄铁矿族", origin: "四川", part: "矿石", latinName: "Pyrite" },
    { name: "煅石膏", family: "硫酸盐类", origin: "湖北", part: "矿石", latinName: "Gypsum" },
    { name: "蜜紫菀", family: "菊科", origin: "河北", part: "根和根茎", latinName: "Aster tataricus" },
  ],
};

// ── 标本类型列表 ─────────────────────────────────────────────────────────

export const SPECIMEN_TYPE_LIST: { value: SpecimenType; label: string; icon: string }[] = [
  { value: "none", label: "无", icon: "" },
  { value: "immersed", label: "浸制标本", icon: "🫙" },
  { value: "herbarium", label: "腊叶标本", icon: "🌿" },
  { value: "crude_drug", label: "生药标本", icon: "🏥" },
  { value: "decoction_pieces", label: "饮片标本", icon: "💊" },
];

// ── 模板图标映射 ─────────────────────────────────────────────────────────

export const TEMPLATE_ICONS: Record<string, string> = {
  "tcm-museum": "🏛️",
  "tcm-herbarium": "🌿",
  "tcm-liquid-specimen": "🫙",
  "tcm-crude-drug": "🏥",
  "tcm-slice-specimen": "💊",
  "tcm-mineral": "💎",
  "tcm-animal": "🦋",
  "tcm-ecology": "🏔️",
};

// ── 模板与标本类型关联 ─────────────────────────────────────────────────

export const TEMPLATE_SPECIMEN_HINTS: Record<string, { types: SpecimenType[]; hint: string }> = {
  "tcm-herbarium": {
    types: ["herbarium"],
    hint: "腊叶标本：中药腊叶标本摄影专业优化"
  },
  "tcm-liquid-specimen": {
    types: ["immersed"],
    hint: "浸制标本：保色液封存标本摄影"
  },
  "tcm-crude-drug": {
    types: ["crude_drug"],
    hint: "生药标本：原生药材摄影"
  },
  "tcm-slice-specimen": {
    types: ["decoction_pieces"],
    hint: "饮片标本：炮制饮片摄影"
  },
};

// ── 工具函数 ─────────────────────────────────────────────────────────────

export const STORAGE_KEY_SPECIMEN = "liang007_specimen_configs";

export function getRandomHerb(type: string): HerbEntry | null {
  const herbs = HERB_DATABASE[type];
  if (!herbs || herbs.length === 0) return null;
  return herbs[Math.floor(Math.random() * herbs.length)];
}

export function generateSpecimenPrompt(type: SpecimenType, params: SpecimenParams): string {
  if (type === "none") return "";
  const cfg = SPECIMEN_CONFIGS[type as Exclude<SpecimenType, "none">];
  if (!cfg) return "";

  let prompt = cfg.basePrompt;

  // 替换占位符
  prompt = prompt.replace(/\[中药正式名\]/g, params.name || "XXX");
  prompt = prompt.replace(/\[炮制规格\]/g, params.processingSpec || "");
  prompt = prompt.replace(/\[片型：[^]]*\]/g, params.sliceShape || "");
  prompt = prompt.replace(/\[厚度\]/g, params.thickness || "");

  // 追加可选参数补充描述
  const extras: string[] = [];
  if (type === "immersed") {
    if (params.bottleType) extras.push(`瓶型：${params.bottleType}`);
    if (params.liquidType) extras.push(`浸制液：${params.liquidType}`);
    if (params.cabinetType) extras.push(`展柜：${params.cabinetType}`);
    if (params.hasLabel) extras.push("附带规范标本标签");
  }
  if (type === "herbarium") {
    if (params.sheetSpec) extras.push(`台纸规格：${params.sheetSpec}`);
    if (params.collector) extras.push(`采集人：${params.collector}`);
    if (params.collectTime) extras.push(`采集时间：${params.collectTime}`);
    if (params.hasLabel) extras.push("附带规范采集标签");
  }
  if (type === "crude_drug") {
    if (params.showSection) extras.push("展示断面特征（放射状纹理/纤维结构/粉质特征）");
    if (params.standMaterial) extras.push(`展台材质：${params.standMaterial}`);
    if (params.hasLabel) extras.push("附带规范药材标签");
  }
  if (type === "decoction_pieces") {
    if (params.thickness) extras.push(`厚度：${params.thickness}`);
    if (params.hasLabel) extras.push("附带规范饮片标签（品名、炮制规格、产地、生产批号）");
  }

  if (extras.length > 0) {
    prompt += "，" + extras.join("，");
  }

  return prompt;
}
