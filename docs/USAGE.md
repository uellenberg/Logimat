# Usage
Here is an outline of how to use Logimat. This file contains instructions on both how to compile it, and how to write it.

## Setting up
The easiest way to use Logimat is to install it through npm. If you have node installed, you can run `npx logimat` to run Logimat's command-line. This command-line has many options, the most important of which are `-p` and `-s`. `-s` helps prevent mistakes by adding strict variable checking, and `-p` allows exporting with piecewise output, which should be used if you are planning to use the output in Desmos (as it's a Desmos-specific feature that makes logical operations faster).

## Language
One important thing to keep in mind with Logimat is that it is based on Javascript, and a lot of its language features are built to emulate how the same thing would be handled in Javascript.

### Blocks
One term used frequently in Logimat is a block. A block is simply a {} with something inside of it. For example, the following is a block:
```
{
    state = 1;
}
```

Blocks are found as function bodies, if statement bodies, sum bodies, and many more things. Also, blocks can be used directly as expressions, so
```
const val = {
    state = 1;
};
```
is perfectly valid.

### State, early returns, and other restrictions
Because Logimat compiles to math, there are a few restrictions that it has. Namely, it has no ability for early returns. In order to return a value, you must set the state. The state is a variable that can be read and written to, as opposed to all other variables, which are constants. At the end of a block (something inside {}), the state must be set, or else a compile error will be thrown. Below is an example of setting the state:
```
state = 1;
```

### Names
In Logimat, there are two types of names: inlined and exported names. Inlined names don't actually appear anywhere in the output, so they can be less restrictive than exported names. Inlined names are found on inline consts/functions (and their args), or consts defined inside of blocks. An inlined name must start with a letter, but it can have letters, digits, or underscores after it (for example, `valid_inlined_name1`). An exported name (found in exported consts/functions (and their args), and map variables), on the other hand, must either be a single letter, or it must be a letter, followed by an underscore and letters/digits/underscores (for example, `v_alid_exported_name1`). All names cannot contain spaces.

### Imports
Imports are statements that import something (currently just templates) from a library. They follow the following format:
```
import templates from "PATH_HERE";
```
Where `PATH_HERE` is either a file path, or a npm package. This will make all templates in that library accessible to your file.

### Outer Declarations
Logimat is split up into outer declarations. These outer declarations are things that will be output when it is compiled, or things that will be globally available. Below are the different kinds of outer declarations that exist.

#### import!
Import is technically a template, but it's common enough that it deserves its own section. Import is a template that imports other files. It is important to note that import works relative to the file running it, and not the main file. Here's how import is used:
```
import!("PATH.lm");
```
Where `PATH.lm` is a path to a file.

#### function
Functions are standard functions. They take in some inputs and return an output. Additionally, functions can be either exported or inlined, where exported means that they will appear as part of the output, and inlined means that they will not be. Exported functions' names can only be a single character long, with multi-character names being achieved using an underscore (for example, `m_ethod`). Inlined functions, on the other hand, have access to multi-character names.

An important feature of functions is that they return a value. In order to facilitate this, somewhere in the function the state must be set.

Here are a few examples of functions:
```
export function a_function(a, b) {
    state = a * b;
}

inline function an_inline_function(arg1, arg2) {
    state = arg1 + arg2;
}
```

#### const
Consts are variables. When used in outer declarations, they are accessible everywhere. Like functions, they can also be exported or inlined, and have a value attached to them. Here are a few examples of constants:
```
export const a_const = 1;

inline const an_inline_const = 2;
```

### Inner Declarations
Inner declarations are things found inside of blocks. They include const, state, if statements, and many more. Below is an overview of them.

#### state
Inside of blocks, the state can and must be set. You can think of the state like a return statement, except it does not stop the block from running. At the end of the block, whatever the state was last set to will be the result. Below is an example of setting the state inside a function:
```
export function a() {
    state = 1;
}
```

#### const
Consts can also appear inside of blocks. They are identical to outer declaration consts, except they are not exported/inlined (and they have the same naming rules as inlined consts). As their name implies, constants are constant, and cannot be modified. The only variable that can be modified is the state. Below is an example of a const inside a function:
```
export function a() {
    const val = 1;
    state = 1;
}
```

#### if
One very important statement in Logimat is the if statement. It acts as a normal if statement, except that an if statement must be paired with an else statement, unless the state was set prior to the if statement running. Else can also be paired with if with an `else if`.

Below is an example of its usage (both functions return the same value):
```
export function a() {
    const val = 1;
    
    if(val == 1) {
        state = 1;
    } else {
        state = 0;
    }
}

export function b() {
    state = 0;

    const val = 1;
    
    if(val == 1) {
        state = 1;
    }
}
```
*As a side note, the `== 1` shown above can be omitted, as the if statement treats 1 as true.*