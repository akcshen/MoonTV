import React from 'react';

import {
  type WeakNetStatusKind,
  WEAK_NET_STATUS_LABEL,
} from '@/lib/hlsPlayback';

interface PlaybackNetworkStatusProps {
  kind: WeakNetStatusKind;
  levelLabel?: string | null;
  bandwidthLabel?: string | null;
  canDropLevel: boolean;
  canSwitchSource: boolean;
  onDropLevel: () => void;
  onSwitchSource: () => void;
  onRetry: () => void;
  onDismiss?: () => void;
}

function ActionButton({
  children,
  onClick,
  primary = false,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      aria-label={ariaLabel}
      className={`min-h-[32px] flex-shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        primary
          ? 'bg-green-500 text-white hover:bg-green-600'
          : 'bg-white/15 text-white hover:bg-white/25'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * 播放中缓冲 / 卡顿恢复 / 建议换源的轻量状态条。
 * 与卡顿阶梯共用同一套操作：降画质、换源、重试恢复。
 */
const PlaybackNetworkStatus: React.FC<PlaybackNetworkStatusProps> = ({
  kind,
  levelLabel,
  bandwidthLabel,
  canDropLevel,
  canSwitchSource,
  onDropLevel,
  onSwitchSource,
  onRetry,
  onDismiss,
}) => {
  const title = WEAK_NET_STATUS_LABEL[kind];
  const context = [levelLabel, bandwidthLabel ? `约 ${bandwidthLabel}` : null]
    .filter(Boolean)
    .join(' · ');
  const hint =
    kind === 'suggest-switch' ? '当前源频繁卡顿，可降低画质或换源' : null;

  return (
    <div
      role='status'
      aria-live='polite'
      data-testid='playback-network-status'
      className='absolute left-3 right-3 bottom-16 z-[510] rounded-lg bg-black/80 px-3 py-2 text-sm text-white shadow-lg backdrop-blur-sm'
    >
      <div className='flex items-start gap-2'>
        <div className='min-w-0 flex-1'>
          <p className='leading-snug'>
            <span className='font-medium'>{title}</span>
            {context ? (
              <span className='text-white/75'> · {context}</span>
            ) : null}
          </p>
          {hint ? (
            <p className='mt-0.5 text-xs leading-snug text-white/70'>{hint}</p>
          ) : null}
        </div>
        {onDismiss ? (
          <button
            type='button'
            onClick={onDismiss}
            className='flex-shrink-0 rounded-md px-1.5 py-1 text-white/70 hover:bg-white/10 hover:text-white'
            aria-label='关闭弱网提示'
          >
            ×
          </button>
        ) : null}
      </div>

      <div className='mt-2 flex flex-wrap gap-1.5'>
        {canDropLevel ? (
          <ActionButton onClick={onDropLevel} ariaLabel='降低一档画质'>
            降低画质
          </ActionButton>
        ) : null}
        {canSwitchSource ? (
          <ActionButton
            onClick={onSwitchSource}
            primary={kind === 'suggest-switch'}
            ariaLabel='打开换源列表'
          >
            {kind === 'suggest-switch' ? '去换源' : '换源'}
          </ActionButton>
        ) : null}
        <ActionButton onClick={onRetry} ariaLabel='按卡顿阶梯重试恢复'>
          重试恢复
        </ActionButton>
      </div>
    </div>
  );
};

export default PlaybackNetworkStatus;
