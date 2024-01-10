//This file provides fills for some functions that don't exist in piecewise (isZero, etc).

export default `
inline function isZero(a) => a == 0;

inline function isNotZero(a) => a != 0;

inline function not(a) => a == 0;

inline function nand(a, b) => not(and(a, b));

inline function nor(a, b) => not(or(a, b));

inline function xor(a, b) => a != b;

inline function xnor(a, b) => a == b;

inline function isPositive(a) => a > 0;

inline function isNegative(a) => a < 0;

inline function isPositiveOrZero(a) => a >= 0;

inline function isNegativeOrZero(a) => a <= 0;`;