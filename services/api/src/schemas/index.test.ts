import { describe, it, expect } from 'vitest';
import { createCollectorSchema, updateCollectorSchema } from './index';

const validWebConfig = {
  startUrls: ['https://example.com'],
};

const validTelegramConfig = {
  channels: ['my_channel'],
};

describe('createCollectorSchema', () => {
  it('accepts a WEB collector with web-shaped configuration', () => {
    const result = createCollectorSchema.safeParse({
      sourceId: 'src-1',
      name: 'My web collector',
      type: 'WEB',
      configuration: validWebConfig,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a TELEGRAM collector with telegram-shaped configuration', () => {
    const result = createCollectorSchema.safeParse({
      sourceId: 'src-1',
      name: 'My telegram collector',
      type: 'TELEGRAM',
      configuration: validTelegramConfig,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // Defaults applied from telegramCollectorConfigSchema.
      expect((result.data.configuration as { messageLimit: number }).messageLimit).toBe(500);
    }
  });

  it('rejects a TELEGRAM collector configured with WEB-shaped fields', () => {
    const result = createCollectorSchema.safeParse({
      sourceId: 'src-1',
      name: 'Mismatched collector',
      type: 'TELEGRAM',
      configuration: validWebConfig,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a WEB collector configured with TELEGRAM-shaped fields', () => {
    const result = createCollectorSchema.safeParse({
      sourceId: 'src-1',
      name: 'Mismatched collector',
      type: 'WEB',
      configuration: validTelegramConfig,
    });
    expect(result.success).toBe(false);
  });

  it('defaults type to WEB when omitted, requiring web-shaped configuration', () => {
    const result = createCollectorSchema.safeParse({
      sourceId: 'src-1',
      name: 'Default type collector',
      configuration: validWebConfig,
    });
    expect(result.success).toBe(true);
  });
});

describe('updateCollectorSchema', () => {
  it('allows a partial update with neither type nor configuration', () => {
    const result = updateCollectorSchema.safeParse({ name: 'Renamed' });
    expect(result.success).toBe(true);
  });

  it('allows updating just configuration without repeating type', () => {
    const result = updateCollectorSchema.safeParse({ configuration: validWebConfig });
    expect(result.success).toBe(true);
  });

  it('still rejects a mismatched type+configuration pair when both are given', () => {
    const result = updateCollectorSchema.safeParse({
      type: 'TELEGRAM',
      configuration: validWebConfig,
    });
    expect(result.success).toBe(false);
  });
});
