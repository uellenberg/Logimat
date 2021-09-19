import {Compile} from "../../src";

const func = Compile(`
inline function factorQuadratic(a, b, c, selector) {
    //First, we have to check if there is a GCD.
    //It can be that c is zero, which makes a GCD of x.
    //In that case, we can simply return (ax+b)(x+0).
    
    if(c == 0) {
        const gcd1 = gcd(a, b);
        state = outputSwitch(selector, 1, a/gcd1, 1, -b/gcd1, 0);
    } else {
        //Next, we'll find an actual GCD between them, store it for later, then divide everything by it.
        
        const gcd1 = gcd(a, b, c);
        
        const a1 = a/gcd1;
        const b1 = b/gcd1;
        const c1 = c/gcd1;
        
        //Now, we need to find the factor.
        const factor = sum(n=1; abs(c1)) {
            state = checkFactor(b1, c1, n);
        };
        
        //This is special code that will safely return undefined when factor is 0.
        //You are not expected to understand this.
        if(factor == 0) {
            if(factor == 0 && c != 0) {
                state = 0;
            } else {
                state = 1;
            }
            
            state = 1/state;
        } else {
            //Factor can be 0.
            const factor2 = safeDivide(c1, factor);
        
            //Next, we need to simplify factor/a.
            const factor1Num = simplifyNumerator(factor, a1);
            const factor1Den = simplifyDenominator(factor, a1);
        
            const factor2Num = simplifyNumerator(factor2, a1);
            const factor2Den = simplifyDenominator(factor2, a1);
        
            state = outputSwitch(selector, gcd1, factor1Den, factor2Den, -factor1Num, -factor2Num);
        }
    }
}

inline function checkFactor(b1, c1, n) {
    const absC = abs(c1);

    //We'll check to see if this is a viable factor.
    //We also have a second check to make sure that only one of the factors is chosen.
    if(isDivisibleBy(c1, n) && absC/n <= n) {
        //Next, we need to check if it is summable to b.
        
        const factor1 = n;
        const factor2 = absC/n;

        if(isNegative(c1)) {
            //If it's negative, we must make one of either factor ne
            if(factor2-factor1 == b1) {
                state = -factor1;
            } else if(factor1-factor2 == b1) {
                state = factor1;
            } else {
                state = 0;
            }
        } else {
            //If it's positive, we can have both negative or both positive.
            
            if(-factor1-factor2 == b1) {
                state = -factor1;
            } else if(factor1+factor2 == b1) {
                state = factor1;
            } else {
                state = 0;
            }
         }
    } else {
        state = 0;
    }
}

inline function outputSwitch(selector, gcd1, a1, a2, b1, b2) {
    if(selector == 0) {
        state = gcd1;
    } else if(selector == 1) {
        state = a1;
    } else if(selector == 2) {
        state = a2;
    } else if(selector == 3) {
        state = b1;
    } else {
        state = b2;
    }
}

export function f(a, b, c, s) {
    state = factorQuadratic(a, b, c, s);
}
`);

console.log(func);