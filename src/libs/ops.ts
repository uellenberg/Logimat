export default
`//Returns on 0 on 0, and 1 for anything else.
//
//Essentially, it works by taking the arctan function, which goes from -(pi/2) to pi/2
//and applying an abs to it, making it go from pi/2 to pi/2. Then, it scales it to one
//by dividing by pi/2, making it go from 1 to 1. Finally, the ceil function makes any
//non-zero output 1 and 0 otherwise.
inline function select(a) {
    state = arctan(a);
    state = abs(state);
    state = state / (pi/2);
    state = ceil(state);
}

//Returns 1 if both inputs are 1, otherwise 0.
//
//Because the set of inputs is limited, this is a simple function that satisfies them,
//but has other behavior on undefined inputs.
inline function and(a, b) {
    state = a + b;
    state = state/2;
    state = floor(state);
}

//Returns 0 if both inputs are 0, otherwise 1.
//
//Because the set of inputs is limited, this is a simple function that satisfies them,
//but has other behavior on undefined inputs.
inline function or(a, b) {
    state = a + b;
    state = state/2;
    state = ceil(state);
}

//Returns 0 on 1, and 1 on 0.
//
//Because the set of inputs is limited, this is a simple function that satisfies them,
//but has other behavior on undefined inputs.
inline function not(a) {
    state = a - 1;
    state = abs(state);
}

//Returns 1 when both inputs are the same, and zero otherwise.
//
//Essentially, this works because two numbers being subtracted will be zero if they are
//the same. The select function can then be used to turn all non-zeros to one, and
//the not turns one to zero and zero to one, so the output is in the correct format.
inline function equal(a, b) {
    state = a - b;
    state = select(state);
    state = not(state);
}

//Returns 1 if the first input is smaller than the second, and zero otherwise.
//
//Essentially, this works because if b is larger than a, their difference will
//become negative. This is tested by comparing their difference to the absolute value.
//If the difference returns 1, then a is larger, otherwise b is larger.
//The not is applied to put the output into the correct format.
inline function lt(a, b) {
    state = equal(abs(a-b), a-b);
    state = not(state);
}

//Returns 1 if the first input is larger than the second, and zero otherwise.
inline function gt(a, b) {
    state = lt(b, a);
}

//Returns 1 if the first input is smaller than the second or they are equal, and zero otherwise.
inline function lte(a, b) {
    state = or(lt(a, b), equal(a, b));
}

//Returns 1 if the first input is larger than the second or they are equal, and zero otherwise.
inline function gte(a, b) {
    state = or(gt(a, b), equal(a, b));
}`;