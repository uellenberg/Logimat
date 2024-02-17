# Logimat

First, to preface, Logimat has two "compilation modes". It outputs pure math (that you can put into your calculator) by
default and also outputs piecewise (which is faster but only works with Desmos, and can be selected with the `-p`
compiler option). Logimat's pure math compilation is not useful for anything. It does not serve any purpose, other than
being an interesting concept to mess around with, and making some interesting functions. That being said, Logimat is
also intended to be able to compile to Desmos, and is made more powerful by extensions to it (such as Graphgame).

## Desmos

Logimat was originally made to be a language to explore logical math, but it has since found its use in compiling to
Desmos, both by creating more efficient output by taking advantage of certain Desmos features (such as piecewise
expressions with the `-p` compiler option), and by directly supporting certain Desmos features (such as polygons,
points, arrays, etc). In Logimat's documentation, certain features will be marked as Desmos-only.

## Graphgame

Logimat's big feature program is Graphgame, a game/animation engine for Desmos. Check it
out [here](https://github.com/uellenberg/Graphgame.git)!

You can also use [Graphgame Studio](https://graphgame.js.org) to get started with Logimat (and Graphgame) in your browser.

Also, take a look at [TopHop](https://github.com/uellenberg/TopHop.git), a [Desmos game](https://www.desmos.com/art#17;iqhtp7solc) made using Logimat and Graphgame
(which you can modify with Graphgame Studio).

## Logical Math

Many mathematical functions are defined through logical statements instead of a function that can be evaluated
arithmetically (for example, piecewise definitions). Logimat does the opposite of this. It allows logical functions to
be defined as functions that can be easily evaluated (using a scientific calculator).

For example, if I wanted to have a sin and cos taking turns for when they'll go on the graph, where the sin appears for
a certain distance, then the cos appears for the same... I could write something like this:

```ts
export const s = 5;

export function a(x){
    if(floor(x/s) % 2 == 1) {
        sin(x)
    } else {
        cos(x)
    }
}
```

Which will compile to this monstrous function:

```
s=5
a(x)=floor(\frac{1}{{2}^{abs(mod(floor(\frac{x}{s}),2)-1)}})*sin(x)+(1-floor(\frac{1}{{2}^{abs(mod(floor(\frac{x}{s}),2)-1)}}))*cos(x)
```

You don't need to worry too much about what's going on with the output (that's the compiler's job), but we'll take a
look at how the pre-compiled code is set up.
First, you should notice the `export const s = 5;`. This is telling it to export (output) a variable called s that's set
to 5. Alternativelty, `inline` can be used in place of `export`, and the variable/function will be put inside any
functions/expressions that reference it. The reason that `const` is used is because the only mutable variable is the
state (but we'll get into that later).

Next up, we see the main function, called `a`. It also takes in an argument of `x`. Inside this function, there's an if
statement that checks what function's turn it is. It also uses the `s` variable from before as a scale. If it turns out
to be the sin's turn, the state will be set to `sin(x)`, otherwise it'll be `cos(x)`.

## Restrictions

Functions weren't made for doing this, so as you can imagine, there are a few restrictions. First off, you only get one
point of memory, called the state (which also acts as your output). You can define variables, but they can only be read
from, so they act a bit more for convenience. Even so, two functions can technically have two distinct states, although
they will need to combine them somehow before the function returns. On that note, early returns, or any kind of jumps,
are also impossible. This effects Logimat's internals as well, and as such means that every code path is executed, but
only the needed values are actually returned. Keep this in mind, as if any code paths return undefined, the entire
function will return undefined (you can use safe functions, such as `safeDivide`, `safeLog`, etc to avoid this).

Before starting, please look through the [usage instructions](docs/USAGE.md) and [examples](examples/).
They're essential to understanding how Logimat works, and how to write code in it.

## How it works

The core of Logimat is actually fairly simple. I've created certain functions (which you can view in more detail inside
of src/libs/ops.ts) which act as either logic gates, or operators (==, !=, <, etc). These are then chained together to
perform the more familiar logical operations found inside the if statement. The only special functions that Logimat
requires are the `ceil`, `floor`, and `abs` functions.

## Usage

To use Logimat, please check out the [usage instructions](docs/USAGE.md). They contain information about running the
Logimat compiler, as well as information on Logimat's language. Also, make sure to check out the examples.
