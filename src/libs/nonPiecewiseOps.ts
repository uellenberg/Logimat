export default `
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
}`;