import {Expression, grammar, OuterConstDeclaration, OuterDeclaration, OuterFunctionDeclaration, ParserOutput, semantic, Statement} from "./grammar";
import ops from "../libs/ops";
import {create, all} from "mathjs";
import stdlib from "../libs/stdlib";

const math = create(all);

const functions = {
    sum(a, b, c, d) {
        return d*(Math.max(0, c-b));
    },
    mod(a, b){
        return a % b;
    },
    abs(a){
        return Math.abs(a);
    },
    sqrt(a){
        return Math.sqrt(a);
    },
    pow(a, b){
        return Math.pow(a, b);
    },
    log(a){
        return math.log(a, 10);
    },
    ln(a){
        return math.log(a, math.e);
    }
};

functions.sum["toTex"] = "{\\sum_{${args[0]}=${args[1]}}^{${args[2]}}${args[3]}}";
functions.mod["toTex"] = "\\operatorname{mod}\\left(${args[0]},\\ ${args[1]}\\right)";
functions.abs["toTex"] = "\\left|${args[0]}\\right|";
functions.sqrt["toTex"] = "\\sqrt{${args[0]}}";
functions.pow["toTex"] = "{${args[0]}}^{${args[1]}}";

[
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
].forEach(funcName => {
    if(!functions[funcName]) functions[funcName] = () => null;
    functions[funcName].toTex = "\\" + funcName + "\\left(${args[0]}\\right)";
});

[
    "lcm",
    "gcd",
].forEach(funcName => {
    if(!functions[funcName]) functions[funcName] = () => null;
    functions[funcName].toTex = "\\" + funcName + "\\left(${args[0]},\\ ${args[1]}\\right)";
});

[
    "pi"
].forEach(constName => {
    if(!functions[constName]) functions[constName] = () => null;
    functions[constName].toTex = "\\" + constName;
});

math.import(functions, {
    override: true
});

/**
 * Compiles LogiMat to a math function (or multiple). Each function/variable will be on a separate line.
 * @param input {string} - is the input LogiMat code that will be compiled.
 * @param useTex {boolean} - is a value indicating if the output should be converted to Tex.
 */
export const Compile = (input: string, useTex: boolean = false) : string => {
    const tree = GetTree(input);

    let out: string[] = [];

    const inlines: Record<string, Inline> = {
        ...GetInlines(tree),
        ...GetInlines(GetTree(stdlib)),
        ...GetInlines(GetTree(ops))
    };

    for (const declaration of tree) {
        if (declaration.modifier === "inline") continue;

        if (declaration.type === "function") out.push(declaration.name + "(" + declaration["args"].join(",") + ")" + "=" + SimplifyExpression(CompileBlock((<OuterFunctionDeclaration>declaration).block, inlines), useTex));
        else out.push(declaration.name + "=" + SimplifyExpression(CompileExpression((<OuterConstDeclaration>declaration).expr, inlines), useTex));
    }

    return out.join("\n");
}

const options = {
    handler: {
        sum(node, options){
            return `{\\sum_{${node.args[0].toString(options)}=${node.args[1].toString(options)}}^{${node.args[2].toString(options)}}{(${node.args[3].toString(options)})}}`;
        },
        sqrt(node, options){
            return `\\sqrt{${node.args[0].toString(options)}}`;
        },
        pow(node, options){
            return `{${node.args[0]}}^{${node.args[1]}}`;
        },
        pi() {
            return "\\pi";
        }
    }
};

const SimplifyExpression = (input: string, useTex: boolean) : string => {
    const res = math.simplify(input, {}, {exactFractions: false});
    return useTex ? res.toTex() : res.toString(options).replace(/\s+/g, "");
}

const GetTree = (input: string) : ParserOutput => {
    const match = grammar.match(input);
    if(match.failed()) throw new Error(match.message);

    return semantic(match).parse();
}

const GetInlines = (tree: ParserOutput) : Record<string, Inline> => {
    const inlines: Record<string, Inline> = {};

    for (const declaration of tree) {
        if(declaration.modifier === "inline") inlines[declaration.name] = {function: declaration.type === "function", value: declaration};
    }

    return inlines;
}

const CompileBlock = (input: Statement[], inlines: Record<string, Inline>, vars: Record<string, string> = {}, args: Record<string, string> = {}) : string => {
    let out = "";
    let newVars = {
        ...vars,
        ...args
    };

    for (const statement of input) {
        switch(statement.type) {
            case "const":
                newVars[statement["name"]] = CompileExpression(statement["expr"], inlines, {
                    ...newVars,
                    state: out
                });

                break;
            case "state":
                out = CompileExpression(statement["expr"], inlines, {
                    ...newVars,
                    state: out
                });
                break;
            case "if":
                const condition = CompileExpression(statement["condition"], inlines, {
                    ...newVars,
                    state: out
                });
                const ifaction = CompileBlock(statement["ifaction"], inlines, {
                    ...newVars,
                    state: out
                });
                const elseaction = CompileBlock(statement["elseaction"], inlines, {
                    ...newVars,
                    state: out
                });


                out = CompileExpression({type: "f", args: ["if_func", [condition, ifaction, elseaction]]}, inlines, {
                    ...newVars,
                    state: out
                });
                break;
        }
    }

    if(out === "") throw new Error("The state must be set inside of every block.");
    return out;
}

const CompileExpression = (expression: Expression, inlines: Record<string, Inline>, vars: Record<string, string> = {}) : string => {
    if(typeof(expression) !== "object") return expression;

    const args = expression.args.map(arg => typeof(arg) === "object" && arg.hasOwnProperty("type") ? CompileExpression(<Expression>arg, inlines, vars) : arg);

    switch(expression.type){
        case "+":
            return "(" + args[0] + ")+(" + args[1] + ")";
        case "-":
            return "(" + args[0] + ")-(" + args[1] + ")";
        case "*":
            return "(" + args[0] + ")*(" + args[1] + ")";
        case "/":
            return "(" + args[0] + ")/(" + args[1] + ")";
        case "^":
            return "pow(" + args[0] + "," + args[1] + ")";
        case "n":
            return "-(" + args[0] + ")";
        case "f":
            const fargs = (<any[]>expression.args[1]).map(arg => typeof(arg) === "object" && arg.hasOwnProperty("type") ? CompileExpression(<Expression>arg, inlines, vars) : arg);

            if(!inlines.hasOwnProperty(<string>expression.args[0])) return <string>expression.args[0] + "(" + fargs.join(",") + ")";

            const fargnames = (<OuterFunctionDeclaration>inlines[<string>expression.args[0]].value).args;

            if(fargnames.length !== fargs.length) throw new Error("Inline function \"" + expression.args[0] + "\" requires " + fargnames.length + ", but only " + fargs.length + " are given.");

            return CompileBlock((<OuterFunctionDeclaration>inlines[<string>expression.args[0]].value).block, inlines, vars, Object.fromEntries(fargnames.map((v, i) => [v, fargs[i]])));
        case "v":
            const name = <string>expression.args[0];

            if(vars.hasOwnProperty(name)) return vars[name];
            if(inlines.hasOwnProperty(name)) return CompileExpression(inlines[name].value["expr"], inlines, vars);

            switch(name) {
                case "pi":
                    return "pi()";
            }

            return name;
        case "sum":
            return "sum(" + args[0] + "," + args[1] + "," + args[2] + "," + CompileBlock(<Statement[]>args[3], inlines, vars) + ")";
    }

    return "";
}

interface Inline {
    function: boolean;
    value: OuterDeclaration;
}