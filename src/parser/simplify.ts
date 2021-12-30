import {MathNode, sec, simplify} from "mathjs";
import {HandleName} from "./util";

export const SimplifyExpression = (input: string, useTex: boolean, strict: boolean, names: string[]) : string => {
    const newNames = names.concat(builtinOneArg).concat(builtinTwoArgs).concat(constants).concat(Object.keys(functions)).concat(Object.keys(texFunctions));

    try {
        const res = simplify(input, simplifyRules, {exactFractions: false});
        //They say they return a string but they can sometimes return numbers.
        return useTex ? res.toTex(getTexOptions(strict, newNames)).toString() : res.toString(getStringOptions(strict, newNames)).toString();
    } catch(e) {
        console.error("An error has occurred while attempting to simplify \"" + input + "\":");
        throw e;
    }
}

const simplifyRules = simplify["rules"].concat([
    //Or
    "n | 1 -> 1",
    "1 | n -> 1",
    "n | 0 -> n",
    "0 | n -> n",
    //And
    "n & 1 -> n",
    "1 & n -> n",
    "n & 0 -> 0",
    "0 & n -> 0",
    //Func
    "if_func(0,n1,n2) -> n2",
    "if_func(1,n1,n2) -> n1"
]);

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
    "log",
    "abs",
    "mod"
];

const builtinTwoArgs = [
    "lcm",
    "gcd",
];

const constants = [
    "pi"
];

const HandleFunction = (node: MathNode, options: object, builtIn: boolean = false) : string => {
    return (builtIn ? "\\operatorname{" : "") + (<MathNode><unknown>node.fn).toString(options) + (builtIn ? "}" : "") + "(" + node.args.map(arg => arg.toString(options)).join(",") + ")";
}

const operatorMap = {
    "*": "*",
    "/": "*",
    "+": "+",
    "-": "+",
    "^": "^"
};

