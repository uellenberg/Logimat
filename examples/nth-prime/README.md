# Nth-Prime

This function returns the nth prime, where the 1st prime is 2. It works by counting the numbers which have less than n primes below them (which is based on Willans' formula for primes).

It only requires sum, product (which can be swapped with sum for a larger function), abs, floor, ln, and basic arithmetic. It can run on a scientific calculator, albeit very, very slowly. It's also very likely that there could be improvements. If you see any, let me know (or make a pull request).

The source code can be found in [main.lm](./main.lm). The compiled function can be found in [equation.txt](./equation.txt) along with an example Desmos graph [here](https://www.desmos.com/calculator/dstdfqf6r6). A picture of the function can be found in [picture.png](./picture.png). These have been compiled with unsafe features in order to reduce the size and computation time of the function, which may make it incompatible with different software and/or interpretations of mathematics. A safe version can also be found here.
