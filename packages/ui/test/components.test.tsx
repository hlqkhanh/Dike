import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button, StatusBadge, urbanMintTokens } from '../src/index.js';

describe('Urban Mint foundation', () => {
  it('exports the approved semantic colors', () => {
    expect(urbanMintTokens.color.primary).toBe('#0F766E');
    expect(urbanMintTokens.color.foreground).toBe('#10231D');
  });

  it('exposes loading state accessibly', () => {
    render(<Button loading>Lưu</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveAccessibleName('Đang xử lý…');
  });

  it('includes non-color status text', () => {
    render(<StatusBadge status="error">Không khả dụng</StatusBadge>);
    expect(screen.getByRole('status')).toHaveTextContent('Không khả dụng');
  });
});
