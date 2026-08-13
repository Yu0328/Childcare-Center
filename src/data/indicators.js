const RAW_DOMAINS = [
  {
    domain: 1,
    name: '身體動作',
    subdomain: '粗動作、精細動作',
    byTier: {
      'Ⅰ': [
        '俯臥時可抬起頭及頸部',
        '能雙手碰在一起',
        '能抓握放在手心的物品',
        '能試圖伸手拿眼前物品',
        '能伸展肢體',
      ],
      'Ⅱ': [
        '俯臥時能以手臂撐起胸部',
        '能自己翻身',
        '能在協助下坐穩',
        '能伸手拉或耙抓物品',
        '能搖晃手中的物品',
        '能抬腿碰觸物品',
        '能匍匐移動',
      ],
      'Ⅲ': [
        '能自己坐穩',
        '會撐起身體向前爬行',
        '能在協助下站立與行走',
        '能獨立站立幾秒',
        '能將物品由一手換到另一手',
        '能用拇指配合其他手指鉗握物品',
        '能以雙手拍手',
      ],
      'Ⅳ': [
        '能獨立穩定行走',
        '能保持平衡撿拾地上物品',
        '會拿或拖拉物品行走',
        '能將玩具放入或倒出容器',
        '能翻硬紙板書',
        '能丟擲玩具',
        '能以兩指(拇指、食指)撿拾物品',
      ],
      'Ⅴ': [
        '能獨立地走上樓梯',
        '能奔跑',
        '能原地跳起',
        '能踢球',
        '能堆疊數個小積木',
        '能拿筆塗鴉',
        '能一頁一頁地翻書',
      ],
      // 25個月以上 (適性活動發展實施計畫-25個月 A4.docx). Ⅵ = 指標項次/發展活動 (base),
      // Ⅶ = 延伸(進階)活動 (extension/advanced) — both belong to the same "25個月以上／E表"
      // tier (see TIER_DATA_KEYS below), kept as separate byTier keys only to preserve their
      // original Ⅵ-x-y / Ⅶ-x-y codes from the source document.
      'Ⅵ': [
        '會手心朝下丟球或東西',
        '用整個腳掌跑步並可避開障礙物',
        '能不須扶東西，自己蹲下或彎腰後站起來',
        '可以扶牆壁、欄杆上樓梯',
        '可倒退走10公尺',
        '不扶物，單腳站1秒以上',
        '模仿畫橫線',
        '可依樣用三塊積木排直線',
        '會開小瓶蓋(寶特瓶大小，大人可以協助先旋開一點點)',
        '可一頁一頁翻薄書',
      ],
      'Ⅶ': [
        '可以雙腳一起跳，需跳高離開地面',
        '雙腳較遠距離跳躍，向前翻跟斗',
        '單腳可跳躍2次以上',
        '會疊高六個到八個積木',
        '會用打蛋器幫忙打蛋',
        '會玩黏土，並自己為作品命名',
      ],
    },
  },
  {
    domain: 2,
    name: '社會情緒',
    subdomain: '自我概念、社會關係、情緒',
    byTier: {
      'Ⅰ': [
        '能發出社會性微笑',
        '會回應成人的逗弄',
        '會使用如吸拇指或吃奶嘴的方式安撫自己',
      ],
      'Ⅱ': [
        '會玩自己的手腳',
        '對鏡中的自己感興趣',
        '能表現愉悅的情緒',
        '對與人互動表現正向反應',
        '會用簡單方式吸引成人注意',
      ],
      'Ⅲ': [
        '會揮手表示再見',
        '能和成人玩簡單重覆遊戲(如躲貓貓)',
        '能簡單表達自我需求及情緒',
        '能區辨照顧者的語氣及情緒',
        '能與照顧者建立情感依附(如主動伸手要抱)',
        '練習處理陌生人焦慮(例如有陌生人來訪時)',
      ],
      'Ⅳ': [
        '能與別的孩子坐在一起玩',
        '能在提示下做基本社交動作(如謝謝、拜拜)',
        '會對喜愛玩偶表現出疼愛或照顧的行為',
        '會對熟悉成人表達好感(如擁抱親吻)',
        '會用行為或語言表達自主性(如搖頭表示不要)',
        '練習處理分離焦慮',
      ],
      'Ⅴ': [
        '能在照片中或鏡子中認出自己',
        '能參與團體性的活動',
        '能辨識並說出他人不同的情緒',
        '會以自己的名字稱呼自己',
        '會用動作去安慰他人',
        '會說出親友、同伴的名字或稱呼',
        '能認識自己、朋友或家庭成員的照片',
        '會與玩偶對話',
      ],
      // 25個月以上. NOTE: the source document numbers these Ⅶ-2-3/Ⅶ-2-4 (continuing the count
      // from Ⅵ-2's 2 items instead of restarting at 1, unlike every other domain in this
      // document) — auto-derived here as Ⅶ-2-1/Ⅶ-2-2 instead, for consistency with how every
      // other tier's codes are generated in this file. Content is identical either way.
      'Ⅵ': [
        '會去幫助別人或保護較小的孩子',
        '會與其他孩子合作，做一件事或一個東西',
      ],
      'Ⅶ': [
        '對幼小的會保護，對錯的會告狀',
        '自己玩玩具時，叫名字會有「抬頭」、「轉頭看」或「回到大人身邊」的反應',
      ],
    },
  },
  {
    domain: 3,
    name: '語言溝通',
    subdomain: '表達性語言、接收性語言、肢體語言',
    byTier: {
      'Ⅰ': [
        '會朝發出聲音的方向轉頭',
        '能注視照顧者的口型變化',
        '會發出聲音自娛',
        '會回應成人的聲音',
      ],
      'Ⅱ': [
        '嚐試發出不同的聲音',
        '能發出聲音回應成人的話語',
        '對熟悉的童謠或音樂有反應',
        '會注視說話的人',
      ],
      'Ⅲ': [
        '能模仿大人的簡單話語(如ㄅㄚㄅㄚ)',
        '在牙牙學語中出現聲量、高低和節奏的變化',
        '會以肢體動作進行溝通(如以手指物或搖頭、點頭)',
        '會與人輪流對話',
        '能理解簡單語彙的意思(如ㄋㄟㄋㄟ)',
      ],
      'Ⅳ': [
        '能講至少十個單字',
        '能結合二個字出現電報式的話語(如狗狗汪汪)',
        '能用語言表達想要的東西',
        '能理解簡單日常生活用語',
        '能指認或說出熟悉物品/動物的名稱',
        '能回答簡單問題',
      ],
      'Ⅴ': [
        '可說出20個以上的字彙',
        '能以短句與他人對話',
        '能說出簡單的身體部位名稱',
        '能自己閱讀圖畫書',
        '聽到喜歡的音樂或歌謠會跟著手舞足蹈或哼唱',
        '練習說疑問句(如問：爸爸呢？)',
      ],
      'Ⅵ': [
        '懂得簡單的數量(多、少)，所有權(誰的)、地點(裡面、上面)的觀念',
        '稍微有一點"過去"的觀念',
        '會問「誰、在哪裡、做什麼」的問題',
        '了解"上、下、裡面．旁邊"‥位置觀念',
        '知道在什麼場合通常都作什麼事',
      ],
      'Ⅶ': [
        '大多時後可以用兩個有關聯的詞，變成句子，表達意思(如媽媽-抱抱)',
        '能用句子表達意思，如：媽媽(老師)，我要喝水',
        '會問「這是什麼？」',
        '會用"這個;那個"…冠詞',
        '能回答誰在哪裡、做什麼等問題',
      ],
    },
  },
  {
    domain: 4,
    name: '認知探索',
    subdomain: '感官知覺、概念發展、解決問題、創意表現',
    byTier: {
      'Ⅰ': [
        '眼睛能追隨物品移動',
        '對光線及聲量的變化有反應',
        '能對不同觸感有反應',
        '會模仿成人的臉部表情',
        '會探索自己雙手',
      ],
      'Ⅱ': [
        '會重覆進行有目的性的行為(例如重複搖手搖鈴)',
        '能用眼睛搜尋聲音的來源',
        '能模仿簡單的動作',
        '會用嘴巴探索物品',
        '會注視顏色或圖案鮮明的圖片/玩具',
      ],
      'Ⅲ': [
        '會分辨熟悉家人與陌生人',
        '會尋找完全被藏著的物品(保留概念)',
        '能預期事件的發生(如奶瓶出現知道要喝奶了)',
        '呼叫他的名字時會有反應',
        '能設法接近想要的事物',
        '能操作簡單玩具',
      ],
      'Ⅳ': [
        '能遵從簡單的指令',
        '能指認常見物品與簡單身體部位',
        '能配對簡單形狀',
        '能了解常見物品的用途',
        '能以新的方式探索物品的特性',
        '能尋找出指定物品',
      ],
      'Ⅴ': [
        '能分辨冷熱、軟硬、乾濕等',
        '會假裝餵洋娃娃吃東西',
        '能依形狀或顏色分類',
        '能分辨大小',
        '能拼簡單拼圖',
        '對塗顏色活動感興趣',
      ],
      'Ⅵ': [
        '能正確的指出身體部位或五官(至少6個地方)',
        '知道上下、裡面、旁邊的位置概念',
        '能正確說出圖片或圖畫書中，日常生活中常見物品的名稱，至少四樣(例:杯子、鞋子、車子、飛機…等)',
      ],
      'Ⅶ': [
        '知道現在、明天，還昨天、從前有些許概念(例如:知道「明天」不是指「現在」)',
        '知道一些規則和是非觀念',
      ],
    },
  },
  {
    domain: 5,
    name: '生活自理',
    subdomain: '自助技能、健康習慣、清潔衛生',
    byTier: {
      'Ⅰ': [
        '能吸吮奶嘴',
      ],
      'Ⅱ': [
        '會伸手幫忙拿奶瓶',
        '能接受用湯匙餵食',
      ],
      'Ⅲ': [
        '能自己拿住奶瓶進食',
        '能吞嚥糊狀副食品',
        '能自己拿食物吃',
        '能拉下頭上的帽子',
        '會表示要吃東西',
      ],
      'Ⅳ': [
        '能用學習杯喝水',
        '能用吸管喝水',
        '練習用湯匙/叉子',
        '會表示尿濕了或已排便',
        '練習洗手的技巧',
        '能粗略以毛巾擦嘴',
        '練習咀嚼半固態食物',
      ],
      'Ⅴ': [
        '能用湯匙進食',
        '能咀嚼固體食物',
        '能自己脫褲子及鞋子',
        '能在協助下練習穿衣服',
        '能在協助下練習刷牙',
        '能幫忙收拾玩具及物品',
        '能練習做簡單家事(如擦桌子、收碗)',
        '能練習如廁及表達需求',
      ],
      'Ⅵ': [
        '在幫忙下會用肥皂洗手並擦乾了',
        '能用湯匙吃喝東西',
      ],
      'Ⅶ': [
        '會拉下褲子，準備大、小便',
        '會自己穿脫沒有鞋帶的鞋子',
        '會打開糖果紙',
        '白天可控制大、小便',
      ],
    },
  },
];

