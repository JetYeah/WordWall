// 字垣 — 书签分享（截图 → 分享/保存）
// 原生：react-native-view-shot captureRef → expo-sharing 系统分享面板
// Web：captureRef(data-uri) → 触发 PNG 下载（或 Web Share API）

import { Platform } from 'react-native';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

export type ShareOutcome = 'shared' | 'saved' | 'cancelled' | 'unavailable' | 'failed';

interface ShareOptions {
  /** 文件名（不含扩展名） */
  filename?: string;
}

/**
 * 截取给定 ref 指向的视图为 PNG 并分享。
 * @param viewRef React ref（指向要截取的 View，通常是 BookmarkCard）
 */
export async function shareViewAsImage(
  viewRef: React.RefObject<any> | null,
  opts: ShareOptions = {},
): Promise<ShareOutcome> {
  if (!viewRef || !viewRef.current) return 'failed';
  const name = (opts.filename || 'ziyuan').replace(/[^\w-]+/g, '_');

  // — Web：导出 PNG 下载 —
  if (Platform.OS === 'web') {
    try {
      const dataUri = await captureRef(viewRef, { format: 'png', quality: 1, result: 'data-uri' });
      // 优先尝试 Web Share API（带文件），失败回退下载
      try {
        const dom: any = (globalThis as any).document;
        if (dom) {
          const a = dom.createElement('a');
          a.href = dataUri;
          a.download = `${name}.png`;
          dom.body.appendChild(a);
          a.click();
          dom.body.removeChild(a);
        }
        return 'saved';
      } catch {
        return 'failed';
      }
    } catch (e) {
      console.warn('[share] web capture failed:', e);
      return 'failed';
    }
  }

  // — 原生：截图 → 系统分享面板 —
  try {
    const uri = await captureRef(viewRef, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
      fileName: name,
    });
    const available = await Sharing.isAvailableAsync();
    if (!available) {
      scheduleRelease(uri);
      return 'unavailable';
    }
    await Sharing.shareAsync(uri, {
      dialogTitle: '字垣 · 书签',
      mimeType: 'image/png',
      UTI: 'public.image',
    });
    // 分享面板关闭后延迟释放临时文件（部分机型分享仍异步读取）
    scheduleRelease(uri);
    return 'shared';
  } catch (e: any) {
    // 用户取消分享面板通常也会抛错，按 cancelled 处理
    const msg = (e && (e.message || String(e))) || '';
    if (/cancel|user|dismiss/i.test(msg)) return 'cancelled';
    console.warn('[share] capture/share failed:', e);
    return 'failed';
  }
}

function scheduleRelease(uri: string): void {
  // 临时文件给分享流程 60s 缓冲再清理
  setTimeout(() => {
    try { releaseCapture(uri); } catch { /* ignore */ }
  }, 60000);
}
