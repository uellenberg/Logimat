import {Expression, grammar, OuterConstDeclaration, OuterDeclaration, OuterFunctionDeclaration, ParserOutput, semantic, Statement} from "./grammar";
import ops from "../libs/ops";
import {simplify} from "mathjs";

/**
 * Compiles LogiMat to a math function (or multiple). Each function/variable will be on a separate line.
 * @param input {string} - is the input LogiMat code that will be compiled.
 */
export const Compile = (input: string) : string => {
    const tree = GetTree(input);

    let out: string[] = [];

    const inlines: Record<string, Inline> = {
        ...GetInlines(tree),
        ...GetInlines(GetTree(ops))
    };

    for (const declaration of tree) {
        if (declaration.type === "inline") continue;

        if (declaration.type === "function") out.push(declaration.name + "(" + declaration["args"].join(",") + ")" + "=" + simplify(CompileBlock((<OuterFunctionDeclaration>declaration).block, inlines)).toString().replace(/\s+/g, ""));
        else out.push(declaration.name + "=" + simplify(CompileExpression((<OuterConstDeclaration>declaration).expr, inlines)).toString().replace(/\s+/g, ""));
    }
    return out.join("\n");
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


                out = CompileExpression({type: "f", args: ["if", [condition, ifaction, elseaction]]}, inlines, {
                    ...newVars,
                    state: out
                });


                break;
            case "sum":
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
            return "(" + args[0] + ")^(" + args[1] + ")";
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

            if(!vars.hasOwnProperty(name)) return name;
            return vars[name];
        case "sum":
            return "";
    }

    return "";
}

interface Inline {
    function: boolean;
    value: OuterDeclaration;
}