# Logimat
First, to preface, this language is not useful for anything. It does not serve any purpose, other than being an interesting concept to mess around with, and making some interesting functions.

## Logical Math
Many mathematical functions are defined through logical statements instead of a function that can be evaluated arithmetically (for example, piecewise definitions). LogiMat does the opposite of this. It allows logical functions to be defined as functions that can be easily evaluated (using a scientific calculator).

For example, if I wanted to have a sin and cos taking turns for when they'll go on the graph, where the sin appears for a certain distance, then the cos appears for the same... I could write something like this:
```lm
export const s = 5;

export function a(x){
    if(floor(x/s) % 2 == 1) {
        state = sin(x);
    } else {
        state = cos(x);
    }
}
```
Which will compile to this monstrous function:
```
s=5
a(x)=floor(\frac{1}{{2}^{abs(mod(floor(\frac{x}{s}),2)-1)}})*sin(x)+(1-floor(\frac{1}{{2}^{abs(mod(floor(\frac{x}{s}),2)-1)}}))*cos(x)
```

You don't need to worry too much about what's going on with the output (that's the compiler's job), but we'll take a look at how the pre-compiled code is set up.
First, you should notice the `export const s = 5;`. This is telling it to export (output) a variable called s that's set to 5. Alternativelty, `inline` can be used in place of `export`, and the variable/function will be put inside any functions/expressions that reference it. The reason that `const` is used is because the only mutable variable is the state (but we'll get into that later).

Next up, we see the main function, called `a`. It also takes in an argument of `x`. Inside this function, there's an if statement that checks what function's turn it is. It also uses the `s` variable from before as a scale. If it turns out to be the sin's turn, the state will be set to `sin(x)`, otherwise it'll be `cos(x)`.

## Restrictions
Functions weren't made for doing this, so as you can imagine, there are a few restrictions. First off, you only get one point of memory, called the state (which also acts as your output). You can define variables, but they can only be read from, so they act a bit more for convenience. Even so, two functions can technically have two distinct states, although they will need to combine them somehow before the function returns. On that note, early returns, or any kind of jumps, are also impossible. This effects LogiMat's internals as well, and as such means that every code path is executed, but only the needed values are actually returned. Keep this in mind, as if any code paths return undefined, the entire function will return undefined (you can use safe functions, such as `safeDivide`, `safeLog`, etc to avoid this).

## How it works
The core of LogiMat is actually fairly simple. I've created certain functions (which you can view in more detail inside of src/libs/ops.ts) which act as either logic gates, or operators (==, !=, <, etc). These are then chained together to perform the more familiar logical operations found inside the if statement. The only special functions that LogiMat requires are the `ceil`, `floor`, and `abs` functions.
