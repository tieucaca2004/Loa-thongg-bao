/**
 * Converts a non-negative integer amount (VND) into Vietnamese words,
 * e.g. 200000 -> "hai trăm nghìn", 100000 -> "một trăm nghìn",
 * 1234567 -> "một triệu hai trăm ba mươi tư nghìn năm trăm sáu mươi bảy".
 *
 * Scope: supports 0 .. 999,999,999,999 (enough for any realistic VND
 * transfer). Uses the common spoken-Vietnamese conventions:
 *  - "mốt" instead of "một" for a trailing 1 (except in "mười một")
 *  - "lăm" instead of "năm" for a trailing 5 (when tens digit is nonzero)
 *  - "linh"/"lẻ" for an internal zero tens digit (e.g. 105 -> "một trăm linh năm")
 */
const ONES = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

function readGroup(n: number, isLeadingGroup: boolean): string {
  // n is 0..999
  const hundreds = Math.floor(n / 100);
  const tens = Math.floor((n % 100) / 10);
  const ones = n % 10;
  const parts: string[] = [];

  if (hundreds > 0 || !isLeadingGroup) {
    parts.push(ONES[hundreds] + ' trăm');
    if (tens === 0 && ones > 0) parts.push('linh');
  }

  if (tens === 0) {
    if (ones > 0 && (hundreds > 0 || !isLeadingGroup)) {
      parts.push(ones === 5 ? 'năm' : ONES[ones]);
    } else if (ones > 0) {
      parts.push(ONES[ones]);
    }
  } else if (tens === 1) {
    parts.push('mười');
    if (ones > 0) parts.push(ones === 5 ? 'lăm' : ONES[ones]);
  } else {
    parts.push(ONES[tens] + ' mươi');
    if (ones === 1) parts.push('mốt');
    else if (ones === 5) parts.push('lăm');
    else if (ones === 4) parts.push('tư');
    else if (ones > 0) parts.push(ONES[ones]);
  }

  return parts.join(' ');
}

const SCALE_WORDS = ['', ' nghìn', ' triệu', ' tỷ'];

export function numberToVietnameseWords(value: number): string {
  if (!Number.isFinite(value)) throw new Error('value must be a finite number');
  const n = Math.trunc(Math.abs(value));
  if (n === 0) return 'không';

  const groups: number[] = [];
  let remaining = n;
  while (remaining > 0) {
    groups.unshift(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }
  if (groups.length > SCALE_WORDS.length) {
    throw new Error('value out of supported range');
  }

  const totalGroups = groups.length;
  const words: string[] = [];

  groups.forEach((group, idx) => {
    if (group === 0) return;
    const scaleIdx = totalGroups - 1 - idx;
    const isLeadingGroup = idx === 0;
    words.push(readGroup(group, isLeadingGroup) + SCALE_WORDS[scaleIdx]);
  });

  return words.join(' ').replace(/\s+/g, ' ').trim();
}
