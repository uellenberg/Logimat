export default
`//Returns on 0 on 0, and 1 for anything else.
inline function select(a) {
    state = 2^(-abs(a)) - 1;
    state = abs(state);
    state = ceil(state);
}

//A more efficient representation of not(select(a)).
inline function notSelect(a) {
    state = 2^(-abs(a));
    state = floor(state);
}

//Returns 1 if both inputs are 1, otherwise 0.
//
//Because the set of inputs is limited, this is a simple function that satisfies them,
//but has other behavior on undefined inputs.
inline function and(a, b) {
    state = a * b;
}

//Returns 0 if both inputs are 0, otherwise 1.
//
//Because the set of inputs is limited, this is a simple function that satisfies them,
//but has other behavior on undefined inputs.
inline function or(a, b) {
    state = a + b;
}

//Returns 0 on 1, and 1 on 0.
//
//Because the set of inputs is limited, this is a simple function that satisfies them,
//but has other behavior on undefined inputs.
inline function not(a) {
    state = -a + 1;
}

//Returns 0 if a is 1 and b is 1.
//
//Because the set of inputs is limited, this is a simple function that satisfies them,
//but has other behavior on undefined inputs.
inline function nand(a, b) {
    state = not(and(a, b));
}

//Returns 1 if a is 0 and b is 0.
//
//Because the set of inputs is limited, this is a simple function that satisfies them,
//but has other behavior on undefined inputs.
inline function nor(a, b) {
    state = not(or(a, b));
}

//Returns 1 if both inputs are different.
//
//Because the set of inputs is limited, this is a simple function that satisfies them,
//but has other behavior on undefined inputs.
inline function xor(a, b) {
    state = abs(a - b);
}

//Returns 1 if both inputs are the same.
//
//Because the set of inputs is limited, this is a simple function that satisfies them,
//but has other behavior on undefined inputs.
inline function xnor(a, b) {
    state = not(xor(a, b));
}

//Returns 1 when both inputs are the same, and zero otherwise.
//
//Essentially, this works because two numbers being subtracted will be zero if they are
//the same. The select function can then be used to turn all non-zeros to one, and
//the not turns one to zero and zero to one, so the output is in the correct format.
inline function equal(a, b) {
    state = a - b;
    state = notSelect(state);
}

//A more efficient representation of not(equal(a, b)).
inline function notEqual(a, b) {
    state = a - b;
    state = select(state);
}

//Returns a > 0.
inline function isPositive(a) {
    state = 2^a;
    state = state^-1;
    state = floor(state)+1;
    state = state^-1;
    state = floor(state);
}

//Returns a >= 0.
inline function isPositiveOrZero(a) {
    state = isPositive(a+1);
}

//Returns a < 0.
inline function isNegative(a) {
    state = isPositive(-a);
}

//Returns a <= 0;
inline function isNegativeOrZero(a) {
    state = not(isPositive(a));
}

//Returns 1 if the first input is smaller than the second, and zero otherwise.
//
//Essentially, this works because if b is larger than a, their difference will
//become negative. This is tested using isNegative.
inline function lt(a, b) {
    state = isNegative(a-b);
}

//Returns 1 if the first input is smaller than the second or they are equal, and zero otherwise.
inline function lte(a, b) {
    state = isNegativeOrZero(a-b);
}

//Returns 1 if the first input is larger than the second, and zero otherwise.
inline function gt(a, b) {
    state = lt(b, a);
}

//Returns 1 if the first input is larger than the second or they are equal, and zero otherwise.
inline function gte(a, b) {
    state = lte(b, a);
}

//Returns b if a is 1, and c if a is 0.
inline function if_func(a, b, c) {
    state = a*b + not(a)*c;
}`;
