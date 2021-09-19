# Quadratic Factor
This function will factor a quadratic function of the form `ax^2+bx+c` into the form `g(a_1x-b_1)(a_2x-b_2)`.

It takes 4 inputs: `a`, `b`, `c`, and `s`. Selector (`s`) is a number `0`-`4`, which selects what will be output. This is what each number outputs:
- `0` - `g` (GCD).
- `1` - `a_1`.
- `2` - `a_2`.
- `3` - `b_1` (root #1).
- `4` - `b_2` (root #2).

## Example
If you want to get the roots of the function `2x^2+6x+4`, we can use the above list to identify the root selectors as `3` and `4`. Then, simply evaluate the function as `f(2,6,4,3)` for root #1, and `f(2,6,4,4)` for root #2.