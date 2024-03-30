export default
`//Returns 1 if the input is prime, and 0 otherwise.
//Accepts integers greater or equal to zero.
//
//All this function does is loop through every number < floor(sqrt(a)), then checks if a is divisible by it.
//If it is, then it will multiply by one, but if one number divides it, it will multiply by zero and return zero.
inline function isPrime(a) {
    prod(n=2; floor(sqrt(a))) {
        if(floor(a/n) == a/n) {
            0
        } else {
            1
        }
    }
}

//Returns the number of digits in the input.
inline function len(a){
    const val = abs(a);

    if(val < .1) {
        0
    } else {
        floor(log(val)) + 1
    }
}

//Safely returns the number of digits in the input.
inline function safeLen(a){
    const val = abs(a);

    if(val < .1) {
        0
    } else {
        floor(safeLog(val)) + 1
    }
}

//Extracts the nth digit (starting at 0) from a number. The first input is the number and the second is the place of the digit.
inline function getDigit(a, b) {
    const pt1 = a/10^(len(a)-b-1);
    const pt2 = a/10^(len(a)-b);
    
    floor(pt1-floor(pt2)*10)
}

//Safely extracts the nth digit (starting at 0) from a number. The first input is the number and the second is the place of the digit.
inline function safeGetDigit(a, b) {
    const pt1 = a/10^(safeLen(a)-b-1);
    const pt2 = a/10^(safeLen(a)-b);
    
    floor(pt1-floor(pt2)*10)
}

//Returns the number of digits in the input in a specific base.
inline function lenBase(a, base){
    const val = abs(a);

    if(val < base^-1) {
        0
    } else {
        // This gives an approximate range. Due to floating point
        // imprecision, it's either this, or the one below.
        // We need to manually check it.
        const range = floor(log_base(val)) + 1;

        // Subtract 1 because the exponent is one less than the length.
        if(a >= base^(range - 1)) {
            range
        } else {
            range - 1
        }
    }
}

//Safely returns the number of digits in the input in a specific base.
inline function safeLenBase(a, base){
    const val = abs(a);

    if(val < base^-1) {
        0
    } else {
        const range = floor(safeLogBase(val, base)) + 1;

        if(a >= base^(range - 1)) {
            range
        } else {
            range - 1
        }
    }
}

//Extracts the nth digit (starting at 0) from a number in a specific base. The first input is the number and the second is the place of the digit.
inline function getDigitBase(a, b, base) {
    const pt1 = a/base^(lenBase(a, base)-b-1);
    const pt2 = a/base^(lenBase(a, base)-b);
    
    floor(pt1-floor(pt2)*base)
}

//Safely extracts the nth digit (starting at 0) from a number in a specific base. The first input is the number and the second is the place of the digit.
inline function safeGetDigitBase(a, b, base) {
    const pt1 = a/base^(safeLenBase(a, base)-b-1);
    const pt2 = a/base^(safeLenBase(a, base)-b);
    
    floor(pt1-floor(pt2)*base)
}

//Returns 1 if the input is an integer, and 0 otherwise.
inline function isInt(a) => a == floor(a);

//Returns if the dividend can be evenly divided by the divisor.
inline function isDivisibleBy(dividend, divisor) => dividend % divisor == 0;

//Safely divides a number (a/b), such that if b is 0 (a/0), it will return 0 instead of undefined.
//Normally, if you divide a number by 0 (even if inside a statement that doesn't run) it will return
//undefined for the entire function. This solves that issue. Use this anywhere that the divisor may
//be 0.
inline function safeDivide(a, b) {
    if(b == 0) {
        0
    } else {
        //This double check is needed because it will run, and needs to divide by a non-zero number. 1 is a "safe" value, but it's being used arbitrarily here.
        //No matter what number is used, it won't ever appear, unless it results in undefined (which will only happen if the value is 0 or infinity).
        const num = if(b == 0) {
            1
        } else {
            b
        };
        
        a/num
    }
}

//Safely runs the log function, returning 0 if the input is 0.
inline function safeLog(a) {
    if(a == 0) {
        0
    } else {
        const val = if(a == 0) {
            1
        } else {
            a
        };
        
        log(val)
    }
}

//Safely runs the ln function, returning 0 if the input is 0.
inline function safeLN(a) {
    if(a == 0) {
        0
    } else {
        const val = if(a == 0) {
            1
        } else {
            a
        };
        
        ln(val)
    }
}

//Gets the log for a certain base.
//Deprecated in favor of log_ syntax.
inline function logBase(num, base) => log_base(num);

//Safely gets the log for a certain base, returning 0 if the input is 0.
inline function safeLogBase(num, base) {
    if(base == 0) {
        0
    } else {
        const base = if(base == 0) {
            1
        } else {
            base
        };
        
        log_base(num)
    }
}

//Simplifies a fraction and returns the numerator.
inline function simplifyNumerator(numerator, denominator) {
    const factor = gcd(numerator, denominator);
    numerator/factor
}

//Simplifies a fraction and returns the denominator.
inline function simplifyDenominator(numerator, denominator) {
    const factor = gcd(numerator, denominator);
    denominator/factor
}

//Gets the real part of a complex number.
inline function cR(a) => a.x;

//Gets the imaginary part of a complex number.
inline function cI(a) => a.y;

//Takes the absolute value of a complex number.
inline function cAbs(a) => distance(a, (0, 0));

//Calculates the complex argument of a number.
inline function cArg(a) => mod(arctan(cI(a), cR(a)), 2*pi);

//Multiplies two complex numbers together.
//https://en.wikipedia.org/wiki/Multiplication_algorithm#Complex_multiplication_algorithm
inline function cMul(a, b) {
    const aPart1 = cR(a) * cR(b);
    const aPart2 = cI(a) * cI(b);
    const aPart = aPart1 - aPart2;
    
    const bPart1 = cI(a) * cR(b);
    const bPart2 = cR(a) * cI(b);
    const bPart = bPart1 + bPart2;
    
    (aPart, bPart)
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
    
    (aPart/cPart, bPart/cPart)
}

//Adds two complex numbers.
inline function cAdd(a, b) => a + b;

//Subtracts two complex numbers.
inline function cSub(a, b) => a - b;

//Raises a real number to a complex power.
inline function cPowRC(real, complex) {
    const p1 = cos(cI(complex));
    const p2 = sin(cI(complex));
    
    const mul = (real^cR(complex), 0);
    
    cMul(mul, ln(real) * (p1, p2))
}

//Raises a complex number to a real power.
inline function cPowCR(complex, real) {
    const r = cAbs(complex);
    const theta = arctan(cI(complex)/cR(complex));
    
    const mul = r^real;
    
    const p1 = mul*cos(real*theta);
    const p2 = mul*sin(real*theta);
    
    (p1, p2)
}

//Calculates a complex number to a complex power.
inline function cPow(base, power) {
    cExp(cMul(power, cLn(base)))
}

//Calculates the log of a complex number in a complex base.
inline function cLog(base, power) {
    cDiv(cLn(power), cLn(base))
}

//Raises e to a complex power.
inline function cExp(a) {
    e^cR(a) * (cos(cI(a)), sin(cR(a)))
}

//Calculates the complex natural logarithm of a number.
inline function cLn(a) {
    const p1 = ln(cAbs(a));
    const p2 = cArg(a);
    
    (p1, p2)
}

//Creates a complex number from polar form.
inline function cPolar(abs, arg) {
    abs * (cos(arg), sin(arg))
}

//The complex sine function.
inline function cSin(a) {
    const p1 = sin(cR(a)) * cosh(cI(a));
    const p2 = cos(cR(a)) * sinh(cI(a));
    
    (p1, p2)
}

//The complex cosine function.
inline function cCos(a) {
    const p1 = cos(cR(a)) * cosh(cI(a));
    const p2 = sin(cR(a)) * sinh(cI(a));
    
    (p1, -p2)
}

//The complex tangent function.
inline function cTan(a) => cDiv(cSin(a), cCos(a));

//The complex cotangent function.
inline function cCot(a) => cDiv(cCos(a), cSin(a));

//The complex hyperbolic sine function.
inline function cSinh(a) {
    const p1 = sinh(cR(a))*cos(cI(a));
    const p2 = cosh(cR(a))*sin(cI(a));
    
    (p1, p2)
}

//The complex hyperbolic cosine function.
inline function cCosh(a) {
    const p1 = cosh(cR(a))*cos(cI(a));
    const p2 = sinh(cR(a))*sin(cI(a));
    
    (p1, p2)
}

//The complex hyperbolic tangent function.
inline function cTanh(a) => cDiv(cSinh(a), cCosh(a));

//The complex hyperbolic cotangent function.
inline function cCoth(a) => cDiv(cCosh(a), cSinh(a));

//Calculates the complex a mod b.
inline function cMod(a, b) {
    const p1 = cFloor(cDiv(a, b));
    const p2 = cMul(p1, b);
    
    a - p2
}

//Applies the floor function to both parts of a complex number.
inline function cFloor(a) {
    (floor(cR(a)), floor(cI(a)))
}

//Applies the ceil function to both parts of a complex number.
inline function cCeil(a) {
    (ceil(cR(a)), ceil(cI(a)))
}

//Applies the round function to both parts of a complex number.
inline function cRound(a) {
    (round(cR(a)), round(cI(a)))
}

//Checks if a number is NaN.
inline function isNaN(a) => a != a;

//Gets the x position (0-based) of a 2d array embedded in a 1d array (1-based).
//Used to convert from a 1d array to a 2d array.
inline function conv_1d_2d_x(idx, width) => (idx-1) % width;

//Gets the y position (0-based) of a 2d array embedded in a 1d array (1-based).
//Used to convert from a 1d array to a 2d array.
inline function conv_1d_2d_y(idx, width) => floor((idx-1) / width);

//Gets the index (1-based) of a 1d array from the position x and y of a 2d array (0-based).
//Used to convert from a 2d array to a 1d array.
inline function conv_2d_1d(x, y, width) => y * width + x + 1;

//Maps from one range of numbers to another.
inline function map(input_start, input_end, output_start, output_end, val) {
    const slope = (output_end - output_start) / (input_end - input_start);
    
    output_start + slope * (val - input_start)
}

//Linearly interpolates from one number to another. This is used to smoothly transition between two numbers.
//An amount of 0 will return from, 1 will return to, and anything in between will return something
//between the two numbers.
inline function lerp(from, to, amount) => from + (to - from) * amount;

//Stores a float and an integer into a single float. Digits defines the precision, and
//should be at least as many digits that exist in the largest number.
inline function pack(float, integer, digits) {
    const half = (10^digits) / 2;
    
    (float + half) + (integer + half)*(10^digits)
}

//Extracts the float part from a packed number.
inline function unpackFloat(packed, digits) {
    const half = (10^digits) / 2;
    
    mod(packed, 10^digits) - half
}

//Extracts the int part from a packed number.
inline function unpackInt(packed, digits) {
    const half = (10^digits) / 2;
    
    floor(packed / 10^digits) - half
}

//Rounds a number to the closest product of another number. For example, roundTo(1.2, .5) will give 1.
inline function roundTo(num, to) => to * round(num/to);

inline function stack_adv(s_tack, nextNum) {
    let new_stack = s_tack;

    // Set the state num to the one specified above.
    new_stack[1] = nextNum;
    new_stack
}

inline function stack_ret(s_tack) {
    let new_stack = s_tack;

    // The stack looks like [stackNum, stackFramePtr, ..., returnStackNum, returnPtr, ...].
    // Set the stackNum to the specified return one.
    new_stack[1] = new_stack[new_stack[2]];
    // Set the stack frame pointer to the return one.
    new_stack[2] = new_stack[new_stack[2] + 1];
    new_stack
}

inline function array_set(arr, idx, new_value) {
    range(0, arr.length).filter(v => v != 0).map(v => v == idx ? new_value : arr[v])
}`;
