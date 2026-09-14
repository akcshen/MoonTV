import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import PlaybackNetworkStatus from './PlaybackNetworkStatus';

describe('PlaybackNetworkStatus', () => {
  const handlers = {
    onDropLevel: jest.fn(),
    onSwitchSource: jest.fn(),
    onRetry: jest.fn(),
    onDismiss: jest.fn(),
  };

  beforeEach(() => {
    Object.values(handlers).forEach((fn) => fn.mockClear());
  });

  it('shows buffering context and the shared action family', () => {
    render(
      <PlaybackNetworkStatus
        kind='buffering'
        levelLabel='720p'
        bandwidthLabel='280 KB/s'
        canDropLevel
        canSwitchSource
        {...handlers}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('缓冲中');
    expect(screen.getByRole('status')).toHaveTextContent('720p');
    expect(screen.getByRole('status')).toHaveTextContent('约 280 KB/s');

    fireEvent.click(screen.getByRole('button', { name: '降低一档画质' }));
    fireEvent.click(screen.getByRole('button', { name: '打开换源列表' }));
    fireEvent.click(screen.getByRole('button', { name: '按卡顿阶梯重试恢复' }));

    expect(handlers.onDropLevel).toHaveBeenCalledTimes(1);
    expect(handlers.onSwitchSource).toHaveBeenCalledTimes(1);
    expect(handlers.onRetry).toHaveBeenCalledTimes(1);
  });

  it('surfaces the stall-ladder switch hint without a second system', () => {
    render(
      <PlaybackNetworkStatus
        kind='suggest-switch'
        canDropLevel={false}
        canSwitchSource
        {...handlers}
      />
    );

    expect(screen.getByText('建议换源')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '打开换源列表' })
    ).toHaveTextContent('去换源');
    expect(screen.queryByRole('button', { name: '降低一档画质' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '关闭弱网提示' }));
    expect(handlers.onDismiss).toHaveBeenCalledTimes(1);
  });
});
