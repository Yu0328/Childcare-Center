// Each tier entry is a [description, activityName] tuple — description is the indicator's full
// text, activityName is its official short 【活動名稱】 label from the practice guide (empty
// string for the 25個月以上 tier, which has no such label in its source document — see
// NO_ACTIVITY_NAME_TIERS below... actually derived from activityName itself, see INDICATORS).
const RAW_DOMAINS = [
  {
    domain: 1,
    name: '身體動作',
    subdomain: '粗動作、精細動作',
    byTier: {
      'Ⅰ': [
        ['俯臥時可抬起頭及頸部', '抬頭小娃'],
        ['能雙手碰在一起', '給自己抱抱'],
        ['能抓握放在手心的物品', '握緊拳頭'],
        ['能試圖伸手拿眼前物品', '來拿玩具'],
        ['能伸展肢體', '舒活時間'],
      ],
      'Ⅱ': [
        ['俯臥時能以手臂撐起胸部', '我會趴'],
        ['能自己翻身', '翻身運動'],
        ['能在協助下坐穩', '坐穩囉'],
        ['能伸手拉或耙抓物品', '抓抓樂'],
        ['能搖晃手中的物品', '叮叮噹'],
        ['能抬腿碰觸物品', '踢踢樂'],
        ['能匍匐移動', '匍匐移動'],
      ],
      'Ⅲ': [
        ['能自己坐穩', '能自己坐'],
        ['會撐起身體向前爬行', '爬爬樂'],
        ['能在協助下站立與行走', '站起來囉'],
        ['能獨立站立幾秒', '站起來囉'],
        ['能將物品由一手換到另一手', '換一隻手'],
        ['能用拇指配合其他手指鉗握物品', '換一隻手'],
        ['能以雙手拍手', '拍拍手'],
      ],
      'Ⅳ': [
        ['能獨立穩定行走', '走過來'],
        ['能保持平衡撿拾地上物品', '撿起來'],
        ['會拿或拖拉物品行走', '拉著玩具走'],
        ['能將玩具放入或倒出容器', '放進去拿出來'],
        ['能翻硬紙板書', '寶寶翻翻書'],
        ['能丟擲玩具', '玩丟丟樂'],
        ['能以兩指(拇指、食指)撿拾物品', '撿拾葡萄乾'],
      ],
      'Ⅴ': [
        ['能獨立地走上樓梯', '上樓梯'],
        ['能奔跑', '我會跑'],
        ['能原地跳起', '跳跳虎'],
        ['能踢球', '踢球樂'],
        ['能堆疊數個小積木', '積木疊疊樂'],
        ['能拿筆塗鴉', '我會塗鴉'],
        ['能一頁一頁地翻書', '小小愛書人'],
      ],
      // 25個月以上 (適性活動發展實施計畫-25個月 A4.docx). Ⅵ = 指標項次/發展活動 (base),
      // Ⅶ = 延伸(進階)活動 (extension/advanced) — both belong to the same "25個月以上／E表"
      // tier (see TIER_DATA_KEYS below), kept as separate byTier keys only to preserve their
      // original Ⅵ-x-y / Ⅶ-x-y codes from the source document. No activityName in this source.
      'Ⅵ': [
        ['會手心朝下丟球或東西', ''],
        ['用整個腳掌跑步並可避開障礙物', ''],
        ['能不須扶東西，自己蹲下或彎腰後站起來', ''],
        ['可以扶牆壁、欄杆上樓梯', ''],
        ['可倒退走10公尺', ''],
        ['不扶物，單腳站1秒以上', ''],
        ['模仿畫橫線', ''],
        ['可依樣用三塊積木排直線', ''],
        ['會開小瓶蓋(寶特瓶大小，大人可以協助先旋開一點點)', ''],
        ['可一頁一頁翻薄書', ''],
      ],
      'Ⅶ': [
        ['可以雙腳一起跳，需跳高離開地面', ''],
        ['雙腳較遠距離跳躍，向前翻跟斗', ''],
        ['單腳可跳躍2次以上', ''],
        ['會疊高六個到八個積木', ''],
        ['會用打蛋器幫忙打蛋', ''],
        ['會玩黏土，並自己為作品命名', ''],
      ],
    },
  },
  {
    domain: 2,
    name: '社會情緒',
    subdomain: '自我概念、社會關係、情緒',
    byTier: {
      'Ⅰ': [
        ['能發出社會性微笑', '笑一個、鏡中人'],
        ['會回應成人的逗弄', '我現在的心情'],
        ['會使用如吸拇指或吃奶嘴的方式安撫自己', '給自己惜惜（台語發音）'],
      ],
      'Ⅱ': [
        ['會玩自己的手腳', '吃雞腿'],
        ['對鏡中的自己感興趣', '誰在鏡子裡'],
        ['能表現愉悅的情緒', '飛天毛毯'],
        ['對與人互動表現正向反應', '飛天毛毯'],
        ['會用簡單方式吸引成人注意', '和我一起玩'],
      ],
      'Ⅲ': [
        ['會揮手表示再見', '打招呼'],
        ['能和成人玩簡單重覆遊戲(如躲貓貓)', '躲貓貓'],
        ['能簡單表達自我需求及情緒', '心情表情'],
        ['能區辨照顧者的語氣及情緒', '心情表情'],
        ['能與照顧者建立情感依附(如主動伸手要抱)', '建立感情'],
        ['練習處理陌生人焦慮(例如有陌生人來訪時)', '有陌生人'],
      ],
      'Ⅳ': [
        ['能與別的孩子坐在一起玩', '坐在一起'],
        ['能在提示下做基本社交動作(如謝謝、拜拜)', '揮手拜拜'],
        ['會對喜愛玩偶表現出疼愛或照顧的行為', '照顧小娃娃'],
        ['會對熟悉成人表達好感(如擁抱親吻)', '照顧小娃娃'],
        ['會用行為或語言表達自主性(如搖頭表示不要)', '我不要'],
        ['練習處理分離焦慮', '我想抱抱'],
      ],
      'Ⅴ': [
        ['能在照片中或鏡子中認出自己', '那是誰？'],
        ['能參與團體性的活動', '一起丟布球'],
        ['能辨識並說出他人不同的情緒', '喜怒哀樂'],
        ['會以自己的名字稱呼自己', '我是誰'],
        ['會用動作去安慰他人', '安慰別人'],
        ['會說出親友、同伴的名字或稱呼', '打招呼'],
        ['能認識自己、朋友或家庭成員的照片', '介紹照片'],
        ['會與玩偶對話', '扮家家酒'],
      ],
      // 25個月以上. Unlike every other domain in this document, 社會情緒's four items here are
      // all Ⅵ (the source document's own Ⅶ-2-3/Ⅶ-2-4 labels on the last two are a numbering
      // slip in that document, not a genuine 延伸/進階 sub-tier for this domain) — kept as one
      // Ⅵ array rather than split into Ⅵ/Ⅶ like the other four domains.
      'Ⅵ': [
        ['會去幫助別人或保護較小的孩子', ''],
        ['會與其他孩子合作，做一件事或一個東西', ''],
        ['對幼小的會保護，對錯的會告狀', ''],
        ['自己玩玩具時，叫名字會有「抬頭」、「轉頭看」或「回到大人身邊」的反應', ''],
      ],
    },
  },
  {
    domain: 3,
    name: '語言溝通',
    subdomain: '表達性語言、接收性語言、肢體語言',
    byTier: {
      'Ⅰ': [
        ['會朝發出聲音的方向轉頭', '聲音在哪裡'],
        ['能注視照顧者的口型變化', '看誰在唱歌'],
        ['會發出聲音自娛', '發聲遊戲'],
        ['會回應成人的聲音', '現在在做什麼'],
      ],
      'Ⅱ': [
        ['嚐試發出不同的聲音', '這是什麼'],
        ['能發出聲音回應成人的話語', '寶寶學說話'],
        ['對熟悉的童謠或音樂有反應', '寶寶會唱歌'],
        ['會注視說話的人', '看誰在說話'],
      ],
      'Ⅲ': [
        ['能模仿大人的簡單話語(如ㄅㄚㄅㄚ)', '跟我一起說'],
        ['在牙牙學語中出現聲量、高低和節奏的變化', '動物大集合'],
        ['會以肢體動作進行溝通(如以手指物或搖頭、點頭)', '表示意見'],
        ['會與人輪流對話', '聊聊天'],
        ['能理解簡單語彙的意思(如ㄋㄟㄋㄟ)', '我聽懂了'],
      ],
      'Ⅳ': [
        ['能講至少十個單字', '說說看'],
        ['能結合二個字出現電報式的話語(如狗狗汪汪)', '狗狗汪汪'],
        ['能用語言表達想要的東西', '你要什麼東西'],
        ['能理解簡單日常生活用語', '指認物品'],
        ['能指認或說出熟悉物品/動物的名稱', '指認物品'],
        ['能回答簡單問題', '要不要'],
      ],
      'Ⅴ': [
        ['可說出20個以上的字彙', '小博士'],
        ['能以短句與他人對話', '以語言表達'],
        ['能說出簡單的身體部位名稱', '認識自己的身體'],
        ['能自己閱讀圖畫書', '故事魔毯'],
        ['聽到喜歡的音樂或歌謠會跟著手舞足蹈或哼唱', '載歌載舞'],
        ['練習說疑問句(如問：爸爸呢？)', '我會問'],
      ],
      'Ⅵ': [
        ['懂得簡單的數量(多、少)，所有權(誰的)、地點(裡面、上面)的觀念', ''],
        ['稍微有一點"過去"的觀念', ''],
        ['會問「誰、在哪裡、做什麼」的問題', ''],
        ['了解"上、下、裡面．旁邊"‥位置觀念', ''],
        ['知道在什麼場合通常都作什麼事', ''],
      ],
      'Ⅶ': [
        ['大多時後可以用兩個有關聯的詞，變成句子，表達意思(如媽媽-抱抱)', ''],
        ['能用句子表達意思，如：媽媽(老師)，我要喝水', ''],
        ['會問「這是什麼？」', ''],
        ['會用"這個;那個"…冠詞', ''],
        ['能回答誰在哪裡、做什麼等問題', ''],
      ],
    },
  },
  {
    domain: 4,
    name: '認知探索',
    subdomain: '感官知覺、概念發展、解決問題、創意表現',
    byTier: {
      'Ⅰ': [
        ['眼睛能追隨物品移動', '追視物品'],
        ['對光線及聲量的變化有反應', '感受明暗變化'],
        ['能對不同觸感有反應', '搔癢遊戲'],
        ['會模仿成人的臉部表情', '表情模仿秀'],
        ['會探索自己雙手', '小手在哪裡'],
      ],
      'Ⅱ': [
        ['會重覆進行有目的性的行為(例如重複搖手搖鈴)', '搖一搖'],
        ['能用眼睛搜尋聲音的來源', '什麼聲音'],
        ['能模仿簡單的動作', '跟我這樣玩'],
        ['會用嘴巴探索物品', '咬咬看'],
        ['會注視顏色或圖案鮮明的圖片/玩具', '瞧一瞧'],
      ],
      'Ⅲ': [
        ['會分辨熟悉家人與陌生人', '我認識的人'],
        ['會尋找完全被藏著的物品(保留概念)', '不見了'],
        ['能預期事件的發生(如奶瓶出現知道要喝奶了)', '等一下做什麼'],
        ['呼叫他的名字時會有反應', '球兒滾來滾去'],
        ['能設法接近想要的事物', '球兒滾來滾去'],
        ['能操作簡單玩具', '我會玩'],
      ],
      'Ⅳ': [
        ['能遵從簡單的指令', '手在哪裡'],
        ['能指認常見物品與簡單身體部位', '手在哪裡'],
        ['能配對簡單形狀', '配對遊戲'],
        ['能了解常見物品的用途', '寶寶的東西在哪裡'],
        ['能以新的方式探索物品的特性', '新玩法'],
        ['能尋找出指定物品', '找出指定物品'],
      ],
      'Ⅴ': [
        ['能分辨冷熱、軟硬、乾濕等', '感覺一下'],
        ['會假裝餵洋娃娃吃東西', '照顧小娃娃'],
        ['能依形狀或顏色分類', '分類遊戲'],
        ['能分辨大小', '大大小小'],
        ['能拼簡單拼圖', '我會拼圖'],
        ['對塗顏色活動感興趣', '自由作畫'],
      ],
      'Ⅵ': [
        ['能正確的指出身體部位或五官(至少6個地方)', ''],
        ['知道上下、裡面、旁邊的位置概念', ''],
        ['能正確說出圖片或圖畫書中，日常生活中常見物品的名稱，至少四樣(例:杯子、鞋子、車子、飛機…等)', ''],
      ],
      'Ⅶ': [
        ['知道現在、明天，還昨天、從前有些許概念(例如:知道「明天」不是指「現在」)', ''],
        ['知道一些規則和是非觀念', ''],
      ],
    },
  },
  {
    domain: 5,
    name: '生活自理',
    subdomain: '自助技能、健康習慣、清潔衛生',
    byTier: {
      'Ⅰ': [
        ['能吸吮奶嘴', '吃奶嘴'],
      ],
      'Ⅱ': [
        ['會伸手幫忙拿奶瓶', '一起拿奶瓶'],
        ['能接受用湯匙餵食', '用湯匙喝果汁'],
      ],
      'Ⅲ': [
        ['能自己拿住奶瓶進食', '幫忙拿奶瓶'],
        ['能吞嚥糊狀副食品', '麥片時間'],
        ['能自己拿食物吃', '我會自己拿'],
        ['能拉下頭上的帽子', '脫帽子'],
        ['會表示要吃東西', '我要吃東西'],
      ],
      'Ⅳ': [
        ['能用學習杯喝水', '我會喝水'],
        ['能用吸管喝水', '我會喝水'],
        ['練習用湯匙/叉子', '我會自己餵'],
        ['會表示尿濕了或已排便', '我大大了'],
        ['練習洗手的技巧', '清潔寶寶'],
        ['能粗略以毛巾擦嘴', '清潔寶寶'],
        ['練習咀嚼半固態食物', '練習咬一咬'],
      ],
      'Ⅴ': [
        ['能用湯匙進食', '用湯匙吃東西'],
        ['能咀嚼固體食物', '咬一咬'],
        ['能自己脫褲子及鞋子', '自己脫'],
        ['能在協助下練習穿衣服', '練習穿衣服'],
        ['能在協助下練習刷牙', '自己刷牙'],
        ['能幫忙收拾玩具及物品', '自己收玩具'],
        ['能練習做簡單家事(如擦桌子、收碗)', '自己收玩具'],
        ['能練習如廁及表達需求', '坐小馬桶'],
      ],
      'Ⅵ': [
        ['在幫忙下會用肥皂洗手並擦乾了', ''],
        ['能用湯匙吃喝東西', ''],
      ],
      'Ⅶ': [
        ['會拉下褲子，準備大、小便', ''],
        ['會自己穿脫沒有鞋帶的鞋子', ''],
        ['會打開糖果紙', ''],
        ['白天可控制大、小便', ''],
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

// The label to show for a tier wherever a "[letter]表" would normally appear: the lettered form
// name for tiers Ⅱ-Ⅴ, or just the plain age range for tier Ⅰ (which has no letter). Callers should
// not append their own trailing "表" — it's already included here when there is a letter.
export function tierFormLabel(tierCode) {
  const tier = TIERS.find(t => t.code === tierCode);
  if (!tier) return '';
  return tier.formLetter ? `${tier.formLetter}表` : tier.label;
}

// The tier immediately before this one in TIERS, or null for Ⅰ (no earlier tier) or an
// unrecognized code.
export function previousTier(tierCode) {
  const index = TIERS.findIndex(t => t.code === tierCode);
  return index > 0 ? TIERS[index - 1].code : null;
}

export const DOMAINS = RAW_DOMAINS.map(({ domain, name, subdomain }) => ({
  id: domain,
  name,
  subdomain,
}));

export const INDICATORS = RAW_DOMAINS.flatMap(({ domain, name, subdomain, byTier }) =>
  Object.entries(byTier).flatMap(([tier, entries]) =>
    entries.map(([description, activityName], index) => ({
      code: `${tier}-${domain}-${index + 1}`,
      tier,
      domain,
      domainName: name,
      subdomain,
      description,
      activityName,
      // 25個月以上's source document has no short 【活動名稱】 label at all (empty string
      // above), unlike tiers Ⅰ-Ⅴ — flagged so UI code can skip auto-filling an activity-name
      // field for those instead of writing an empty string into it.
      noActivityName: !activityName,
    }))
  )
);

export function getIndicatorsForTier(tierCode) {
  const dataKeys = TIER_DATA_KEYS[tierCode] || [tierCode];
  return INDICATORS.filter(indicator => dataKeys.includes(indicator.tier));
}

// Bug fix: reference codes always use the Unicode ROMAN NUMERAL characters (Ⅰ Ⅱ Ⅲ Ⅳ Ⅴ, single
// codepoints) as the tier prefix, and lookups do an exact string match against them. A real
// legacy file's author sometimes typed that prefix using ordinary ASCII Latin letters (the
// keyboard "V" key, etc.) instead — verified against a real reference sample (gitignored, not
// committed here): 8 Latin-prefixed codes vs. only 3 proper Unicode ones in that one file. A
// Latin-prefixed code still displays fine as text, but an exact-match lookup silently fails to
// resolve it. Longest-prefix-first ordering matters: "IV" and "III" must be checked before the
// single-letter "I"/"V" fallbacks, or "IV-1-2" would match "I" and leave a bogus "V-1-2" remainder.
const LATIN_TIER_PREFIX_TO_UNICODE = { III: 'Ⅲ', IV: 'Ⅳ', II: 'Ⅱ', I: 'Ⅰ', V: 'Ⅴ' };
const LATIN_TIER_PREFIX_PATTERN = /^(III|IV|II|I|V)-/;
export function normalizeIndicatorCode(code) {
  const match = LATIN_TIER_PREFIX_PATTERN.exec(code ?? '');
  if (!match) return code; // already Unicode, or unrecognized/garbled — leave untouched
  return LATIN_TIER_PREFIX_TO_UNICODE[match[1]] + code.slice(match[1].length);
}

// Normalizes before matching so a Latin-prefixed code already stored from before this fix — not
// just a newly-parsed one — resolves too, on every read, with no one-time data migration needed.
export function getIndicator(code) {
  const normalized = normalizeIndicatorCode(code);
  return INDICATORS.find(indicator => indicator.code === normalized);
}