// formLetter: the official per-tier form designation. Tier Ⅰ (0-3個月) has no lettered form at
// all — it's referred to by its age range instead, never "A表". Letters start at tier Ⅱ (Ⅱ→A表,
// Ⅲ→B表, Ⅳ→C表, Ⅴ→D表), used in the 適性總表 docx export's downloaded filename and the monthly
// plan's per-child form label. Use tierFormLabel() below rather than reading formLetter directly,
// so tier Ⅰ's null case is handled in one place instead of at every call site.
export const TIERS = [
  { code: 'Ⅰ', label: '0-3個月', minMonths: 0, maxMonths: 3, formLetter: null },
  { code: 'Ⅱ', label: '4-6個月', minMonths: 4, maxMonths: 6, formLetter: 'A' },
  { code: 'Ⅲ', label: '7-12個月', minMonths: 7, maxMonths: 12, formLetter: 'B' },
  { code: 'Ⅳ', label: '13-18個月', minMonths: 13, maxMonths: 18, formLetter: 'C' },
  { code: 'Ⅴ', label: '19-24個月', minMonths: 19, maxMonths: 24, formLetter: 'D' },
  { code: 'Ⅵ', label: '25個月以上', minMonths: 25, maxMonths: Infinity, formLetter: 'E' },
];

