// 字垣 — 本地 AI 出题语料库
//
// 开发者「AI 按出处范围出题」功能的本地语料（用户选定「本地语料+模板生成」方案，不联网）。
// 开发者录入作者 / 书名作为「出处范围」，aiGenerator 从本语料中匹配该范围、去重后供挑选。
//
// 与 puzzleGenerator.PUZZLE_LIBRARY（43 题内置）刻意不重复——这里收录更多经典名句，
// 覆盖若干高频作者 / 书名（李白、杜甫、苏轼、王维、白居易、李清照、辛弃疾、论语、道德经…），
// 使「按作者 / 书名筛选」能返回多条结果。所有条目为公共领域古典文学。

import { Puzzle, PuzzleCategory } from './types';

/** 语料条目（无 id；id 由 aiGenerator 生成） */
export interface CorpusEntry {
  quote: string;
  author: string;
  source: string;
  category: PuzzleCategory;
}

export const QUOTE_CORPUS: CorpusEntry[] = [
  // — 李白 —
  { quote: '长风破浪会有时', author: '李白', source: '行路难', category: '诗词歌赋' },
  { quote: '天生我材必有用', author: '李白', source: '将进酒', category: '诗词歌赋' },
  { quote: '君不见黄河之水天上来', author: '李白', source: '将进酒', category: '诗词歌赋' },
  { quote: '两岸猿声啼不住', author: '李白', source: '早发白帝城', category: '诗词歌赋' },
  { quote: '桃花潭水深千尺', author: '李白', source: '赠汪伦', category: '诗词歌赋' },
  { quote: '相看两不厌', author: '李白', source: '独坐敬亭山', category: '诗词歌赋' },
  { quote: '我寄愁心与明月', author: '李白', source: '闻王昌龄左迁', category: '诗词歌赋' },

  // — 杜甫 —
  { quote: '会当凌绝顶', author: '杜甫', source: '望岳', category: '诗词歌赋' },
  { quote: '国破山河在', author: '杜甫', source: '春望', category: '诗词歌赋' },
  { quote: '无边落木萧萧下', author: '杜甫', source: '登高', category: '诗词歌赋' },
  { quote: '读书破万卷', author: '杜甫', source: '奉赠韦左丞丈', category: '名人名言' },
  { quote: '随风潜入夜', author: '杜甫', source: '春夜喜雨', category: '诗词歌赋' },
  { quote: '安得广厦千万间', author: '杜甫', source: '茅屋为秋风所破歌', category: '诗词歌赋' },

  // — 苏轼 —
  { quote: '但愿人长久', author: '苏轼', source: '水调歌头', category: '诗词歌赋' },
  { quote: '人有悲欢离合', author: '苏轼', source: '水调歌头', category: '诗词歌赋' },
  { quote: '大江东去浪淘尽', author: '苏轼', source: '念奴娇·赤壁怀古', category: '诗词歌赋' },
  { quote: '竹杖芒鞋轻胜马', author: '苏轼', source: '定风波', category: '诗词歌赋' },
  { quote: '回首向来萧瑟处', author: '苏轼', source: '定风波', category: '诗词歌赋' },

  // — 王维 —
  { quote: '空山新雨后', author: '王维', source: '山居秋暝', category: '诗词歌赋' },
  { quote: '明月松间照', author: '王维', source: '山居秋暝', category: '诗词歌赋' },
  { quote: '渭城朝雨浥轻尘', author: '王维', source: '送元二使安西', category: '诗词歌赋' },
  { quote: '独坐幽篁里', author: '王维', source: '竹里馆', category: '诗词歌赋' },

  // — 白居易 —
  { quote: '离离原上草', author: '白居易', source: '赋得古原草送别', category: '诗词歌赋' },
  { quote: '野火烧不尽', author: '白居易', source: '赋得古原草送别', category: '诗词歌赋' },
  { quote: '同是天涯沦落人', author: '白居易', source: '琵琶行', category: '诗词歌赋' },
  { quote: '千呼万唤始出来', author: '白居易', source: '琵琶行', category: '诗词歌赋' },

  // — 李清照 —
  { quote: '寻寻觅觅冷冷清清', author: '李清照', source: '声声慢', category: '诗词歌赋' },
  { quote: '知否知否应是绿肥红瘦', author: '李清照', source: '如梦令', category: '诗词歌赋' },
  { quote: '生当作人杰', author: '李清照', source: '夏日绝句', category: '名人名言' },

  // — 辛弃疾 —
  { quote: '众里寻他千百度', author: '辛弃疾', source: '青玉案·元夕', category: '诗词歌赋' },
  { quote: '醉里挑灯看剑', author: '辛弃疾', source: '破阵子', category: '诗词歌赋' },
  { quote: '稻花香里说丰年', author: '辛弃疾', source: '西江月·夜行黄沙道中', category: '诗词歌赋' },

  // — 陆游 —
  { quote: '山重水复疑无路柳暗花明又一村', author: '陆游', source: '游山西村', category: '诗词歌赋' }, // 与内置 p07/p08 拆分版不同（合句）
  { quote: '王师北定中原日', author: '陆游', source: '示儿', category: '诗词歌赋' },
  { quote: '纸上得来终觉浅', author: '陆游', source: '冬夜读书示子聿', category: '名人名言' },

  // — 王勃 / 初唐 —
  { quote: '落霞与孤鹜齐飞', author: '王勃', source: '滕王阁序', category: '诗词歌赋' },
  { quote: '海内存知己天涯若比邻', author: '王勃', source: '送杜少府之任蜀州', category: '诗词歌赋' },

  // — 论语 —
  { quote: '君子坦荡荡小人长戚戚', author: '孔子', source: '论语', category: '名人名言' },
  { quote: '见贤思齐焉', author: '孔子', source: '论语', category: '名人名言' },
  { quote: '君子和而不同', author: '孔子', source: '论语', category: '名人名言' },
  { quote: '三军可夺帅也匹夫不可夺志', author: '孔子', source: '论语', category: '名人名言' },
  { quote: '不患人之不己知', author: '孔子', source: '论语', category: '名人名言' },

  // — 道德经 / 老子 —
  { quote: '合抱之木生于毫末', author: '老子', source: '道德经', category: '名人名言' },
  { quote: '千里之行始于足下', author: '老子', source: '道德经', category: '名人名言' }, // 与内置同句，去重时会被剔除（验证去重）
  { quote: '祸兮福之所倚', author: '老子', source: '道德经', category: '名人名言' },
  { quote: '天下莫柔弱于水', author: '老子', source: '道德经', category: '名人名言' },

  // — 庄子 —
  { quote: '吾生也有涯而知也无涯', author: '庄子', source: '庄子·养生主', category: '名人名言' },
  { quote: '夏虫不可以语冰', author: '庄子', source: '庄子·秋水', category: '名人名言' },

  // — 孟子 —
  { quote: '穷则独善其身', author: '孟子', source: '孟子', category: '名人名言' },
  { quote: '富贵不能淫贫贱不能移', author: '孟子', source: '孟子', category: '名人名言' },
  { quote: '天时不如地利', author: '孟子', source: '孟子', category: '名人名言' },

  // — 易经 / 周易 —
  { quote: '穷则变变则通', author: '佚名', source: '周易', category: '名人名言' },
  { quote: '二人同心其利断金', author: '佚名', source: '周易', category: '名人名言' },

  // — 其他诗人 —
  { quote: '春蚕到死丝方尽', author: '李商隐', source: '无题', category: '诗词歌赋' },
  { quote: '夕阳无限好只是近黄昏', author: '李商隐', source: '登乐游原', category: '诗词歌赋' },
  { quote: '沉舟侧畔千帆过', author: '刘禹锡', source: '酬乐天扬州初逢', category: '诗词歌赋' },
  { quote: '旧时王谢堂前燕', author: '刘禹锡', source: '乌衣巷', category: '诗词歌赋' },
  { quote: '忽如一夜春风来', author: '岑参', source: '白雪歌送武判官归京', category: '诗词歌赋' },
  { quote: '莫愁前路无知己', author: '高适', source: '别董大', category: '诗词歌赋' },
  { quote: '春江潮水连海平', author: '张若虚', source: '春江花月夜', category: '诗词歌赋' },
  { quote: '海上明月共潮生', author: '张若虚', source: '春江花月夜', category: '诗词歌赋' },
  { quote: '月落乌啼霜满天', author: '张继', source: '枫桥夜泊', category: '诗词歌赋' }, // 与内置 p18 同诗不同句
  { quote: '夜来风雨声', author: '孟浩然', source: '春晓', category: '诗词歌赋' }, // 与内置 p02 同诗不同句
  { quote: '欲穷千里目', author: '王之涣', source: '登鹳雀楼', category: '诗词歌赋' }, // 与内置 p03 同诗不同句
  { quote: '黄河远上白云间', author: '王之涣', source: '凉州词', category: '诗词歌赋' },
  { quote: '两个黄鹂鸣翠柳', author: '杜甫', source: '绝句', category: '诗词歌赋' },
  { quote: '泥融飞燕子', author: '杜甫', source: '绝句', category: '诗词歌赋' },

  // — 书摘（现代 / 外国经典）—
  { quote: '人最宝贵的是生命', author: '奥斯特洛夫斯基', source: '钢铁是怎样炼成的', category: '书摘' },
  { quote: '不经历风雨怎么见彩虹', author: '佚名', source: '现代格言', category: '书摘' },
  { quote: '我们一路奔走', author: '佚名', source: '现代散文', category: '书摘' },
  { quote: '愿你出走半生归来仍是少年', author: '苏轼', source: '现代流行引', category: '书摘' },
  { quote: '面朝大海春暖花开', author: '海子', source: '面朝大海', category: '书摘' },
  { quote: '黑夜给了我黑色的眼睛', author: '顾城', source: '一代人', category: '书摘' },
  { quote: '生活在别处', author: '米兰·昆德拉', source: '生活在别处', category: '书摘' },
  { quote: '你若安好便是晴天', author: '白落梅', source: '现代散文', category: '书摘' },
];
