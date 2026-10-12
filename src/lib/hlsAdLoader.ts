/* eslint-disable @typescript-eslint/no-explicit-any */

import { filterAdsFromM3U8 } from '@/lib/m3u8AdFilter';

type HlsWithLoader = {
  DefaultConfig: {
    loader: new (config: any) => { load: (...args: any[]) => void };
  };
};

/**
 * 基于已加载的 Hls 构造去广告 Loader。
 * 只在用户打开「去广告」时挂上，默认仍用 hls.js 自带 loader。
 */
export function createAdSkipHlsLoader(Hls: HlsWithLoader) {
  return class CustomHlsJsLoader extends Hls.DefaultConfig.loader {
    constructor(config: any) {
      super(config);
      const load = this.load.bind(this);
      this.load = function (context: any, config: any, callbacks: any) {
        if (
          (context as any).type === 'manifest' ||
          (context as any).type === 'level'
        ) {
          const onSuccess = callbacks.onSuccess;
          callbacks.onSuccess = function (
            response: any,
            stats: any,
            context: any
          ) {
            if (response.data && typeof response.data === 'string') {
              response.data = filterAdsFromM3U8(response.data);
            }
            return onSuccess(response, stats, context, null);
          };
        }
        load(context, config, callbacks);
      };
    }
  };
}
