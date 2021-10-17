import {MathNode, simplify} from "mathjs";

export const SimplifyExpression = (input: string, useTex: boolean) : string => {
    const res = simplify(input, {}, {exactFractions: false});
    //They say they return a string but they can sometimes return numbers.
    return useTex ? res.toTex(texOptions).toString() : res.toString(stringOptions).toString().replace(/\s+/g, "");
}

const builtinOneArg = [
    "sin",
    "cos",
    "tan",
    "csc",
    "sec",
    "cot",
    "arcsin",
    "arccos",
    "arctan",
    "arccsc",
    "arcsec",
    "arccot",
    "sinh",
    "cosh",
    "tanh",
    "csch",
    "sech",
    "coth",
    "round",
    "sign",
    "ln",
    "log"
];

const builtinTwoArgs = [
    "lcm",
    "gcd",
];

const constants = [
    "pi"
];

const HandleFunction = (node: MathNode, options: object) : string => {
    return (<MathNode><unknown>node.fn).toString(options) + "(" + node.args.map(arg => arg.toString(options)).join(",") + ")";
}

const operatorMap = {
    "*": "*",
    "/": "*",
    "+": "+",
    "-": "+"
};

const handle = (node: MathNode, options: object, tex: boolean) : string => {
    //Handle numerical values.
    if(!isNaN(node.value)) {
        return node.value;
    }

    //Handle default operators.
    if(node.op) {
        if(node.fn?.startsWith("unary")) {
            if(node.args[0]?.op) {
                return node.op + "(" + HandleNode(node.args[0], options, tex) + ")";
            }

            return node.op + HandleNode(node.args[0], options, tex);
        }

        let a1 = HandleNode(node.args[0], options, tex);
        let a2 = HandleNode(node.args[1], options, tex);

        let op = node.op;

        //Handle special cases like a+-b to a-b and a*b to ab.
        if(a2.startsWith("-") && operatorMap[node.op] === "+") {
            a2 = a2.substring(1);

            if(node.op === "+") {
                op = "-";
            } else {
                op = "+";
            }
        }
        //If the operator is * and they are either 1a, a1, or aa.
        else if(node.op === "*" && ((!node.args[0].value && !node.args[1].value) || (node.args[0].value && !node.args[1].value) || (!node.args[0].value && node.args[1].value))) {
            op = "";
        }

        //If any of the ones here are an incompatible operation, encapsulate them.

        //If #1 is an operator and #2 is not, and #1 doesn't have the same operator as this one.
        if(node.args[0]?.op && operatorMap[node.args[0]?.op] !== operatorMap[node.op] && !node.args[1]?.op) {
            return tex ? `\\left(${a1}\\right)${op}${a2}` : `(${a1})${op}${a2}`;
        }
        //If #2 is an operator and #1 is not, and #2 doesn't have the same operator as this one.
        if(node.args[1]?.op && operatorMap[node.args[1]?.op] !== operatorMap[node.op] && !node.args[0]?.op) {
            return tex ? `${a1}${op}\\left(${a2}\\right)` : `${a1}${op}(${a2})`;
        }
        //If both are operators, and are incompatible.
        if(node.args[0]?.op && node.args[1]?.op && ![operatorMap[node.args[0]?.op], operatorMap[node.args[1]?.op], operatorMap[node.op]].every((el, _, arr) => el === arr[0])) {
            return tex ? `\\left(${a1}\\right)${op}\\left(${a2}\\right)` : `(${a1})${op}(${a2})`;
        }

        //Otherwise, return a normal operator.
        return `${a1}${op}${a2}`;
    }

    //Handle functions.
    if(node.fn && typeof(node.fn) === "object" && node.fn["name"]) {
        let name: string = node.fn["name"];

        //If we have tex-only special handling for it, then handle it.
        if(tex && texFunctions.hasOwnProperty(name)) {
            return texFunctions[name](node, options);
        }

        //If we have special handling for it, then handle it.
        if(functions.hasOwnProperty(name)) {
            return functions[name](node, options, tex);
        }

        //If we know it's built-in, handle it.
        if(constants.includes(name)) {
            return `\\${name}`;
        }
        if(builtinOneArg.includes(name)) {
            if(tex) {
                return `\\${name}\\left(${node.args[0].toTex(options)}\\right)`;
            }

            return HandleFunction(node, options);
        }
        if(builtinTwoArgs.includes(name)) {
            if(tex) {
                return `\\${name}\\left(${node.args[0].toTex(options)},\\ ${node.args[1].toTex(options)}\\right)`;
            }

            return HandleFunction(node, options);
        }

        if(tex) {
            return (<MathNode><unknown>node.fn).toTex(options) + "\\left(" + node.args.map(arg => arg.toTex(options)).join(",\\ ") + "\\right)";
        }

        return HandleFunction(node, options);
    }

    //Handle variables.
    if(node.name) {
        let name: string = node.name;

        //Correct the variable name if it's in the form of \w_\w+.
        if(name.substring(1, 2) === "_") {
            name = name[0] + "_{" + name.substring(2) + "}";
        }

        return name;
    }

    return "";
}

const HandleNode = (node: MathNode, options: object, tex: boolean) : string => {
    if(!node) return "";
    //They say they return a string but they can sometimes return numbers.
    return tex ? node.toTex(options).toString() : node.toString(options).toString();
}

const stringOptions = {
    handler(node, options) {
        return handle(node, options, false);
    }
};

const texOptions = {
    handler(node, options) {
        return handle(node, options, true);
    }
};

const functions: Record<string, (node: MathNode, options: object, tex: boolean) => string> = {
    sum(node, options, tex) {
        return `{\\sum_{${HandleNode(node.args[0], options, tex)}=${HandleNode(node.args[1], options, tex)}}^{${HandleNode(node.args[2], options, tex)}}{${tex ? "" : "("}${HandleNode(node.args[3], options, tex)}${tex ? "" : ")"}}}`;
    },
    prod(node, options, tex) {
        return `{\\prod_{${HandleNode(node.args[0], options, tex)}=${HandleNode(node.args[1], options, tex)}}^{${HandleNode(node.args[2], options, tex)}}{${tex ? "" : "("}${HandleNode(node.args[3], options, tex)}${tex ? "" : ")"}}}`;
    },
    sqrt(node, options, tex) {
        return `\\sqrt{${HandleNode(node.args[0], options, tex)}}`;
    },
    pow(node, options, tex) {
        let base = HandleNode(node.args[0], options, tex);
        const exp = HandleNode(node.args[1], options, tex);

        if((node.args[0].fn && typeof(node.args[0].fn) === "object" && node.args[0].fn["name"] === "pow") || /[-+*/]/g.test(base)) {
            base = "(" + base + ")";
        }

        return `{${base}}^{${exp}}`;
    },
    pi() {
        return "\\pi";
    },
    div(node, options, tex) {
        return `\\frac{${HandleNode(node.args[0], options, tex)}}{${HandleNode(node.args[1], options, tex)}}`;
    }
};

const texFunctions: Record<string, (node: MathNode, options: object) => string> = {
    mod(node, options) {
        return `\\operatorname{mod}\\left(${node.args[0].toTex(options)},\\ ${node.args[1].toTex(options)}\\right)`;
    },
    abs(node, options) {
        return `\\left|${node.args[0].toTex(options)}\\right|`;
    },
    floor(node, options) {
        return `\\left\\lfloor ${node.args[0].toTex(options)}\\right\\rfloor `;
    },
    ceil(node, options) {
        return `\\left\\lceil ${node.args[0].toTex(options)}\\right\\rceil `;
    }
};