const handle = (node: MathNode, options: Options, tex: boolean) : string => {
    const encaseLogicalOperators = options.encaseLogicalOperators;
    options.encaseLogicalOperators = true;

    const secondaryBinary = options.secondaryBinary;
    options.secondaryBinary = false;

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

        let op = node.op;

        if(op === "|") {
            const opOptions = Object.assign({}, options);
            opOptions.secondaryBinary = true;
            opOptions.encaseLogicalOperators = false;

            const normalOptions = Object.assign({}, options);
            normalOptions.encaseLogicalOperators = false;

            let a1txt, a2txt, a1, a2;

            if(node.args[0].type === "OperatorNode" && node.args[0].op === "|") {
                a1txt = HandleNode(node.args[0], Object.assign({}, opOptions), tex);
                a1 = a1txt;
            } else {
                a1txt = HandleNode(node.args[0], Object.assign({}, normalOptions), tex);
                a1 = a1txt + (node.args[0].type !== "OperatorNode" ? "=1" : "");
            }

            if(node.args[1].type === "OperatorNode" && node.args[1].op === "|") {
                a2txt = HandleNode(node.args[1], Object.assign({}, opOptions), tex);
                a2 = a2txt;
            } else {
                a2txt = HandleNode(node.args[1], Object.assign({}, normalOptions), tex);
                a2 = a2txt + (node.args[1].type !== "OperatorNode" ? "=1" : "");
            }

            if(a1txt === "1" || a2txt === "1") {
                return "1";
            }

            if(!secondaryBinary) {
                if(encaseLogicalOperators) {
                    return `\\left\\{${a1},${a2},0\\right\\}`;
                }

                return `\\left\\{${a1},${a2},0\\right\\}=1`;
            }

            return `${a1},${a2}`;
        }

        if(op === "&") {
            const opOptions = Object.assign({}, options);
            opOptions.secondaryBinary = true;
            opOptions.encaseLogicalOperators = false;

            const normalOptions = Object.assign({}, options);
            normalOptions.encaseLogicalOperators = false;

            let a1txt, a2txt, a1, a2;

            if(node.args[0].type === "OperatorNode" && node.args[0].op === "&") {
                a1txt = HandleNode(node.args[0], Object.assign({}, opOptions), tex);
                a1 = a1txt;
            } else {
                a1txt = HandleNode(node.args[0], Object.assign({}, normalOptions), tex);
                a1 = "\\left\\{" + a1txt + (node.args[0].type !== "OperatorNode" ? "=1" : "") + "\\right\\}";
            }

            if(node.args[1].type === "OperatorNode" && node.args[1].op === "&") {
                a2txt = HandleNode(node.args[1], Object.assign({}, opOptions), tex);
                a2 = a2txt;
            } else {
                a2txt = HandleNode(node.args[1], Object.assign({}, normalOptions), tex);
                a2 = "\\left\\{" + a2txt + (node.args[1].type !== "OperatorNode" ? "=1" : "") + "\\right\\}";
            }

            if(a1txt === "0" || a2txt === "0") {
                return "0";
            }

            if(!secondaryBinary) {
                if(encaseLogicalOperators) {
                    return `${a1}${a2}`;
                }

                return `${a1}${a2}=1`;
            }

            return `${a1}${a2}`;
        }

        if(op === "!=") {
            node.op = "=";
            node.args = [node.args[1], node.args[0]];
            return functions["if_func"](<MathNode>{args: [node, {value: 0}, {value: 1}]}, options, tex);
        }

        let a1 = HandleNode(node.args[0], options, tex);
        let a2 = HandleNode(node.args[1], options, tex);

        //Handle logical operators.
        if(["==", ">", ">=", "<", "<="].includes(op)) {
            switch(op) {
                case "==":
                    op = "=";
                    break;
                case ">=":
                    op = "\\ge ";
                    break;
                case "<=":
                    op = "\\le ";
                    break;
            }

            if(encaseLogicalOperators) {
                return `\\left\\{${a1}${op}${a2},0\\right\\}`;
            }

            return `${a1}${op}${a2}`;
        }

        //Handle special cases like a+-b to a-b and a*b to ab.
        if(a2.startsWith("-") && operatorMap[node.op] === "+") {
            a2 = a2.substring(1);

            if(node.op === "+") {
                op = "-";
            } else {
                op = "+";
            }
        }
        //If the operator is * and they are either 1a, a1, or aa, and neither operand is a point or list.
        else if(
            node.op === "*" &&
            ((node.args[0].name && node.args[1].name) || (node.args[0].value && node.args[1].name) || (node.args[0].name && node.args[1].value)) &&
            !((node.args[0].fn && typeof(node.args[0].fn) === "object" && ["point", "array"].includes(node.args[0].fn["name"])) || (node.args[1].fn && typeof(node.args[1].fn) === "object" && ["point", "array"].includes(node.args[1].fn["name"])))
        ) {
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
            return `\\${name} `;
        }
        if(builtinOneArg.includes(name)) {
            if(tex) {
                return `\\operatorname{${name}}\\left(${node.args[0].toTex(options)}\\right)`;
            }

            return HandleFunction(node, options, true);
        }
        if(builtinTwoArgs.includes(name)) {
            if(tex) {
                return `\\operatorname{${name}}\\left(${node.args[0].toTex(options)},\\ ${node.args[1].toTex(options)}\\right)`;
            }

            return HandleFunction(node, options, true);
        }

        if(options.strict && !options.names.includes(name)) {
            throw new Error("The function \"" + name + "\" does not exist.");
        }

        if(tex) {
            return (<MathNode><unknown>node.fn).toTex(options) + "\\left(" + node.args.map(arg => arg.toTex(options)).join(",\\ ") + "\\right)";
        }

        return HandleFunction(node, options);
    }

    //Handle variables.
    if(node.name) {
        if(options.strict && !options.names.includes(node.name)) {
            console.log(node);
            throw new Error("The function or variable \"" + node.name + "\" does not exist.");
        }

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

const getStringOptions = (strict: boolean, names: string[]) : Options => {
    return {
        handler(node, options) {
            return handle(node, options, false);
        },
        strict,
        names,
        encaseLogicalOperators: true,
        secondaryBinary: false
    };
}

const getTexOptions = (strict: boolean, names: string[]) : Options => {
    return {
        handler(node, options) {
            return handle(node, options, true);
        },
        strict,
        names,
        encaseLogicalOperators: true,
        secondaryBinary: false
    };
}

interface Options {
    handler: (node: any, options: Options) => string;
    strict: boolean;
    names: string[];
    encaseLogicalOperators: boolean;
    secondaryBinary: boolean;
}

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
        return "\\pi ";
    },
    point(node, options, tex) {
        return `(${node.args.map(arg => HandleNode(arg, options, tex)).join(",")})`;
    },
    array(node, options, tex) {
        return `[${node.args.map(arg => HandleNode(arg, options, tex)).join(",")}]`;
    },
    point_x(node, options, tex) {
        const point = HandleNode(node.args[0], options, tex);

        return `${point}.x`;
    },
    point_y(node, options, tex) {
        const point = HandleNode(node.args[0], options, tex);

        return `${point}.y`;
    },
    array_idx(node, options, tex) {
        const array = HandleNode(node.args[0], options, tex);
        const indexer = HandleNode(node.args[1], options, tex);

        return `${array}[${indexer}]`;
    },
    array_length(node, options, tex) {
        const array = HandleNode(node.args[0], options, tex);

        return `${array}.\\operatorname{length}`;
    },
    array_filter(node, options, tex) {
        const array = HandleNode(node.args[0], options, tex);
        const condition = HandleNode(node.args[1], options, tex);

        return `${array}[${condition}=1]`;
    },
    array_map(node, options, tex) {
        const array = HandleNode(node.args[0], options, tex);
        const func = HandleNode(node.args[1], options, tex);
        const varName = HandleNode(node.args[2], options, tex);

        return `[${func}\\operatorname{for}${varName}=${array}]`;
    },
    range(node, options, tex) {
        const from = HandleNode(node.args[0], options, tex);
        const to = HandleNode(node.args[1], options, tex);

        return `[${from}...${to}]`;
    },
    equal(node, options, tex) {
        return `\\left\\{${HandleNode(node.args[0], options, tex)}=${HandleNode(node.args[1], options, tex)},0\\right\\}`;
    },
    notEqual(node, options, tex) {
        return `\\left\\{${HandleNode(node.args[0], options, tex)}=${HandleNode(node.args[1], options, tex)}:0,1\\right\\}`;
    },
    lt(node, options, tex) {
        return `\\left\\{${HandleNode(node.args[0], options, tex)}<${HandleNode(node.args[1], options, tex)},0\\right\\}`;
    },
    lte(node, options, tex) {
        return `\\left\\{${HandleNode(node.args[0], options, tex)}\\le ${HandleNode(node.args[1], options, tex)},0\\right\\}`;
    },
    gt(node, options, tex) {
        return `\\left\\{${HandleNode(node.args[0], options, tex)}>${HandleNode(node.args[1], options, tex)},0\\right\\}`;
    },
    gte(node, options, tex) {
        return `\\left\\{${HandleNode(node.args[0], options, tex)}\\ge ${HandleNode(node.args[1], options, tex)},0\\right\\}`;
    },
    if_func(node, options: Options, tex) {
        const nonEnclosedOptions = Object.assign({}, options);
        nonEnclosedOptions.encaseLogicalOperators = false;

        const cond = HandleNode(node.args[0], nonEnclosedOptions, tex);
        const ifVal = HandleNode(node.args[1], options, tex);
        const elseVal = HandleNode(node.args[2], options, tex);

        if(cond === "1") return ifVal;
        if(cond === "0") return elseVal;
        if(ifVal === elseVal) return ifVal;

        return `\\left\\{${cond + (node.args[0].type !== "OperatorNode" ? "=1" : "")}${ifVal !== "1" ? `:${ifVal}` : ""},${elseVal}\\right\\}`;
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
    },
    array_idx(node, options) {
        return `${node.args[0].toTex(options)}\\left[${node.args[1].toTex(options)}\\right]`;
    },
    array_filter(node, options) {
        return `${node.args[0].toTex(options)}\\left[${node.args[1].toTex(options)}=1\\right]`;
    },
    array_map(node, options) {
        return `\\left[${node.args[1].toTex(options)}\\ \\operatorname{for}\\ ${node.args[2].toTex(options)}=${node.args[0].toTex(options)}\\right]`;
    },
    range(node, options) {
        return `\\left[${node.args[0].toTex(options)}...${node.args[1].toTex(options)}\\right]`;
    },
    equal(node, options) {
        return `\\left\\{${node.args[0].toTex(options)}=${node.args[1].toTex(options)},0\\right\\}`;
    },
    notEqual(node, options) {
        return `\\left\\{${node.args[0].toTex(options)}=${node.args[1].toTex(options)}:0,1\\right\\}`;
    },
    lt(node, options) {
        return `\\left\\{${node.args[0].toTex(options)}<${node.args[1].toTex(options)},0\\right\\}`;
    },
    lte(node, options) {
        return `\\left\\{${node.args[0].toTex(options)}\\le ${node.args[1].toTex(options)},0\\right\\}`;
    },
    gt(node, options) {
        return `\\left\\{${node.args[0].toTex(options)}>${node.args[1].toTex(options)},0\\right\\}`;
    },
    gte(node, options) {
        return `\\left\\{${node.args[0].toTex(options)}\\ge ${node.args[1].toTex(options)},0\\right\\}`;
    }
};