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
}`;