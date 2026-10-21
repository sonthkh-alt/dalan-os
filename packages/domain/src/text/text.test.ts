import { describe, expect, it } from 'vitest';
import { codify, documentCode, matchesSearch, removeDiacritics, slugify } from './text.js';

describe('text', () => {
  it('bỏ dấu tiếng Việt kể cả đ', () => {
    expect(removeDiacritics('Gà ri luộc rút xương Đặc biệt')).toBe('Ga ri luoc rut xuong Dac biet');
  });
  it('tìm kiếm không dấu', () => {
    expect(matchesSearch('Phở bò tái gầu', 'pho bo')).toBe(true);
    expect(matchesSearch('Phở bò tái gầu', 'BÚN')).toBe(false);
    expect(matchesSearch('Bất kỳ', '')).toBe(true);
  });
  it('slug và mã', () => {
    expect(slugify('Hến Sông Mã / Giắt biển xào hành chăm')).toBe('hen-song-ma-giat-bien-xao-hanh-cham');
    expect(codify('Gà ri luộc rút xương')).toBe('GA-RI-LUOC-RUT-XUONG');
    expect(documentCode('C', '2026-10-20', 1)).toBe('C-20261020-0001');
  });
});
