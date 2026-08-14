/** 按需加载下载模块，避免播放页首包打入 HLS 合并逻辑 */
export function loadVideoDownload() {
  // @ts-expect-error Next bundler 解析 @ 别名；tsc node16 动态 import 不识别别名
  return import('@/lib/videoDownload') as Promise<
    typeof import('@/lib/videoDownload')
  >;
}
