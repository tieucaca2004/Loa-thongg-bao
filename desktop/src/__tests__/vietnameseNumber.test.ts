import { describe, expect, it } from 'vitest';
import { numberToVietnameseWords } from '../formatter/vietnameseNumber.js';

describe('numberToVietnameseWords', () => {
  it('reads zero', () => {
    expect(numberToVietnameseWords(0)).toBe('không');
  });

  it('reads simple amounts', () => {
    expect(numberToVietnameseWords(1)).toBe('một');
    expect(numberToVietnameseWords(5)).toBe('năm');
    expect(numberToVietnameseWords(10)).toBe('mười');
    expect(numberToVietnameseWords(11)).toBe('mười một');
    expect(numberToVietnameseWords(15)).toBe('mười lăm');
    expect(numberToVietnameseWords(21)).toBe('hai mươi mốt');
    expect(numberToVietnameseWords(25)).toBe('hai mươi lăm');
  });

  it('reads hundreds with linh for internal zero', () => {
    expect(numberToVietnameseWords(105)).toBe('một trăm linh năm');
    expect(numberToVietnameseWords(100)).toBe('một trăm');
  });

  it('reads thousands (typical VND transfer amounts)', () => {
    expect(numberToVietnameseWords(100000)).toBe('một trăm nghìn');
    expect(numberToVietnameseWords(200000)).toBe('hai trăm nghìn');
    expect(numberToVietnameseWords(1000)).toBe('một nghìn');
  });

  it('reads large amounts', () => {
    expect(numberToVietnameseWords(1234567)).toBe(
      'một triệu hai trăm ba mươi tư nghìn năm trăm sáu mươi bảy'
    );
    expect(numberToVietnameseWords(1000000)).toBe('một triệu');
  });
});
