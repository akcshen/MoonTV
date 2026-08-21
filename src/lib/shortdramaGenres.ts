/**
 * 短剧题材。各资源站对同一题材的叫法不一致（如「言情总裁」「女恋总裁」「女频恋爱」），
 * 这里按别名归一化，供前端选择器与服务端分类匹配共用。
 */
export interface ShortDramaGenre {
  label: string;
  aliases: string[];
}

export const SHORT_DRAMA_GENRES: ShortDramaGenre[] = [
  { label: '古装仙侠', aliases: ['古装仙侠'] },
  { label: '现代都市', aliases: ['现代都市', '现代言情'] },
  { label: '总裁言情', aliases: ['言情总裁', '女恋总裁', '女频恋爱'] },
  { label: '穿越年代', aliases: ['穿越年代', '年代穿越', '穿越现代'] },
  { label: '重生民国', aliases: ['重生民国'] },
  { label: '反转爽剧', aliases: ['反转爽剧', '反转爽文'] },
  { label: '悬疑脑洞', aliases: ['悬疑烧脑', '脑洞悬疑', '都市脑洞'] },
  { label: '逆袭成长', aliases: ['成长逆袭'] },
  { label: '闪婚离婚', aliases: ['闪婚离婚'] },
  { label: 'AI漫剧', aliases: ['AI漫剧'] },
];

/** 「全部」在选择器里的取值 */
export const SHORT_DRAMA_GENRE_ALL = '';

export function findGenreByLabel(label: string): ShortDramaGenre | undefined {
  return SHORT_DRAMA_GENRES.find((genre) => genre.label === label);
}
