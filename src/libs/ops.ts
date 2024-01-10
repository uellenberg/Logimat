export default
`// Returns 1 on 0, and 0 for everything else.
inline function isZero(a) {
    if!(UNSAFE, {
        0^abs(a)
    }, {
        const p1 = 2^(-abs(a));

        floor(p1)
    })
}

//A more efficient representation of not(isZero(a)).
inline function isNotZero(a) {
    if!(UNSAFE, {
        not(isZero(a))
    }, {
        const p1 = 2^(-abs(a));
        const p2 = not(p1);

        ceil(p2)
    })
}

//Returns 1 if both inputs are 1, otherwise 0.
//
//Because the set of inputs is limited, this is a simple function that satisfies them,
//but has other behavior on undefined inputs.
inline function and(a, b) => a * b;

//Returns 0 if both inputs are 0, otherwise 1.
//
//Because the set of inputs is limited, this is a simple function that satisfies them,
//but has other behavior on undefined inputs.
inline function or(a, b) => ceil((a + b)/2);

//Returns 0 on 1, and 1 on 0.
//
//Because the set of inputs is limited, this is a simple function that satisfies them,
//but has other behavior on undefined inputs.
inline function not(a) => 1 - a;

//Returns 0 if a is 1 and b is 1.
//
//Because the set of inputs is limited, this is a simple function that satisfies them,
//but has other behavior on undefined inputs.
inline function nand(a, b) => not(and(a, b));

//Returns 1 if a is 0 and b is 0.
//
//Because the set of inputs is limited, this is a simple function that satisfies them,
//but has other behavior on undefined inputs.
inline function nor(a, b) => not(or(a, b));

//Returns 1 if both inputs are different.
//
//Because the set of inputs is limited, this is a simple function that satisfies them,
//but has other behavior on undefined inputs.
inline function xor(a, b) => abs(a - b);

//Returns 1 if both inputs are the same.
//
//Because the set of inputs is limited, this is a simple function that satisfies them,
//but has other behavior on undefined inputs.
inline function xnor(a, b) => not(xor(a, b));

//Returns 1 when both inputs are the same, and zero otherwise.
//
//Essentially, this works because two numbers being subtracted will be zero if they are
//the same.
inline function equal(a, b) => isZero(a - b);

//A more efficient representation of not(equal(a, b)).
inline function notEqual(a, b) => isNotZero(a - b);

//Returns a > 0.
inline function isPositive(a) {
    if!(UNSAFE, {
        0^(0^(a))
    }, {
        const p1 = 2^(-a);
        const p2 = floor(p1)+1;
        const p3 = 1/p2;

        floor(p3)
    })
}

//Returns a < 0.
inline function isNegative(a) => isPositive(-a);

//Returns a >= 0.
inline function isPositiveOrZero(a) => not(isNegative(a));

//Returns a <= 0;
inline function isNegativeOrZero(a) => not(isPositive(a));

//Returns 1 if the first input is smaller than the second, and zero otherwise.
//
//Essentially, this works because if b is larger than a, their difference will
//become negative. This is tested using isNegative.
inline function lt(a, b) => isNegative(a-b);

//Returns 1 if the first input is smaller than the second or they are equal, and zero otherwise.
inline function lte(a, b) => isNegativeOrZero(a-b);

//Returns 1 if the first input is larger than the second, and zero otherwise.
inline function gt(a, b) => lt(b, a);

//Returns 1 if the first input is larger than the second or they are equal, and zero otherwise.
inline function gte(a, b) => lte(b, a);

//Returns b if a is 1, and c if a is 0.
inline function if_func(a, b, c) => a*b + not(a)*c;

//Returns the smallest number.
inline polyfill function min(a, b) {
    if(a < b) {
        a
    } else {
        b
    }
}

//Returns the biggest number.
inline polyfill function max(a, b) {
    if(a > b) {
        a
    } else {
        b
    }
}

//Rounds a number.
inline polyfill function round(a) => floor(a + .5);`;
