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

    state = notSelect(state);
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
        state = floor(log_base(val)) + 1;
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

//Gets the log for a certain base.
//Deprecated in favor of log_ syntax.
inline function logBase(num, base) {
    state = log_base(num);
}

//Safely gets the log for a certain base, returning 0 if the input is 0.
inline function safeLogBase(num, base) {
    if(base == 0) {
        state = 0;
    } else {
        if(base == 0) {
            state = 1;
        } else {
            state = base;
        }
        
        state = log_state(num);
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
}

//Gets the real part of a complex number.
inline function cR(a) {
    state = a.x;
}

//Gets the imaginary part of a complex number.
inline function cI(a) {
    state = a.y;
}

//Takes the absolute value of a complex number.
inline function cAbs(a) {
    state = sqrt(cR(a)^2 + cI(a)^2);
}

//Multiplies two complex numbers together.
//https://en.wikipedia.org/wiki/Multiplication_algorithm#Complex_multiplication_algorithm
inline function cMul(a, b) {
    const aPart1 = cR(a) * cR(b);
    const aPart2 = cI(a) * cI(b);
    const aPart = aPart1 - aPart2;
    
    const bPart1 = cI(a) * cR(b);
    const bPart2 = cR(a) * cI(b);
    const bPart = bPart1 + bPart2;
    
    state = (aPart, bPart);
}

//Divides two complex numbers.
//https://mathworld.wolfram.com/ComplexDivision.html
inline function cDiv(a, b) {
    const aPart1 = cR(a) * cR(b);
    const aPart2 = cI(a) * cI(b);
    const aPart = aPart1 + aPart2;
    
    const bPart1 = cI(a) * cR(b);
    const bPart2 = cR(a) * cI(b);
    const bPart = bPart1 - bPart2;
    
    const cPart = cR(b)^2 + cI(b)^2;
    
    state = (aPart/cPart, bPart/cPart);
}

//Adds two complex numbers.
inline function cAdd(a, b) {
    state = (cR(a) + cR(b), cI(a) + cI(b));
}

//Subtracts two complex numbers.
inline function cSub(a, b) {
    state = (cR(a) - cR(b), cI(a) - cI(b));
}

//Checks if a number is NaN.
inline function isNaN(a) {
    state = a != a;
}

//Gets the x position (0-based) of a 2d array embedded in a 1d array (1-based).
//Used to convert from a 1d array to a 2d array.
inline function conv_1d_2d_x(idx, width) {
    state = (idx-1) % width;
}

//Gets the y position (0-based) of a 2d array embedded in a 1d array (1-based).
//Used to convert from a 1d array to a 2d array.
inline function conv_1d_2d_y(idx, width) {
    state = floor((idx-1) / width);
}

//Gets the index (1-based) of a 1d array from the position x and y of a 2d array (0-based).
//Used to convert from a 2d array to a 1d array.
inline function conv_2d_1d(x, y, width) {
    state = y * width + x + 1;
}

//Maps from one range of numbers to another.
inline function map(input_start, input_end, output_start, output_end, val) {
    const slope = (output_end - output_start) / (input_end - input_start);
    state = output_start + slope * (val - input_start);
}

//Linearly interpolates from one number to another. This is used to smoothly transition between two numbers.
//An amount of 0 will return from, 1 will return to, and anything in between will return something
//between the two numbers.
inline function lerp(from, to, amount) {
    state = from + (to - from) * amount;
}

//Stores a float and an integer into a single float. Digits defines the precision, and
//should be at least as many digits that exist in the largest number.
inline function pack(int, float, digits) {
    const half = 10^(digits) / 2;
    state = (int + half) + (float + half)*(10^digits);
}

//Extracts the float part from a packed number.
inline function unpackFloat(packed, digits) {
    const half = 10^(digits) / 2;
    state = mod(packed, 10^digits) - half;
}

//Extracts the int part from a packed number.
inline function unpackInt(packed, digits) {
    const half = 10^(digits) / 2;
    state = floor(packed / 10^digits) - half;
}`;