// Tier Ⅵ ("25個月以上") draws its indicators from two source-document codings — Ⅵ-x-y (base
// 指標項次/發展活動) and Ⅶ-x-y (延伸/進階活動) — both selectable under the single Ⅵ tier/E表.
// Every other tier code maps 1:1 to its own INDICATORS `tier` value, so only this one needs an
// explicit multi-key entry.
const TIER_DATA_KEYS = { 'Ⅵ': ['Ⅵ', 'Ⅶ'] };

// Unlike tiers Ⅰ-Ⅴ, the 25個月以上 source document's indicators have no short 【活動名稱】 label
// alongside their description — just the description text alone. Flagged per-indicator (not
// per-tier) so UI code can decide whether to auto-fill an activity-name field without needing a
// reverse tier→TIERS lookup.
const NO_ACTIVITY_NAME_TIERS = new Set(['Ⅵ', 'Ⅶ']);

// The label to show for a tier wherever a "[letter]表" would normally appear: the lettered form
// name for tiers Ⅱ-Ⅴ, or just the plain age range for tier Ⅰ (which has no letter). Callers should
// not append their own trailing "表" — it's already included here when there is a letter.
export function tierFormLabel(tierCode) {
  const tier = TIERS.find(t => t.code === tierCode);
  if (!tier) return '';
  return tier.formLetter ? `${tier.formLetter}表` : tier.label;
}

export const DOMAINS = RAW_DOMAINS.map(({ domain, name, subdomain }) => ({
  id: domain,
  name,
  subdomain,
}));

export const INDICATORS = RAW_DOMAINS.flatMap(({ domain, name, subdomain, byTier }) =>
  Object.entries(byTier).flatMap(([tier, descriptions]) =>
    descriptions.map((description, index) => ({
      code: `${tier}-${domain}-${index + 1}`,
      tier,
      domain,
      domainName: name,
      subdomain,
      description,
      noActivityName: NO_ACTIVITY_NAME_TIERS.has(tier),
    }))
  )
);

export function getIndicatorsForTier(tierCode) {
  const dataKeys = TIER_DATA_KEYS[tierCode] || [tierCode];
  return INDICATORS.filter(indicator => dataKeys.includes(indicator.tier));
}

export function getIndicator(code) {
  return INDICATORS.find(indicator => indicator.code === code);
}
