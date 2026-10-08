'use strict';

// transfer URL専用の最小QR encoder。外部CDNや実行時依存を使わない。
// Version 10 / error correction M はASCII URLを最大213 bytesまで格納できる。
globalThis.LocalQrCode = (() => {
  const VERSION = 10;
  const SIZE = VERSION * 4 + 17;
  const DATA_CODEWORDS = 216;
  const ECC_CODEWORDS = 26;
  const MAX_INPUT_BYTES = 213;
  const ALIGNMENT_POSITIONS = [6, 28, 50];

  function appendBits(bits, value, length) {
    for (let index = length - 1; index >= 0; index -= 1) bits.push((value >>> index) & 1);
  }

  function multiplyGf(x, y) {
    let result = 0;
    while (y > 0) {
      if (y & 1) result ^= x;
      x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
      y >>>= 1;
    }
    return result;
  }

  function generatorPolynomial(degree) {
    let polynomial = [1];
    let root = 1;
    for (let count = 0; count < degree; count += 1) {
      const next = Array(polynomial.length + 1).fill(0);
      for (let index = 0; index < polynomial.length; index += 1) {
        next[index] ^= polynomial[index];
        next[index + 1] ^= multiplyGf(polynomial[index], root);
      }
      polynomial = next;
      root = multiplyGf(root, 2);
    }
    return polynomial;
  }

  function eccRemainder(data, generator) {
    const remainder = Array(generator.length - 1).fill(0);
    for (const byte of data) {
      const factor = byte ^ remainder.shift();
      remainder.push(0);
      for (let index = 0; index < remainder.length; index += 1) {
        remainder[index] ^= multiplyGf(generator[index + 1], factor);
      }
    }
    return remainder;
  }

  function codewordsForText(text) {
    if (typeof text !== 'string' || !/^[\x20-\x7e]+$/.test(text)) throw new TypeError('QR URL');
    const bytes = [...text].map((character) => character.charCodeAt(0));
    if (bytes.length > MAX_INPUT_BYTES) throw new RangeError('QR URL is too long');
    const bits = [];
    appendBits(bits, 0x4, 4); // byte mode
    appendBits(bits, bytes.length, 16); // Version 10のbyte count
    for (const byte of bytes) appendBits(bits, byte, 8);
    appendBits(bits, 0, Math.min(4, DATA_CODEWORDS * 8 - bits.length));
    while (bits.length % 8 !== 0) bits.push(0);
    const data = [];
    for (let index = 0; index < bits.length; index += 8) {
      data.push(bits.slice(index, index + 8).reduce((value, bit) => (value << 1) | bit, 0));
    }
    for (let pad = 0; data.length < DATA_CODEWORDS; pad += 1) data.push(pad % 2 ? 0x11 : 0xec);

    // Version 10 / M: 4 blocks x 43 data bytes, 1 block x 44 data bytes.
    const blocks = [];
    let offset = 0;
    for (const length of [43, 43, 43, 43, 44]) {
      blocks.push(data.slice(offset, offset + length));
      offset += length;
    }
    const generator = generatorPolynomial(ECC_CODEWORDS);
    const eccBlocks = blocks.map((block) => eccRemainder(block, generator));
    const result = [];
    for (let index = 0; index < 44; index += 1) {
      for (const block of blocks) if (index < block.length) result.push(block[index]);
    }
    for (let index = 0; index < ECC_CODEWORDS; index += 1) {
      for (const block of eccBlocks) result.push(block[index]);
    }
    return result;
  }

  function drawFunctionPatterns(modules, functions) {
    const set = (x, y, value) => {
      if (0 <= x && x < SIZE && 0 <= y && y < SIZE) {
        modules[y][x] = value;
        functions[y][x] = true;
      }
    };
    const finder = (centerX, centerY) => {
      for (let y = -4; y <= 4; y += 1) {
        for (let x = -4; x <= 4; x += 1) {
          const distance = Math.max(Math.abs(x), Math.abs(y));
          set(centerX + x, centerY + y, distance !== 2 && distance !== 4);
        }
      }
    };
    const alignment = (centerX, centerY) => {
      for (let y = -2; y <= 2; y += 1) {
        for (let x = -2; x <= 2; x += 1) {
          const distance = Math.max(Math.abs(x), Math.abs(y));
          set(centerX + x, centerY + y, distance !== 1);
        }
      }
    };

    for (let index = 8; index < SIZE - 8; index += 1) {
      set(6, index, index % 2 === 0);
      set(index, 6, index % 2 === 0);
    }
    finder(3, 3);
    finder(SIZE - 4, 3);
    finder(3, SIZE - 4);
    for (let row = 0; row < ALIGNMENT_POSITIONS.length; row += 1) {
      for (let column = 0; column < ALIGNMENT_POSITIONS.length; column += 1) {
        if ((row === 0 && column === 0) || (row === 0 && column === ALIGNMENT_POSITIONS.length - 1)
            || (row === ALIGNMENT_POSITIONS.length - 1 && column === 0)) continue;
        alignment(ALIGNMENT_POSITIONS[column], ALIGNMENT_POSITIONS[row]);
      }
    }
  }

  function drawVersionBits(modules, functions) {
    let remainder = VERSION;
    for (let index = 0; index < 12; index += 1) {
      remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
    }
    const bits = (VERSION << 12) | remainder;
    for (let index = 0; index < 18; index += 1) {
      const value = ((bits >>> index) & 1) !== 0;
      const a = SIZE - 11 + (index % 3);
      const b = Math.floor(index / 3);
      modules[b][a] = value;
      modules[a][b] = value;
      functions[b][a] = true;
      functions[a][b] = true;
    }
  }

  function drawFormatBits(modules, functions, mask) {
    // Error correction M has format value 0.
    let remainder = mask;
    for (let index = 0; index < 10; index += 1) {
      remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
    }
    const bits = ((mask << 10) | remainder) ^ 0x5412;
    const set = (x, y, bitIndex) => {
      modules[y][x] = ((bits >>> bitIndex) & 1) !== 0;
      functions[y][x] = true;
    };
    for (let index = 0; index <= 5; index += 1) set(8, index, index);
    set(8, 7, 6);
    set(8, 8, 7);
    set(7, 8, 8);
    for (let index = 9; index < 15; index += 1) set(14 - index, 8, index);
    for (let index = 0; index < 8; index += 1) set(SIZE - 1 - index, 8, index);
    for (let index = 8; index < 15; index += 1) set(8, SIZE - 15 + index, index);
    modules[SIZE - 8][8] = true;
    functions[SIZE - 8][8] = true;
  }

  function makeMatrix(text) {
    const modules = Array.from({length: SIZE}, () => Array(SIZE).fill(false));
    const functions = Array.from({length: SIZE}, () => Array(SIZE).fill(false));
    drawFunctionPatterns(modules, functions);
    drawVersionBits(modules, functions);
    // format informationもデータ配置の対象外として、先に予約する。
    drawFormatBits(modules, functions, 0);
    const codewords = codewordsForText(text);
    let bitIndex = 0;
    for (let right = SIZE - 1; right >= 1; right -= 2) {
      if (right === 6) right -= 1;
      for (let vertical = 0; vertical < SIZE; vertical += 1) {
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? SIZE - 1 - vertical : vertical;
        for (let offset = 0; offset < 2; offset += 1) {
          const x = right - offset;
          if (functions[y][x]) continue;
          const bit = bitIndex < codewords.length * 8
            && ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0;
          modules[y][x] = bit;
          // Mask 0: (x + y) mod 2 = 0. Any standards-compliant mask is valid.
          if ((x + y) % 2 === 0) modules[y][x] = !modules[y][x];
          bitIndex += 1;
        }
      }
    }
    return modules;
  }

  function createSvg(text, documentRef = document) {
    const modules = makeMatrix(text);
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = documentRef.createElementNS(namespace, 'svg');
    svg.setAttribute('viewBox', `-4 -4 ${SIZE + 8} ${SIZE + 8}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'スマホ保存用QRコード');
    svg.setAttribute('shape-rendering', 'crispEdges');
    const background = documentRef.createElementNS(namespace, 'rect');
    background.setAttribute('x', '-4');
    background.setAttribute('y', '-4');
    background.setAttribute('width', String(SIZE + 8));
    background.setAttribute('height', String(SIZE + 8));
    background.setAttribute('fill', '#fff');
    const modulesPath = documentRef.createElementNS(namespace, 'path');
    let path = '';
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) if (modules[y][x]) path += `M${x},${y}h1v1h-1z`;
    }
    modulesPath.setAttribute('d', path);
    modulesPath.setAttribute('fill', '#102d3a');
    svg.append(background, modulesPath);
    return svg;
  }

  return Object.freeze({makeMatrix, createSvg, maxInputBytes: MAX_INPUT_BYTES});
})();
