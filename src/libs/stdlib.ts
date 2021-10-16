export default
`//Returns 1 if the input is prime, and 0 otherwise.
//Accepts integers greater or equal to zero.
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
    const val = abs(a);

    if(val < .1) {
        state = 0;
    } else {
        state = floor(log(val)) + 1;
    }
}

//Safely returns the number of digits in the input.
inline function safeLen(a){
    const val = abs(a);

    if(val < .1) {
        state = 0;
    } else {
        state = floor(safeLog(val)) + 1;
    }
}

//Extracts the nth digit (starting at 0) from a number. The first input is the number and the second is the place of the digit.
inline function getDigit(a, b) {
    const pt1 = a/10^(len(a)-b-1);
    const pt2 = a/10^(len(a)-b);
    
    state = floor(pt1-floor(pt2)*10);
}

//Safely extracts the nth digit (starting at 0) from a number. The first input is the number and the second is the place of the digit.
inline function safeGetDigit(a, b) {
    const pt1 = a/10^(safeLen(a)-b-1);
    const pt2 = a/10^(safeLen(a)-b);
    
    state = floor(pt1-floor(pt2)*10);
}

//Returns the number of digits in the input in a specific base.
inline function lenBase(a, base){
    const val = abs(a);

    if(val < base^-1) {
        state = 0;
    } else {
        state = floor(logBase(val, base)) + 1;
    }
}

//Safely returns the number of digits in the input in a specific base.
inline function safeLenBase(a, base){
    const val = abs(a);

    if(val < base^-1) {
        state = 0;
    } else {
        state = floor(safeLogBase(val, base)) + 1;
    }
}

//Extracts the nth digit (starting at 0) from a number in a specific base. The first input is the number and the second is the place of the digit.
inline function getDigitBase(a, b, base) {
    const pt1 = a/base^(lenBase(a, base)-b-1);
    const pt2 = a/base^(lenBase(a, base)-b);
    
    state = floor(pt1-floor(pt2)*base);
}

//Safely extracts the nth digit (starting at 0) from a number in a specific base. The first input is the number and the second is the place of the digit.
inline function safeGetDigitBase(a, b, base) {
    const pt1 = a/base^(safeLenBase(a, base)-b-1);
    const pt2 = a/base^(safeLenBase(a, base)-b);
    
    state = floor(pt1-floor(pt2)*base);
}

//Returns 1 if the input is an integer, and 0 otherwise.
inline function isInt(a) {
    state = a == floor(a);
}

//Returns if the dividend can be evenly divided by the divisor.
inline function isDivisibleBy(dividend, divisor) {
    state = dividend % divisor == 0;
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

//Safely runs the log function, returning 0 if the input is 0.
inline function safeLog(a) {
    if(a == 0) {
        state = 0;
    } else {
        if(a == 0) {
            state = 1;
        } else {
            state = a;
        }
        
        state = log(state);
    }
}

//Safely runs the ln function, returning 0 if the input is 0.
inline function safeLN(a) {
    if(a == 0) {
        state = 0;
    } else {
        if(a == 0) {
            state = 1;
        } else {
            state = a;
        }
        
        state = ln(state);
    }
}

//Gets the log for a certain exponent.
inline function logBase(num, base) {
    state = ln(num)/ln(base);
}

//Safely gets the log for a certain exponent, returning 0 if the input is 0.
inline function safeLogBase(num, base) {
    if(a == 0) {
        state = 0;
    } else {
        if(a == 0) {
            state = 1;
        } else {
            state = a;
        }
        
        state = ln(num)/ln(base);
    }
}

//Returns the smallest number.
inline function min(a, b) {
    if(a < b) {
        state = a;
    } else {
        state = b;
    }
}

//Returns the biggest number.
inline function max(a, b) {
    if(a > b) {
        state = a;
    } else {
        state = b;
    }
}

//Simplifies a fraction and returns the numerator.
inline function simplifyNumerator(numerator, denominator) {
    const div = gcd(numerator, denominator);
    state = numerator/div;
}

//Simplifies a fraction and returns the denominator.
inline function simplifyDenominator(numerator, denominator) {
    const div = gcd(numerator, denominator);
    state = denominator/div;
}`;