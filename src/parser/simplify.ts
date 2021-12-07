import {MathNode, simplify} from "mathjs";
import {HandleName} from "./util";

export const SimplifyExpression = (input: string, useTex: boolean) : string => {
    try {
        const res = simplify(input, {}, {exactFractions: false});
        //They say they return a string but they can sometimes return numbers.
        return useTex ? res.toTex(texOptions).toString() : res.toString(stringOptions).toString().replace(/\s+/g, "");
    } catch(e) {
        console.error("An error has occurred while attempting to simplify \"" + input + "\":");
        throw e;
    }
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
    "-": "+",
    "^": "^"
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
        else if(node.op === "*" && ((node.args[0].name && node.args[1].name) || (node.args[0].value && node.args[1].name) || (node.args[0].name && node.args[1].value))) {
            return `${a1}${a2}`;
        }

        //If any of the ones here are an incompatible operation, encapsulate them.

        const operator = node.op;
        const op1 = node.args[0].op;
        const op2 = node.args[1].op;

        //We want to group any non-single terms that have an operator that isn't equal to the current operator.
        if(!IsSingleTerm(op1) && op1 !== operator) {
            a1 = Encapsulate(a1, tex);
        }
        if(!IsSingleTerm(op2) && op2 !== operator) {
            a2 = Encapsulate(a2, tex);
        }

        switch(op) {
            case "/":
                return `\\frac{${a1}}{${a2}}`;
            default:
                return `${a1}${op}${a2}`;
        }
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
        //Correct the variable name if it's in the form of \w_\w+.
        return HandleName(node.name);
    }

    return "";
}

const IsSingleTerm = (op: string) : boolean => {
    //Single terms are implicitly grouped, and don't need parentheses.
    return !op || operatorMap[op] !== "+";
}

const Encapsulate = (val: string, tex: boolean) : string => {
    return tex ? `\\left(${val}\\right)` : `(${val})`;
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
    point(node, options, tex) {
        return `(${node.args.map(arg => HandleNode(arg, options, tex)).join(",")})`;
    },
    array(node, options, tex) {
        return `[${node.args.map(arg => HandleNode(arg, options, tex)).join(",")}]`;
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
    },
    point(node, options) {
        return `\\left(${node.args.map(arg => arg.toTex(options)).join(",")}\\right)`
    },
    array(node, options) {
        return `\\left[${node.args.map(arg => arg.toTex(options)).join(",")}\\right]`
    }
};