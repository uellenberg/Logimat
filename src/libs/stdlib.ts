export default
`//Returns 1 if the input is prime, and 0 otherwise.
//
//All this function does is loop through every number < floor(sqrt(a)), then checks if a is divisible by it.
//If it is, then it adds 1 to the sum, otherwise zero. This is then put through select, which will make it 0
//if prime and 1 otherwise. Next, it's put through not, to make it the opposite.
inline function isPrime(a) {
    state = sum(n=2; floor(sqrt(a))) {
        if(floor(a/n) == a/n) {
            state = 1;
        } else {
            state = 0;
        }
    };

    state = not(select(state));
}

//Returns the number of digits in the input.
inline function len(a){
    state = floor(log(a));
}

//Extracts the nth digit (starting at 0) from a number. The first input is the number and the second is the place of the digit.
inline function getDigit(a, b) {
    const pt1 = a/10^(len(a)-b);
    const pt2 = a/10^(len(a)-b+1);
    
    state = floor(pt1-floor(pt2)*10);
}

//Returns 1 if the input is an integer, and 0 otherwise.
inline function isInt(a) {
    state = a == floor(a);
}

//Safely divides a number (a/b), such that if b is 0 (a/0), it will return 0 instead of undefined.
//Normally, if you divide a number by 0 (even if inside a statement that doesn't run) it will return
//undefined for the entire function. This solves that issue. Use this anywhere that the divisor may
//be 0.
inline function safeDivide(a, b) {
    if(b == 0) {
        state = 0;
    } else {
        //This double check is needed because it will run, and needs to divide by a non-zero number. 1 is a "safe" value, but it's being used arbitrarily here.
        //No matter what number is used, it won't ever appear, unless it results in undefined (which will only happen if the value is 0 or infinity).
        if(b == 0) {
            state = 1;
        } else {
            state = b;
        }
        
        state = a/state;
    }
}
`;